// triggeredshort-crawler
// Second Worker. Walks every SEC-listed company, records state of incorporation,
// exchange and shell status. Runs off a queue because ~12,000 CIKs will not fit
// in one Worker invocation.
//
// Bindings (same as the collector):
//   D1 database -> OVERHANG
//   Secret      -> LOG_KEY
//   Variable    -> SEC_UA
//
// Cron: * * * * *   (every minute — it drains a batch each run and stops when done)

const TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json";
const SUB = "https://data.sec.gov/submissions/CIK";
const CONCEPT = "https://data.sec.gov/api/xbrl/companyconcept/CIK";
const BATCH = 20;        // keep under the free-plan subrequest ceiling
const PAUSE_MS = 120;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      drain(env, BATCH).then(() => refreshMeta(env).catch(() => {}))
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Browser preflight for the admin page.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    // PUBLIC SEARCH — no sign-in. This is the free tier: anyone can look up a
    // company by name or ticker and see what the system holds on it. What it
    // returns is deliberately shallow. The detail sits behind the paid tier.
    const pub = url.searchParams.get("q");
    if (pub !== null) {
      return json(await publicSearch(pub, url, request, env), 200, request);
    }

    // Login: username + password in headers, returns a signed token.
    if (url.searchParams.get("auth") === "login") {
      return json(await login(request, env), 200, request);
    }

    const who = await authenticate(request, url, env);
    if (!who) return json({ error: "unauthorized" }, 401, request);

    // User administration — admins only.
    const users = url.searchParams.get("users");
    if (users) {
      const need = users === "list" || users === "logins" ? "users.read" : "users.write";
      if (!can(who, need)) return denied(need, request);
      return json(await userAdmin(users, url, env, who), 200, request);
    }

    if (url.searchParams.get("whoami"))
      return json({ user: who.username, role: who.role, name: who.name }, 200, request);

    try {
      if (url.searchParams.get("perms")) {
      if (!can(who, "perms.read")) return denied("perms.read", request);
      return json({ permissions: PERMISSIONS, roles: ROLES, you: who }, 200, request);
    }

    if (url.searchParams.get("seed")) {
      if (!can(who, "crawl.seed")) return denied("crawl.seed", request);
      return json(await seed(env), 200, request);
    }

    // Find a company by name or ticker. Nobody should have to know a CIK.
    const find = url.searchParams.get("find");
    if (find !== null) {
      if (!can(who, "read.data")) return denied("read.data", request);
      return json(await findCompany(find, env), 200, request);
    }

    const watch = url.searchParams.get("watch");
    if (watch) {
      if (!can(who, "watchlist.write")) return denied("watchlist.write", request);
      return json(await watchlist(watch, url, env), 200, request);
    }

    if (url.searchParams.get("export")) {
      if (!can(who, "export")) return denied("export", request);
      return csv(await exportTable(url.searchParams.get("export"), env), request);
    }

      const meta = url.searchParams.get("meta");
      if (meta === "refresh") {
        if (!can(who, "crawl.refresh")) return denied("crawl.refresh", request);
        return json(await refreshMeta(env), 200, request);
      }
      if (meta === "set" && !can(who, "meta.write")) return denied("meta.write", request);
      if (meta === "delete" && !can(who, "meta.delete")) return denied("meta.delete", request);
      if (meta === "set") {
        const k = url.searchParams.get("k");
        const v = url.searchParams.get("v");
        const note = url.searchParams.get("note") || null;
        if (!k) return json({ error: "need k" }, 400, request);
        await env.OVERHANG.prepare(
          "INSERT INTO collector_meta (k, v, source, note, updated_at) VALUES (?,?,'manual',?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, source='manual', note=COALESCE(excluded.note, collector_meta.note), updated_at=excluded.updated_at"
        )
          .bind(k, v || "", note)
          .run();
        return json({ set: k, value: v, source: "manual" }, 200, request);
      }
      if (meta === "delete") {
        const k = url.searchParams.get("k");
        if (!k) return json({ error: "need k" }, 400, request);
        await env.OVERHANG.prepare("DELETE FROM collector_meta WHERE k = ?").bind(k).run();
        return json({ deleted: k }, 200, request);
      }

      const view = url.searchParams.get("view");
      if (view) {
        const need = view === "meta" ? "read.meta" : "read.data";
        if (!can(who, need)) return denied(need, request);
        return json(await read(env, view, url), 200, request);
      }

      if (!can(who, "crawl.run")) return denied("crawl.run", request);
      const n = Math.min(Number(url.searchParams.get("drain") || BATCH), 60);
      return json(await drain(env, n), 200, request);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500, request);
    }
  },
};



