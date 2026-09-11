/* ============================================================================
   READ  —  Cloudflare Worker
   The warrant read agent. This is the thing the $20 buys.

   Built 2026-09-12 16:00 ET · read-2s
   WIRED TO THE REAL SCHEMA. 1f guessed at column names and five were wrong.
   2h FIXES THE FIRST REAL READ. It worked — Tenon Medical, at least ten
   million dollars, fifty cents — and then RAN OUT OF TOKENS mid-object and
   the half-finished JSON could not be parsed. Three changes: more room, a
   bounded number of terms, and SALVAGE so a truncated read still returns
   what it managed rather than nothing at all.

   2e changed the engine to Mistral. 2f ADDS THE BUILD STAMP — every reply
   says which version answered, so nobody debugs a version that was pasted
   but never became the active deployment.
   1f added the substance test. 2a FIXES THE QUERIES against ?action=schema —
   and uses detection_outcomes, which already holds every price move,
   reverse split and authorized-share restoration. It did not need building.

   ----------------------------------------------------------------------------
   WHAT IT DOES

   Takes an accession number. Fetches the filing AND ITS EXHIBITS from EDGAR —
   the exhibit is the part almost nobody opens and it is where the trouble sits.
   Reads them. Returns PLAIN ENGLISH in the same FIELDS every time.

   FIELDS, NEVER PROSE. A paragraph is something to read once. The same fields
   on every read is a database — it is what lets the wire say "seven companies
   this month carry a floor price" without anyone typing it.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              AI         Workers AI   ← the engine. Same binding as AdHotBox uses
   SECRETS    LOG_KEY        admin
   VARIABLE   PAY            the pay worker's address, for the gate
   OPTIONAL   READ_KEY       an outside key, only if you ever want that path

   ----------------------------------------------------------------------------
   PUBLIC
     ?read=1&accession=0001234567-26-000123     the read, if it is paid for
     ?peek=1&accession=…                        what the read WOULD cover, free

   PRIVATE
     ?action=run&accession=…                    produce a read now
     ?action=ping[&model=…]                     TEST THE ENGINE — run this first
     ?action=industries[&days=30]               PUBLIC — how many companies per industry
     ?action=tally[&from=&to=]                  WHAT SHAREHOLDERS PAID — daily and running
     ?action=pulse                              is the wire still running
     ?action=candidates                         heavy filings to test with
     ?action=schema                             what is actually in the database
     ?action=precedent&accession=…              the prior instances, without a read
     ?action=substance&cik=…                    the substance test on one company
     ?action=cost                               what the reads have cost so far
     ?action=list                               reads on file

   ----------------------------------------------------------------------------
   THE THREE RULES THIS IS BUILT TO

   1. READ IT ONCE, SELL IT FOREVER. Every read is stored. The second customer
      on the same filing is a database query costing nothing. THAT is why the
      archive is the asset — it builds itself out of what people pay to look at.

   2. A HARD CEILING ON EVERY JOB. An unbounded loop on a 200-page exhibit is
      the only way this loses money. MAX_CHARS caps what is sent; if a document
      is bigger, the exhibit is read and the rest is summarised, and the read
      SAYS SO rather than pretending it read everything.

   3. IT SAYS WHAT IT DID NOT CHECK. Every read prints the checks it ran AND the
      checks it did not. A finding that hides its own gaps is worth nothing when
      somebody finds the gap.
   ========================================================================== */

/* ⚠ THE BUILD STAMP, returned in every reply. If it does not say 2f, the
   worker running is not the file you pasted. */
const BUILD = "read-2s · 2026-09-12 16:00 ET";

const CONTACT = "research@warrantwire.com";   /* the SEC blocks automated requests without one */
const UA = "WarrantWire/1.0 (" + CONTACT + ")";

/* ---------------------------------------------------------------------------
   THE ENGINE — one place, so the model is an internal dial and never a price.

   RUNS ON WORKERS AI. No outside key, no second bill, and the whole filing
   goes in at once: DeepSeek V4 Flash carries a one-million-token context
   window, and a 45-page exhibit is about 45,000 tokens. Nothing is chunked
   and nothing is skipped.

   To change engine, change these three lines and nothing else. That is the
   point of putting it here — the model is an internal dial and the price on
   the page never moves when rates do.
   --------------------------------------------------------------------------- */
const ENGINE = {
  /* ⚠ MARK'S RULING, 8 Sep 2026: NO META, NO DEEPSEEK. Mistral is the engine.
     European, open weights, good at following an instruction, and it holds a
     long document. If it ever needs changing, change it HERE and nowhere else. */
  model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
  max_tokens: 8000
};

/* The ceiling stays, but it is now generous rather than tight. It exists so a
   200-page exhibit cannot run away with the job, not because the model cannot
   hold it. */
/* ⚠ THE CEILING BELONGS TO THE MODEL, NOT TO US.

   This was 600,000 characters, set when the engine was going to be a
   million-token model. Mistral's window is 128,000 TOKENS, and a PDS
   Biotechnology 8-K came back refused:

     "5021: The estimated number of input and maximum output tokens
      (155740) exceeded this model context window limit (128000)."

   Legal text runs about four characters to the token, so 128,000 tokens
   is roughly 500,000 characters — and the reply needs room inside that
   same window. 300,000 leaves a wide margin, and a document longer than
   that is truncated with the read SAYING SO rather than being refused. */
const MODEL_CONTEXT_TOKENS = 128000;
const MAX_CHARS = 300000;   /* ~75 pages, comfortably inside the window */

export default {
  async fetch(req, env) {
    const u = new URL(req.url), q = u.searchParams;
    const H = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);

    try {
      /* ---------- public ---------- */
      if (q.get("peek")) return json(await peek(env, q.get("accession")), H);
      if (q.get("read")) return json(await serve(env, q), H);

      /* ---------- private ---------- */
      /* ⚠ THE SUBSTANCE TEST IS PUBLIC. Every figure in it is the company's
         own, tagged in its own filing and free from the SEC. Putting a key
         in front of it would only stop people checking our work, which is
         the opposite of the point. */
      /* ⚠ PUBLIC AND NO KEY — it is the proof, not the product. */
      if ((q.get("action") || "") === "industries")
        return json(await industries(env, q), H);

      if ((q.get("action") || "") === "substance") {
        let cik = q.get("cik");
        if (!cik && q.get("ticker")) {
          const found = await cikFor(env, q.get("ticker"));
          if (!found) return json({ ok:false, build: BUILD,
            error: "that ticker is not on file",
            note: "The wire knows a ticker once it has appeared in a filing " +
                  "carrying warrant language. Try the CIK instead." }, H);
          cik = found.cik;
        }
        return json(await substance(cik), H);
      }

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "list";
      if (a === "run")  return json(await produce(env, q.get("accession"), true), H);
      if (a === "schema") return json(await schema(env), H);
      if (a === "candidates") return json(await candidates(env, q.get("ticker")), H);
      if (a === "pulse") return json(await pulse(env), H);
      if (a === "tally") return json(await tally(env, q.get("from"), q.get("to")), H);
      if (a === "ping") return json(await ping(env, q.get("model")), H);
      if (a === "precedent") return json(await precedent(env, q.get("accession")), H);
      if (a === "substance") {
        let cik = q.get("cik");
        if (!cik && q.get("ticker")) {
          const found = await cikFor(env, q.get("ticker"));
          if (!found) return json({ ok:false, build: BUILD,
            error: "that ticker is not on file",
            note: "The wire knows a ticker once it has appeared in a filing " +
                  "carrying warrant language. Try the CIK instead." }, H);
          cik = found.cik;
        }
        return json(await substance(cik), H);
      }
      if (a === "cost") return json(await cost(env), H);
      return json(await list(env), H);
    } catch (e) {
      return json({ ok:false, error:String(e) }, H, 500);
    }
  }
};

/* ============================================================
   THE TABLES
   ============================================================ */
async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS reads (
       accession TEXT PRIMARY KEY,
       cik TEXT, ticker TEXT, company TEXT, form TEXT, filed TEXT,
       fields TEXT,           /* the read itself, as JSON */
       docs INTEGER,          /* how many documents were read */
       chars INTEGER,         /* how much text went in */
       truncated INTEGER DEFAULT 0,
       engine TEXT, cost_cents REAL,
       made TEXT DEFAULT (datetime('now')),
       by_hand INTEGER DEFAULT 0)`).run();
  /* ============================================================
     WHAT THE MONEY COST, one row per filing.

     Kept as its own table rather than inside the read's JSON so
     it can be summed. Every column is either DISCLOSED or NULL —
     nothing is estimated here. Estimates happen at tally time,
     where they can be labelled.
     ============================================================ */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS deal_costs (
       accession TEXT PRIMARY KEY,
       cik TEXT, ticker TEXT, company TEXT, form TEXT, filed TEXT,
       is_resale INTEGER DEFAULT 0,
       gross REAL, agent_cash_fee REAL, agent_fee_pct REAL,
       agent_expenses REAL, offering_expenses REAL, net_to_company REAL,
       agent_name TEXT, counsel_name TEXT,
       shares_before REAL, shares_after REAL,
       raw TEXT, made TEXT DEFAULT (datetime('now')))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS read_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       at TEXT DEFAULT (datetime('now')),
       accession TEXT, kind TEXT, note TEXT, cost_cents REAL)`).run();
}

/* ============================================================
   EDGAR — the filing AND its exhibits
   ============================================================ */
