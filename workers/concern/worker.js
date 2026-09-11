/* ============================================================================
   GOING CONCERN  —  Cloudflare Worker  ·  worker name: concern
   Who is running out of money, who signed off on it, and who papered it.

   Built 2026-09-10 · concern-1b — with what shareholders have lost

   ----------------------------------------------------------------------------
   ⚠ TWO DIFFERENT EVENTS, AND ALMOST NOBODY SEPARATES THEM.

   THE AUDITOR'S DOUBT is an independent accountant putting his own name to
   the sentence that this company may not survive the year. It appears in the
   audit report and it is the strongest signal in an annual report.

   MANAGEMENT'S DISCLOSURE is the company saying it about itself, in the
   notes, because ASC 205-40 requires an assessment every reporting period. It
   is not nothing — but it is the company grading its own homework.

   A list that mixes them is worth much less than one that does not. The
   phrase sets below are what tells them apart, and which set matched is
   carried on every row.

   ⚠ IT IS AN APPROXIMATION AND IT IS LABELLED ONE. Full-text search returns a
   document, not a paragraph, so a filing can match both sets. Where it does,
   the row says both rather than picking one.

   ----------------------------------------------------------------------------
   ⚠ THE AUDITOR IS NOT PARSED OFF A PAGE. Since 2021 every filer tags
   dei:AuditorName in XBRL, so who signed the report is machine-readable and
   exact. That is what makes a league table defensible: it is the company's
   own tagged data, not a name somebody read off a scan.

   ⚠ THE ATTORNEY IS DIFFERENT AND THE PAGE MUST SAY SO. There is no tag for
   counsel. It comes from the `parties` and `roles` tables already built here
   by hand, so coverage is PARTIAL — a firm absent from the table is absent
   from the count, which is not the same as a firm that did no work. Never
   print a counsel league table without that sentence beside it.

   ----------------------------------------------------------------------------
   ⚠ WHAT SHAREHOLDERS HAVE LOST, BESIDE IT. An auditor's doubt is a
   statement about the year ahead. The fall in market value is what already
   happened. Together they are a far stronger row than either alone, and both
   numbers come from the companies' own filings.

     money in       cash from financing, added across the years on file
     worth then     the earliest public float the company filed
     worth now      the latest public float the company filed
     the fall       the difference, same company at both ends

   ⚠ SAME COMPANY AT BOTH ENDS OR IT IS NOT A COMPARISON. A figure from one
   set of filers against a figure from another is arithmetic that looks right
   and is not.

   ⚠ AND THE COVERAGE IS PARTIAL BY CONSTRUCTION. The counter stores
   per-company figures for companies ON THE WIRE. A going concern filer that
   has never filed warrant paper has no row, and it is shown as NOT HELD —
   never as zero. Zero is a claim; not held is a fact about us.

   ----------------------------------------------------------------------------
   ⚠ AND WHAT NONE OF IT MEANS. A going concern paragraph is a required
   disclosure, not an accusation. Thousands of ordinary companies carry one —
   early-stage businesses nearly always do. An auditor who signs many of them
   may simply be the auditor small companies hire. THE COUNT IS THE FINDING.
   Why is not, and this worker never says why.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
   SECRETS    LOG_KEY

   PUBLIC — free, both sites
     ?today=1[&days=1]            what carried going concern language
     ?league=1[&days=365]         which auditor signs the most, and counsel
     ?company=TICKER              one company's history of it
     ?method=1                    the phrases, the limits, the sources
   PRIVATE
     ?action=scan&days=3          search EDGAR and record what matched
     ?action=auditors&n=25        fill in dei:AuditorName for what was found
     ?action=stats
   ========================================================================== */

const BUILD = "concern-1b · 2026-09-10 14:20 ET";
const CONTACT = "research@warrantwire.com";
const FTS = "https://efts.sec.gov/LATEST/search-index";

/* ⚠ THE AUDITOR'S OWN LANGUAGE. These sentences live in an audit report and
   nowhere else — the explanatory paragraph an accountant adds when he is not
   prepared to sign without one. */
const AUDITOR_SAYS = [
  "the accompanying financial statements have been prepared assuming that the company will continue as a going concern",
  "raise substantial doubt about the company's ability to continue as a going concern",
  "raise substantial doubt about its ability to continue as a going concern",
  "these conditions raise substantial doubt",
  "the financial statements do not include any adjustments that might result from the outcome of this uncertainty"
];