// ---------------------------------------------------------- watchlist & export

// The free tier. Says what is on file. Does not say what it means.
// Not free of charge to the user: a name and an email are the price of entry.
async function publicSearch(q, url, request, env) {
  const term = String(q || "").trim();
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
  const first = String(url.searchParams.get("first") || "").trim();
  const last = String(url.searchParams.get("last") || "").trim();

  if (!email || !first || !last) {
    return { error: "first name, last name and email required", need_signin: true };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return { error: "that email does not look right", need_signin: true };
  }
  if (first.length < 2 || first.length > 60) {
    return { error: "please give a first name", need_signin: true };
  }
  if (last.length < 2 || last.length > 60) {
    return { error: "please give a last name", need_signin: true };
  }

  const country = (request.cf && request.cf.country) || null;

  // Optional. Nobody is turned away for leaving these blank.
  const roleRaw = String(url.searchParams.get("role") || "").trim().toLowerCase();
  const ROLES = ["retail investor", "financial professional", "journalist", "other"];
  const role = ROLES.indexOf(roleRaw) >= 0 ? roleRaw : null;
  const firm = String(url.searchParams.get("firm") || "").trim().slice(0, 120) || null;
  const crd = String(url.searchParams.get("crd") || "").replace(/\D/g, "").slice(0, 12) || null;
  // SEC CIK. Publicly checkable on EDGAR, unlike an LTID.
  const cikRaw = String(url.searchParams.get("cik") || "").replace(/\D/g, "");
  const cik = cikRaw ? cikRaw.slice(0, 10).padStart(10, "0") : null;

  await env.OVERHANG.prepare(
    "INSERT INTO collector_leads (email, first_name, last_name, role, firm, crd, cik, country, source, searches) VALUES (?,?,?,?,?,?,?,?,?,1) " +
    "ON CONFLICT(email) DO UPDATE SET first_name = excluded.first_name, " +
    "last_name = excluded.last_name, " +
    "role = COALESCE(excluded.role, collector_leads.role), " +
    "firm = COALESCE(excluded.firm, collector_leads.firm), " +
    "crd = COALESCE(excluded.crd, collector_leads.crd), " +
    "cik = COALESCE(excluded.cik, collector_leads.cik), " +
    "last_seen = datetime('now'), searches = collector_leads.searches + 1"
  ).bind(email, first, last, role, firm, crd, cik, country, "site search").run();

  if (term.length < 2) return { query: term, matches: [] };

  const up = term.toUpperCase().replace(/[%_]/g, "");
  const like = "%" + up + "%";

  const r = await env.OVERHANG.prepare(
    "SELECT cik, ticker, title, exchange, state_inc, sic_desc, former_name_count, shell_ever " +
    "FROM collector_issuers " +
    "WHERE UPPER(ticker) = ?1 OR UPPER(ticker) LIKE ?2 OR UPPER(title) LIKE ?2 " +
    "ORDER BY CASE WHEN UPPER(ticker) = ?1 THEN 0 WHEN UPPER(ticker) LIKE ?2 THEN 1 ELSE 2 END, " +
    "LENGTH(title), title LIMIT 12"
  ).bind(up, like).all();

  const hits = (r.results || []).length;

  await env.OVERHANG.prepare(
    "INSERT INTO collector_lead_searches (email, query, hits) VALUES (?,?,?)"
  ).bind(email, term, hits).run();

  return {
    query: term,
    count: hits,
    matches: (r.results || []).map(function (x) {
      return {
        cik: x.cik,
        ticker: x.ticker,
        name: x.title,
        exchange: x.exchange,
        state: x.state_inc,
        industry: x.sic_desc,
        name_changes: x.former_name_count,
        was_shell: x.shell_ever === 1 ? true : x.shell_ever === 0 ? false : null,
      };
    }),
  };
}