async function edgarIndex(accession, cik) {
  const clean = String(accession).replace(/-/g, "");
  const base = "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + clean;
  const r = await fetch(base + "/index.json", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("EDGAR would not give the index for " + accession);
  const j = await r.json();
  return { base, items: (j.directory && j.directory.item) || [] };
}

/* WHICH DOCUMENTS MATTER, and the order is deliberate:
   the EXHIBIT first, because the 8-K summary is the company's description of
   its own document and the exhibit is the document. */
function pick(items) {
  /* ⚠ 2k FIXES A REAL FAULT. The old test was
       if (/^0001|index|\.xml$/.test(n) && !/\.htm/.test(n)) continue;
     which skipped an index file ONLY IF it was not html — and EDGAR's index
     files are called ...-index.html. So the reader opened the index pages and
     never touched the prospectus. It returned a headline, one figure, and a
     "term" called "the shares". The money was right; the document was wrong.

     JUNK is now skipped by name whatever its extension. */
  const JUNK = /(-index|index-headers|index\.json|FilingSummary|MetaLinks|R\d+\.htm|\.xsd$|_cal\.|_def\.|_lab\.|_pre\.|\.xml$|\.jpg$|\.png$|\.gif$)/i;

  const ex = [], main = [], other = [];
  for (const it of items) {
    const n = String(it.name || "");
    if (JUNK.test(n)) continue;
    if (!/\.(htm|html|txt)$/i.test(n)) continue;
    if (/ex-?\d|exhibit|_ex\d/i.test(n)) ex.push(n);
    else if (/424|s-?1|s-?3|10-?k|10-?q|8-?k|def ?14|prospect/i.test(n)) main.push(n);
    else other.push(n);
  }

  /* THE EXHIBIT FIRST — it is the document; the filing is the company's
     description of it. Then the filing itself, then anything left. */
  const want = ex.slice(0, 4).concat(main.slice(0, 2)).concat(other.slice(0, 2));
  return want.length ? want : other.concat(main).slice(0, 3);
}

function strip(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function gather(accession, cik) {
  const { base, items } = await edgarIndex(accession, cik);
  const names = pick(items);
  let text = "", used = [], truncated = 0;

  for (const n of names) {
    if (text.length >= MAX_CHARS) { truncated = 1; break; }
    const r = await fetch(base + "/" + n, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    const body = strip(await r.text());
    if (!body) continue;
    const room = MAX_CHARS - text.length;
    if (body.length > room) { truncated = 1; }
    text += "\n\n===== DOCUMENT: " + n + " =====\n\n" + body.slice(0, room);
    used.push(n);
  }
  if (!text) throw new Error("Nothing readable in that filing — every document " +
    "was an index page or an attachment. Names offered: " +
    items.map(x => x.name).slice(0, 12).join(", "));
  return { text, used, truncated };
}

/* ============================================================
   THE SCHEMA PROBE

   Run this FIRST, before trusting the precedent query below. It
   reports what tables and columns actually exist rather than what
   anybody assumed. Guessing a schema is how an afternoon gets lost.
   ============================================================ */
async function schema(env) {
  const t = await env.OVERHANG.prepare(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all();
  const out = [];
  for (const row of (t.results || [])) {
    let cols = [];
    try {
      const c = await env.OVERHANG.prepare("PRAGMA table_info(" + row.name + ")").all();
      cols = (c.results || []).map(x => x.name);
    } catch (e) {}
    out.push({ name: row.name, kind: row.type, columns: cols });
  }
  return { ok:true, build: BUILD, count: out.length, objects: out,
    note: "Send this back and the precedent query gets wired to what is really here." };
}

/* ============================================================
   PING — does the engine work at all, and what does it return?

   Workers AI model IDs change, and different models return the
   text on different fields. Guessing at either wastes a day. This
   sends four words to a model and returns THE WHOLE RAW OBJECT,
   so the shape is a fact rather than an assumption.

   ?action=ping                 tests the model set at the top
   ?action=ping&model=@cf/...   tests any other one
   ============================================================ */
/* The fallbacks, in order. NOTHING FROM META AND NOTHING FROM DEEPSEEK —
   his ruling. Mistral first; the rest are here only so a dead model name
   never leaves the worker with nothing to try. */
const TRY_MODELS = [
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.2",
  "@cf/mistralai/mistral-nemo-instruct-2407",
  "@hf/mistral/mistral-7b-instruct-v0.2",
  "@cf/google/gemma-3-12b-it"
];

async function ping(env, model) {
  if (!env.AI) return { ok:false, error:"no AI binding on this worker" };

  const list = model ? [model] : [ENGINE.model].concat(TRY_MODELS);
  const out = [];

  for (const m of list) {
    const row = { model: m };
    try {
      const r = await env.AI.run(m, {
        max_tokens: 60,
        messages: [
          { role:"system", content:'Reply with only this JSON and nothing else: {"ok":true}' },
          { role:"user", content:"ping" }
        ]
      });
      row.worked = true;
      row.shape = (r && typeof r === "object") ? Object.keys(r) : typeof r;
      row.raw = r;                       /* the whole thing, unedited */
      /* which field actually held the text */
      row.text_field =
        (r && typeof r.response === "string") ? "response" :
        (r && typeof r.result === "string") ? "result" :
        (r && r.result && typeof r.result.response === "string") ? "result.response" :
        (r && r.choices && r.choices[0]) ? "choices[0].message.content" :
        (typeof r === "string") ? "(the whole return is a string)" : "UNKNOWN";
    } catch (e) {
      row.worked = false;
      row.error = String(e);
    }
    out.push(row);
    if (row.worked) break;               /* stop at the first that answers */
  }

  const winner = out.find(x => x.worked);
  return { ok: !!winner, build: BUILD, model_in_engine: ENGINE.model, tried: out.length, results: out,
    use_this_model: winner ? winner.model : null,
    note: winner
      ? "Put this model name in the ENGINE block at the top, and make sure the text " +
        "is read off the field named in text_field."
      : "Nothing answered. Every model above was refused — check that Workers AI is " +
        "actually bound and that the account has it enabled." };
}

/* ============================================================
   PULSE — is the wire still running?

   "No fresh data" has two causes and they need different fixes:
   the scan stopped, or the scan ran and found nothing. This tells
   them apart in one call, and it never guesses.
   ============================================================ */
async function pulse(env) {
  const out = { ok:true, missing: [] };

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT ran_at, day_from, day_to, phrases, api_calls, hits_new, note
         FROM wire_runs ORDER BY id DESC LIMIT 10`).all();
    out.last_runs = r.results || [];
    if (out.last_runs.length) {
      const last = out.last_runs[0];
      out.last_ran_at = last.ran_at;
      out.last_covered = last.day_from + " to " + last.day_to;
      out.last_found = last.hits_new;
    }
  } catch (e) { out.missing.push("wire_runs: " + String(e)); }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT MAX(filed_on) newest, MAX(found_at) last_written, COUNT(*) total
         FROM wire_hits`).first();
    out.newest_filing_on_the_wire = r && r.newest;
    out.last_row_written = r && r.last_written;
    out.hits_total = r && r.total;
  } catch (e) { out.missing.push("wire_hits: " + String(e)); }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT filed_on AS day, COUNT(DISTINCT accession) filings
         FROM wire_hits
        WHERE filed_on >= date('now','-21 day')
        GROUP BY filed_on ORDER BY filed_on DESC`).all();
    out.last_three_weeks = r.results || [];
  } catch (e) { out.missing.push("daily counts: " + String(e)); }

  /* the duplicate-phrase check, flagged 8 Sep: "Pre-funded warrants"
     appears twice in every label list, which double-counts the heavy mark */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT phrase, COUNT(*) rows_in_table, GROUP_CONCAT(id) ids
         FROM wire_phrases GROUP BY LOWER(phrase) HAVING COUNT(*) > 1`).all();
    out.duplicate_phrases = r.results || [];
  } catch (e) { out.missing.push("wire_phrases: " + String(e)); }

  /* the same filing event filed several times the same day — BDRX filed
     six near-identical 424B3s, which inflates any per-month count */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT ticker, filed_on, form, COUNT(DISTINCT accession) n
         FROM wire_hits
        WHERE filed_on >= date('now','-120 day')
        GROUP BY ticker, filed_on, form HAVING n > 2
        ORDER BY n DESC LIMIT 20`).all();
    out.same_day_duplicates = r.results || [];
  } catch (e) { out.missing.push("duplicate check: " + String(e)); }

  out.build = BUILD;
  out.reading = "If last_ran_at is recent but hits_new is 0, the scan is running " +
                "and finding nothing — that is a quiet stretch, not a fault. If " +
                "last_ran_at is old, the cron stopped and that is the fault.";
  return out;
}

/* ============================================================
   CANDIDATES — filings worth testing on

   The heaviest recent hits on the wire, with their accession
   numbers, so a test is one copy-paste rather than a hunt.
   Pass &ticker=TOVX to narrow it to one company.
   ============================================================ */
async function candidates(env, ticker) {
  let sql = `SELECT accession, ticker, company, form, filed_on, heavy, labels
               FROM v_wire_filings WHERE heavy > 0`;
  const b = [];
  if (ticker) { sql += " AND ticker = ?"; b.push(String(ticker).toUpperCase()); }
  sql += " ORDER BY heavy DESC, filed_on DESC LIMIT 15";

  const r = await env.OVERHANG.prepare(sql).bind(...b).all();
  const rows = r.results || [];

  /* which of these have already been read, so a test does not repeat one */
  const done = {};
  try {
    const d = await env.OVERHANG.prepare("SELECT accession FROM reads").all();
    for (const x of (d.results || [])) done[x.accession] = true;
  } catch (e) {}

  return { ok:true, build: BUILD, count: rows.length,
    rows: rows.map(x => ({ accession: x.accession, ticker: x.ticker,
      company: x.company, form: x.form, filed: x.filed_on,
      heavy_marks: x.heavy, labels: x.labels,
      already_read: !!done[x.accession] })),
    note: "Copy an accession and run ?action=precedent&accession=… first — that is " +
          "pure SQL, no AI, and it proves every lookup before a read is paid for." };
}

/* ============================================================
   PRECEDENT — the part nobody else can do

   Three questions, all answered from his own database:
     1. WHERE ELSE has this same combination of terms appeared?
     2. WHERE ELSE do these same NAMES appear?
     3. WHAT HAPPENED to the price after each of those?

   Every one of these is a query, not a guess, so every citation
   the agent makes carries an accession number somebody can pull.

   ⚠ IT REPORTS WHAT HAPPENED. IT NEVER SAYS WHAT WILL HAPPEN.
   Nine of fourteen fell is a fact with a method behind it. "This
   will fall" is a forecast, and a forecast is advice.

   Every query below is wrapped. A missing table returns nothing
   and the read still runs — it just says so in checks_not_run.
   ============================================================ */
async function precedent(env, accession) {
  const out = { ok:true, build: BUILD, accession, terms_on_this_filing: [], same_shape: [],
                names: [], deals_by_name: [], outcomes: [], splits: [],
                authorized: [], prices: [], missing: [] };
  if (!accession) return out;

  /* ---- 1. WHAT THIS FILING CARRIES ----------------------------------
     wire_hits has NO weight column — the weight lives on wire_phrases and
     joins through phrase_id. That was wrong in every version before 2a. */
  let heavy = [];
  try {
    const p = await env.OVERHANG.prepare(
      `SELECT h.phrase, COALESCE(w.weight, 1) AS weight, h.label
         FROM wire_hits h
         LEFT JOIN wire_phrases w ON w.id = h.phrase_id
        WHERE h.accession = ?`).bind(accession).all();
    const rows = p.results || [];
    out.terms_on_this_filing = rows.map(x => ({ phrase: x.phrase, label: x.label, weight: x.weight }));
    heavy = rows.filter(x => (x.weight || 0) >= 2).map(x => x.phrase);
  } catch (e) { out.missing.push("wire_hits: " + String(e)); }

  /* ---- 2. SAME SHAPE — other filings carrying the same heavy terms ----
     the date column is filed_on, not filed. */
  if (heavy.length) {
    try {
      const marks = heavy.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT accession, ticker, company, form, filed_on,
                COUNT(DISTINCT phrase) AS shared
           FROM wire_hits
          WHERE phrase IN (${marks}) AND accession <> ?
          GROUP BY accession
          ORDER BY shared DESC, filed_on DESC
          LIMIT 25`).bind(...heavy, accession).all();
      out.same_shape = r.results || [];
    } catch (e) { out.missing.push("same shape: " + String(e)); }
  }

  const tickers = Array.from(new Set(
    out.same_shape.map(x => x.ticker).filter(Boolean))).slice(0, 40);

  /* ---- 3. THE NAMES ---------------------------------------------------
     v_network: party, kind, role, issuer, ticker, start_date, filing_count.
     v_recurrence: party, kind, issuers, total_filings.
     roles uses start_date/end_date, NOT first_seen/last_seen. */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT party, kind, issuers, total_filings
         FROM v_recurrence
        WHERE issuers > 1
        ORDER BY issuers DESC, total_filings DESC
        LIMIT 20`).all();
    out.names = r.results || [];
  } catch (e) { out.missing.push("v_recurrence: " + String(e)); }

  try {
    if (tickers.length) {
      const marks = tickers.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT party, kind, role, issuer, ticker, start_date, filing_count
           FROM v_network
          WHERE ticker IN (${marks})
          ORDER BY party, start_date
          LIMIT 200`).bind(...tickers).all();
      out.deals_by_name = r.results || [];
    }
  } catch (e) { out.missing.push("v_network: " + String(e)); }

  /* ---- 4. WHAT HAPPENED AFTER — ALREADY BUILT -------------------------
     detection_outcomes carries the price at the event and at 30, 90, 180
     days and a year, the percentage changes, whether a reverse split
     followed, THE RATIO, WHETHER THE AUTHORIZED COUNT WAS RESTORED, how
     many financings followed, the dilution multiple and the listing
     status. None of this needed a price vendor. */
  try {
    if (tickers.length) {
      const marks = tickers.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT d.ticker, d.company_name, d.event_date, d.mechanism,
                d.tests_failed, d.placement_agent, d.outside_counsel, d.holder_name,
                o.price_at_event, o.price_90d, o.price_1y,
                o.chg_90d_pct, o.chg_1y_pct,
                o.reverse_split_since, o.reverse_split_ratio, o.reverse_split_date,
                o.authorized_restored, o.financings_since,
                o.shares_out_at_event, o.shares_out_now, o.dilution_multiple,
                o.listing_status, o.going_concern
           FROM detections d
           JOIN detection_outcomes o ON o.detection_id = d.detection_id
          WHERE d.ticker IN (${marks})
          ORDER BY d.event_date DESC
          LIMIT 60`).bind(...tickers).all();
      out.outcomes = r.results || [];
    }
  } catch (e) { out.missing.push("detection_outcomes: " + String(e)); }

  /* the same thing summarised across every band, already computed */
  try {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_scorecard").all();
    out.scorecard = r.results || [];
  } catch (e) { out.missing.push("v_scorecard: " + String(e)); }

  /* ---- 5. REVERSE SPLITS AND THE AUTHORIZED CEILING -------------------
     splits keys on ISSUER_ID, not ticker, and it already carries
     auth_before and auth_after — the ceiling left standing is in the
     table. The split itself dilutes nobody; that number is the finding. */
  try {
    if (tickers.length) {
      const marks = tickers.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT i.ticker, s.effective_date, s.ratio_from, s.ratio_to,
                s.board_approved, s.holder_vote,
                s.shares_before, s.shares_after,
                s.auth_before, s.auth_after
           FROM splits s
           JOIN issuers i ON i.id = s.issuer_id
          WHERE i.ticker IN (${marks})
          ORDER BY i.ticker, s.effective_date`).bind(...tickers).all();
      out.splits = r.results || [];
    }
  } catch (e) { out.missing.push("splits: " + String(e)); }

  try {
    if (tickers.length) {
      const marks = tickers.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT i.ticker, c.as_of, c.outstanding, c.authorized, c.source
           FROM share_counts c
           JOIN issuers i ON i.id = c.issuer_id
          WHERE i.ticker IN (${marks})
          ORDER BY i.ticker, c.as_of DESC
          LIMIT 200`).bind(...tickers).all();
      out.authorized = r.results || [];
    }
  } catch (e) { out.missing.push("share_counts: " + String(e)); }

  /* ---- 6. PRICE HISTORY, where we hold it ---------------------------- */
  try {
    if (tickers.length) {
      const marks = tickers.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT ticker, d, close FROM prices
          WHERE ticker IN (${marks})
          ORDER BY d DESC LIMIT 1500`).bind(...tickers).all();
      out.prices = r.results || [];
    }
  } catch (e) { out.missing.push("prices: " + String(e)); }

  /* ---- 7. THE WARRANTS THEMSELVES, if this issuer is on file --------- */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT i.ticker, w.label, w.issued_date, w.shares, w.strike,
              w.original_strike, w.repriced_date, w.blocker_pct, w.prefunded,
              w.exercised, w.outstanding
         FROM warrants w
         JOIN issuers i ON i.id = w.issuer_id
        WHERE i.ticker = (SELECT ticker FROM v_wire_filings WHERE accession = ? LIMIT 1)
        ORDER BY w.issued_date DESC LIMIT 40`).bind(accession).all();
    out.warrants_on_file = r.results || [];
  } catch (e) { out.missing.push("warrants: " + String(e)); }

  return out;
}

/* ============================================================
   THE SUBSTANCE TEST

   His hypothesis, and it is testable rather than assertable:
   warrants lean toward reverse splits and excuses for dilution,
   and some of these companies may be running the financing as the
   activity rather than the business.

   NOTHING HERE ACCUSES ANYBODY. It reports six numbers the company
   filed itself. What they add up to is the reader's to decide, and
   Mark's opinion goes in his own signed block — never in this field.

   THE DATA IS FREE AND IT IS THE COMPANY'S OWN. SEC XBRL company
   facts: every filer, every tagged figure, no vendor, no key.
   https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
   ============================================================ */
const FACTS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
            "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  operating: ["NetCashProvidedByUsedInOperatingActivities"],
  financing: ["NetCashProvidedByUsedInFinancingActivities"],
  deficit:   ["RetainedEarningsAccumulatedDeficit"],
  rnd:       ["ResearchAndDevelopmentExpense"],
  shares:    ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"],
  authorized:["CommonStockSharesAuthorized"]
};

function annual(facts, names) {
  const out = {};
  for (const n of names) {
    const node = facts.facts && (facts.facts["us-gaap"] || {})[n];
    if (!node) continue;
    for (const unit of Object.keys(node.units || {})) {
      for (const row of node.units[unit]) {
        if (row.form !== "10-K" || row.fp !== "FY") continue;
        if (!row.fy) continue;
        /* first tag that has the year wins, so the list above is a priority order */
        if (out[row.fy] === undefined) out[row.fy] = row.val;
      }
    }
    if (Object.keys(out).length) break;
  }
  return out;
}

/* ⚠ A READER TYPES A TICKER, NOT A CIK. Nobody knows their own company's
   CIK number. Resolve it here, from cik_tickers, and say plainly when a
   ticker is not on file rather than returning an empty answer. */
async function cikFor(env, ticker) {
  const t = String(ticker || "").trim().toUpperCase();
  if (!t) return null;
  try {
    const r = await env.OVERHANG.prepare(
      "SELECT cik, title FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1")
      .bind(t).first();
    if (r) return { cik: r.cik, title: r.title };
  } catch (e) {}
  try {
    const r = await env.OVERHANG.prepare(
      "SELECT cik, ticker FROM issuers WHERE UPPER(ticker) = ? LIMIT 1")
      .bind(t).first();
    if (r) return { cik: r.cik, title: null };
  } catch (e) {}
  return null;
}

async function substance(cik) {
  if (!cik) throw new Error("a CIK, please");
  const padded = String(cik).replace(/\D/g, "").padStart(10, "0");
  const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK" + padded + ".json",
                        { headers: { "User-Agent": UA } });
  if (!r.ok) return { ok:false, error:"the SEC has no company facts for CIK " + padded };
  const facts = await r.json();

  const rev  = annual(facts, FACTS.revenue);
  const ops  = annual(facts, FACTS.operating);
  const fin  = annual(facts, FACTS.financing);
  const def  = annual(facts, FACTS.deficit);
  const rnd  = annual(facts, FACTS.rnd);
  const auth = annual(facts, FACTS.authorized);
  const sh   = annual(facts, FACTS.shares);

  const years = Array.from(new Set([].concat(
    Object.keys(rev), Object.keys(ops), Object.keys(fin)))).map(Number).sort();

  const rows = years.map(y => ({
    year: y,
    revenue: rev[y] ?? null,
    cash_from_operations: ops[y] ?? null,
    cash_from_financing: fin[y] ?? null,
    research_and_development: rnd[y] ?? null,
    accumulated_deficit: def[y] ?? null,
    shares_outstanding: sh[y] ?? null,
    shares_authorized: auth[y] ?? null
  }));

  /* THE SIX FIGURES, all of them the company's own, none of them a judgment */
  const sumFin = rows.reduce((n, r2) => n + (r2.cash_from_financing || 0), 0);
  const sumOps = rows.reduce((n, r2) => n + (r2.cash_from_operations || 0), 0);
  const sumRev = rows.reduce((n, r2) => n + (r2.revenue || 0), 0);
  const yearsNoRevenue = rows.filter(r2 => (r2.revenue || 0) === 0).length;

  /* ============================================================
     THE ARC — read year against year, and say what happened

     ⚠ TWO THINGS A TOTAL CANNOT SEE, and both were found by hand
     on the first two companies, which means neither can be left
     to a person to notice again:

     1. A REVERSE SPLIT. The outstanding count collapses and the
        authorized ceiling usually collapses with it — then the
        ceiling is restored the following year and the count
        climbs again. That sequence IS the pattern.

     2. A DISCONTINUITY. If the ACCUMULATED DEFICIT FALLS, this is
        not the same company's record. A deficit cannot go down.
        PDS Biotechnology came to market through a reverse merger
        and its 2017-18 rows belong to the predecessor. Summing
        across that line produces a total no filing supports.
     ============================================================ */
  const arc = [];
  let discontinuity = null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i-1], b = rows[i];

    if (a.accumulated_deficit !== null && b.accumulated_deficit !== null &&
        Math.abs(b.accumulated_deficit) < Math.abs(a.accumulated_deficit) * 0.8) {
      discontinuity = {
        between: a.year + " and " + b.year,
        deficit_was: a.accumulated_deficit,
        deficit_became: b.accumulated_deficit,
        why: "An accumulated deficit cannot fall. The figures before this " +
             "line belong to a different entity — usually a predecessor in a " +
             "reverse merger, sometimes a restatement.",
        warning: "DO NOT SUM ACROSS THIS LINE. Totals spanning it describe no " +
            "company that has ever existed."
      };
      arc.push({ year: b.year, event: "the record breaks here",
                 detail: "deficit fell from " + a.accumulated_deficit +
                         " to " + b.accumulated_deficit });
      continue;
    }

    if (a.shares_outstanding && b.shares_outstanding) {
      const r = a.shares_outstanding / b.shares_outstanding;
      if (r >= 1.8)
        arc.push({ year: b.year, event: "share count collapses",
          detail: a.shares_outstanding.toLocaleString() + " to " +
                  b.shares_outstanding.toLocaleString(),
          in_effect: "1-for-" + Math.round(r),
          authorized_was: a.shares_authorized,
          authorized_became: b.shares_authorized,
          note: "A reverse split dilutes nobody. What matters is the " +
                "AUTHORIZED figure afterwards — that is the room for the " +
                "next round." });
      else if (r <= 0.35)
        arc.push({ year: b.year, event: "share count multiplies",
          detail: a.shares_outstanding.toLocaleString() + " to " +
                  b.shares_outstanding.toLocaleString(),
          times: +(1/r).toFixed(1) });
    }

    if (a.shares_authorized && b.shares_authorized &&
        b.shares_authorized >= a.shares_authorized * 1.5)
      arc.push({ year: b.year, event: "authorized ceiling raised",
        detail: a.shares_authorized.toLocaleString() + " to " +
                b.shares_authorized.toLocaleString(),
        room_created: b.shares_authorized - (b.shares_outstanding || 0),
        note: "Room made before it was used." });
  }

  /* totals AFTER the break only, where there is one */
  const safeFrom = discontinuity
    ? Number(String(discontinuity.between).split(" and ")[1]) : null;
  const safe = safeFrom ? rows.filter(r => r.year >= safeFrom) : rows;
  const sum = k => safe.reduce((n, r) => n + (r[k] || 0), 0);

  return { ok:true, cik: padded,
    company: facts.entityName || null,
    years_on_file: rows.length,
    arc,
    discontinuity,
    safe_totals: {
      from_year: safe.length ? safe[0].year : null,
      years: safe.length,
      financing_raised: Math.round(sum("cash_from_financing")),
      operating_cash_used: Math.round(sum("cash_from_operations")),
      revenue: Math.round(sum("revenue")),
      years_with_no_revenue: safe.filter(r => !(r.revenue > 0)).length,
      note: discontinuity
        ? "Counted only from " + safeFrom + ", after the break in the record. " +
          "The years before it belong to another entity."
        : "No break found. All years counted."
    },
    rows,
    measured: {
      financing_raised_total: sumFin,
      operating_cash_used_total: sumOps,
      revenue_total: sumRev,
      years_with_no_revenue: yearsNoRevenue,
      financing_to_operations_ratio:
        sumOps ? +(Math.abs(sumFin / sumOps)).toFixed(2) : null,
      authorized_vs_outstanding_latest: (() => {
        const last = rows[rows.length - 1] || {};
        if (!last.shares_authorized || !last.shares_outstanding) return null;
        return +(last.shares_authorized / last.shares_outstanding).toFixed(1);
      })()
    },
    note: "Every figure here is the company's own, tagged in its own 10-K. " +
          "This measures; it does not conclude. Nothing here says anyone did " +
          "anything wrong."
  };
}

/* ============================================================
   THE READ ITSELF

   The prompt is the product. Three things it is built to do:
   name the clause, say what it does to a HOLDER, and say what
   it could NOT check.
   ============================================================ */
const SYSTEM = `You read SEC filings for people who own the stock and cannot read legal language.