/* ⚠ MANAGEMENT'S OWN LANGUAGE, required by ASC 205-40 every reporting period.
   The company saying it about itself. */
const MANAGEMENT_SAYS = [
  "management has concluded that there is substantial doubt",
  "management's plans to alleviate substantial doubt",
  "substantial doubt about the company's ability to continue as a going concern within one year",
  "asc 205-40",
  "accounting standards update no. 2014-15",
  "our ability to continue as a going concern is dependent upon"
];

const FORMS = "10-K,10-Q,20-F,S-1,424B3,424B5";

export default {
  async fetch(req, env) {
    const q = new URL(req.url).searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      const a = q.get("action") || "";
      if (!a) {
        if (q.get("method"))  return json(method(), H);
        if (q.get("today"))   return json(await today(env, +(q.get("days") || 1)), H);
        if (q.get("league"))  return json(await league(env, +(q.get("days") || 365)), H);
        if (q.get("company")) return json(await oneCompany(env, q.get("company")), H);
      }

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      if (a === "scan")     return json(await scan(env, +(q.get("days") || 3)), H);
      if (a === "auditors") return json(await auditors(env, +(q.get("n") || 25)), H);
      return json(await stats(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS concern_hits (
       accession TEXT, cik TEXT, ticker TEXT, company TEXT,
       form TEXT, filed_on TEXT,
       said_by TEXT,          /* auditor | management | both */
       phrase TEXT,
       found TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (accession, said_by))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS auditor_of (
       cik TEXT, fy INTEGER, auditor TEXT, auditor_id TEXT, location TEXT,
       pulled TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (cik, fy))`).run();
}

function method() {
  return { ok:true, build: BUILD,
    what_this_is:
      "Every filing carrying going concern language, and who put their name " +
      "to it. Free, on both sites, always.",
    the_distinction: {
      auditor:
        "An independent accountant putting HIS OWN NAME to the sentence that " +
        "this company may not survive the year. It appears in the audit " +
        "report. It is the strongest signal in an annual report.",
      management:
        "The company saying it about itself in the notes, because ASC 205-40 " +
        "requires the assessment every reporting period. Not nothing — but it " +
        "is the company grading its own homework.",
      why_it_matters:
        "A list that mixes the two is worth much less than one that does not."
    },
    phrases: { auditor: AUDITOR_SAYS, management: MANAGEMENT_SAYS },
    where_the_names_come_from: {
      auditor:
        "dei:AuditorName, tagged in XBRL by every filer since 2021. Machine " +
        "readable and exact — the company's own tagged data, not a name read " +
        "off a scan.",
      attorney:
        "⚠ PARTIAL, AND SAID SO WHEREVER IT IS PRINTED. There is no tag for " +
        "counsel. It comes from a table built here by hand, so a firm absent " +
        "from the count is not a firm that did no work.",
      company: "EDGAR full-text search and the SEC's own CIK to ticker map."
    },
    the_limits: [
      "Full-text search returns a DOCUMENT, not a paragraph. A filing can " +
      "match both sets; where it does, the row says both rather than choosing.",
      "dei:AuditorName appears on annual reports. A quarterly hit has no " +
      "auditor attached and is shown without one.",
      "⚠ A GOING CONCERN PARAGRAPH IS A REQUIRED DISCLOSURE, NOT AN " +
      "ACCUSATION. Thousands of ordinary companies carry one and early-stage " +
      "businesses nearly always do. An auditor who signs many may simply be " +
      "the auditor small companies hire. THE COUNT IS THE FINDING. Why is not."
    ]
  };
}

/* ============================================================
   THE SCAN
   ============================================================ */
async function scan(env, days) {
  days = Math.max(1, Math.min(30, days || 3));
  const to = today_iso(), from = addDays(to, -days);

  const sets = [["auditor", AUDITOR_SAYS], ["management", MANAGEMENT_SAYS]];
  const found = new Map();          /* accession -> row */
  const tried = [], failed = [];

  for (const [who, phrases] of sets) {
    for (const p of phrases) {
      const u = new URL(FTS);
      u.searchParams.set("q", '"' + p + '"');
      u.searchParams.set("forms", FORMS);
      u.searchParams.set("startdt", from);
      u.searchParams.set("enddt", to);
      tried.push(p);

      let res;
      try {
        res = await fetch(u.toString(), {
          headers: { "User-Agent": CONTACT, "Accept": "application/json" } });
      } catch (e) { failed.push({ phrase: p, why: String(e).slice(0, 90) }); continue; }

      /* ⚠ EDGAR RETURNS 500s UNDER LOAD AND A ZERO IS NOT AN ANSWER. A phrase
         that errored is recorded as errored, never as "nothing found" — the
         wire learned this the hard way and reported a quiet day that was not
         quiet. */
      if (!res.ok) { failed.push({ phrase: p, status: res.status }); continue; }

      const data = await res.json();
      for (const h of ((data.hits && data.hits.hits) || [])) {
        const s = h._source || {};
        const acc = (s.adsh || String(h._id || "").split(":")[0] || "").trim();
        if (!acc) continue;
        const cik = String(Array.isArray(s.ciks) ? s.ciks[0] : (s.ciks || ""));
        const nm  = Array.isArray(s.display_names) ? s.display_names[0] : (s.display_names || "");
        const prev = found.get(acc);
        if (prev) {
          if (prev.said_by !== who) prev.said_by = "both";
        } else {
          found.set(acc, { accession: acc, cik,
            company: String(nm).split("  (")[0],
            ticker: tickerFrom(nm),
            form: s.file_type || s.root_form || "",
            filed_on: String(s.file_date || "").slice(0, 10),
            said_by: who, phrase: p });
        }
      }
      await sleep(220);
    }
  }

  let saved = 0;
  for (const r of found.values()) {
    await env.OVERHANG.prepare(
      `INSERT INTO concern_hits (accession, cik, ticker, company, form, filed_on, said_by, phrase)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(accession, said_by) DO UPDATE SET
         phrase=excluded.phrase, filed_on=excluded.filed_on`)
      .bind(r.accession, r.cik, r.ticker, r.company, r.form, r.filed_on,
            r.said_by, r.phrase).run();
    saved++;
  }

  return { ok:true, build: BUILD, window: { from, to },
    phrases_tried: tried.length, filings_found: found.size, saved,
    /* ⚠ A FAILED PHRASE IS REPORTED. Silence here would look like a clean run. */
    phrases_that_errored: failed,
    note: failed.length
      ? "⚠ Some phrases errored at EDGAR, so this run UNDER-REPORTS. Run it " +
        "again for the same window and it will catch what was dropped."
      : "Every phrase answered." };
}

/* ⚠ THE TICKER, WHERE EDGAR PUTS IT: display_names arrive as
   "THERIVA BIOLOGICS, INC.  (TOVX)  (CIK 0000894158)". */
function tickerFrom(name) {
  const m = String(name || "").match(/\(([A-Z][A-Z0-9.\-]{0,6})\)/);
  return m ? m[1] : null;
}

/* ============================================================
   WHO SIGNED IT
   ============================================================ */
async function auditors(env, n) {
  n = Math.max(1, Math.min(100, n || 25));
  const r = await env.OVERHANG.prepare(
    `SELECT DISTINCT h.cik FROM concern_hits h
       LEFT JOIN auditor_of a ON a.cik = h.cik
      WHERE h.cik IS NOT NULL AND a.cik IS NULL
      LIMIT ?`).bind(n).all();

  const out = [];
  for (const x of (r.results || [])) {
    const padded = String(x.cik).replace(/\D/g, "").padStart(10, "0");
    const url = "https://data.sec.gov/api/xbrl/companyconcept/CIK" + padded +
                "/dei/AuditorName.json";
    try {
      const res = await fetch(url, { headers: { "User-Agent": CONTACT } });
      /* ⚠ A 404 IS NORMAL, NOT A FAULT. A company that has not filed an
         annual report since the tag existed simply has no such document. */
      if (res.status === 404) { out.push({ cik: x.cik, none: true }); await sleep(220); continue; }
      if (!res.ok) { out.push({ cik: x.cik, status: res.status }); await sleep(220); continue; }
      const j = await res.json();
      const units = (j.units && (j.units.pure || j.units[Object.keys(j.units)[0]])) || [];
      /* the latest annual one wins — a restatement corrects the earlier */
      let best = null;
      for (const u of units) {
        if (!u || !u.val) continue;
        if (!/^(10-K|20-F|40-F)/.test(String(u.form || ""))) continue;
        if (!best || String(u.accn || "") > String(best.accn || "")) best = u;
      }
      if (best) {
        await env.OVERHANG.prepare(
          `INSERT INTO auditor_of (cik, fy, auditor) VALUES (?,?,?)
           ON CONFLICT(cik, fy) DO UPDATE SET auditor=excluded.auditor`)
          .bind(x.cik, Number(best.fy) || 0, String(best.val)).run();
        out.push({ cik: x.cik, auditor: String(best.val), fy: best.fy });
      } else out.push({ cik: x.cik, none: true });
    } catch (e) { out.push({ cik: x.cik, error: String(e).slice(0, 90) }); }
    await sleep(220);
  }
  return { ok:true, build: BUILD, looked_up: out.length, rows: out };
}

/* ============================================================
   WHAT SHAREHOLDERS HAVE LOST

   ⚠ ONE QUERY FOR EVERY CIK ASKED FOR, NOT ONE PER ROW. A daily
   list of forty filings would otherwise be forty round trips.

   ⚠ AND IT DEGRADES TO NOTHING RATHER THAN FAILING. If the
   counter has not been built yet the table does not exist, and a
   going concern list that will not load because a second product
   is unfinished is worse than one without a money column.
   ============================================================ */
async function damageFor(env, ciks) {
  const out = {};
  const want = [...new Set((ciks || []).filter(Boolean).map(c => pad10(c)))];
  if (!want.length) return out;
  const qs = want.map(() => "?").join(",");

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT cik, concept, fy, val FROM market_cik
        WHERE cik IN (${qs}) AND concept IN ('money_in','still_standing')
        ORDER BY fy`).bind(...want).all();

    const by = {};
    for (const x of (r.results || [])) {
      const b = by[x.cik] = by[x.cik] || { money_in: 0, floats: [] };
      if (x.concept === "money_in") b.money_in += Number(x.val) || 0;
      else if (Number(x.val) > 0) b.floats.push({ fy: x.fy, val: Number(x.val) });
    }

    for (const cik of want) {
      const b = by[cik];
      if (!b) { out[cik] = { held: false }; continue; }
      b.floats.sort((a, c) => a.fy - c.fy);
      const then = b.floats[0], now = b.floats[b.floats.length - 1];
      /* ⚠ TWO DIFFERENT YEARS OR IT IS NOT A FALL. One filing gives a start
         and a finish that are the same number, which pads both sides and
         says nothing. */
      const usable = then && now && now.fy > then.fy;
      out[cik] = {
        held: true,
        money_in: b.money_in || null,
        worth_then: usable ? then.val : null,
        worth_then_year: usable ? then.fy : null,
        worth_now: usable ? now.val : null,
        worth_now_year: usable ? now.fy : null,
        the_fall: usable ? (now.val - then.val) : null,
        per_cent: usable && then.val ? +(((now.val - then.val) / then.val) * 100).toFixed(1) : null
      };
    }
  } catch (e) {
    for (const cik of want) out[cik] = { held: false, why: "the counter has not been built yet" };
  }
  return out;
}

function pad10(c) { return String(c).replace(/\D/g, "").padStart(10, "0"); }

/* ============================================================
   THE FREE LIST
   ============================================================ */
async function today(env, days) {
  days = Math.max(1, Math.min(30, days || 1));
  const from = addDays(today_iso(), -days);
  const r = await env.OVERHANG.prepare(
    `SELECT h.accession, h.cik, h.ticker, h.company, h.form, h.filed_on, h.said_by,
            a.auditor
       FROM concern_hits h
       LEFT JOIN auditor_of a ON a.cik = h.cik
      WHERE h.filed_on >= ?
      ORDER BY h.filed_on DESC, h.company`).bind(from).all();

  const hits = r.results || [];
  const damage = await damageFor(env, hits.map(x => x.cik));

  const rows = hits.map(x => ({
    ticker: x.ticker, company: x.company, form: x.form, filed_on: x.filed_on,
    said_by: x.said_by,
    auditor: x.auditor || null,
    shareholders: damage[pad10(x.cik)] || { held: false } }));

  return { ok:true, build: BUILD, since: from,
    filings: rows.length,
    auditor_said_it: rows.filter(x => x.said_by !== "management").length,
    company_said_it: rows.filter(x => x.said_by !== "auditor").length,
    rows,
    what_this_is:
      "An auditor's doubt and a company's own disclosure are different events " +
      "and this list keeps them apart.",
    the_money_column:
      "Money in is cash from financing across the years on file. Worth then " +
      "and worth now are the earliest and latest public float the company " +
      "itself filed, same company at both ends. Where it says held:false we " +
      "do not hold the figures for that company \u2014 which is a fact about " +
      "us, not a zero about them.",
    not_an_accusation:
      "A going concern paragraph is a required disclosure. Thousands of " +
      "ordinary companies carry one. Nothing here says any company or any " +
      "person did anything wrong.",
    method: "/?method=1" };
}

/* ============================================================
   THE LEAGUE TABLE
   ============================================================ */
async function league(env, days) {
  days = Math.max(30, Math.min(3650, days || 365));
  const from = addDays(today_iso(), -days);

  const aud = await env.OVERHANG.prepare(
    `SELECT a.auditor, COUNT(DISTINCT h.cik) companies, COUNT(*) filings
       FROM concern_hits h JOIN auditor_of a ON a.cik = h.cik
      WHERE h.filed_on >= ? AND h.said_by IN ('auditor','both')
        AND a.auditor IS NOT NULL AND a.auditor <> ''
      GROUP BY a.auditor ORDER BY companies DESC, filings DESC LIMIT 40`)
    .bind(from).all();

  /* ⚠ COUNSEL COMES FROM THE HAND-BUILT TABLE AND THE COVERAGE IS PARTIAL.
     Wrapped so a missing table reports itself rather than emptying the page. */
  let counsel = [];
  let counselNote = null;
  try {
    const c = await env.OVERHANG.prepare(
      `SELECT p.name, COUNT(DISTINCT h.cik) companies
         FROM concern_hits h
         JOIN roles r ON r.issuer_id = h.cik
         JOIN parties p ON p.id = r.party_id
        WHERE h.filed_on >= ? AND p.kind LIKE '%counsel%'
        GROUP BY p.id ORDER BY companies DESC LIMIT 25`).bind(from).all();
    counsel = c.results || [];
  } catch (e) { counselNote = "the counsel table could not be read: " + String(e).slice(0, 90); }

  return { ok:true, build: BUILD, since: from,

    auditors: (aud.results || []).map(x => ({
      auditor: x.auditor, companies: x.companies, filings: x.filings })),

    counsel,
    counsel_warning:
      "⚠ PARTIAL BY CONSTRUCTION. There is no XBRL tag for counsel, so this " +
      "comes from a table built by hand. A firm that is absent from the count " +
      "is NOT a firm that did no work. Print this sentence wherever the " +
      "counsel numbers are printed." + (counselNote ? " " + counselNote : ""),

    what_the_auditor_count_means:
      "How many companies carrying an auditor's going concern paragraph that " +
      "firm audited. It is a count and nothing else. An accountant who signs " +
      "many may simply be the accountant small companies hire.",

    method: "/?method=1" };
}

async function oneCompany(env, ticker) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, error:"a ticker, please" };
  const r = await env.OVERHANG.prepare(
    `SELECT h.accession, h.form, h.filed_on, h.said_by, h.phrase, a.auditor
       FROM concern_hits h LEFT JOIN auditor_of a ON a.cik = h.cik
      WHERE UPPER(h.ticker) = ? ORDER BY h.filed_on DESC`).bind(tk).all();
  const rows = r.results || [];
  const cikRow = await env.OVERHANG.prepare(
    "SELECT cik FROM concern_hits WHERE UPPER(ticker) = ? LIMIT 1").bind(tk).first();
  const dmg = cikRow ? (await damageFor(env, [cikRow.cik]))[pad10(cikRow.cik)] : { held: false };

  return { ok:true, build: BUILD, ticker: tk,
    shareholders: dmg,
    times: rows.length,
    first: rows.length ? rows[rows.length - 1].filed_on : null,
    latest: rows.length ? rows[0].filed_on : null,
    auditor: rows.length ? rows[0].auditor || null : null,
    rows,
    not_an_accusation:
      "A going concern paragraph is a required disclosure, not a finding of " +
      "wrongdoing.",
    method: "/?method=1" };
}

async function stats(env) {
  const a = await env.OVERHANG.prepare(
    `SELECT COUNT(*) rows, COUNT(DISTINCT cik) companies,
            MIN(filed_on) earliest, MAX(filed_on) latest FROM concern_hits`).first();
  const b = await env.OVERHANG.prepare(
    "SELECT said_by, COUNT(*) n FROM concern_hits GROUP BY said_by").all();
  const c = await env.OVERHANG.prepare(
    "SELECT COUNT(*) known FROM auditor_of").first();
  return { ok:true, build: BUILD, held: a, by_who: b.results || [], auditors_known: c };
}

/* ---------- small tools ---------- */
function today_iso() { return new Date().toISOString().slice(0, 10); }
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}