// Matches on ticker first, then on company name. Exact ticker wins outright.
async function findCompany(q, env) {
  const term = String(q || "").trim();
  if (term.length < 1) return { query: term, matches: [] };

  const up = term.toUpperCase();
  const like = "%" + term.replace(/[%_]/g, "") + "%";

  const r = await env.OVERHANG.prepare(
    "SELECT cik, ticker, title, exchange, state_inc, sic_desc, former_name_count, shell_ever " +
    "FROM collector_issuers " +
    "WHERE UPPER(ticker) = ?1 OR UPPER(ticker) LIKE ?2 OR UPPER(title) LIKE ?2 " +
    "ORDER BY CASE WHEN UPPER(ticker) = ?1 THEN 0 WHEN UPPER(ticker) LIKE ?2 THEN 1 ELSE 2 END, " +
    "LENGTH(title), title LIMIT 15"
  )
    .bind(up, "%" + up.replace(/[%_]/g, "") + "%")
    .all();

  const rows = r.results || [];

  // Say which of them are already followed, so the page can show it.
  let watched = {};
  if (rows.length) {
    const w = await env.OVERHANG.prepare(
      "SELECT cik, active FROM collector_watchlist"
    ).all();
    (w.results || []).forEach(function (x) { watched[x.cik] = x.active; });
  }

  return {
    query: term,
    count: rows.length,
    matches: rows.map(function (x) {
      return {
        cik: x.cik,
        ticker: x.ticker,
        name: x.title,
        exchange: x.exchange,
        state: x.state_inc,
        industry: x.sic_desc,
        name_changes: x.former_name_count,
        shell_ever: x.shell_ever,
        on_watchlist: watched[x.cik] === 1,
      };
    }),
  };
}

async function watchlist(action, url, env) {
  const cik = String(url.searchParams.get("cik") || "").replace(/\D/g, "").padStart(10, "0");
  if (action === "list") {
    const r = await env.OVERHANG.prepare(
      "SELECT cik, label, active, added_at FROM collector_watchlist ORDER BY label"
    ).all();
    return { watchlist: r.results };
  }
  if (!cik || cik === "0000000000") return { error: "need cik" };
  if (action === "add") {
    const label = url.searchParams.get("label") || cik;
    await env.OVERHANG.prepare(
      "INSERT INTO collector_watchlist (cik, label, active) VALUES (?,?,1) ON CONFLICT(cik) DO UPDATE SET label=excluded.label, active=1"
    ).bind(cik, label).run();
    await env.OVERHANG.prepare(
      "INSERT OR IGNORE INTO collector_queue (cik, kind, status) VALUES (?, 'profile', 'pending')"
    ).bind(cik).run();
    return { added: cik, label: label };
  }
  if (action === "off" || action === "on") {
    await env.OVERHANG.prepare("UPDATE collector_watchlist SET active = ? WHERE cik = ?")
      .bind(action === "on" ? 1 : 0, cik).run();
    return { cik: cik, active: action === "on" };
  }
  return { error: "unknown action" };
}

const EXPORTABLE = {
  nevada: "v_nevada_corps",
  delaware: "v_delaware_corps",
  texas: "v_texas_corps",
  renamed: "v_renamed_issuers",
  serial: "v_serial_renamers",
  shells: "v_shell_origin",
  addresses: "v_shared_address",
  owners: "v_owner_recurrence",
  scoreboard: "v_state_scoreboard",
  meta: "v_meta",
  users: "v_users",
  leads: "v_leads",
  pros: "v_leads_pro",
  roles: "v_lead_roles",
  demand: "v_lead_demand",
};

async function exportTable(name, env) {
  const view = EXPORTABLE[name];
  if (!view) return "error\nunknown table: " + name;
  const r = await env.OVERHANG.prepare("SELECT * FROM " + view + " LIMIT 20000").all();
  const rows = r.results || [];
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(",")]
    .concat(rows.map((row) => cols.map((c) => esc(row[c])).join(",")))
    .join("\n");
}

function csv(text, request) {
  return new Response(text, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="export.csv"',
      ...cors(request),
    },
  });
}

// ---------------------------------------------------------- permissions
//
// ONE table. The worker enforces it and the admin page displays it, so the
// reference a person reads is the rule that actually runs.