Return ONLY a JSON object. No preamble, no markdown, no backticks.

{
 "headline": "one sentence a shareholder understands. Say what was found, not what it might mean.",
 "money": {"raised":"", "raised_quote":"", "price":"", "price_quote":"",
           "who_bought":"", "who_was_paid":""},
 "cost_of_the_money": {
   "gross":"the total raised, exactly as written",
   "gross_quote":"under 15 words containing that figure",
   "agent_cash_fee":"the placement agent's cash fee",
   "agent_fee_pct":"the fee as a percentage, if stated",
   "agent_expenses":"the agent's expenses, if stated",
   "agent_warrants":"any warrants issued to the agent, if stated",
   "legal_and_offering_expenses":"the issuer's own offering expenses, if stated",
   "net_to_company":"what the company says it actually receives",
   "net_quote":"under 15 words containing that figure",
   "note":"say plainly what could NOT be found"
 },
 "who_is_not_named": [
   {"as_written":"the placeholder the document uses, e.g. the August 2026 Purchaser",
    "what_they_are":"buyer / investor / lender",
    "quote":"under 15 words showing the document declining to name them"}
 ],
 "parties": [
   {"name":"exactly as the document writes it, no titles, no address",
    "role":"one of: placement agent, issuer counsel, agent counsel, investor, auditor, transfer agent, underwriter",
    "quote":"under 15 words from the document naming them"}
 ],
 "the_terms": [
   {"name":"the clause in plain words",
    "quote":"under 15 words from the document, exact",
    "where":"which document and section",
    "what_it_does":"what this does to somebody holding the stock, in one or two sentences",
    "heavy": true}
 ],
 "share_count": {"before":"", "after_if_all_exercised":"", "note":""},
 "checks_run": ["each thing you actually verified in the text"],
 "checks_not_run": ["each thing you could NOT verify and why — be specific and honest"],
 "five_questions": ["five questions this shareholder should ask, aimed at THIS company"],
 "plain_summary": "three or four sentences. No jargon. Assume a smart person who has never read a filing."
}

