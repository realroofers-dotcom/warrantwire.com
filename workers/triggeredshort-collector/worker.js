// triggeredshort-collector
// Cron-triggered Cloudflare Worker. Reads SEC EDGAR submissions for every CIK on the
// watchlist and writes new filings into the D1 database "overhang".
//
// Bindings required on this Worker:
//   D1 database  ->  variable name OVERHANG   (the same database the site uses)
//   Secret       ->  LOG_KEY                  (same value as the site's key)
//   Variable     ->  SEC_UA                   (declared User-Agent, see below)
//
// SEC requires a User-Agent that identifies you and gives contact info, and caps
// requests at 10 per second. Set SEC_UA to something like:
//   Foundation for Job Creation - Triggered Short research - you@yourdomain.com
// Requests without it get blocked, and the block is by IP.

const SEC_BASE = "https://data.sec.gov/submissions/CIK";
const PAUSE_MS = 150;              // ~6 requests/sec, well under the SEC cap
const BATCH = 40;                  // D1 statements per batch

export default {
  // Runs on the cron schedule set in the Worker's Settings > Triggers
  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env, "cron"));
  },

  // Manual run and read-back. Key required on every path.
  async fetch(request, env) {
    const url = new URL(request.url);
    const key =
      request.headers.get("X-Auth-Key") || url.searchParams.get("key") || "";

    if (!env.LOG_KEY || key !== env.LOG_KEY) {
      return json({ error: "unauthorized" }, 401);
    }

    const view = url.searchParams.get("view");

    try {
      if (view === "runs") {
        const r = await env.OVERHANG.prepare(
          "SELECT * FROM collector_runs ORDER BY id DESC LIMIT 25"
        ).all();
        return json({ runs: r.results });
      }

      if (view === "filings") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
        const cik = url.searchParams.get("cik");
        const stmt = cik
          ? env.OVERHANG.prepare(
              "SELECT filed_date, form, items, company_name, cik, accession, doc_url FROM collector_filings WHERE cik = ? ORDER BY filed_date DESC LIMIT ?"
            ).bind(pad(cik), limit)
          : env.OVERHANG.prepare(
              "SELECT filed_date, form, items, company_name, cik, accession, doc_url FROM collector_filings ORDER BY filed_date DESC LIMIT ?"
            ).bind(limit);
        const r = await stmt.all();
        return json({ filings: r.results });
      }

      if (view === "names") {
        const r = await env.OVERHANG.prepare(
          "SELECT cik, name, kind, from_date, to_date FROM collector_issuer_names ORDER BY cik, kind DESC, from_date"
        ).all();
        return json({ names: r.results });
      }

      if (view === "watchlist") {
        const r = await env.OVERHANG.prepare(
          "SELECT cik, label, active, added_at FROM collector_watchlist ORDER BY label"
        ).all();
        return json({ watchlist: r.results });
      }

      // default: run the collector now
      const result = await collect(env, "manual");
      return json(result);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};

// ---------------------------------------------------------------- collector

async function collect(env, trigger) {
  const started = new Date().toISOString();
  let checked = 0,
    seen = 0,
    added = 0,
    namesAdded = 0;
  const notes = [];

  const wl = await env.OVERHANG.prepare(
    "SELECT cik, label FROM collector_watchlist WHERE active = 1 ORDER BY cik"
  ).all();

  for (const row of wl.results) {
    const cik = pad(row.cik);
    try {
      const data = await fetchSubmissions(cik, env);
      checked++;

      namesAdded += await saveNames(env, cik, data);

      const r = await saveFilings(env, cik, data);
      seen += r.seen;
      added += r.added;

      if (r.added > 0) {
        notes.push(`${row.label || cik}: ${r.added} new`);
      }
    } catch (err) {
      notes.push(`${row.label || cik}: ERROR ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }

  const finished = new Date().toISOString();
  const status = notes.some((n) => n.includes("ERROR")) ? "partial" : "ok";

  await env.OVERHANG.prepare(
    "INSERT INTO collector_runs (started_at, finished_at, trigger, ciks_checked, filings_seen, filings_new, names_new, status, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      started,
      finished,
      trigger,
      checked,
      seen,
      added,
      namesAdded,
      status,
      notes.join(" | ") || "no change"
    )
    .run();

  return {
    started,
    finished,
    trigger,
    ciks_checked: checked,
    filings_seen: seen,
    filings_new: added,
    names_new: namesAdded,
    status,
    notes,
  };
}

async function fetchSubmissions(cik, env) {
  const res = await fetch(`${SEC_BASE}${cik}.json`, {
    headers: {
      "User-Agent": env.SEC_UA || "Triggered Short research contact@example.com",
      "Accept-Encoding": "gzip, deflate",
      Accept: "application/json",
    },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  return await res.json();
}

async function saveNames(env, cik, data) {
  const stmts = [];
  const q = env.OVERHANG.prepare(
    "INSERT OR IGNORE INTO collector_issuer_names (cik, name, kind, from_date, to_date) VALUES (?, ?, ?, ?, ?)"
  );

  if (data.name) stmts.push(q.bind(cik, data.name, "current", null, null));

  for (const fn of data.formerNames || []) {
    if (fn && fn.name) {
      stmts.push(
        q.bind(cik, fn.name, "former", dayOf(fn.from), dayOf(fn.to))
      );
    }
  }

  if (!stmts.length) return 0;
  const res = await env.OVERHANG.batch(stmts);
  return res.reduce((n, r) => n + (r.meta && r.meta.changes ? r.meta.changes : 0), 0);
}

async function saveFilings(env, cik, data) {
  const rec = (data.filings && data.filings.recent) || {};
  const acc = rec.accessionNumber || [];
  const company = data.name || null;
  const bare = String(Number(cik)); // CIK without leading zeros, for archive URLs

  const q = env.OVERHANG.prepare(
    "INSERT OR IGNORE INTO collector_filings (accession, cik, company_name, form, filed_date, report_date, accepted_at, items, primary_doc, doc_url, index_url, is_xbrl, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  let added = 0;
  let stmts = [];

  for (let i = 0; i < acc.length; i++) {
    const accession = acc[i];
    const noDash = accession.replace(/-/g, "");
    const primary = (rec.primaryDocument || [])[i] || null;
    const folder = `https://www.sec.gov/Archives/edgar/data/${bare}/${noDash}`;

    stmts.push(
      q.bind(
        accession,
        cik,
        company,
        (rec.form || [])[i] || null,
        (rec.filingDate || [])[i] || null,
        (rec.reportDate || [])[i] || null,
        (rec.acceptanceDateTime || [])[i] || null,
        (rec.items || [])[i] || null,
        primary,
        primary ? `${folder}/${primary}` : null,
        `${folder}/${accession}-index.htm`,
        (rec.isXBRL || [])[i] ? 1 : 0,
        (rec.size || [])[i] || null
      )
    );

    if (stmts.length >= BATCH) {
      added += await flush(env, stmts);
      stmts = [];
    }
  }

  if (stmts.length) added += await flush(env, stmts);
  return { seen: acc.length, added };
}

async function flush(env, stmts) {
  const res = await env.OVERHANG.batch(stmts);
  return res.reduce((n, r) => n + (r.meta && r.meta.changes ? r.meta.changes : 0), 0);
}

// ------------------------------------------------------------------ helpers

function pad(cik) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

function dayOf(ts) {
  if (!ts) return null;
  return String(ts).slice(0, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}