const PERMISSIONS = [
  { id: "read.data",          label: "See the data",            detail: "Counts, Nevada list, shells, shared addresses, owner recurrence" },
  { id: "read.meta",          label: "See site values",         detail: "The keys and text shown on the public pages" },
  { id: "meta.write",         label: "Change site values",      detail: "Edit any key; an auto key becomes manual once edited" },
  { id: "meta.delete",        label: "Remove site values",      detail: "Delete a key outright" },
  { id: "crawl.refresh",      label: "Recalculate numbers",     detail: "Recompute every auto key from the database now" },
  { id: "crawl.run",          label: "Run a batch",             detail: "Process a batch of companies immediately" },
  { id: "crawl.seed",         label: "Re-queue everything",     detail: "Re-load all 10,398 companies. Expensive. Rarely needed" },
  { id: "watchlist.write",    label: "Manage the watchlist",    detail: "Add or switch off a company the collector follows" },
  { id: "cards.write",        label: "Edit executive cards",    detail: "Change what a card records. Never a grade, only filed facts" },
  { id: "reports.write",      label: "Draft reports",           detail: "Write and revise, but not publish" },
  { id: "reports.publish",    label: "PUBLISH",                 detail: "Push live under the byline. Held by the owner and not delegated" },
  { id: "corrections.write",  label: "Log corrections",         detail: "Record a correction with its date beside the original figure" },
  { id: "users.read",         label: "See people",              detail: "Who has an account and when they last signed in" },
  { id: "users.write",        label: "Manage people",           detail: "Add, set passwords, change roles, switch accounts on and off" },
  { id: "logins.read",        label: "See sign-in history",     detail: "Every attempt, success or failure, with country" },
  { id: "perms.read",         label: "See this table",          detail: "View the permissions reference itself" },
  { id: "export",             label: "Export",                  detail: "Download any table as CSV" },
  { id: "console.open",       label: "Open the old console",     detail: "The original site console. Full database access, key only, no roles" },
];

const ROLES = {
  viewer: {
    label: "Viewer",
    note: "Can look at everything and change nothing.",
    perms: ["read.data", "read.meta"],
  },
  editor: {
    label: "Editor",
    note: "Does the work. Cannot publish, cannot manage people, cannot re-seed.",
    perms: [
      "read.data", "read.meta", "meta.write", "crawl.refresh", "crawl.run",
      "watchlist.write", "cards.write", "reports.write", "corrections.write",
      "perms.read",
    ],
  },
  admin: {
    label: "Admin",
    note: "Everything, including publishing and people.",
    perms: PERMISSIONS.map(function (p) { return p.id; }),
  },
};

function can(who, perm) {
  if (!who) return false;
  const r = ROLES[who.role];
  return !!r && r.perms.indexOf(perm) >= 0;
}

function denied(perm, request) {
  return json(
    { error: "not permitted", needs: perm },
    403,
    request
  );
}

// ---------------------------------------------------------- accounts

// Two ways in:
//   1. the master LOG_KEY  — always admin, the bootstrap and the fallback
//   2. a signed token issued by ?auth=login against collector_users
// Passwords are never stored. Only a PBKDF2 hash and a per-user salt.

const TOKEN_HOURS = 12;

