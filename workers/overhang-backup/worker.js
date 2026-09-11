/* BUILT 2026-09-06 — build 2d */
/* ============================================================
   overhang-backup  —  Cloudflare Worker
   The database, written out to files, so it does not live in one
   company's account only.

   WHAT CHANGED IN 2a, AND WHY
   Build 1a built the whole dump as one string and then wrote it.
   That worked at a few thousand rows and died at 460,000 with
   "Error 1102 — worker exceeded resource limits". A worker has a
   small memory budget and the string was the problem.

   Now: it writes as it reads. A dated FOLDER of numbered files,
   each a few megabytes, flushed to R2 and dropped from memory.
   Nothing is ever held whole. And the job is RESUMABLE — it works
   for about twenty seconds, records exactly where it stopped, and
   the next call picks it up. So the size of the database no longer
   decides whether the backup works.

   ------------------------------------------------------------
   BINDINGS   OVERHANG  D1  → overhang
              BACKUPS   R2  → overhang-backups
   SECRETS    LOG_KEY
   CRON       0 7 * * 0     (03:00 ET Sunday)

   ------------------------------------------------------------
     ?action=run              start a backup, or carry on one that
                              is part done. Call it again until it
                              answers done:true
     ?action=status           how far the current one has got
     ?action=list             every backup, newest first
     ?action=files&run=FOLDER the files in one backup, in order
     ?action=get&file=NAME    download one file
     ?action=drop&run=FOLDER  delete a whole backup
     ?action=cancel           abandon a part-done job

   ------------------------------------------------------------
   RESTORING. The files are plain SQL and they are numbered. Join
   them in order and run them:

     cat overhang-2026-09-06T12-00-00/*.sql > overhang.sql
     sqlite3 overhang.db < overhang.sql

   On Windows:  copy /b *.sql overhang.sql

   The numbering is what makes that work — 000 is the schema, the
   middle files are the rows in table order, and the last one
   closes the transaction and rebuilds the indexes and views.

   THREE COPIES IS THE RULE: the live database, the files in R2,
   and a copy on a drive you actually hold.
   ============================================================ */

const SKIP  = ["_cf_KV", "sqlite_sequence", "sqlite_stat1", "d1_migrations", "backup_jobs"];
const PAGE  = 500;              /* rows read at a time */
const CHUNK = 3 * 1024 * 1024;  /* flush a file at about three megabytes */
const BUDGET = 18000;           /* work this long, then save the place and stop */