⚠⚠ WHAT DID THE MONEY COST? THIS IS THE QUESTION NOBODY ELSE ASKS.

A shareholder is paying for this offering out of the value of the company they
already own. "cost_of_the_money" is where that goes: the gross raised, the
placement agent's cash fee and percentage, the agent's expenses, any warrants
the agent received, the issuer's own legal and offering expenses, and what the
company says it NETS.

- EVERY FIGURE EXACTLY AS WRITTEN, with a quote for the gross and the net.
- If a figure is not in the document, LEAVE IT EMPTY and say so in "note".
  Never compute a net the document did not state — an offering has costs that
  are not disclosed here, and a subtraction would look like a finding when it
  is a guess.
- ⚠ A RESALE PROSPECTUS RAISES NOTHING FOR THE COMPANY. If this document is
  registering shares for resale by selling stockholders, say that in "note",
  leave gross and net empty, and do not carry over figures from the earlier
  placement it describes — those belong to that filing, not this one.

⚠⚠ WHEN A PARTY IS NOT NAMED, THAT IS THE FINDING.

Documents routinely register shares for "the August 2026 Purchaser" or "certain
accredited investors" without ever saying who they are.

- THOSE ARE NOT NAMES AND THEY DO NOT GO IN "parties". They go in
  "who_is_not_named", with the placeholder exactly as written and a quote.