async function authenticate(request, url, env) {
  const key = request.headers.get("X-Auth-Key") || url.searchParams.get("key") || "";
  if (env.LOG_KEY && key === env.LOG_KEY) {
    return { username: "master", role: "admin", name: "Master key" };
  }

  const tok = request.headers.get("X-Auth-Token") || url.searchParams.get("token") || "";
  if (!tok) return null;

  const parts = tok.split(".");
  if (parts.length !== 2) return null;

  const body = parts[0];
  const sig = parts[1];
  const expect = await hmac(body, env.LOG_KEY || "");
  if (sig !== expect) return null;

  let claim;
  try {
    claim = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (e) {
    return null;
  }
  if (!claim || !claim.u || !claim.exp || Date.now() > claim.exp) return null;

  // Confirm the account is still switched on — a disabled account dies at once,
  // it does not wait for the token to expire.
  const row = await env.OVERHANG.prepare(
    "SELECT username, display_name, role, active FROM collector_users WHERE username = ?"
  )
    .bind(claim.u)
    .first();
  if (!row || !row.active) return null;

  return { username: row.username, role: row.role, name: row.display_name };
}

async function login(request, env) {
  const u = (request.headers.get("X-Auth-User") || "").trim().toLowerCase();
  const p = request.headers.get("X-Auth-Pass") || "";
  const country = (request.cf && request.cf.country) || null;

  const note = async (ok, reason) => {
    try {
      await env.OVERHANG.prepare(
        "INSERT INTO collector_logins (username, ok, reason, country) VALUES (?,?,?,?)"
      )
        .bind(u || null, ok ? 1 : 0, reason || null, country)
        .run();
    } catch (e) {}
  };

  if (!u || !p) {
    await note(false, "missing");
    return { error: "username and password required" };
  }

  const row = await env.OVERHANG.prepare(
    "SELECT username, display_name, role, pass_hash, salt, active FROM collector_users WHERE username = ?"
  )
    .bind(u)
    .first();

  if (!row) {
    await note(false, "no such user");
    return { error: "sign in failed" };
  }
  if (!row.active) {
    await note(false, "disabled");
    return { error: "this account is switched off" };
  }
  if (!row.pass_hash) {
    await note(false, "no password set");
    return { error: "no password set for this account" };
  }

  const hash = await pbkdf2(p, row.salt);
  if (hash !== row.pass_hash) {
    await note(false, "bad password");
    return { error: "sign in failed" };
  }

  await env.OVERHANG.prepare(
    "UPDATE collector_users SET last_login = datetime('now'), login_count = login_count + 1 WHERE username = ?"
  )
    .bind(u)
    .run();
  await note(true, null);

  const claim = { u: row.username, r: row.role, exp: Date.now() + TOKEN_HOURS * 3600e3 };
  const body = btoa(JSON.stringify(claim)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = await hmac(body, env.LOG_KEY || "");

  return {
    token: body + "." + sig,
    user: row.username,
    name: row.display_name,
    role: row.role,
    expires_in_hours: TOKEN_HOURS,
  };
}

async function userAdmin(action, url, env, who) {
  const u = (url.searchParams.get("u") || "").trim().toLowerCase();

  if (action === "list") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_users").all();
    return { users: r.results };
  }

  if (action === "logins") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_recent_logins").all();
    return { logins: r.results };
  }

  if (!u) return { error: "need u" };

  if (action === "add") {
    const role = (url.searchParams.get("role") || "viewer").toLowerCase();
    if (["admin", "editor", "viewer"].indexOf(role) < 0) return { error: "bad role" };
    const pass = url.searchParams.get("pass") || "";
    const name = url.searchParams.get("name") || u;
    const salt = randomHex(16);
    const hash = pass ? await pbkdf2(pass, salt) : null;

    await env.OVERHANG.prepare(
      "INSERT INTO collector_users (username, display_name, role, pass_hash, salt, active, created_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name, role=excluded.role"
    )
      .bind(u, name, role, hash, salt, who.username)
      .run();
    return { added: u, role: role, password_set: !!pass };
  }

  if (action === "setpass") {
    const pass = url.searchParams.get("pass") || "";
    if (pass.length < 8) return { error: "password must be at least 8 characters" };
    const salt = randomHex(16);
    const hash = await pbkdf2(pass, salt);
    const r = await env.OVERHANG.prepare(
      "UPDATE collector_users SET pass_hash = ?, salt = ? WHERE username = ?"
    )
      .bind(hash, salt, u)
      .run();
    return { username: u, password_changed: r.meta.changes > 0 };
  }

  if (action === "on" || action === "off") {
    if (u === who.username) return { error: "you cannot switch off your own account" };
    const r = await env.OVERHANG.prepare(
      "UPDATE collector_users SET active = ? WHERE username = ?"
    )
      .bind(action === "on" ? 1 : 0, u)
      .run();
    return { username: u, active: action === "on", changed: r.meta.changes > 0 };
  }

  if (action === "role") {
    const role = (url.searchParams.get("role") || "").toLowerCase();
    if (["admin", "editor", "viewer"].indexOf(role) < 0) return { error: "bad role" };
    if (u === who.username) return { error: "you cannot change your own role" };
    await env.OVERHANG.prepare("UPDATE collector_users SET role = ? WHERE username = ?")
      .bind(role, u)
      .run();
    return { username: u, role: role };
  }

  if (action === "delete") {
    if (u === who.username) return { error: "you cannot delete your own account" };
    const r = await env.OVERHANG.prepare("DELETE FROM collector_users WHERE username = ?")
      .bind(u)
      .run();
    return { deleted: u, changed: r.meta.changes > 0 };
  }

  return { error: "unknown action" };
}

// ---------------------------------------------------------- crypto

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    material,
    256
  );
  return toHex(bits);
}

async function hmac(message, secret) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return toHex(sig);
}

// ---------------------------------------------------------- meta