export default {
  async fetch(request, env) {
    const url = new URL(request.url), q = url.searchParams;
    const h = { "Content-Type": "application/json" };
    const p = url.pathname.replace(/\/+$/, "") || "/";

    /* ---- the console: a login and a page, so nothing needs a key in the
       address bar. Your own rule: if it needs a key in the URL, it is not
       finished. ---- */
    try {
      if (p === "/ops/login")  return request.method === "POST" ? opsLogin(request, env) : opsLoginPage();
      if (p === "/ops/logout") return new Response(null, { status: 303, headers: [
        ["location", "/ops/login"],
        ["set-cookie", "ops=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"]] });
      if (p === "/ops" || p === "/") {
        if (await signedIn(env, request)) return new Response(OPS_HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
        if (p === "/ops") return new Response(null, { status: 303, headers: { location: "/ops/login" } });
      }
      /* the console's own calls, authorised by the cookie */
      if (p.startsWith("/ops/")) {
        if (!(await signedIn(env, request)))
          return new Response(JSON.stringify({ ok:false, error:"sign in" }), { status:401, headers:h });
        const a2 = p.slice(5);
        if (a2 === "run")     return json(await run(env), h);
        if (a2 === "status")  return json(await opsStatus(env), h);
        if (a2 === "list")    return json(await list(env), h);
        if (a2 === "files")   return json(await files(env, q), h);
        if (a2 === "drop")    return json(await drop(env, q), h);
        if (a2 === "cancel")  return json(await cancel(env), h);
        if (a2 === "get")     return await get(env, q);
        if (a2 === "script")  return await script(env, q, url);
        if (a2 === "whole")   return await whole(env, q);
        return json({ ok:false, error:"unknown" }, h, 404);
      }
    } catch (e) {
      return json({ ok:false, error:String(e) }, h, 500);
    }

    const key = request.headers.get("X-Auth-Key") || q.get("key");
    if (!key || key !== env.LOG_KEY)
      return new Response(JSON.stringify({ ok:false, error:"unauthorized" }), { status:401, headers:h });

    /* set the console's password once, from the key you already have:
       ?action=setpw&pw=YOURPASSWORD&key=... */
    if (q.get("action") === "setpw") return json(await setPw(env, q), h);

    /* a check, so a password failure never has to be guessed at */
    if (q.get("action") === "checkpw") {
      await opsTable(env);
      const row = await env.OVERHANG.prepare("SELECT pw, changed FROM ops_users WHERE id=1").first();
      const all = await env.OVERHANG.prepare("SELECT COUNT(*) c FROM ops_users").first();
      const pw = q.get("pw") || "";
      let made = null, match = null;
      if (row && row.pw && row.pw.includes(":")) {
        made = await hashPw(pw, row.pw.split(":")[0]);
        match = made === row.pw;
      }
      return json({ ok:true, rows_in_table: all ? all.c : 0,
        stored: row ? { changed: row.changed, len: row.pw ? row.pw.length : 0,
                        head: row.pw ? row.pw.slice(0, 8) : null,
                        tail: row.pw ? row.pw.slice(-8) : null } : null,
        tried: { chars: pw.length, head: pw.slice(0, 2), tail: pw.slice(-2),
                 hash_tail: made ? made.slice(-8) : null },
        match }, h);
    }

    try {
      const a = q.get("action") || "list";
      if (a === "run")    return json(await run(env), h);
      if (a === "status") return json(await status(env), h);
      if (a === "list")   return json(await list(env), h);
      if (a === "files")  return json(await files(env, q), h);
      if (a === "drop")   return json(await drop(env, q), h);
      if (a === "cancel") return json(await cancel(env), h);
      if (a === "get")    return await get(env, q);
      if (a === "whole")  return await whole(env, q);
      return json(await list(env), h);
    } catch (e) {
      return json({ ok:false, error:String(e), stack:String(e.stack||"") }, h, 500);
    }
  },

  /* Sunday: start it. Then keep calling until it finishes — each call
     picks up where the last one stopped. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      for (let i = 0; i < 40; i++) {
        const r = await run(env).catch(e => ({ done: true, error: String(e) }));
        if (r.done || r.error) break;
      }
    })());
  }
};


/* ============================================================
   THE CONSOLE — a login, a page, and no key in any address bar
   ============================================================ */
async function opsTable(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ops_users (id INTEGER PRIMARY KEY, pw TEXT,
       changed TEXT DEFAULT (datetime('now')))`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ops_sessions (token TEXT PRIMARY KEY, expires TEXT)`).run();
}
async function hashPw(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(x => parseInt(x, 16)))
                       : crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, k, 256));
  const hex = a => [...a].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex(salt) + ":" + hex(bits);
}
async function setPw(env, q) {
  const pw = q.get("pw") || "";
  if (pw.length < 8) return { ok:false, error:"eight characters or more, please" };
  await opsTable(env);
  await env.OVERHANG.prepare(
    `INSERT INTO ops_users (id, pw, changed) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET pw=excluded.pw, changed=datetime('now')`)
    .bind(await hashPw(pw)).run();
  return { ok:true, note: "Password set. Sign in at /ops — no key needed from here on." };
}
async function signedIn(env, request) {
  await opsTable(env);
  const m = /(?:^|;\s*)ops=([a-z0-9]+)/.exec(request.headers.get("cookie") || "");
  if (!m) return false;
  const r = await env.OVERHANG.prepare(
    "SELECT 1 FROM ops_sessions WHERE token=? AND expires > datetime('now')").bind(m[1]).first();
  return !!r;
}
async function opsLogin(request, env) {
  await opsTable(env);
  const f = await request.formData();
  const row = await env.OVERHANG.prepare("SELECT pw FROM ops_users WHERE id=1").first();
  const pw = String(f.get("password") || "");
  const ok = row && row.pw && row.pw.includes(":")
    && (await hashPw(pw, row.pw.split(":")[0])) === row.pw;
  if (!ok) return opsLoginPage("That password is not right.");
  const tok = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 30]).join("");
  await env.OVERHANG.prepare("INSERT INTO ops_sessions (token, expires) VALUES (?,?)")
    .bind(tok, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [["location", "/ops"],
    ["set-cookie", `ops=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}
function opsLoginPage(err) {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Operations</title>
<meta name="robots" content="noindex"><style>:root{color-scheme:light}
body{margin:0;background:#E9EAE3;color:#15181B;font:16px/1.6 system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.b{width:340px}h1{font:600 24px Georgia,serif;margin:0 0 14px}
form{background:#F6F6F1;border:1px solid #C3C7BC;padding:20px}
input{width:100%;padding:11px;border:1.5px solid #C3C7BC;font:inherit;background:#fff;color:#15181B}
button{width:100%;margin-top:12px;padding:12px;border:0;background:#1C5D45;color:#E9EAE3;
font:600 15px system-ui;cursor:pointer}.e{color:#8C2E22;font-size:14px;margin:0 0 8px}</style></head>
<body><div class="b"><h1>Operations</h1>${err ? '<p class="e">' + err + "</p>" : ""}
<form method="post" action="/ops/login"><input name="password" type="password"
placeholder="Password" autofocus><button>Sign in</button></form></div></body></html>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

/* everything the console shows in one call */
async function opsStatus(env) {
  const out = { ok: true };
  try { out.backup = await status(env); } catch (e) { out.backup = { error: String(e) }; }
  try {
    const w = await env.OVERHANG.prepare(
      `SELECT status, COUNT(*) c FROM wire_walk GROUP BY status`).all();
    const cov = await env.OVERHANG.prepare(
      "SELECT MIN(filed_on) a, MAX(filed_on) b, COUNT(*) c FROM wire_hits").first();
    out.wire = { walk: w.results || [], coverage: cov ? { from: cov.a, to: cov.b } : null,
                 rows: cov ? cov.c : 0 };
  } catch (e) { out.wire = { error: String(e) }; }
  try {
    out.history = (await env.OVERHANG.prepare(
      "SELECT taken_at, file, tables, rows, bytes FROM backup_log ORDER BY id DESC LIMIT 8").all()).results || [];
  } catch (e) { out.history = []; }
  try {
    const t = await env.OVERHANG.prepare(
      `SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).first();
    out.tables = t ? t.c : 0;
  } catch (e) {}
  return out;
}

