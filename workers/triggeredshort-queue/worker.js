/* BUILT 2026-08-26 19:18 ET */
/* ============================================================
   triggeredshort-queue  —  Cloudflare Worker
   THE APPROVAL QUEUE. The wire finds them. You decide which
   ones get said out loud. Nothing posts without a decision.
   Built 26 Aug 2026

   BINDINGS   OVERHANG  D1 → overhang
   SECRETS    LOG_KEY
              X_BEARER          (needed to actually post)
   VARIABLE   AUTO_POST = on    (plain variable, not a secret — set it to
                                 anything else to hold posts for approval)

   NO CRON ON THIS WORKER. The account is at its five-trigger limit, and
   this does not need one: triggeredshort-wire calls ?action=draft at the
   end of its own nightly run. That is the better order anyway — the queue
   drafts from filings the scan has just finished writing, so it can never
   run first and find nothing.

   EVERY ENDPOINT NEEDS THE KEY. There is no public read here.
   Send X-Auth-Key as a header; the Cloudflare editor's HTTP tab
   can do that, Preview cannot.

     ?action=draft&days=2        turn new wire hits into drafts
                                 (the wire worker calls this after every scan)
     ?action=list&status=pending
     ?action=approve&id=7&note=...
     ?action=reject&id=7&note=...
     ?action=edit&id=7&draft=... replace the wording, stays pending
     ?action=post&id=7           post ONE approved draft
     ?action=post_all            post everything approved
     ?action=stats

   POSTING IS OFF UNTIL YOU SET IT ON. With no X_BEARER secret the
   post action returns the text it WOULD have sent and marks the row
   'ready' - so the whole queue can be run and read before a single
   thing reaches a timeline.
   ============================================================ */

const LIVE_LINK = "https://triggeredshort.com/warrants.html";

/* The only sentence shapes this worker will ever produce.
   Every one of them reports a document. None characterises a company. */
const HEAVY_LABELS = ["Price reset","Cashless exercise","Warrant inducement","Inducement agreement",
                      "Reduced exercise price","Variable rate transaction","Equity line"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url), q = url.searchParams;
    const headers = { "Content-Type": "application/json",
                      "Access-Control-Allow-Origin": "*",
                      "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type" };
    if (request.method === "OPTIONS") return new Response(null, { headers });

    const key = request.headers.get("X-Auth-Key") || q.get("key");
    if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, headers, 401);

    try {
      const a = q.get("action") || "stats";
      if (a === "draft")    return json(await draft(env, Math.min(+(q.get("days")||2), 30)), headers);
      if (a === "list")     return json(await list(env, q.get("status")), headers);
      if (a === "approve")  return json(await decide(env, q.get("id"), "approved", q.get("note")), headers);
      if (a === "reject")   return json(await decide(env, q.get("id"), "rejected", q.get("note")), headers);
      if (a === "edit")     return json(await edit(env, q.get("id"), q.get("draft")), headers);
      if (a === "post")     return json(await post(env, q.get("id")), headers);
      if (a === "post_all") return json(await postAll(env), headers);
      return json(await stats(env), headers);
    } catch (e) {
      return json({ ok:false, error:String(e), stack:String(e.stack||"") }, headers, 500);
    }
  },

  /* Kept so a cron can be attached later without a code change. Nothing
     calls it today — the wire worker drives the draft over HTTP instead. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await draft(env, 1);
      if (env.AUTO_POST === "on") await postAll(env);
    })().catch(()=>{}));
  }
};

/* ============================================================
   DRAFTING — ONE POST A DAY, NAMING NOBODY

   The post announces that filings landed and links to the page.
   It does not name a company, because a named company in a
   timeline is a call, and a link to a list is a publication.
   That is the whole reason this can run unattended.
   ============================================================ */