// Recomputes every auto key from the current state of the database.
// Manual keys are never touched. Runs after each cron batch as well.
async function refreshMeta(env) {
  const one = async (sql) => {
    const r = await env.OVERHANG.prepare(sql).first();
    return r ? Object.values(r)[0] : null;
  };

  const LISTED = "(exchange LIKE '%Nasdaq%' OR exchange LIKE '%NYSE%')";

  const vals = {
    listed_total: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND state_inc IS NOT NULL`
    ),
    nv_listed: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND state_inc='NV'`
    ),
    de_listed: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND state_inc='DE'`
    ),
    tx_listed: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND state_inc='TX'`
    ),
    shells_ever: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND shell_ever=1`
    ),
    shells_unknown: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND shell_ever IS NULL AND state_inc IS NOT NULL`
    ),
    nv_shells: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND state_inc='NV' AND shell_ever=1`
    ),
    renamed_issuers: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND former_name_count>0`
    ),
    serial_renamers: await one(
      `SELECT COUNT(*) FROM collector_issuers WHERE ${LISTED} AND former_name_count>=2`
    ),
    shared_addresses: await one(
      "SELECT COUNT(*) FROM (SELECT addr_key FROM collector_issuers WHERE addr_key IS NOT NULL AND addr_key<>'' GROUP BY addr_key HAVING COUNT(*)>1)"
    ),
    crawl_done: await one(
      "SELECT COUNT(*) FROM collector_queue WHERE status='done'"
    ),
    crawl_pending: await one(
      "SELECT COUNT(*) FROM collector_queue WHERE status='pending'"
    ),
    crawl_failed: await one(
      "SELECT COUNT(*) FROM collector_queue WHERE status='failed'"
    ),
  };

  const listed = Number(vals.listed_total) || 0;
  vals.nv_pct = listed ? ((100 * vals.nv_listed) / listed).toFixed(1) : null;
  vals.de_pct = listed ? ((100 * vals.de_listed) / listed).toFixed(1) : null;
  vals.tx_pct = listed ? ((100 * vals.tx_listed) / listed).toFixed(1) : null;
  vals.crawl_complete = vals.crawl_pending === 0 ? "yes" : "no";
  vals.last_refreshed = new Date().toISOString();

  const q = env.OVERHANG.prepare(
    "INSERT INTO collector_meta (k, v, source, updated_at) VALUES (?,?,'auto',datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, source='auto', updated_at=excluded.updated_at WHERE collector_meta.source <> 'manual'"
  );
  const stmts = Object.keys(vals).map((k) => q.bind(k, String(vals[k])));
  await env.OVERHANG.batch(stmts);

  return { refreshed: Object.keys(vals).length, values: vals };
}

// ---------------------------------------------------------------- seed

async function seed(env) {
  const res = await fetch(TICKERS, { headers: hdrs(env) });
  if (!res.ok) throw new Error(`SEC tickers ${res.status}`);
  const data = await res.json();

  const rows = data.data || [];
  const idx = {};
  (data.fields || []).forEach((f, i) => (idx[f] = i));

  // Build literal-value inserts. CIKs are numeric, so they are sanitised by Number().
  let queued = 0;
  const CHUNK = 900;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const vals = [];
    for (const r of rows.slice(i, i + CHUNK)) {
      const cik = Number(r[idx.cik]);
      if (!cik) continue;
      vals.push(`('${String(cik).padStart(10, "0")}','profile','pending')`);
    }
    if (!vals.length) continue;
    await env.OVERHANG.exec(
      `INSERT OR IGNORE INTO collector_queue (cik, kind, status) VALUES ${vals.join(",")}`
    );
    queued += vals.length;
  }

  // Stash ticker/exchange/title now so the per-CIK pass does not need this file again.
  let named = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const vals = [];
    for (const r of rows.slice(i, i + CHUNK)) {
      const cik = Number(r[idx.cik]);
      if (!cik) continue;
      const c = String(cik).padStart(10, "0");
      vals.push(
        `('${c}',${lit(r[idx.ticker])},${lit(r[idx.name])},${lit(r[idx.exchange])})`
      );
    }
    if (!vals.length) continue;
    await env.OVERHANG.exec(
      `INSERT INTO collector_issuers (cik, ticker, title, exchange) VALUES ${vals.join(
        ","
      )} ON CONFLICT(cik) DO UPDATE SET ticker=excluded.ticker, title=excluded.title, exchange=excluded.exchange`
    );
    named += vals.length;
  }

  return { seeded: queued, issuers_stubbed: named, total_rows: rows.length };
}

// ---------------------------------------------------------------- drain