- A real name goes in "parties". A placeholder goes in "who_is_not_named".
  The test is simple: could you look this up in a register? If not, it is a
  placeholder.

⚠⚠ THE NAMES ARE THE PATTERN. LIST EVERY ONE.

"parties" must carry every firm and person the document names in a role — the
placement agent, the issuer's counsel, the agent's counsel, the investor or fund
that bought, the auditor, the transfer agent, the underwriter.

- THE NAME EXACTLY AS THE DOCUMENT WRITES IT. "Blank Rome LLP", not "Blank
  Rome". "A.G.P./Alliance Global Partners", not "AGP". The spelling is what
  lets the same firm be recognised across a thousand filings.
- ONE ENTRY PER FIRM PER ROLE, with a short quote naming them, under fifteen
  words. NO QUOTE MEANS YOU DID NOT FIND THEM — leave them out entirely.
- Never guess a role. If the document names a firm but not what it did, put
  the role as "named" and nothing more.
- Do not include the issuer itself. Do not include the exchange, the SEC, or
  the depository.

⚠⚠ THE MONEY FIGURES ARE THE MOST IMPORTANT THING ON THE PAGE AND THEY MUST BE
COPIED, NEVER SUMMARISED.

- "raised" and "price" must be the figure EXACTLY AS THE DOCUMENT WRITES IT.
  If the document says $10,350,000 you write $10,350,000. NOT "about ten
  million", NOT "$10 million", NOT a rounded or tidied version.
- "raised_quote" and "price_quote" must each be a SHORT RUN OF WORDS COPIED
  FROM THE DOCUMENT containing that figure, under fifteen words, so anyone can
  find it. If you cannot copy such a run of words, YOU DID NOT FIND THE FIGURE
  — leave BOTH fields empty.
- ⚠ AN EMPTY FIELD IS ALWAYS BETTER THAN A PLAUSIBLE NUMBER. Two readings of
  this same filing produced "$10,000,000 at $0.50" and "$100 million at $1.00".
  One of those was invented. That single failure would end this business, and
  a blank field would have cost nothing.
- Never write a round number unless the document writes a round number.

RULES:
- Quote at most 15 words at a time, and never more than one quote per document.
- Never say anyone broke a law. Describe what the document says.
- Never give advice. Never say buy, sell, hold, or what a price will do.
- If the text was cut short, say so in checks_not_run.
- "heavy" is true for: price reset, cashless exercise, inducement, ownership blocker,
  pre-funded warrants, variable rate, floor price, most favoured nation, participation right.
- If something is not in the document, say so. Do not fill a field with a guess.
- ⚠ AT MOST FIVE ENTRIES IN "the_terms". A long list runs out of room and the
  whole read is lost. Five that matter beats nine that never arrive.
- ⚠ AT MOST FIVE ENTRIES in checks_run, checks_not_run and five_questions.
- ⚠ KEEP EVERY FIELD SHORT. One or two sentences. This must fit in one reply.

WHEN PRECEDENT IS SUPPLIED:
- You will be given other filings that carried the same terms, and the names that
  appear across them. USE IT. Add a "precedent" field:
  {"seen_before":"how many other filings carry this same combination",
   "cite":[{"accession":"","ticker":"","filed":"","what_was_shared":""}],
   "names":[{"name":"","role":"counsel / placement agent / investor",
             "issuers":0,"first_seen":"","deals":["ticker — what they did, when"]}],
   "then_and_now":[{"ticker":"","at_the_deal":"","today":"","change":"",
                    "split_adjusted":true}],
   "what_happened_after":[{"ticker":"","event_date":"","chg_90d_pct":"",
                           "chg_1y_pct":"","reverse_split_since":"",
                           "authorized_restored":"","financings_since":"",
                           "listing_status":""}],
   "reverse_splits":{"how_many_of_these_companies_split":0,
                     "when":[{"ticker":"","on":"","ratio":""}],
                     "authorized_left_standing":"what the authorized share count was after"},
   "after":"what the record shows happened afterwards, stated as a count"},
 "substance": {"years_measured":0,
               "revenue_total":"", "raised_total":"",
               "years_with_no_revenue":0,
               "financing_to_operations":"how many times larger the financing was",
               "authorized_vs_outstanding":"the ceiling against the shares out",
               "what_the_numbers_say":"one or two sentences describing ONLY what the figures are. No conclusion about the company."}
- REPORT WHAT HAPPENED. NEVER SAY WHAT WILL HAPPEN. "Nine of fourteen fell within
  ninety days" is a fact with a method behind it. "This will fall" is a forecast,
  and a forecast is advice. Never make one.
- If no precedent was supplied, say so in checks_not_run. Do not invent one.
- The outcome figures are ALREADY COMPUTED and supplied to you. Use them as given.
  Do not recompute a percentage and do not round one into a different number.

THEN AND NOW — the rule that keeps it honest:
- Only state a then-and-now price if BOTH the price history AND the split data were
  supplied. A reverse split makes the old price meaningless unless it is adjusted:
  a stock at $8 that later did a 1-for-20 was at $0.40 in today's terms.
- If split data is missing, put "no then-and-now: split data not available" in
  checks_not_run and leave then_and_now empty. NEVER state an unadjusted comparison.
- Say "at least" on any raised figure. It is a floor, not a total.

REVERSE SPLITS — get this right or the whole read is dismissed:
- A REVERSE SPLIT DOES NOT DILUTE ANYBODY. Every holder keeps exactly the same
  percentage of the company. Never write that a split diluted shareholders.
- What matters is THE AUTHORIZED SHARE COUNT AFTERWARDS. If 500 million shares
  stay authorized while outstanding falls to 2 million, the room for the next
  financing was just created. THAT is the finding, and it is usually in a charter
  amendment or a proxy, not in the split announcement.
- The sequence worth naming when the record shows it: financing with warrants →
  price falls → reverse split → authorized left standing or raised → another
  financing. Report the sequence as a count of what happened, with dates and
  accession numbers. Never say it will happen again.
- If the authorized figure was not supplied, say so in checks_not_run. The split
  on its own is only half the story and a half-told story is worse than none.

THE SUBSTANCE FIGURES — measure, never conclude:
- If substance data is supplied, fill the substance field from it. These are the
  company's own tagged figures from its own 10-Ks.
- STATE WHAT THE NUMBERS ARE. Do not say the company is a shell, a front, a
  vehicle, or that the business is a pretext. Do not say the financing is the
  real activity. Those are conclusions about a named company and they are not
  yours to draw — the reader draws them, or the author does under his own name.
- Acceptable: "reported no revenue in six of eight years; financing cash flow was
  eleven times operating cash flow; 500 million shares authorized against 2.1
  million outstanding."