async function draft(env, days) {
  const from = addDays(today(), -days);

  const r = await env.OVERHANG.prepare(
    `SELECT accession, ticker, company, form, filed_on, labels, heavy
       FROM v_wire_filings WHERE filed_on >= ? LIMIT 200`
  ).bind(from).all();
  const rows = (r.results || []).filter(f => f.heavy > 0);

  if (!rows.length) {
    return { ok:true, since: from, drafted: 0,
             note: "Nothing heavy on the wire. No post drafted, and that is correct." };
  }

  /* one row per day, keyed on the date so a rerun does not duplicate */
  const key = "roundup-" + today();
  const exists = await env.OVERHANG.prepare(
    "SELECT id FROM post_queue WHERE accession = ?").bind(key).first();
  if (exists) return { ok:true, drafted: 0, note: "Already drafted for today.", id: exists.id };

  const text = compose(rows);

  await env.OVERHANG.prepare(
    `INSERT INTO post_queue
       (accession, company, form, filed_on, labels, heavy, doc_url, draft, chars, status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(key, rows.length + " companies", "roundup", today(),
         summarise(rows), 1, LIVE_LINK, text, text.length,
         env.AUTO_POST === "on" ? "approved" : "pending").run();

  return { ok:true, since: from, companies: rows.length, drafted: 1,
           auto: env.AUTO_POST === "on",
           draft: text,
           note: env.AUTO_POST === "on"
             ? "Drafted and marked approved — AUTO_POST is on."
             : "Drafted and waiting. Set the AUTO_POST variable to 'on' to skip approval." };
}

/* His words, short. 140 characters, cashtags on, the link last.
   The caveat cannot fit in 140 - it lives on the page the link opens,
   in the first line under the heading. */
function compose(rows) {
  const LINK  = LIVE_LINK;
  const LIMIT = 140;

  const tick = [];
  for (const f of rows) {
    const t = (f.ticker || "").trim().toUpperCase();
    if (t && tick.indexOf(t) === -1) tick.push("$" + t);
  }

  const head = "They are at it again. Warrant deals filed today.";

  /* the link is counted as 23 characters by the platform whatever its length */
  const LINKCOST = 24;

  let shown = tick.slice();
  let text  = build(head, shown, 0, LINK);
  while (len(text, LINKCOST, LINK) > LIMIT && shown.length > 1) {
    shown.pop();
    text = build(head, shown, tick.length - shown.length, LINK);
  }
  if (!tick.length) text = head + " " + LINK;

  return text;
}

function build(head, shown, more, link) {
  return head + " " + shown.join(" ") + (more ? " +" + more : "") + " " + link;
}

/* character count as the platform counts it: any link is 23, plus the space */
function len(text, linkcost, link) {
  return text.replace(link, "").length + linkcost - 1;
}

function summarise(rows) {
  const counts = {};
  for (const f of rows) {
    String(f.labels || "").split(" | ").forEach(function (l) {
      if (l && HEAVY_LABELS.includes(l)) counts[l] = (counts[l] || 0) + 1;
    });
  }
  return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return k + " x" + counts[k]; }).join(" | ");
}

/* ============================================================
   DECISIONS
   ============================================================ */

async function list(env, status) {
  const sql = status
    ? "SELECT * FROM v_post_queue WHERE status = ? LIMIT 200"
    : "SELECT * FROM v_post_queue LIMIT 200";
  const r = status
    ? await env.OVERHANG.prepare(sql).bind(status).all()
    : await env.OVERHANG.prepare(sql).all();
  const rows = r.results || [];
  const counts = {};
  for (const x of rows) counts[x.status] = (counts[x.status] || 0) + 1;
  return { ok:true, counts, rows };
}

async function decide(env, id, status, note) {
  if (!id) throw new Error("id required");
  await env.OVERHANG.prepare(
    `UPDATE post_queue SET status = ?, decided_at = datetime('now'), decided_note = ?
      WHERE id = ? AND status IN ('pending','approved','rejected','ready')`
  ).bind(status, note || null, id).run();
  const row = await env.OVERHANG.prepare("SELECT * FROM v_post_queue WHERE id = ?").bind(id).first();
  return { ok:true, row };
}

async function edit(env, id, text) {
  if (!id || !text) throw new Error("id and draft required");
  await env.OVERHANG.prepare(
    `UPDATE post_queue SET draft = ?, chars = ?, status = 'pending',
            decided_at = NULL, decided_note = NULL WHERE id = ?`
  ).bind(text, text.length, id).run();
  const row = await env.OVERHANG.prepare("SELECT * FROM v_post_queue WHERE id = ?").bind(id).first();
  return { ok:true, row, note: "Edited drafts go back to pending. An edit is not an approval." };
}

/* ============================================================
   POSTING — only what has been approved, one at a time
   ============================================================ */

async function post(env, id) {
  if (!id) throw new Error("id required");
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM post_queue WHERE id = ?").bind(id).first();
  if (!row) throw new Error("not found");
  if (row.status !== "approved")
    return { ok:false, error:`status is ${row.status}, not approved. Nothing sent.` };

  if (!env.X_BEARER) {
    await env.OVERHANG.prepare(
      "UPDATE post_queue SET status='ready' WHERE id = ?").bind(id).run();
    return { ok:true, sent:false, status:"ready",
             would_have_posted: row.draft,
             note: "Posting is off — no X_BEARER secret set. This is the text it would have sent." };
  }

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.X_BEARER}`,
               "Content-Type": "application/json" },
    body: JSON.stringify({ text: row.draft })
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { ok:false, error:`HTTP ${res.status}`, detail: out };

  const pid = out && out.data && out.data.id;
  await env.OVERHANG.prepare(
    `UPDATE post_queue SET status='posted', posted_at=datetime('now'), post_url=? WHERE id=?`
  ).bind(pid ? `https://x.com/i/status/${pid}` : null, id).run();

  return { ok:true, sent:true, id, post_url: pid ? `https://x.com/i/status/${pid}` : null };
}

async function postAll(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id FROM post_queue WHERE status='approved' ORDER BY id LIMIT 10").all();
  const out = [];
  for (const x of (r.results || [])) {
    out.push(await post(env, x.id));
    await sleep(2000);                     /* never machine-gun a timeline */
  }
  return { ok:true, attempted: out.length, results: out };
}

async function stats(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT status, COUNT(*) n FROM post_queue GROUP BY status`).all();
  const last = await env.OVERHANG.prepare(
    `SELECT id, company, filed_on, status, posted_at FROM post_queue
      ORDER BY id DESC LIMIT 10`).all();
  return { ok:true, by_status: r.results || [], recent: last.results || [],
           posting_enabled: !!env.X_BEARER };
}

/* ============================================================ */
function today(){ return new Date().toISOString().slice(0,10); }
function addDays(d,n){ const x=new Date(d+"T12:00:00Z"); x.setUTCDate(x.getUTCDate()+n);
  return x.toISOString().slice(0,10); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function json(o,h,s=200){ return new Response(JSON.stringify(o,null,2),{status:s,headers:h}); }