async function drain(env, n) {
  const q = await env.OVERHANG.prepare(
    "SELECT cik, kind FROM collector_queue WHERE status = 'pending' AND attempts < 3 ORDER BY kind, cik LIMIT ?"
  )
    .bind(n)
    .all();

  const items = q.results || [];
  if (!items.length) {
    const left = await env.OVERHANG.prepare(
      "SELECT COUNT(*) AS n FROM collector_queue WHERE status = 'pending'"
    ).first();
    return { done: true, pending: left ? left.n : 0 };
  }

  let ok = 0,
    failed = 0,
    nv = 0;

  for (const it of items) {
    try {
      if (it.kind === "profile") {
        const r = await doProfile(env, it.cik);
        if (r.nevada) nv++;
      } else {
        await doShell(env, it.cik);
      }
      await env.OVERHANG.prepare(
        "UPDATE collector_queue SET status='done', done_at=datetime('now') WHERE cik=? AND kind=?"
      )
        .bind(it.cik, it.kind)
        .run();
      ok++;
    } catch (err) {
      await env.OVERHANG.prepare(
        "UPDATE collector_queue SET attempts=attempts+1, last_error=?, status=CASE WHEN attempts+1>=3 THEN 'failed' ELSE 'pending' END WHERE cik=? AND kind=?"
      )
        .bind(String(err.message || err).slice(0, 200), it.cik, it.kind)
        .run();
      failed++;
    }
    await sleep(PAUSE_MS);
  }

  const left = await env.OVERHANG.prepare(
    "SELECT COUNT(*) AS n FROM collector_queue WHERE status = 'pending'"
  ).first();

  return { processed: ok, failed, nevada_found: nv, pending: left ? left.n : 0 };
}

async function doProfile(env, cik) {
  const res = await fetch(`${SUB}${cik}.json`, { headers: hdrs(env) });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  const d = await res.json();

  const state = (d.stateOfIncorporation || "").toUpperCase();
  const exch = Array.isArray(d.exchanges) && d.exchanges.length ? d.exchanges.join(",") : null;
  const formerCount = Array.isArray(d.formerNames) ? d.formerNames.length : 0;

  const biz = (d.addresses && d.addresses.business) || {};
  const addrKey = [biz.street1, biz.street2, biz.city, biz.stateOrCountry, biz.zipCode]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[.,#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  await env.OVERHANG.prepare(
    "INSERT INTO collector_issuers (cik, ticker, title, exchange, state_inc, entity_type, sic, sic_desc, fiscal_year_end, website, phone, biz_street, biz_city, biz_state, biz_zip, addr_key, former_name_count, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(cik) DO UPDATE SET state_inc=excluded.state_inc, entity_type=excluded.entity_type, sic=excluded.sic, sic_desc=excluded.sic_desc, fiscal_year_end=excluded.fiscal_year_end, website=excluded.website, phone=excluded.phone, biz_street=excluded.biz_street, biz_city=excluded.biz_city, biz_state=excluded.biz_state, biz_zip=excluded.biz_zip, addr_key=excluded.addr_key, former_name_count=excluded.former_name_count, exchange=COALESCE(excluded.exchange, collector_issuers.exchange), fetched_at=excluded.fetched_at"
  )
    .bind(
      cik,
      Array.isArray(d.tickers) && d.tickers.length ? d.tickers[0] : null,
      d.name || null,
      exch,
      state || null,
      d.entityType || null,
      d.sic || null,
      d.sicDescription || null,
      d.fiscalYearEnd || null,
      d.website || null,
      d.phone || null,
      [biz.street1, biz.street2].filter(Boolean).join(" ") || null,
      biz.city || null,
      biz.stateOrCountry || null,
      biz.zipCode || null,
      addrKey || null,
      formerCount
    )
    .run();

  // Remember the most recent annual report. Its cover page carries the shell
  // checkbox as an inline-XBRL tag, which is the only reliable source for it.
  const rec = (d.filings && d.filings.recent) || {};
  const forms = rec.form || [];
  let tenk = null;
  for (let i = 0; i < forms.length; i++) {
    const f = String(forms[i] || "");
    if (f === "10-K" || f === "10-K/A" || f === "20-F" || f === "40-F") {
      const acc = (rec.accessionNumber || [])[i];
      const doc = (rec.primaryDocument || [])[i];
      if (acc && doc) {
        tenk =
          "https://www.sec.gov/Archives/edgar/data/" +
          String(Number(cik)) + "/" + acc.replace(/-/g, "") + "/" + doc;
      }
      break;
    }
  }
  if (tenk) {
    await env.OVERHANG.prepare("UPDATE collector_issuers SET tenk_url = ? WHERE cik = ?")
      .bind(tenk, cik).run();
  }

  const listed = /Nasdaq|NYSE/i.test(exch || "");
  const nevada = state === "NV";

  // Shell status is worth the second request for the three states being compared.
  if (listed && (state === "NV" || state === "DE" || state === "TX")) {
    await env.OVERHANG.prepare(
      "INSERT OR IGNORE INTO collector_queue (cik, kind, status) VALUES (?, 'shell', 'pending')"
    )
      .bind(cik)
      .run();
  }

  return { nevada, listed };
}