- Not acceptable: any sentence that characterises the company rather than counting.
- If the substance data is missing, say so in checks_not_run and leave it empty.`;

/* ⚠ MEASURE BEFORE SENDING. A refusal costs the whole read and tells the
   buyer nothing. Estimating the size here means an oversized document is
   trimmed on a sentence boundary and the read says it was trimmed — which
   is a worse read, but a read. */
function fitsWindow(system, user, maxOut) {
  const chars = String(system).length + String(user).length;
  const tokens = Math.ceil(chars / 3.6) + (maxOut || 0);   /* cautious ratio */
  return { chars, tokens, fits: tokens < MODEL_CONTEXT_TOKENS - 4000 };
}

function trimToWindow(text, system, maxOut) {
  let t = String(text);
  let guard = 0;
  while (guard++ < 40) {
    const m = fitsWindow(system, t, maxOut);
    if (m.fits) return { text: t, trimmed: guard > 1, tokens: m.tokens };
    const cut = Math.floor(t.length * 0.85);
    const at = t.lastIndexOf(". ", cut);
    t = t.slice(0, at > 1000 ? at + 1 : cut);
  }
  return { text: t, trimmed: true, tokens: fitsWindow(system, t, maxOut).tokens };
}

async function think(env, text, meta, prior) {
  if (!env.AI) throw new Error("no AI binding on this worker — add it in Settings");

  let pre = "";
  if (prior && (prior.same_shape || []).length) {
    pre = "\n\n===== PRECEDENT FROM OUR OWN RECORD =====\n" +
          "Other filings carrying the same terms:\n" +
          JSON.stringify(prior.same_shape) +
          "\n\nNames appearing across issuers:\n" +
          JSON.stringify(prior.same_names) +
          (prior.prices && prior.prices.length
             ? "\n\nPrice history for those tickers:\n" + JSON.stringify(prior.prices)
             : "\n\nNo price history was supplied. Say so in checks_not_run.") +
          "\n===== END PRECEDENT =====\n";
  }

  let user =
    "Filing: " + (meta.form || "") + " filed " + (meta.filed || "") +
    " by " + (meta.company || "") + " (" + (meta.ticker || "") + ")." +
    "\nAccession " + meta.accession + ".\n" + pre + "\n" + text;

  /* ⚠ TRIM TO THE WINDOW BEFORE ASKING. A refusal costs the whole read and
     tells the buyer nothing; a trimmed read is worse than a full one but it
     is still a read, and it says it was trimmed. */
  const fit = trimToWindow(user, SYSTEM, ENGINE.max_tokens);
  user = fit.text;

  const r = await env.AI.run(ENGINE.model, {
    max_tokens: ENGINE.max_tokens,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user }
    ]
  });

  /* Workers AI returns the text on `response` for chat models. Some return
     `result.response`. Take whichever is there rather than assuming. */
  /* take the text from wherever this model put it, and if none of the
     known shapes match, SAY WHAT CAME BACK rather than swallowing it. */
  /* ⚠ MISTRAL ON WORKERS AI RETURNS THE JSON ALREADY PARSED, as an object on
     `response`. Confirmed by ?action=ping. When it is there, USE IT — parsing
     a string is the step that failed twice, and skipping it removes that whole
     class of failure. */
  let parsed = null;
  if (r && r.response && typeof r.response === "object" && !Array.isArray(r.response))
    parsed = r.response;

  let out = "";
  if (typeof r === "string") out = r;
  else if (r && typeof r.response === "string") out = r.response;
  else if (r && typeof r.result === "string") out = r.result;
  else if (r && r.result && typeof r.result.response === "string") out = r.result.response;
  else if (r && r.choices && r.choices[0] && r.choices[0].message)
    out = r.choices[0].message.content || "";
  else if (r && typeof r.output_text === "string") out = r.output_text;

  if (!out) {
    throw new Error("the engine returned nothing this worker recognises. " +
      "Shape: " + JSON.stringify(r && typeof r === "object" ? Object.keys(r) : typeof r) +
      " | Raw: " + JSON.stringify(r).slice(0, 400) +
      " — run ?action=ping to find a model that answers.");
  }
  out = out.replace(/```json|```/g, "").trim();

  /* a model sometimes wraps JSON in a sentence. Take the object. */
  const first = out.indexOf("{"), last = out.lastIndexOf("}");
  if (first > 0 || last < out.length - 1) out = out.slice(first, last + 1);

  let fields, salvaged = false;
  if (parsed) { fields = parsed; }
  else {
    try { fields = JSON.parse(out); }
    catch (e) {
      /* ⚠ SALVAGE. A read that ran out of room still holds the headline and
         the money. Close what is open and keep what survived rather than
         throwing away a document we already paid to read. */
      fields = salvage(out);
      if (!fields) throw new Error("the engine did not return clean JSON: " +
                                   out.slice(0, 300));
      salvaged = true;
    }
  }

  /* Workers AI bills in neurons, not tokens, and the account meter is the
     truth. Characters in is recorded so the cost per read can be checked
     against the bill rather than guessed at. */
  const cents = 0;

  return { fields, cents, salvaged, window_trimmed: !!fit.trimmed,
           tokens_sent: fit.tokens,
           inTok: Math.round(user.length / 4), outTok: 0 };
}

/* ============================================================
   SALVAGE — rescue a truncated reply

   The model writes JSON top to bottom, so a reply cut short is
   valid up to the cut. Walk it, drop the unfinished tail, close
   what is open, and parse. Returns null if nothing survives.
   ============================================================ */
function salvage(txt) {
  let s = String(txt || "").trim();
  const i = s.indexOf("{");
  if (i < 0) return null;
  s = s.slice(i);

  /* walk forward tracking depth and strings, remembering the last
     position where the object was structurally sound */
  const stack = [];
  let inStr = false, esc = false, lastGood = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") { stack.pop(); }
    else if (c === "," && stack.length) lastGood = k;   /* end of a complete member */
  }

  /* try progressively: the whole thing closed, then trimmed back to the
     last complete member and closed */
  const attempts = [];
  const close = str => {
    const st = [];
    let q = false, e2 = false;
    for (const c of str) {
      if (q) { if (e2) e2 = false; else if (c === "\\") e2 = true; else if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === "{" || c === "[") st.push(c);
      else if (c === "}" || c === "]") st.pop();
    }
    let tail = q ? '"' : "";
    for (let k = st.length - 1; k >= 0; k--) tail += (st[k] === "{" ? "}" : "]");
    return str + tail;
  };

  /* trailing rubbish after the final brace is the commonest wrapper —
     try cutting to it before anything more destructive */
  const lastBrace = s.lastIndexOf("}");
  /* ⚠ ORDER MATTERS. Prefer data that was COMPLETE over data force-closed
     mid-word: closing a cut string keeps a fragment like "The na" as though
     it were a real item. Trailing rubbish first, then trim to the last
     complete member, and only then force everything shut. */
  if (lastBrace > 0) attempts.push(s.slice(0, lastBrace + 1));
  if (lastGood > 0) attempts.push(close(s.slice(0, lastGood)));
  attempts.push(close(s));

  for (const a of attempts) {
    try {
      const o = JSON.parse(a);
      if (o && typeof o === "object") return o;
    } catch (e) {}
  }
  return null;
}

/* ============================================================
   PRODUCE — read it once
   ============================================================ */
async function produce(env, accession, force) {
  if (!accession) throw new Error("an accession number, please");

  const had = await env.OVERHANG.prepare(
    "SELECT * FROM reads WHERE accession = ?").bind(accession).first();
  if (had && !force) return { ok:true, build: BUILD, cached:true, read: JSON.parse(had.fields) };

  /* the wire already knows about this filing */
  const hit = await env.OVERHANG.prepare(
    `SELECT * FROM v_wire_filings WHERE accession = ? LIMIT 1`)
    .bind(accession).first().catch(() => null);
  if (!hit || !hit.cik) throw new Error("that accession is not on the wire");

  /* v_wire_filings columns: accession, cik, ticker, company, form, filed_on,
     doc_url, marks, labels, heavy. The date is filed_on, not filed. */
  const meta = { accession, cik: hit.cik, ticker: hit.ticker,
                 company: hit.company, form: hit.form, filed: hit.filed_on };

  const got = await gather(accession, hit.cik);

  /* THE RECORD OF EVERY SIMILAR FILING, put in front of the agent before
     it reads this one. This is what the archive is for. */
  const prior = await precedent(env, accession);

  /* IS THERE A BUSINESS HERE, OR IS THE BUSINESS THE FINANCING?
     The company's own numbers, free from the SEC. */
  try { prior.substance = await substance(hit.cik); }
  catch (e) { prior.missing.push("substance test: " + String(e)); }

  const res = await think(env, got.text, meta, prior);

  await env.OVERHANG.prepare(
    `INSERT INTO reads (accession, cik, ticker, company, form, filed,
                        fields, docs, chars, truncated, engine, cost_cents)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(accession) DO UPDATE SET
       fields=excluded.fields, docs=excluded.docs, chars=excluded.chars,
       truncated=excluded.truncated, cost_cents=excluded.cost_cents,
       made=datetime('now')`
  ).bind(accession, meta.cik, meta.ticker || null, meta.company || null,
         meta.form || null, meta.filed || null,
         JSON.stringify(res.fields), got.used.length, got.text.length,
         got.truncated, ENGINE.model, res.cents).run();

  await env.OVERHANG.prepare(
    "INSERT INTO read_log (accession, kind, note, cost_cents) VALUES (?,?,?,?)"
  ).bind(accession, "made", got.used.join(", "), res.cents).run().catch(()=>{});

  /* ⚠ FILE THE NAMES. This is what makes the archive compound: every read
     writes its parties into `parties` and `roles`, and from then on
     v_recurrence and v_network answer "where else does this firm appear"
     without anybody typing anything. It is also what the Deck runs on. */
  let filed = { parties: 0, roles: 0, note: "" };
  try { filed = await fileParties(env, meta, res.fields); }
  catch (e) { filed.note = String(e).slice(0, 200); }

  try { await fileCosts(env, meta, res.fields); }
  catch (e) { filed.costs_note = String(e).slice(0, 200); }

  return { ok:true, build: BUILD, cached:false, salvaged: !!res.salvaged,
    window_trimmed: !!res.window_trimmed, tokens_sent: res.tokens_sent, filed,
    documents: got.used, truncated: !!got.truncated,
           cost_cents: res.cents, read: res.fields };
}

/* ============================================================
   FILING THE NAMES

   parties: id, name, kind, cik, address, notes
   roles:   id, party_id, issuer_id, issuer_name, role,
            start_date, end_date, filing_count, source, notes
   issuers: id, cik, ticker, name, ...

   ⚠ MATCH ON THE NAME, EXACTLY AS FILED. No fuzzy matching — two
   firms with similar names are two firms, and merging them would
   corrupt every recurrence count built on top. If the same firm
   is written two ways in two filings, that is a cleanup job with
   a human looking at it, not something to guess at here.
   ============================================================ */
async function fileParties(env, meta, fields) {
  const list = (fields && fields.parties) || [];
  if (!list.length) return { parties: 0, roles: 0, note: "no parties in the read" };

  /* the issuer must exist before a role can point at it */
  let issuerId = null;
  try {
    const found = await env.OVERHANG.prepare(
      "SELECT id FROM issuers WHERE cik = ? OR ticker = ? LIMIT 1")
      .bind(meta.cik, meta.ticker || "").first();
    if (found) issuerId = found.id;
    else {
      const ins = await env.OVERHANG.prepare(
        `INSERT INTO issuers (cik, ticker, name, created_at)
         VALUES (?,?,?, datetime('now'))`)
        .bind(meta.cik, meta.ticker || null,
              String(meta.company || "").split("  (")[0]).run();
      issuerId = ins.meta && ins.meta.last_row_id;
    }
  } catch (e) { return { parties: 0, roles: 0, note: "issuer: " + String(e) }; }

  let np = 0, nr = 0;
  for (const p of list) {
    const name = String(p.name || "").trim();
    const role = String(p.role || "named").trim().toLowerCase();
    if (!name || name.length < 3) continue;
    if (!p.quote || String(p.quote).trim().length < 4) continue;   /* no quote, no entry */

    /* ⚠ A PLACEHOLDER IS NOT A FIRM. "the August 2026 Purchaser", "certain
       accredited investors", "the selling stockholders" — these are the
       document declining to say who. Filed as parties they would never match
       anything, and worse, the next issuer using the same phrase would look
       like the same party. They belong in who_is_not_named, which is a
       FINDING, not in the register of firms. */
    if (/^(the |certain |various )?(august|september|october|november|december|january|february|march|april|may|june|july)?\s*\d{0,4}\s*(purchaser|purchasers|investor|investors|holder|holders|selling stockholder|selling stockholders|accredited investor|accredited investors|noteholder|noteholders|buyer|buyers)$/i
        .test(name)) continue;
    if (/^(the )?(selling stockholders?|certain investors?|certain purchasers?|various investors?)$/i.test(name)) continue;

    let partyId = null;
    try {
      const found = await env.OVERHANG.prepare(
        "SELECT id FROM parties WHERE name = ? LIMIT 1").bind(name).first();
      if (found) partyId = found.id;
      else {
        const kind = /counsel|llp|law/i.test(role + " " + name) ? "attorney"
                   : /agent|underwrit/i.test(role)              ? "placement_agent"
                   : /investor|fund|capital|partners/i.test(role + " " + name) ? "fund"
                   : /auditor/i.test(role)                      ? "auditor"
                   : "firm";
        const ins = await env.OVERHANG.prepare(
          "INSERT INTO parties (name, kind, notes) VALUES (?,?,?)")
          .bind(name, kind, "first seen in " + meta.accession).run();
        partyId = ins.meta && ins.meta.last_row_id;
        np++;
      }
    } catch (e) { continue; }
    if (!partyId || !issuerId) continue;

    /* one row per party per issuer per role — seen again, the count goes up
       and the dates widen */
    try {
      const had = await env.OVERHANG.prepare(
        "SELECT id, filing_count, start_date FROM roles WHERE party_id=? AND issuer_id=? AND role=?")
        .bind(partyId, issuerId, role).first();
      if (had) {
        await env.OVERHANG.prepare(
          `UPDATE roles SET filing_count = COALESCE(filing_count,0) + 1,
                  end_date = ?,
                  start_date = CASE WHEN start_date IS NULL OR ? < start_date
                                    THEN ? ELSE start_date END
            WHERE id = ?`)
          .bind(meta.filed, meta.filed, meta.filed, had.id).run();
      } else {
        await env.OVERHANG.prepare(
          `INSERT INTO roles (party_id, issuer_id, issuer_name, role,
                              start_date, end_date, filing_count, source, notes)
           VALUES (?,?,?,?,?,?,1,?,?)`)
          .bind(partyId, issuerId,
                String(meta.company || "").split("  (")[0], role,
                meta.filed, meta.filed, "read agent",
                String(p.quote || "").slice(0, 200)).run();
        nr++;
      }
    } catch (e) {}
  }
  return { parties: np, roles: nr,
    note: "new firms and new roles recorded — v_recurrence and v_network " +
          "now answer for them without anyone typing" };
}

/* ============================================================
   FILING WHAT THE MONEY COST

   ⚠ ONLY WHAT THE DOCUMENT STATES. A figure the filing does not
   give is stored as NULL, never as a subtraction of our own. An
   offering has costs that are not disclosed, so a computed net
   would look like a finding when it is a guess.
   ============================================================ */
function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

async function fileCosts(env, meta, fields) {
  const c = (fields && fields.cost_of_the_money) || {};
  const sc = (fields && fields.share_count) || {};
  const parties = (fields && fields.parties) || [];

  const agent = (parties.find(p => /placement agent|underwrit/i.test(p.role || "")) || {}).name || null;
  const counsel = (parties.find(p => /issuer counsel|counsel/i.test(p.role || "")) || {}).name || null;

  const resale = /resale|selling stockholder/i.test(
    String(fields.headline || "") + " " + String(c.note || ""));

  await env.OVERHANG.prepare(
    `INSERT INTO deal_costs (accession, cik, ticker, company, form, filed,
        is_resale, gross, agent_cash_fee, agent_fee_pct, agent_expenses,
        offering_expenses, net_to_company, agent_name, counsel_name,
        shares_before, shares_after, raw)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(accession) DO UPDATE SET
       gross=excluded.gross, agent_cash_fee=excluded.agent_cash_fee,
       agent_fee_pct=excluded.agent_fee_pct, agent_expenses=excluded.agent_expenses,
       offering_expenses=excluded.offering_expenses,
       net_to_company=excluded.net_to_company, agent_name=excluded.agent_name,
       counsel_name=excluded.counsel_name, is_resale=excluded.is_resale,
       shares_before=excluded.shares_before, shares_after=excluded.shares_after,
       raw=excluded.raw, made=datetime('now')`
  ).bind(meta.accession, meta.cik, meta.ticker || null,
         String(meta.company || "").split("  (")[0], meta.form || null, meta.filed || null,
         resale ? 1 : 0,
         toNum(c.gross), toNum(c.agent_cash_fee), toNum(c.agent_fee_pct),
         toNum(c.agent_expenses), toNum(c.legal_and_offering_expenses),
         toNum(c.net_to_company), agent, counsel,
         toNum(sc.before), toNum(sc.after_if_all_exercised),
         JSON.stringify(c)).run();
}


/* ============================================================
   THE INDUSTRY SUMMARY — the proof, not the product

   His instruction, 12 Sep 2026: "one of the most important
   things we need to report is a summary, NOT with the companies'
   names, but how many companies in each industry have warrants.
   We're trying to prove to people that they need the information
   we're collecting... our summary should not give them all the
   goodies, they should pay us for what we're doing."

   ⚠ SO IT IS DELIBERATELY THIN, and here is exactly what is
   withheld and why:

     · NO COMPANY NAMES AND NO TICKERS. That is the list, and the
       list is what is sold.
     · NO DATES. A date plus an industry narrows it to a handful
       of companies anybody could then find on EDGAR.
     · NO TREND, NO HISTORY, NO MONTH-ON-MONTH. The trend across
       years IS the analysis — it is what Report No. 3 is built
       on, and giving it away free gives away the finding.
     · NO PHRASE BREAKDOWN PER INDUSTRY. Which terms cluster in
       which sector is a finding too.

   What is left is a count. It proves the data exists and is
   large, and it cannot be turned into the list.
   ============================================================ */
async function industries(env, q) {
  const days = Math.max(7, Math.min(90, +(q.get("days") || 30)));

  let rows = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COALESCE(NULLIF(s.sector,''), 'Not classified') AS sector,
              COUNT(DISTINCT h.cik) AS companies
         FROM wire_hits h
         LEFT JOIN cik_sic s ON s.cik = h.cik
        WHERE h.filed_on >= date('now', ?)
        GROUP BY sector
        ORDER BY companies DESC`).bind('-' + days + ' days').all();
    rows = r.results || [];
  } catch (e) { return { ok:false, build: BUILD, error: String(e) }; }

  const total = rows.reduce((n, x) => n + (x.companies || 0), 0);

  /* ⚠ A SECTOR WITH ONE OR TWO COMPANIES IN IT IS A NAME. Anybody who follows
     a small sector would know which company it is. Those are rolled together
     rather than printed. */
  const shown = [], hidden = [];
  for (const x of rows) {
    if (x.companies >= 3) shown.push(x); else hidden.push(x);
  }
  const hiddenCount = hidden.reduce((n, x) => n + x.companies, 0);
  if (hiddenCount)
    shown.push({ sector: "Other industries", companies: hiddenCount,
                 note: hidden.length + " sectors with fewer than three each, " +
                       "held back because a sector with one company in it names it" });

  return { ok:true, build: BUILD,
    over_the_last: days + " days",
    companies_with_warrant_paper: total,
    by_industry: shown,
    note: "Counts only. No company names, no tickers, no dates, and no history " +
          "— those are the product. This says how much there is, not what it is.",
    what_you_get_if_you_pay: "Every company, every filing, the dates, the forms, " +
          "the accession numbers and a link to each document." };
}