/* a one-line download for the whole folder, made for the machine you are on */
async function script(env, q, url) {
  const folder = q.get("run");
  if (!folder) throw new Error("run required");
  const win = (q.get("os") || "") === "windows";
  const r = await env.BACKUPS.list({ prefix: folder + "/", limit: 1000 });
  const names = (r.objects || []).map(o => o.key).sort();
  const base = url.origin + "/ops/get?file=";
  let body;
  if (win) {
    body = "@echo off\r\nREM Downloads every file of " + folder + "\r\n"
      + "REM Sign in to the console in your browser first - this uses that session.\r\n"
      + "mkdir \"" + folder + "\" 2>nul\r\n"
      + names.map(n => 'curl -L -b "ops=%OPS%" -o "' + n.replace(/\//g, "\\") + '" "'
          + base + encodeURIComponent(n) + '"').join("\r\n")
      + "\r\ncopy /b \"" + folder + "\\*.sql\" overhang.sql\r\n"
      + "echo Done. Restore with:  sqlite3 overhang.db < overhang.sql\r\n";
  } else {
    body = "#!/bin/sh\n# Downloads every file of " + folder + "\n"
      + "mkdir -p '" + folder + "'\n"
      + names.map(n => "curl -L -b \"ops=$OPS\" -o '" + n + "' '"
          + base + encodeURIComponent(n) + "'").join("\n")
      + "\ncat '" + folder + "'/*.sql > overhang.sql\n"
      + "echo 'Done. Restore with: sqlite3 overhang.db < overhang.sql'\n";
  }
  return new Response(body, { headers: {
    "Content-Type": "text/plain",
    "Content-Disposition": 'attachment; filename="download-' + folder + (win ? '.cmd"' : '.sh"') } });
}

/* ============================================================
   THE JOB — one row, so a backup can be picked up where it stopped
   ============================================================ */
async function job(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS backup_jobs (
       id INTEGER PRIMARY KEY AUTOINCREMENT, folder TEXT, tables TEXT,
       t_index INTEGER DEFAULT 0, offset_at INTEGER DEFAULT 0, seq INTEGER DEFAULT 1,
       rows INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, counts TEXT DEFAULT '{}',
       status TEXT DEFAULT 'running', started TEXT DEFAULT (datetime('now')),
       finished TEXT)`).run();
  return env.OVERHANG.prepare(
    "SELECT * FROM backup_jobs WHERE status='running' ORDER BY id DESC LIMIT 1").first();
}

async function run(env) {
  if (!env.BACKUPS) throw new Error("no BACKUPS bucket bound");
  const started = Date.now();
  let j = await job(env);

  /* ---- nothing running: begin one, and write the schema file first ---- */
  if (!j) {
    const t = await env.OVERHANG.prepare(
      `SELECT name, sql FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    const tables = (t.results || []).filter(x => SKIP.indexOf(x.name) === -1);

    const folder = "overhang-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    let head = "-- overhang — full dump, written in numbered files\n"
      + "-- started " + new Date().toISOString() + "\n"
      + "-- " + tables.length + " tables\n"
      + "--\n-- Join the files in order, then restore:\n"
      + "--   cat " + folder + "/*.sql > overhang.sql\n"
      + "--   sqlite3 overhang.db < overhang.sql\n\n"
      + "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n";
    for (const tab of tables) {
      head += "DROP TABLE IF EXISTS " + qq(tab.name) + ";\n";
      if (tab.sql) head += tab.sql.trim() + ";\n\n";
    }
    await env.BACKUPS.put(folder + "/000-schema.sql", head,
      { httpMetadata: { contentType: "application/sql" } });

    await env.OVERHANG.prepare(
      "INSERT INTO backup_jobs (folder, tables, bytes) VALUES (?,?,?)")
      .bind(folder, JSON.stringify(tables.map(x => x.name)), head.length).run();
    j = await job(env);
  }

  const names  = JSON.parse(j.tables || "[]");
  const counts = JSON.parse(j.counts || "{}");
  let tIndex = j.t_index, offset = j.offset_at, seq = j.seq;
  let rows = j.rows, bytes = j.bytes;
  let buf = "", tableStarted = offset === 0;

  /* ---- read rows, flush files, stop when the time budget is spent ---- */
  while (tIndex < names.length) {
    if (Date.now() - started > BUDGET) break;
    const name = names[tIndex];

    if (tableStarted) { buf += "\n-- ============ " + name + " ============\n"; tableStarted = false; }

    const page = await env.OVERHANG.prepare(
      "SELECT * FROM " + qq(name) + " LIMIT " + PAGE + " OFFSET " + offset).all();
    const r = page.results || [];

    if (r.length) {
      const cols = Object.keys(r[0]);
      const head = "INSERT INTO " + qq(name) + " (" + cols.map(qq).join(",") + ") VALUES ";
      for (const row of r) buf += head + "(" + cols.map(c => lit(row[c])).join(",") + ");\n";
      rows   += r.length;
      offset += r.length;
      counts[name] = (counts[name] || 0) + r.length;
    }

    if (buf.length >= CHUNK) {
      bytes += await flush(env, j.folder, seq++, buf);
      buf = "";
    }

    if (r.length < PAGE) { tIndex++; offset = 0; tableStarted = true; }
  }

  if (buf) { bytes += await flush(env, j.folder, seq++, buf); buf = ""; }

  /* ---- still work to do: save the place and ask to be called again ---- */
  if (tIndex < names.length) {
    await env.OVERHANG.prepare(
      `UPDATE backup_jobs SET t_index=?, offset_at=?, seq=?, rows=?, bytes=?, counts=?
        WHERE id=?`).bind(tIndex, offset, seq, rows, bytes, JSON.stringify(counts), j.id).run();
    return { ok:true, done:false, folder: j.folder,
      table: names[tIndex], table_number: tIndex + 1, of: names.length,
      rows_so_far: rows, mb_so_far: +(bytes/1048576).toFixed(2),
      note: "Part done. Call ?action=run again to carry on — it picks up exactly here." };
  }

  /* ---- finished: close the transaction, put back indexes and views ---- */
  const ix = await env.OVERHANG.prepare(
    `SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name`).all();
  const vw = await env.OVERHANG.prepare(
    `SELECT sql FROM sqlite_master WHERE type='view' ORDER BY name`).all();
  let tail = "\n-- ============ indexes and views ============\n";
  for (const x of (ix.results || [])) if (x.sql) tail += x.sql.trim() + ";\n";
  for (const x of (vw.results || [])) if (x.sql) tail += x.sql.trim() + ";\n";
  tail += "\nCOMMIT;\nPRAGMA foreign_keys=ON;\n";
  bytes += await flush(env, j.folder, 999, tail);

  const manifest = { folder: j.folder, taken: new Date().toISOString(),
    tables: names.length, rows, bytes, per_table: counts,
    restore: "cat " + j.folder + "/*.sql > overhang.sql   then   sqlite3 overhang.db < overhang.sql" };
  await env.BACKUPS.put(j.folder + "/manifest.json", JSON.stringify(manifest, null, 2),
    { httpMetadata: { contentType: "application/json" },
      customMetadata: { rows: String(rows), tables: String(names.length) } });

  await env.OVERHANG.prepare(
    `UPDATE backup_jobs SET status='done', finished=datetime('now'),
       t_index=?, rows=?, bytes=?, counts=? WHERE id=?`)
    .bind(tIndex, rows, bytes, JSON.stringify(counts), j.id).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS backup_log (id INTEGER PRIMARY KEY AUTOINCREMENT,
       taken_at TEXT DEFAULT (datetime('now')), file TEXT, tables INTEGER,
       rows INTEGER, bytes INTEGER, ms INTEGER)`).run();
  await env.OVERHANG.prepare(
    "INSERT INTO backup_log (file, tables, rows, bytes, ms) VALUES (?,?,?,?,?)"
  ).bind(j.folder, names.length, rows, bytes, Date.now() - started).run();

  return { ok:true, done:true, folder: j.folder, tables: names.length, rows,
    mb: +(bytes/1048576).toFixed(2), per_table: counts,
    note: "Finished. See the files with ?action=files&run=" + j.folder +
          " and download each one — then it exists somewhere that is not Cloudflare." };
}

async function flush(env, folder, seq, text) {
  const name = folder + "/" + String(seq).padStart(3, "0") + "-rows.sql";
  await env.BACKUPS.put(name, text, { httpMetadata: { contentType: "application/sql" } });
  return text.length;
}

async function status(env) {
  const j = await job(env);
  if (!j) {
    const last = await env.OVERHANG.prepare(
      "SELECT * FROM backup_jobs ORDER BY id DESC LIMIT 1").first();
    return { ok:true, running:false, last: last || null };
  }
  const names = JSON.parse(j.tables || "[]");
  return { ok:true, running:true, folder: j.folder, table: names[j.t_index],
    table_number: j.t_index + 1, of: names.length, rows_so_far: j.rows,
    mb_so_far: +(j.bytes/1048576).toFixed(2), started: j.started,
    note: "Call ?action=run to carry on." };
}

async function cancel(env) {
  await env.OVERHANG.prepare(
    "UPDATE backup_jobs SET status='cancelled', finished=datetime('now') WHERE status='running'").run();
  return { ok:true, note: "Abandoned. The files already written are still in R2." };
}

/* ============================================================
   THE SHELF
   ============================================================ */
async function list(env) {
  if (!env.BACKUPS) throw new Error("no BACKUPS bucket bound");
  const r = await env.BACKUPS.list({ limit: 1000 });
  const runs = {};
  for (const o of (r.objects || [])) {
    const folder = o.key.split("/")[0];
    (runs[folder] ||= { run: folder, files: 0, bytes: 0, taken: o.uploaded });
    runs[folder].files++; runs[folder].bytes += o.size;
    if (o.customMetadata && o.customMetadata.rows) runs[folder].rows = +o.customMetadata.rows;
    if (o.uploaded > runs[folder].taken) runs[folder].taken = o.uploaded;
  }
  const out = Object.values(runs).map(x => ({ ...x, mb: +(x.bytes/1048576).toFixed(2) }))
    .sort((a, b) => (a.run < b.run ? 1 : -1));
  return { ok:true, count: out.length, runs: out,
    note: "?action=files&run=FOLDER lists the files of one backup, in the order they join." };
}

async function files(env, q2) {
  const folder = q2.get("run");
  if (!folder) throw new Error("run required");
  const r = await env.BACKUPS.list({ prefix: folder + "/", limit: 1000 });
  const out = (r.objects || []).map(o => ({ file: o.key, bytes: o.size,
    mb: +(o.size/1048576).toFixed(2) })).sort((a, b) => a.file < b.file ? -1 : 1);
  return { ok:true, run: folder, count: out.length, files: out,
    restore: "Download every file, keep the names, then join them in this order.\n"
      + "  cat " + folder + "/*.sql > overhang.sql\n"
      + "  sqlite3 overhang.db < overhang.sql" };
}


/* ------------------------------------------------------------
   ONE FILE. The backup is written in pieces so the worker can
   never run out of memory; this joins them back on the way out,
   streaming, so the browser saves a single .sql and the worker
   still never holds the whole thing.
   ------------------------------------------------------------ */
async function whole(env, q2) {
  if (!env.BACKUPS) throw new Error("no BACKUPS bucket bound");
  const folder = q2.get("run");
  if (!folder) throw new Error("run required");

  const r = await env.BACKUPS.list({ prefix: folder + "/", limit: 1000 });
  const names = (r.objects || []).map(o => o.key)
    .filter(k => k.endsWith(".sql")).sort();          /* 000, 001 … 999 */
  if (!names.length) return new Response("nothing in that backup", { status: 404 });

  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter();
    try {
      for (const key of names) {
        const obj = await env.BACKUPS.get(key);
        if (!obj) continue;
        const rd = obj.body.getReader();
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          await w.write(value);
        }
      }
    } catch (e) {
      await w.write(new TextEncoder().encode("\n-- INTERRUPTED: " + String(e) + "\n"));
    } finally { await w.close(); }
  })();

  return new Response(readable, { headers: {
    "Content-Type": "application/sql",
    "Content-Disposition": 'attachment; filename="' + folder + '.sql"',
    "Cache-Control": "no-store" } });
}

async function get(env, q2) {
  const file = q2.get("file");
  if (!file) throw new Error("file required");
  const obj = await env.BACKUPS.get(file);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, { headers: {
    "Content-Type": "application/sql",
    "Content-Disposition": 'attachment; filename="' + file.replace(/\//g, "_") + '"',
    "Cache-Control": "no-store" } });
}

async function drop(env, q2) {
  const folder = q2.get("run"), file = q2.get("file");
  if (file) { await env.BACKUPS.delete(file); return { ok:true, deleted: file }; }
  if (!folder) throw new Error("run or file required");
  const r = await env.BACKUPS.list({ prefix: folder + "/", limit: 1000 });
  for (const o of (r.objects || [])) await env.BACKUPS.delete(o.key);
  return { ok:true, deleted: folder, files: (r.objects || []).length };
}

/* SQLite quoting — the two things that corrupt a dump if you get them wrong */
function qq(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const b = new Uint8Array(v.buffer || v);
    let hex = "";
    for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, "0");
    return "X'" + hex + "'";
  }
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}


/* ============================================================
   THE PAGE
   ============================================================ */
const OPS_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Operations — overhang</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:light;--paper:#E9EAE3;--card:#F6F6F1;--ink:#15181B;--ink2:#4C555A;
  --green:#1C5D45;--stamp:#8C2E22;--rule:#C3C7BC;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}
.bar{background:var(--ink);color:var(--paper);padding:12px 20px;display:flex;gap:16px;
  align-items:center;position:sticky;top:0;z-index:5}
.bar b{font:600 17px Georgia,serif}.bar a{margin-left:auto;color:#9FD3BE;font-size:13px}
.w{max-width:1000px;margin:0 auto;padding:22px 20px 60px}
.card{background:var(--card);border:1px solid var(--rule);padding:18px 20px;margin-bottom:18px}
h2{font:600 19px Georgia,serif;margin:0 0 4px}
.sub{color:var(--ink2);font-size:14px;margin:0 0 14px}
.n{display:flex;gap:26px;flex-wrap:wrap;margin:10px 0 14px}
.n div{min-width:96px}.n b{display:block;font:600 24px var(--mono)}
.n span{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
button{font:600 15px system-ui;padding:11px 18px;border:1px solid var(--rule);background:#fff;
  cursor:pointer;margin-right:8px}
button.go{background:var(--green);color:#fff;border-color:var(--green)}
button.bad{color:var(--stamp)}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}
th{text-align:left;font:600 10.5px var(--mono);letter-spacing:.07em;text-transform:uppercase;
  color:var(--ink2);padding:6px 8px 6px 0;border-bottom:1px solid var(--rule)}
td{padding:8px 8px 8px 0;border-bottom:1px solid #DEE0D8;font-variant-numeric:tabular-nums}
.msg{font-size:14px;margin-left:6px}.msg.good{color:var(--green);font-weight:600}
.msg.bad{color:var(--stamp);font-weight:600}
.bar2{height:8px;background:#DEE0D8;margin:10px 0}
.bar2 i{display:block;height:8px;background:var(--green)}
a{color:var(--green)}code{font:13px var(--mono);background:#E9EAE3;padding:1px 5px}
</style></head><body>
<div class="bar"><b>Operations</b><span style="font-size:13px;color:#AEB6B1">overhang</span>
  <a href="/ops/logout">Sign out</a></div>
<div class="w">

  <div class="card">
    <h2>The database</h2>
    <p class="sub">What is in it right now.</p>
    <div class="n">
      <div><b id="rows">—</b><span>wire rows</span></div>
      <div><b id="tabs">—</b><span>tables</span></div>
      <div><b id="cov">—</b><span>wire covers</span></div>
      <div><b id="walk">—</b><span>weeks left</span></div>
    </div>
  </div>

  <div class="card">
    <h2>Backup</h2>
    <p class="sub">Writes the whole database to numbered files. It works in short bursts and
      picks up where it stopped, so it cannot run out of memory. Press once and leave it.</p>
    <div class="bar2"><i id="prog" style="width:0"></i></div>
    <p id="state" class="sub" style="margin:0 0 12px">—</p>
    <button class="go" onclick="startRun()">Run a backup</button>
    <button onclick="load()">Refresh</button>
    <button class="bad" onclick="stopRun()">Stop</button>
    <span class="msg" id="m"></span>
  </div>

  <div class="card">
    <h2>What is stored</h2>
    <p class="sub">Every backup in R2. <b>Download</b> saves the whole thing as one .sql file —
      keep it on a drive you hold, and that is the third copy.</p>
    <table id="runs"><tr><th>Backup</th><th>Files</th><th>Size</th><th>Rows</th><th></th></tr></table>
  </div>

  <div class="card">
    <h2>History</h2>
    <table id="hist"><tr><th>Taken</th><th>Backup</th><th>Tables</th><th>Rows</th><th>Size</th></tr></table>
  </div>

</div>
<script>
var busy=false;
function $(x){return document.getElementById(x);}
function say(t,k){var m=$('m');m.textContent=t||'';m.className='msg '+(k||'');}
function mb(b){return (b/1048576).toFixed(1)+' MB';}

function load(){
  fetch('/ops/status').then(function(r){return r.json();}).then(function(d){
    if(d.wire && !d.wire.error){
      $('rows').textContent = (d.wire.rows||0).toLocaleString();
      $('cov').textContent = d.wire.coverage ? String(d.wire.coverage.from).slice(0,7) : '—';
      var pend = (d.wire.walk||[]).filter(function(x){return x.status==='pending';})[0];
      $('walk').textContent = pend ? pend.c : '0';
    }
    $('tabs').textContent = d.tables||'—';
    var b=d.backup||{};
    if(b.running){ $('state').textContent = 'Running — table '+b.table_number+' of '+b.of+
      ' ('+b.table+'), '+(b.rows_so_far||0).toLocaleString()+' rows, '+b.mb_so_far+' MB so far.';
      $('prog').style.width = Math.round((b.table_number/b.of)*100)+'%'; }
    else { $('state').textContent = b.last ? 'Last backup '+(b.last.finished||b.last.started)+
      ' — '+(b.last.rows||0).toLocaleString()+' rows.' : 'No backup has been taken yet.';
      $('prog').style.width='0'; }
    runs();
    var h=$('hist'); h.innerHTML='<tr><th>Taken</th><th>Backup</th><th>Tables</th><th>Rows</th><th>Size</th></tr>';
    (d.history||[]).forEach(function(x){
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+x.taken_at+'</td><td>'+x.file+'</td><td>'+x.tables+'</td><td>'+
        (x.rows||0).toLocaleString()+'</td><td>'+mb(x.bytes||0)+'</td>';
      h.appendChild(tr);
    });
  });
}
function runs(){
  fetch('/ops/list').then(function(r){return r.json();}).then(function(d){
    var t=$('runs'); t.innerHTML='<tr><th>Backup</th><th>Files</th><th>Size</th><th>Rows</th><th></th></tr>';
    (d.runs||[]).forEach(function(x){
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+x.run+'</td><td>'+x.files+'</td><td>'+x.mb+' MB</td><td>'+
        (x.rows? x.rows.toLocaleString():'—')+'</td>'+
        '<td><a href="/ops/whole?run='+encodeURIComponent(x.run)+'"><b>Download</b></a>'+
        ' · <a href="/ops/files?run='+encodeURIComponent(x.run)+'" target="_blank">what is in it</a></td>';
      t.appendChild(tr);
    });
  });
}
function startRun(){
  if(busy) return; busy=true; say('Working…');
  (function step(){
    fetch('/ops/run').then(function(r){return r.json();}).then(function(j){
      if(!j.ok){ busy=false; say(j.error||'Stopped.','bad'); return; }
      load();
      if(j.done){ busy=false; say('Finished — '+(j.rows||0).toLocaleString()+' rows.','good'); return; }
      say('Table '+j.table_number+' of '+j.of+' — '+(j.rows_so_far||0).toLocaleString()+' rows so far…');
      step();
    }).catch(function(){ busy=false; say('Lost the connection. Press Run again — it carries on.','bad'); });
  })();
}
function stopRun(){ busy=false; fetch('/ops/cancel').then(function(){ say('Stopped.','bad'); load(); }); }
load(); setInterval(function(){ if(!busy) load(); }, 30000);
</script></body></html>`;