async function doShell(env, cik) {
  const row = await env.OVERHANG.prepare(
    "SELECT tenk_url FROM collector_issuers WHERE cik = ?"
  ).bind(cik).first();

  const mark = async (ever, cur, source) => {
    await env.OVERHANG.prepare(
      "UPDATE collector_issuers SET shell_ever = ?, shell_current = ?, shell_source = ?, shell_checked_at = datetime('now') WHERE cik = ?"
    ).bind(ever, cur, source, cik).run();
  };

  if (!row || !row.tenk_url) {
    await mark(null, null, "no annual report on file");
    return;
  }

  const res = await fetch(row.tenk_url, { headers: hdrs(env) });
  if (!res.ok) throw new Error("doc " + res.status);

  // Cover page is at the top. Read the first chunk only — a 10-K can be 20 MB.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  const LIMIT = 900000;
  while (text.length < LIMIT) {
    const r = await reader.read();
    if (r.done) break;
    text += dec.decode(r.value, { stream: true });
    if (text.indexOf("EntityShellCompany") >= 0 && text.length > 60000) break;
  }
  try { await reader.cancel(); } catch (e) {}

  const val = readShellTag(text);
  if (val === null) {
    await mark(null, null, "not tagged in annual report");
    return;
  }
  await mark(val ? 1 : 0, val ? 1 : 0, "10-K cover page");
}

// Pulls the value out of the inline-XBRL cover-page tag. The SEC renders it
// either as the words true/false or as a ballot box, depending on the filer's
// software, so both are handled. Anything else is left unknown rather than
// guessed at.
function readShellTag(html) {
  const at = html.indexOf("EntityShellCompany");
  if (at < 0) return null;

  const window = html.slice(at, at + 900);
  const m = window.match(/>([^<]{0,80})</);
  if (!m) return null;

  const t = m[1].replace(/&#x?[0-9a-f]+;/gi, " ").trim().toLowerCase();

  if (t === "true" || t === "yes") return true;
  if (t === "false" || t === "no") return false;

  // Ballot boxes: checked means the stated value is true.
  if (window.indexOf("\u2612") >= 0 || window.indexOf("&#9746;") >= 0) return true;
  if (window.indexOf("\u2610") >= 0 || window.indexOf("&#9744;") >= 0) return false;

  const sign = window.match(/sign\s*=\s*["']?-/i);
  if (t === "" && sign) return false;

  return null;
}

// ---------------------------------------------------------------- read

async function read(env, view, url) {
  if (view === "progress") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_queue_progress").all();
    return { progress: r.results };
  }
  if (view === "counts") {
    const r = await env.OVERHANG.prepare(
      "SELECT * FROM v_screen_counts WHERE n > 5 ORDER BY n DESC LIMIT 60"
    ).all();
    return { counts: r.results };
  }
  if (view === "nevada") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);
    const r = await env.OVERHANG.prepare(
      "SELECT * FROM v_nevada_listed LIMIT ?"
    )
      .bind(limit)
      .all();
    return { count: r.results.length, nevada_listed: r.results };
  }
  if (view === "shells") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_shell_origin LIMIT 1000").all();
    return { count: r.results.length, shells: r.results };
  }
  if (view === "addresses") {
    const r = await env.OVERHANG.prepare(
      "SELECT * FROM v_shared_address LIMIT 300"
    ).all();
    return { count: r.results.length, shared_addresses: r.results };
  }
  if (view === "leads") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_leads LIMIT 500").all();
    return { count: r.results.length, leads: r.results };
  }
  if (view === "pros") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_leads_pro LIMIT 300").all();
    return { count: r.results.length, professionals: r.results };
  }
  if (view === "roles") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_lead_roles").all();
    return { roles: r.results };
  }
  if (view === "demand") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_lead_demand LIMIT 200").all();
    return { demand: r.results };
  }
  if (view === "meta") {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_meta").all();
    return { meta: r.results };
  }
  if (view === "owners") {
    const r = await env.OVERHANG.prepare(
      "SELECT * FROM v_owner_recurrence LIMIT 300"
    ).all();
    return { count: r.results.length, owner_recurrence: r.results };
  }
  return { error: "unknown view" };
}

// ---------------------------------------------------------------- helpers

function hdrs(env) {
  return {
    "User-Agent": env.SEC_UA || "Triggered Short research contact@example.com",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
}

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const ALLOWED = [
  "https://triggeredshort.com",
  "https://jobcreation.us",
  "https://www.triggeredshort.com",
  "https://triggeredshort-com.pages.dev",
];

function cors(request) {
  const origin = request ? request.headers.get("Origin") : null;
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(obj, status = 200, request = null) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cors(request),
    },
  });
}