/* ============================================================
   THE TALLY — what shareholders paid, by day and running

   ⚠ DISCLOSED AND ESTIMATED NEVER MIX IN ONE FIGURE. Every total
   is reported twice: what the documents actually state, and what
   an estimate adds. A reader can take the first and ignore the
   second, which is the only way an estimate is publishable at all.

   ⚠ THE ESTIMATE IS DERIVED FROM YOUR OWN READS, NOT ASSUMED.
   Where filings DO disclose offering expenses, that gives a ratio
   to gross. The MEDIAN of those ratios is applied to filings that
   disclose nothing. The basis, the sample size and the ratio are
   all printed, so anyone can re-run it or reject it.

   ⚠ RESALE REGISTRATIONS ARE EXCLUDED FROM THE MONEY TOTALS. They
   raise nothing; counting them would double-count the placement
   they describe.
   ============================================================ */
async function tally(env, from, to) {
  const out = { ok:true, build: BUILD, from: from || null, to: to || null };

  let rows = [];
  try {
    let sql = `SELECT * FROM deal_costs WHERE is_resale = 0`;
    const b = [];
    if (from) { sql += " AND filed >= ?"; b.push(from); }
    if (to)   { sql += " AND filed <= ?"; b.push(to); }
    const r = await env.OVERHANG.prepare(sql + " ORDER BY filed").bind(...b).all();
    rows = r.results || [];
  } catch (e) { return { ok:false, build: BUILD, error: String(e) }; }

  /* ---------- what the documents actually say ---------- */
  const sum = k => rows.reduce((n, x) => n + (Number(x[k]) || 0), 0);
  const gross = sum("gross");
  const agentCash = sum("agent_cash_fee");
  const agentExp = sum("agent_expenses");
  const offering = sum("offering_expenses");

  const withGross = rows.filter(x => Number(x.gross) > 0);
  const withOffering = rows.filter(x => Number(x.offering_expenses) > 0 && Number(x.gross) > 0);
  const withAgent = rows.filter(x => Number(x.agent_cash_fee) > 0);

  out.disclosed = {
    filings_counted: rows.length,
    filings_with_a_gross_figure: withGross.length,
    gross_raised: Math.round(gross),
    placement_agent_cash_fees: Math.round(agentCash),
    placement_agent_expenses: Math.round(agentExp),
    offering_and_legal_expenses: Math.round(offering),
    total_disclosed_cost: Math.round(agentCash + agentExp + offering),
    cost_as_pct_of_gross: gross ? +(((agentCash + agentExp + offering) / gross) * 100).toFixed(2) : null,
    note: "Every figure here is stated in a filing. Nothing is estimated. " +
          "Each is a FLOOR — undisclosed costs are not in it."
  };

  /* ---------- the estimate, and its basis ---------- */
  const ratios = withOffering
    .map(x => Number(x.offering_expenses) / Number(x.gross))
    .sort((a, b) => a - b);
  const median = ratios.length
    ? (ratios.length % 2
        ? ratios[(ratios.length - 1) / 2]
        : (ratios[ratios.length/2 - 1] + ratios[ratios.length/2]) / 2)
    : null;

  const missing = withGross.filter(x => !(Number(x.offering_expenses) > 0));
  const missingGross = missing.reduce((n, x) => n + Number(x.gross), 0);

  out.estimated = median === null ? {
    possible: false,
    reason: "No filing in this range disclosed its offering expenses, so there " +
            "is nothing to derive a ratio from. An estimate would be invented, " +
            "so none is given."
  } : {
    possible: true,
    basis: "the median ratio of DISCLOSED offering and legal expenses to gross " +
           "proceeds, taken from the filings in this set that state both",
    sample_size: ratios.length,
    median_ratio_pct: +(median * 100).toFixed(2),
    lowest_ratio_pct: +(ratios[0] * 100).toFixed(2),
    highest_ratio_pct: +(ratios[ratios.length - 1] * 100).toFixed(2),
    filings_with_no_expense_figure: missing.length,
    their_gross: Math.round(missingGross),
    estimated_additional_legal_and_expenses: Math.round(missingGross * median),
    note: "ESTIMATE. Derived from this data set, not from an industry figure. " +
          "With a sample this size it is indicative only, and it is reported " +
          "separately so it can be ignored."
  };

  out.combined = {
    disclosed_cost: out.disclosed.total_disclosed_cost,
    plus_estimate: out.estimated.possible
      ? out.estimated.estimated_additional_legal_and_expenses : 0,
    total: out.disclosed.total_disclosed_cost +
           (out.estimated.possible ? out.estimated.estimated_additional_legal_and_expenses : 0),
    warning: "Do not publish the combined figure without the split. The " +
             "disclosed half survives any argument; the estimated half does not."
  };

  /* ---------- by day ---------- */
  const byDay = {};
  for (const x of rows) {
    const d = x.filed || "unknown";
    byDay[d] = byDay[d] || { filings: 0, gross: 0, agent_fees: 0, expenses: 0 };
    byDay[d].filings++;
    byDay[d].gross += Number(x.gross) || 0;
    byDay[d].agent_fees += Number(x.agent_cash_fee) || 0;
    byDay[d].expenses += (Number(x.agent_expenses) || 0) + (Number(x.offering_expenses) || 0);
  }
  let run = 0;
  out.by_day = Object.keys(byDay).sort().map(d => {
    const v = byDay[d];
    run += v.agent_fees + v.expenses;
    return { day: d, filings: v.filings,
      gross: Math.round(v.gross),
      disclosed_cost: Math.round(v.agent_fees + v.expenses),
      running_disclosed_cost: Math.round(run) };
  });

  /* ---------- who was paid ---------- */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT agent_name, COUNT(*) deals,
              SUM(gross) gross, SUM(agent_cash_fee) fees
         FROM deal_costs WHERE is_resale = 0 AND agent_name IS NOT NULL
        GROUP BY agent_name ORDER BY fees DESC LIMIT 20`).all();
    out.by_agent = (r.results || []).map(x => ({
      agent: x.agent_name, deals: x.deals,
      gross: Math.round(x.gross || 0), disclosed_fees: Math.round(x.fees || 0),
      fee_pct: x.gross ? +((x.fees / x.gross) * 100).toFixed(2) : null }));
  } catch (e) {}

  return out;
}

/* ============================================================
   SERVE — the buyer's side
   ============================================================ */
async function serve(env, q) {
  const accession = q.get("accession");
  const email = (q.get("email") || "").trim().toLowerCase();
  if (!accession) throw new Error("an accession number, please");

  /* ⚠ THE GATE IS NOT BUILT YET. This asks the pay worker what this
     address is entitled to. Until PAY is set it refuses everything,
     which is the safe direction to fail. */
  const paid = await entitled(env, email);
  if (!paid.ok) {
    return { ok:false, paid:false, reason: paid.why,
             offer: { read_cents: 2000, opinion_cents: 4000 } };
  }

  const row = await env.OVERHANG.prepare(
    "SELECT * FROM reads WHERE accession = ?").bind(accession).first();
  if (row) return { ok:true, cached:true, read: JSON.parse(row.fields),
                    truncated: !!row.truncated, made: row.made };

  const made = await produce(env, accession, false);
  return { ok:true, cached:false, read: made.read, truncated: made.truncated };
}

async function entitled(env, email) {
  if (!email) return { ok:false, why:"no email" };
  if (!env.PAY) return { ok:false, why:"the gate is not connected yet" };
  try {
    const r = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
    const j = await r.json();
    const has = (j && j.has) || {};
    if (has.read || has.read_year) return { ok:true };
    return { ok:false, why:"nothing on this address" };
  } catch (e) {
    return { ok:false, why:"could not reach the payment desk" };
  }
}

/* ============================================================
   PEEK — free, and it sells the read without giving it away
   ============================================================ */
async function peek(env, accession) {
  if (!accession) throw new Error("an accession number, please");
  const row = await env.OVERHANG.prepare(
    "SELECT ticker, company, form, filed, fields FROM reads WHERE accession = ?")
    .bind(accession).first();

  if (row) {
    const f = JSON.parse(row.fields);
    const terms = (f.the_terms || []);
    return { ok:true, read_exists:true,
      ticker: row.ticker, company: row.company, form: row.form, filed: row.filed,
      terms_found: terms.length,
      heavy_found: terms.filter(t => t.heavy).length,
      /* the NAMES of the clauses, never what they do — that is the product */
      terms: terms.map(t => t.name),
      note: "This filing has been read. The reading is " + terms.length +
            " terms, what each does to a holder, the share count, and what we could not check." };
  }

  const hit = await env.OVERHANG.prepare(
    "SELECT * FROM v_wire_filings WHERE accession = ? LIMIT 1").bind(accession).first()
    .catch(() => null);
  if (!hit) return { ok:false, error:"not on the wire" };
  return { ok:true, read_exists:false, ticker: hit.ticker, form: hit.form, filed: hit.filed,
           note: "Nobody has read this one yet. Buying the read produces it." };
}

/* ============================================================
   THE BOOKS ON IT
   ============================================================ */
async function cost(env) {
  const t = await env.OVERHANG.prepare(
    "SELECT COUNT(*) n, SUM(cost_cents) c, AVG(cost_cents) a FROM reads").first();
  return { ok:true, build: BUILD, reads: t.n || 0,
    spent_dollars: +(((t.c || 0) / 100)).toFixed(2),
    average_cents: +((t.a || 0)).toFixed(2),
    note: "Every read is stored. The second buyer on the same filing costs nothing." };
}

async function list(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT accession, ticker, company, form, filed, docs, truncated, cost_cents, made
       FROM reads ORDER BY made DESC LIMIT 200`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}