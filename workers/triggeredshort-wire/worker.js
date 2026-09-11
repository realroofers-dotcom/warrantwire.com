/* BUILT 2026-09-11 · triggeredshort-wire 2b — THE GATE, AND THE CAP
   Supersedes the 2026-08-27 build.

   ⚠ WHAT WAS WRONG, AND IT WAS THE WHOLE PRODUCT.

   ?wire=1&q=TICKER returned up to FIVE HUNDRED ROWS — every filing, every
   date, every accession — with no check of any kind. The PAGE chose not to
   draw them, which is not a gate; it is a curtain. Anyone who opened the
   worker address, or the network tab, had the twelve-dollar product for
   nothing.

   ⚠ THE FIX IS NOT TO REFUSE THE SEARCH. The free answer stays free: who the
   company is, how many filings, how many heavy, the date range, the forms,
   and WHICH TERMS are in the paper. That is what brings somebody back.

   What is withheld is WHICH DOCUMENT each term sits in — the accession, the
   date, the form. Unpaid, a row comes back carrying its marks and nothing
   else. The page's own code reads the marks off the rows exactly as before,
   so nothing on the site had to change.

   ⚠ AND IT FAILS CLOSED. If the pay desk cannot be reached, the rows are
   withheld and the answer says so. Failing open would hand the product to
   anybody who could break one connection. */
/* ============================================================
   triggeredshort-wire  —  Cloudflare Worker
   THE WARRANT WIRE — scans EDGAR full-text search for the
   language that marks a warrant financing, and records what
   it finds.
   Built 26 Aug 2026 · pattern matches triggeredshort-shortvol

   BINDINGS   OVERHANG  D1 → overhang
   SECRETS    LOG_KEY
   CRON       0 23 * * 1-5      (19:00 ET, after the day's filings)
              every 30 minutes  the backfill walk ONLY - it does nothing
                                once the walk has finished, so the trigger
                                can be left in place

   THIS WORKER DRIVES THE QUEUE. The account is at its five-cron limit,
   so triggeredshort-queue has no trigger of its own - the nightly run
   here calls its ?action=draft when the scan is done. Mondays it also
   refreshes the ticker map first.

   AUTH — X-Auth-Key header, same as the other workers.
   Use the Cloudflare editor's HTTP tab, not Preview.

   PUBLIC (no key, CORS *):
     ?alert=1&email=&tickers=     join the alert list (write-only, never reads back)
     ?wire=1&days=14              recent filings with their marks and tickers
     ?wire=1&days=30&heavy=1      only filings carrying a heavy phrase
     ?filing=1&accession=...      every phrase found in one filing
     ?company=1&ticker=TOVX       every warrant-language filing for one company, all years
     ?company=1&name=theriva      same, resolved from the company name

   PRIVATE (key required):
     ?action=tickers              load the SEC's CIK-to-ticker map (also runs itself Mondays)
     ?action=sic&max=150          fetch SIC + sector for CIKs we don't know yet
     ?action=sectors              the sector rollup, and by week
     ?action=holders&ticker=TOVX  every 13F-HR that reports this company's CUSIP
     ?action=ownership&ticker=    institutional share, and the residual, by quarter
     ?action=run&days=3           scan the last N days
     ?action=backfill&from=YYYY-MM-DD&to=YYYY-MM-DD
     ?action=walk&years=5         plan the five-year backfill, a week at a time
     ?action=walk_step&weeks=10   read the next batch of weeks (default 10)
     ?action=walk_status          how far it has got
     ?action=rescan_send          email everyone who asked while the history was loading
     ?action=mail_test&to=...     send one test email

   MAIL — Cloudflare Email Service. Binding `EMAIL` (send_email) on this worker,
   sending domain warrantwire.com, from research@warrantwire.com.
     ?action=walk_stop / walk_go  pause and resume
     ?action=stats

   NOTE ON THE SOURCE. EDGAR full-text search covers filings from
   2001 onward and indexes the documents themselves, exhibits
   included — which is the point, because the language we look
   for is in the exhibit and not in the 8-K that points at it.
   The SEC asks for a real contact address in the User-Agent on
   every automated request. Put yours in CONTACT below.
   ============================================================ */

const CONTACT = "research@warrantwire.com";
const FTS     = "https://efts.sec.gov/LATEST/search-index";
const FORMS   = ["8-K","S-1","S-3","424B5","424B3","10-Q","10-K","DEF 14A"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const q   = url.searchParams;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
      "Content-Type": "application/json"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (q.get("alert"))  return json(await addAlert(env, q), cors);
      if (q.get("wire"))   return json(await readWire(env, q, request), cors);
      if (q.get("filing")) return json(await readFiling(env, q), cors);
      if (q.get("company")) return json(await readCompany(env, q, request), cors);
      if (q.get("rescan"))  return json(await addRescan(env, q), cors);
    } catch (e) { return json({ ok:false, error:String(e) }, cors, 500); }

    const key = request.headers.get("X-Auth-Key") || q.get("key");
    if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, cors, 401);

    try {
      const action = q.get("action") || "stats";
      if (action === "run") {
        const days = Math.min(parseInt(q.get("days") || "3", 10), 30);
        const to   = today();
        const from = addDays(to, -days);
        return json(await scan(env, from, to), cors);
      }
      if (action === "tickers") return json(await loadTickers(env), cors);
      if (action === "sic")     return json(await loadSic(env, +(q.get("max")||"150")), cors);
      if (action === "sectors") return json(await readSectors(env, q), cors);
      if (action === "holders") return json(await findHolders(env, q), cors);
      if (action === "ownership") return json(await readOwnership(env, q), cors);
      if (action === "walk")        return json(await walkPlan(env, +(q.get("years")||"5")), cors);
      if (action === "walk_step")   return json(await walkStep(env, request, ctx, +(q.get("weeks")||"10")), cors);
      if (action === "walk_status") return json(await walkStatus(env), cors);
      if (action === "rescan_send") return json(await sendRescans(env), cors);
      if (action === "mail_test") {
        const to = q.get("to") || "";
        if (!to) return json({ ok:false, error:"to=you@example.com required" }, cors, 400);
        const ok = await sendWire(env, to, "Warrant Wire - test",
          "This is the wire testing its own mail. If you are reading it, sending works.");
        return json({ ok, to, note: ok ? "Sent." : "Not sent - check the EMAIL binding." }, cors);
      }
      if (action === "walk_stop")   return json(await walkStop(env, 1), cors);
      if (action === "walk_go")     return json(await walkStop(env, 0), cors);
      if (action === "backfill") {
        const from = q.get("from"), to = q.get("to") || today();
        if (!from) return json({ ok:false, error:"from=YYYY-MM-DD required" }, cors, 400);
        return json(await scan(env, from, to), cors);
      }
      if (q.get("action") === "alerts") {
        const r = await env.OVERHANG.prepare(
          "SELECT email, tickers, paid, joined_at FROM alert_list ORDER BY joined_at DESC LIMIT 500").all();
        return json({ ok:true, count:(r.results||[]).length, rows:r.results||[] }, cors);
      }
      return json(await stats(env), cors);
    } catch (e) {
      return json({ ok:false, error:String(e), stack:String(e.stack||"") }, cors, 500);
    }
  },

  /* TWO SCHEDULES, told apart by which one fired.
       19:00 ET weekdays  ->  the nightly scan, then the queue drafts
       every 30 minutes   ->  a batch of backfill weeks, and nothing else
     A frequent trigger must NEVER run the nightly scan: that would hit
     EDGAR forty-eight times a day for the same three days of filings.
     If the walk queue is empty the frequent run does nothing at all, so
     the trigger can be left in place and forgotten. */
  async scheduled(event, env, ctx) {
    const cron = String(event && event.cron || '');
    const nightly = cron.indexOf('*/') === -1;   /* a slash-30 pattern is the frequent one */

    ctx.waitUntil((async () => {
      if (nightly) {
        const to = today(), from = addDays(to, -3);
        /* Mondays, refresh the CIK-to-ticker map before scanning. */
        if (new Date().getUTCDay() === 1) await loadTickers(env).catch(()=>{});

        await scan(env, from, to);

        /* Then tell the queue to draft from what was just written. The queue
           has no cron of its own; this is what drives it, and it guarantees
           the scan finishes first. */
        await fetch("https://triggeredshort-queue.realroofers.workers.dev/?action=draft",
                    { headers: { "X-Auth-Key": env.LOG_KEY } }).catch(()=>{});
      }

      /* the walk: a batch every time either schedule fires, until it is done */
      try {
        const left = await env.OVERHANG.prepare(
          "SELECT COUNT(*) c FROM wire_walk WHERE status='pending'").first();
        if (left && left.c) await walkStep(env, null, ctx, nightly ? 40 : 10);
      } catch (e) {}

      /* a week left flagged 'running' by a request that died would be
         stepped over for good - free anything stuck for more than an hour */
      try {
        await env.OVERHANG.prepare(
          `UPDATE wire_walk SET status='pending'
            WHERE status='running' AND (ran_at IS NULL OR ran_at < datetime('now','-1 hour'))`).run();
      } catch (e) {}
    })().catch(()=>{}));
  }
};

/* ============================================================
   WHO OWNS IT — the ownership shift

   His question, 27 Aug 2026: can the shift in shareholder ownership
   be measured? Yes, and every input is a filed number.

   HOW IT WORKS. Institutions with over $100M file Form 13F-HR every
   quarter, 45 days after quarter end, listing every LONG position by
   CUSIP with a share count. EDGAR full-text search indexes those
   information tables, so searching a company's CUSIP returns every
   manager who held it. Sum the shares, divide by shares outstanding,
   and the remainder - after insiders - is everybody else.

   THREE LIMITS, and the first one matters most for the thesis:
   1. 13F IS LONG ONLY. A fund shorting the stock does not appear at
      all. This measures who LEFT, never who pressed.
   2. 45-day lag. December quarter lands in mid-February.
   3. The $100M threshold means small funds never file, and their
      shares fall into the residual alongside retail.
   The residual is therefore "not a reporting institution and not an
   insider" - which is mostly retail, but never only retail. Say so
   wherever the number is printed.

   You need the CUSIP first. It is printed on the cover of a
   prospectus, on the note or warrant itself, and in any 424B. Put it
   in the `cusips` table by hand, once per company.
   ============================================================ */

async function findHolders(env, q) {
  const ticker = (q.get("ticker") || "").toUpperCase();
  if (!ticker) throw new Error("ticker required");

  const row = await env.OVERHANG.prepare(
    "SELECT cusip, cik, company FROM cusips WHERE ticker = ?").bind(ticker).first();
  if (!row) throw new Error(
    "No CUSIP on file for " + ticker + ". Add one: INSERT INTO cusips (ticker,cusip,company) VALUES (...)");

  const cusip = String(row.cusip).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const from = q.get("from") || "2023-01-01";
  const to   = q.get("to")   || today();

  /* A 13F information table writes the CUSIP as nine characters with no
     space - 87164U508. Searching the six-digit stem as a quoted phrase does
     not match a longer token, so try every form the tables actually use:
     the full nine, the nine with a space before the issue number, and the
     stem on its own in case the table is spaced differently. */
  const forms = [];
  if (cusip.length >= 9) {
    forms.push(cusip.slice(0, 9));
    forms.push(cusip.slice(0, 6) + " " + cusip.slice(6, 9));
  }
  forms.push(cusip.slice(0, 6));
  const tried = [];

  let calls = 0, added = 0, start = 0;
  const seen = [];

  /* 13F tables carry the CUSIP with and without spaces; search the 6-digit
     issuer stem, which is the part that identifies the company. */
  for (const term of forms) {
   tried.push(term);
   start = 0;
   let gotAny = false;
   while (start < 200) {
    const u = new URL("https://efts.sec.gov/LATEST/search-index");
    u.searchParams.set("q", '"' + term + '"');
    u.searchParams.set("forms", "13F-HR");
    u.searchParams.set("startdt", from);
    u.searchParams.set("enddt", to);
    if (start) u.searchParams.set("from", String(start));

    const res = await fetch(u.toString(), {
      headers: { "User-Agent": CONTACT, "Accept": "application/json" } });
    calls++;
    if (!res.ok) break;
    const data = await res.json();
    const hits = (data.hits && data.hits.hits) || [];
    if (!hits.length) break;

    const stmt = env.OVERHANG.prepare(
      `INSERT OR IGNORE INTO holders_13f
         (ticker, cusip, quarter, filed_on, manager, manager_cik, accession, doc_url)
       VALUES (?,?,?,?,?,?,?,?)`);
    const batch = [];
    for (const h of hits) {
      const s2 = h._source || {};
      const parts = String(h._id || "").split(":");
      const acc = (s2.adsh || parts[0] || "").trim();
      if (!acc) continue;
      const cik = Array.isArray(s2.ciks) ? s2.ciks[0] : (s2.ciks || "");
      const mgr = Array.isArray(s2.display_names) ? s2.display_names[0]
                : (s2.display_names || "");
      const filed = (s2.file_date || "").slice(0, 10);
      const quarter = quarterOf(filed);
      const doc = cik ? "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/"
                        + acc.replace(/-/g, "") + "/" + (parts[1] || "") : "";
      batch.push(stmt.bind(ticker, cusip, quarter, filed, mgr, String(cik), acc, doc));
      seen.push({ manager: mgr, quarter, filed, accession: acc });
      added++;
    }
    if (batch.length) { await env.OVERHANG.batch(batch); gotAny = true; }
    if (hits.length < 10) break;
    start += 10;
    await sleep(150);
   }
   await sleep(150);
   if (gotAny) break;                 /* the first form that works is the one */
  }

  return { ok:true, ticker, cusip, terms_tried: tried, api_calls: calls,
    rows_written: added, sample: seen.slice(0, 20),
    note: "Managers who REPORTED this CUSIP. Share counts are inside each information " +
          "table and are not parsed here - open the filing, or enter them by hand. " +
          "13F is long positions only: a fund shorting the stock does not appear." };
}

/* A 13F filed in Feb reports the December quarter. 45-day lag, so back up. */
function quarterOf(filed) {
  if (!filed) return "";
  const d = new Date(filed + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 45);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const q = m < 3 ? "Q1" : m < 6 ? "Q2" : m < 9 ? "Q3" : "Q4";
  const end = { Q1:"-03-31", Q2:"-06-30", Q3:"-09-30", Q4:"-12-31" }[q];
  return y + end;
}

async function readOwnership(env, q) {
  const ticker = (q.get("ticker") || "").toUpperCase();
  const sql = ticker
    ? "SELECT * FROM v_ownership_shift WHERE ticker = ?"
    : "SELECT * FROM v_ownership_shift";
  const r = ticker
    ? await env.OVERHANG.prepare(sql).bind(ticker).all()
    : await env.OVERHANG.prepare(sql).all();

  const mgrs = await env.OVERHANG.prepare(
    ticker ? `SELECT quarter, manager, shares, doc_url FROM holders_13f
                WHERE ticker = ? ORDER BY quarter DESC, manager LIMIT 300`
           : `SELECT ticker, quarter, manager, shares FROM holders_13f
                ORDER BY quarter DESC LIMIT 300`);
  const m = ticker ? await mgrs.bind(ticker).all() : await mgrs.all();

  return { ok:true, ticker: ticker || "all",
    by_quarter: r.results || [], managers: m.results || [],
    note: "The residual is shares outstanding minus reported institutional minus insider. " +
          "It is MOSTLY retail but never ONLY retail - funds under the $100M reporting " +
          "threshold sit in it too. 13F is long only and lags 45 days." };
}

/* ============================================================
   SECTORS

   His hypothesis, 27 Aug 2026: warrant financings may cluster in a
   sector BEFORE that sector runs - money placed through paper has to
   go somewhere ahead of the crowd. This is what makes that testable.
   It records the sector; it does not claim the pattern exists.

   The SEC's submissions endpoint carries the SIC code, its own
   description, and the state of incorporation. One call per CIK,
   cached permanently - a company's SIC almost never changes.
   ============================================================ */

/* SIC's own major groups, collapsed to something a reader recognises.
   The description from the SEC is stored alongside, unedited. */
function sectorOf(sic) {
  const n = parseInt(sic, 10);
  if (!n) return "Unknown";
  if (n >= 100  && n <= 999)  return "Agriculture";
  if (n >= 1000 && n <= 1099) return "Metal mining";
  if (n >= 1200 && n <= 1299) return "Coal";
  if (n >= 1300 && n <= 1399) return "Oil and gas";
  if (n >= 1400 && n <= 1499) return "Mining, other";
  if (n >= 1500 && n <= 1799) return "Construction";
  if (n >= 2000 && n <= 2199) return "Food, drink and tobacco";
  if (n >= 2200 && n <= 2399) return "Textiles and apparel";
  if (n >= 2400 && n <= 2799) return "Wood, paper and printing";
  if (n === 2836 || n === 8731) return "Biotech";
  if (n >= 2833 && n <= 2836) return "Pharma and biotech";
  if (n >= 2800 && n <= 2899) return "Chemicals";
  if (n >= 2900 && n <= 3099) return "Petroleum, rubber and plastics";
  if (n >= 3100 && n <= 3399) return "Leather, stone and metals";
  if (n >= 3400 && n <= 3599) return "Machinery and fabricated metal";
  if (n >= 3600 && n <= 3699) return "Electronics";
  if (n >= 3700 && n <= 3799) return "Transport equipment";
  if (n >= 3800 && n <= 3899) return "Instruments and medical devices";
  if (n >= 3900 && n <= 3999) return "Manufacturing, other";
  if (n >= 4000 && n <= 4799) return "Transport and logistics";
  if (n >= 4800 && n <= 4899) return "Telecom and media";
  if (n >= 4900 && n <= 4999) return "Utilities";
  if (n >= 5000 && n <= 5199) return "Wholesale";
  if (n >= 5200 && n <= 5999) return "Retail";
  if (n >= 6000 && n <= 6199) return "Banks and lending";
  if (n >= 6200 && n <= 6299) return "Brokers and exchanges";
  if (n >= 6300 && n <= 6499) return "Insurance";
  if (n >= 6500 && n <= 6599) return "Real estate";
  if (n >= 6700 && n <= 6799) return "Holding and investment";
  if (n >= 7000 && n <= 7299) return "Hotels and services";
  if (n >= 7370 && n <= 7379) return "Software and IT";
  if (n >= 7300 && n <= 7399) return "Business services";
  if (n >= 7800 && n <= 7999) return "Entertainment and leisure";
  if (n >= 8000 && n <= 8099) return "Health services";
  if (n >= 8700 && n <= 8799) return "Research and consulting";
  if (n === 6770) return "Blank check";
  return "Other";
}

async function loadSic(env, max) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS cik_sic (cik TEXT PRIMARY KEY, sic TEXT, sic_desc TEXT,
       sector TEXT, state_inc TEXT, name TEXT, fetched_at TEXT DEFAULT (datetime('now')))`).run();
  await addProfileColumns(env);

  /* only the CIKs the wire has seen and we do not know yet */
  const r = await env.OVERHANG.prepare(
    `SELECT DISTINCT cik FROM wire_hits
      WHERE cik IS NOT NULL AND cik <> ''
        AND CAST(cik AS INTEGER) NOT IN (SELECT CAST(cik AS INTEGER) FROM cik_sic)
      LIMIT ?`).bind(Math.min(max, 400)).all();

  const ciks = (r.results || []).map(x => x.cik);
  let done = 0, failed = 0;
  const stmt = env.OVERHANG.prepare(
    `INSERT INTO cik_sic (cik, sic, sic_desc, sector, state_inc, name,
                          website, city, state_loc, phone, former_names, fy_end, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(cik) DO UPDATE SET sic=excluded.sic, sic_desc=excluded.sic_desc,
       sector=excluded.sector, state_inc=excluded.state_inc, name=excluded.name,
       website=excluded.website, city=excluded.city, state_loc=excluded.state_loc,
       phone=excluded.phone, former_names=excluded.former_names, fy_end=excluded.fy_end,
       fetched_at=datetime('now')`);

  const batch = [];
  for (const cik of ciks) {
    const padded = String(Number(cik)).padStart(10, "0");
    try {
      const res = await fetch("https://data.sec.gov/submissions/CIK" + padded + ".json",
        { headers: { "User-Agent": CONTACT, "Accept": "application/json" } });
      if (!res.ok) { failed++; await sleep(120); continue; }
      const d = await res.json();
      const p = profileOf(d);
      batch.push(stmt.bind(String(cik), d.sic || "", d.sicDescription || "",
                           sectorOf(d.sic), d.stateOfIncorporation || "", d.name || "",
                           p.website, p.city, p.state_loc, p.phone, p.former_names, p.fy_end));
      done++;
    } catch (e) { failed++; }
    if (batch.length >= 50) await env.OVERHANG.batch(batch.splice(0, batch.length));
    await sleep(120);                    /* the SEC asks for under 10 a second */
  }
  if (batch.length) await env.OVERHANG.batch(batch);

  const left = await env.OVERHANG.prepare(
    `SELECT COUNT(DISTINCT cik) c FROM wire_hits
      WHERE cik IS NOT NULL AND cik <> ''
        AND CAST(cik AS INTEGER) NOT IN (SELECT CAST(cik AS INTEGER) FROM cik_sic)`).first();

  return { ok:true, looked_up: done, failed, still_unknown: left.c,
           note: left.c ? "Run it again to continue." : "Every CIK on the wire has a sector." };
}

async function readSectors(env, q) {
  const roll = await env.OVERHANG.prepare("SELECT * FROM v_wire_sectors").all();
  const weeks = await env.OVERHANG.prepare(
    "SELECT * FROM v_sector_weeks LIMIT 400").all();

  const total = (roll.results || []).reduce((a, x) => a + x.filings, 0);
  const rows = (roll.results || []).map(x => Object.assign({}, x, {
    share_pct: total ? +((x.filings / total) * 100).toFixed(1) : null
  }));

  return { ok:true, total_filings: total, sectors: rows, by_week: weeks.results || [],
    note: "Which sectors the warrant language is landing in, and when. A count is not a forecast." };
}

/* ============================================================
   THE TICKER MAP
   EDGAR full-text search returns a company name and a CIK, not a
   ticker. The SEC publishes the mapping as one small file. Load it
   once, refresh it monthly - companies change tickers and new ones
   list all the time.
   ============================================================ */

async function loadTickers(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS cik_tickers (cik TEXT PRIMARY KEY, ticker TEXT, title TEXT,
      updated_at TEXT DEFAULT (datetime('now')))`).run();
  /* exchange came later - added here so an existing table picks it up */
  try { await env.OVERHANG.prepare("ALTER TABLE cik_tickers ADD COLUMN exchange TEXT").run(); } catch (e) {}

  /* the exchange file is the same map with Nasdaq / NYSE / etc on each row.
     If it is unavailable we fall back to the plain one and leave exchange blank. */
  let rows = [], withEx = false;
  try {
    const ex = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      headers: { "User-Agent": CONTACT }
    });
    if (ex.ok) {
      const d = await ex.json();
      const cols = (d.fields || []).map(x => String(x).toLowerCase());
      const iC = cols.indexOf("cik"), iT = cols.indexOf("ticker"),
            iN = cols.indexOf("name"), iX = cols.indexOf("exchange");
      if (iC > -1 && iT > -1 && Array.isArray(d.data)) {
        rows = d.data.map(a => ({ cik_str: a[iC], ticker: a[iT],
                                  title: iN > -1 ? a[iN] : "", exchange: iX > -1 ? a[iX] : "" }));
        withEx = true;
      }
    }
  } catch (e) {}

  if (!rows.length) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": CONTACT }
    });
    if (!res.ok) throw new Error(`ticker file HTTP ${res.status}`);
    const data = await res.json();
    rows = Object.values(data || {});
  }
  const stmt = env.OVERHANG.prepare(
    `INSERT INTO cik_tickers (cik, ticker, title, exchange, updated_at)
     VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(cik) DO UPDATE SET ticker=excluded.ticker, title=excluded.title,
       exchange=COALESCE(NULLIF(excluded.exchange,''), cik_tickers.exchange),
       updated_at=datetime('now')`);

  let n = 0, batch = [];
  for (const r of rows) {
    if (!r || !r.cik_str || !r.ticker) continue;
    batch.push(stmt.bind(String(r.cik_str), r.ticker, r.title || "", r.exchange || ""));
    n++;
    if (batch.length >= 500) { await env.OVERHANG.batch(batch.splice(0, batch.length)); }
  }
  if (batch.length) await env.OVERHANG.batch(batch);

  return { ok:true, loaded: n, note: "Refresh this monthly." };
}

/* ============================================================ */

async function scan(env, from, to) {
  const ph = await env.OVERHANG.prepare(
    "SELECT id, phrase, label, weight FROM wire_phrases WHERE active=1 ORDER BY weight DESC, id"
  ).all();
  const phrases = ph.results || [];

  let calls = 0, added = 0;
  const detail = [];

  for (const p of phrases) {
    let start = 0, kept = 0, note = "";
    while (start < 100) {
      /* EDGAR full-text search is an undocumented GET. Uppercase /LATEST/ matters.
         A quoted q is an exact phrase; unquoted is an OR of the words. */
      const u = new URL("https://efts.sec.gov/LATEST/search-index");
      u.searchParams.set("q", '"' + p.phrase + '"');
      u.searchParams.set("forms", FORMS.join(","));
      u.searchParams.set("startdt", from);
      u.searchParams.set("enddt", to);
      if (start) u.searchParams.set("from", String(start));

      const res = await fetch(u.toString(), {
        headers: {
          "User-Agent": CONTACT,
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate"
        }
      });
      calls++;
      if (!res.ok) { note = "HTTP " + res.status; break; }

      const data = await res.json();
      const hits = (data.hits && data.hits.hits) || [];
      if (!hits.length) { if (!kept) note = "no hits"; break; }

      const stmt = env.OVERHANG.prepare(
        `INSERT OR IGNORE INTO wire_hits
           (accession, cik, company, form, filed_on, phrase_id, phrase, label, doc_url)
         VALUES (?,?,?,?,?,?,?,?,?)`
      );
      const batch = [];
      for (const h of hits) {
        const s2 = h._source || {};
        /* _id is "0001104659-25-100468:tm2528131d2_ex99-1.htm" */
        const idParts = String(h._id || "").split(":");
        const acc  = (s2.adsh || idParts[0] || "").trim();
        const file = idParts[1] || "";
        if (!acc) continue;

        const cik = Array.isArray(s2.ciks) ? s2.ciks[0] : (s2.ciks || "");
        const co  = Array.isArray(s2.display_names) ? s2.display_names[0]
                  : (s2.display_names || s2.entity_name || "");
        const doc = cik
          ? "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/"
            + acc.replace(/-/g, "") + "/" + file
          : "";

        batch.push(stmt.bind(acc, String(cik), co,
                             s2.root_form || s2.form_type || s2.file_type || "",
                             (s2.file_date || "").slice(0, 10),
                             p.id, p.phrase, p.label, doc));
        kept++;
      }
      if (batch.length) { await env.OVERHANG.batch(batch); added += batch.length; }

      if (hits.length < 10) break;
      start += 10;
      await sleep(150);
    }
    detail.push({ phrase: p.phrase, label: p.label, hits: kept, note: note || undefined });
    await sleep(200);
  }

  await env.OVERHANG.prepare(
    `UPDATE wire_hits SET ticker = (
       SELECT t.ticker FROM cik_tickers t
        WHERE CAST(t.cik AS INTEGER) = CAST(wire_hits.cik AS INTEGER))
     WHERE ticker IS NULL AND cik IS NOT NULL`).run().catch(()=>{});

  await env.OVERHANG.prepare(
    `INSERT INTO wire_runs (day_from, day_to, phrases, api_calls, hits_new, note)
     VALUES (?,?,?,?,?,?)`
  ).bind(from, to, phrases.length, calls, added, "scan").run();

  return { ok:true, from, to, phrases: phrases.length, api_calls: calls,
           rows_written: added, detail };
}

/* THE ALERT LIST. Write-only on purpose: this endpoint can add an
   address and can never return one. Reading the list needs the key,
   through a different action, so a public URL can never spill it. */
async function addAlert(env, q) {
  const email = (q.get("email") || "").trim().toLowerCase();
  const tick  = (q.get("tickers") || "").trim().toUpperCase()
                  .replace(/[$,]/g, " ").split(/\s+/).filter(Boolean).slice(0, 40).join(" ");

  if (!email || email.indexOf("@") < 1 || email.length > 200) throw new Error("email required");

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS alert_list (
       email TEXT PRIMARY KEY, tickers TEXT, source TEXT, paid INTEGER DEFAULT 0,
       joined_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`).run();

  await env.OVERHANG.prepare(
    `INSERT INTO alert_list (email, tickers, source) VALUES (?,?,'warrantwire')
     ON CONFLICT(email) DO UPDATE SET tickers = excluded.tickers,
       updated_at = datetime('now')`
  ).bind(email, tick).run();

  return { ok:true, note:"On the list." };
}

/* ==================================================================
   THE GATE

   ⚠ ONE FUNCTION, ASKED BY EVERY PAID PATH. Two places deciding who
   has paid is how one of them ends up wrong.

   ⚠ THE OWNER'S KEY OPENS IT. Nobody should have to buy from himself
   to see whether his own site works.
   ================================================================== */
/* ============================================================
   THE CAP

   ⚠ A CAP THAT NOBODY COUNTS IS A SENTENCE, NOT A CAP. Both years
   carried cap_month and cap_year from the day they were priced,
   and nothing ever counted a search against them — so the $480
   behaved exactly like the $1,200 and the professional tier had
   no reason to exist.

   ⚠ ONE TICKER, ONE DAY, ONE SEARCH. His model. Reloading the
   page, going back to it after lunch, checking the same company
   twice — all one. A meter that runs on every request is easier
   to build and it is the version that generates complaints, and
   it makes three hundred a year feel mean instead of generous.
   The primary key does the work: same email, same day, same
   ticker cannot be inserted twice.

   ⚠ AND IT IS ONLY COUNTED WHEN SOMETHING IS ACTUALLY SERVED. A
   refused search costs nothing. A search by somebody who has not
   paid costs nothing. Only a paid list that was handed over is a
   search used.
   ============================================================ */

/* ⚠ THE CAPS COME FROM THE PAY DESK, NOT FROM A COPY KEPT HERE. Two price
   tables is how the wire ends up enforcing a cap the desk stopped selling.
   Fetched once and held for the life of the isolate. */
let CAPS = null, CAPS_AT = 0;

async function capsFor(env, skuName) {
  if (!skuName || !env.PAY) return null;
  const now = Date.now();
  if (!CAPS || now - CAPS_AT > 3600e3) {
    try {
      const r = await fetch(env.PAY + "/?action=prices&key=" +
                            encodeURIComponent(env.LOG_KEY || ""));
      const j = await r.json();
      if (j && j.skus) { CAPS = j.skus; CAPS_AT = now; }
    } catch (e) { /* keep whatever we had rather than dropping the cap */ }
  }
  const sku = CAPS && CAPS[skuName];
  if (!sku || !sku.cap_year) return null;
  return { month: sku.cap_month || null, year: sku.cap_year,
           label: sku.label || skuName, sku: skuName };
}

/* how many DIFFERENT companies this person has looked at, this month and this
   year, against this entitlement */
async function used(env, email) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS wire_use (
       email TEXT NOT NULL, day TEXT NOT NULL, ticker TEXT NOT NULL,
       at TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (email, day, ticker))`).run();

  const r = await env.OVERHANG.prepare(
    `SELECT
       SUM(CASE WHEN day >= date('now','start of month') THEN 1 ELSE 0 END) this_month,
       SUM(CASE WHEN day >= date('now','start of year')  THEN 1 ELSE 0 END) this_year
     FROM wire_use WHERE email = ?`).bind(email).first();

  return { month: Number(r && r.this_month) || 0,
           year:  Number(r && r.this_year)  || 0 };
}

async function useOne(env, email, ticker) {
  try {
    await env.OVERHANG.prepare(
      `INSERT OR IGNORE INTO wire_use (email, day, ticker)
       VALUES (?, date('now'), ?)`).bind(email, String(ticker || "").toUpperCase()).run();
  } catch (e) { /* a search never fails because the meter did */ }
}

async function paidFor(env, q, request) {
  const key = (request && request.headers.get("X-Auth-Key")) || q.get("key") || "";
  if (key && env.LOG_KEY && key === env.LOG_KEY)
    return { paid: true, how: "owner key" };

  const email = String(q.get("email") || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1)
    return { paid: false, why: "no account on this search" };

  if (!env.PAY)
    /* ⚠ NO PAY ADDRESS SET IS NOT A REASON TO GIVE IT AWAY. It is a
       misconfiguration, and the safe answer to a misconfiguration on a
       paid product is no. */
    return { paid: false, why: "the payment desk is not configured" };

  try {
    const r = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
    const j = await r.json();
    const has = (j && j.has) || {};
    /* a single search, or the year, or a company deep read — any of the
       three entitles somebody to see the list */
    if (has.search || has.wire || has.deep) {
      /* which product it was bought under decides the cap */
      const rows = (j && j.entitlements) || (j && j.rows) || [];
      let sku = null;
      for (const e of rows)
        if (e && e.sku && /^(wire_year|wire_year_pro|k8_year)$/.test(e.sku)) { sku = e.sku; break; }
      return { paid: true, how: "entitlement", email, sku };
    }
    return { paid: false, why: "nothing on that address yet", email };
  } catch (e) {
    /* ⚠ FAIL CLOSED, AND SAY WHY. An address set without https:// throws
       exactly like a desk that is down, and the two need different fixes. */
    return { paid: false, why: "could not reach the payment desk",
             detail: String(e).slice(0, 120),
             pay_is_set_to: env.PAY || "NOTHING" };
  }
}

/* ⚠ WHAT AN UNPAID ROW IS ALLOWED TO CARRY: its marks, and whether it is
   heavy. Not the accession, not the date, not the form, not the CIK — any
   one of those is enough to find the document on EDGAR, which is the whole
   of what the twelve dollars buys. */
function veil(rows) {
  return (rows || []).map(f => ({ labels: f.labels || "", heavy: f.heavy || 0 }));
}

async function readWire(env, q, request) {
  /* the site's search box calls ?wire=1&q=TICKER and reads .about and .rows */
  const asked = (q.get("q") || "").trim();
  if (asked) return wireSearch(env, asked, q, request);
  const days  = Math.min(parseInt(q.get("days") || "14", 10), 180);
  const heavy = q.get("heavy") === "1";
  const from  = addDays(today(), -days);

  const sql = heavy
    ? `SELECT * FROM v_wire_filings WHERE filed_on >= ? AND heavy > 0 LIMIT 300`
    : `SELECT * FROM v_wire_filings WHERE filed_on >= ? LIMIT 300`;

  const r = await env.OVERHANG.prepare(sql).bind(from).all();
  const rows = r.results || [];

  /* mark the ones already on the docket - the strongest reason to click through */
  let scored = {};
  try {
    const d = await env.OVERHANG.prepare(
      "SELECT ticker, tests_yes, tests_total, exhibit_read FROM detections").all();
    for (const x of (d.results || [])) {
      if (x.ticker) scored[String(x.ticker).toUpperCase()] =
        { yes: x.tests_yes, total: x.tests_total, exhibit: x.exhibit_read };
    }
  } catch (e) { scored = {}; }

  for (const f of rows) {
    const t = (f.ticker || "").toUpperCase();
    f.on_docket = scored[t] || null;
  }

  return {
    ok: true, since: from, filings: rows.length,
    already_screened: rows.filter(f => f.on_docket).length,
    rows, note: NOTE
  };
}

/* ------------------------------------------------------------------
   WHILE THE HISTORY IS STILL LOADING
   A search today only reads what has been scanned so far. If the
   walk is still running we say so, take an email, and send the
   whole answer when the years are in. Nobody is charged for a
   search that could not see the whole record.
------------------------------------------------------------------ */
async function walkPending(env) {
  try {
    const r = await env.OVERHANG.prepare(
      "SELECT COUNT(*) c FROM wire_walk WHERE status IN ('pending','running')").first();
    return r ? r.c : 0;
  } catch (e) { return 0; }
}
async function addRescan(env, q) {
  const email  = String(q.get("email") || "").trim().slice(0, 200);
  const ticker = String(q.get("ticker") || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "a working email, please" };
  if (!ticker) return { ok: false, error: "ticker required" };
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS wire_rescan (
       id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, ticker TEXT,
       asked_at TEXT DEFAULT (datetime('now')), sent_at TEXT, found INTEGER)`).run();
  await env.OVERHANG.prepare(
    "INSERT INTO wire_rescan (email, ticker) VALUES (?,?)").bind(email, ticker).run();
  const left = await walkPending(env);
  return { ok: true, ticker, weeks_left: left,
           note: "We will search the full record for " + ticker + " and email you the answer." };
}
/* Cloudflare Email Service - the EMAIL send_email binding on this worker.
   warrantwire.com is onboarded as a sending domain, so any recipient is
   reachable; no API key and no third party. */
async function sendWire(env, to, subject, text) {
  const from = env.FROM_EMAIL || "research@warrantwire.com";
  if (env.EMAIL && env.EMAIL.send) {
    try {
      await env.EMAIL.send({
        from: { email: from, name: "Warrant Wire" },
        to: to, subject: subject, text: text
      });
      return true;
    } catch (e) { return false; }
  }
  /* fallback, only if a key is ever set instead */
  if (env.RESEND_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: "Bearer " + env.RESEND_KEY, "content-type": "application/json" },
        body: JSON.stringify({ from: "Warrant Wire <" + from + ">", to, subject, text })
      });
      return r.ok;
    } catch (e) { return false; }
  }
  return false;
}
/* runs when the walk finishes - answers everyone who asked while it was loading */
async function sendRescans(env) {
  let rows = [];
  try {
    rows = (await env.OVERHANG.prepare(
      "SELECT * FROM wire_rescan WHERE sent_at IS NULL ORDER BY id LIMIT 200").all()).results || [];
  } catch (e) { return { ok: true, sent: 0 }; }
  let sent = 0, held = 0;
  for (const r of rows) {
    const d = await wireSearch(env, r.ticker);
    const n = (d.rows || []).length;
    const cov = d.coverage ? d.coverage.from + " to " + d.coverage.to : "the record we hold";
    const body = n
      ? `You asked us to search ${r.ticker} once the full history was loaded. It is.\n\n`
        + `${n} filing${n === 1 ? "" : "s"} carry the language of a warrant financing`
        + `${d.about && d.about.heavy ? ", " + d.about.heavy + " of them with the heavy terms" : ""}.`
        + `\nFirst: ${d.about.first}   Latest: ${d.about.latest}\n\n`
        + `See them all: https://warrantwire.com/?q=${encodeURIComponent(r.ticker)}\n\n`
        + `Want one read in plain English? https://8k10q.com/?ticker=${encodeURIComponent(r.ticker)}\n`
      : `You asked us to search ${r.ticker} once the full history was loaded. It is.\n\n`
        + `We searched every filing on record from ${cov}. None of them carries the language of a `
        + `warrant financing.\n\n`
        + `See for yourself: https://warrantwire.com/?q=${encodeURIComponent(r.ticker)}\n`;
    const ok = await sendWire(env, r.email, `Warrant Wire — ${r.ticker}`, body);
    if (ok) {
      await env.OVERHANG.prepare(
        "UPDATE wire_rescan SET sent_at=datetime('now'), found=? WHERE id=?").bind(n, r.id).run();
      sent++;
    } else held++;
  }
  return { ok: true, sent, held,
           note: held ? "Held - add the EMAIL (send_email) binding to this worker." : "" };
}

/* ============================================================
   THE WALK — five years, one week at a time, on its own.
   A week is the right size: a month makes EDGAR return 500s and
   caps the common phrases at 1,000 hits, which silently loses
   filings. Plan the weeks, then each step runs the oldest
   unfinished one and calls the next itself, so nothing has to be
   pasted 260 times. Stop it any time; it picks up where it left.
   ============================================================ */
async function walkTable(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS wire_walk (
       week_from TEXT PRIMARY KEY, week_to TEXT, status TEXT DEFAULT 'pending',
       rows_written INTEGER, api_calls INTEGER, ran_at TEXT, note TEXT)`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS wire_walk_flag (k TEXT PRIMARY KEY, v TEXT)`).run();
}
async function walkPlan(env, years) {
  await walkTable(env);
  /* EDGAR's full-text index starts in 2001, so 26 years is the whole of it.
     The early years come back thin - this financing structure barely existed
     before the mid-2000s - and that emptiness is itself the finding. */
  const yrs = Math.max(1, Math.min(26, years || 5));
  const end = today();
  let cursor = addDays(end, -7);
  const weeks = Math.ceil((yrs * 365) / 7);
  const stmt = env.OVERHANG.prepare(
    `INSERT OR IGNORE INTO wire_walk (week_from, week_to, status) VALUES (?,?,'pending')`);
  const batch = [];
  for (let i = 0; i < weeks; i++) {
    const to = cursor, from = addDays(cursor, -6);
    batch.push(stmt.bind(from, to));
    cursor = addDays(from, -1);
  }
  for (let i = 0; i < batch.length; i += 100)
    await env.OVERHANG.batch(batch.slice(i, i + 100));
  await env.OVERHANG.prepare(
    `INSERT INTO wire_walk_flag (k,v) VALUES ('stop','0')
     ON CONFLICT(k) DO UPDATE SET v='0'`).run();
  const n = await env.OVERHANG.prepare(
    "SELECT COUNT(*) c FROM wire_walk WHERE status='pending'").first();
  const mins = Math.round(weeks * 1.1);
  return { ok: true, planned_weeks: weeks, pending: n.c, years: yrs,
           estimate: "about " + (mins >= 90 ? Math.round(mins / 60) + " hours" : mins + " minutes"),
           note: "THIS TAKES A WHILE - roughly a minute a week, so about "
               + (mins >= 90 ? Math.round(mins / 60) + " hours" : mins + " minutes")
               + " for " + weeks + " weeks. Start it with ?action=walk_step and leave it: each week "
               + "calls the next itself. Nothing is lost if you close the browser, the computer "
               + "sleeps or the chain breaks - progress is on record and the nightly job carries "
               + "on from wherever it stopped. Watch it with ?action=walk_status." };
}
async function walkStop(env, on) {
  await walkTable(env);
  await env.OVERHANG.prepare(
    `INSERT INTO wire_walk_flag (k,v) VALUES ('stop',?)
     ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(String(on)).run();
  return { ok: true, stopped: !!on };
}
async function walkStatus(env) {
  await walkTable(env);
  const a = await env.OVERHANG.prepare(
    `SELECT status, COUNT(*) c FROM wire_walk GROUP BY status`).all();
  const done = await env.OVERHANG.prepare(
    `SELECT MIN(week_from) a, MAX(week_to) b, SUM(rows_written) r, COUNT(*) c
       FROM wire_walk WHERE status='done'`).first();
  const stop = await env.OVERHANG.prepare(
    "SELECT v FROM wire_walk_flag WHERE k='stop'").first();
  const last = await env.OVERHANG.prepare(
    `SELECT * FROM wire_walk WHERE status='done' ORDER BY ran_at DESC LIMIT 5`).all();
  const pend = (a.results || []).find(x => x.status === 'pending');
  const mins = pend ? Math.round(pend.c * 1.1) : 0;
  return { ok: true, by_status: a.results || [], stopped: stop ? stop.v === '1' : false,
           time_left: pend ? "about " + (mins >= 90 ? Math.round(mins / 60) + " hours" : mins + " minutes") : "done",
           weeks_done: done ? done.c : 0, rows_written: done ? done.r : 0,
           covered: done && done.c ? { from: done.a, to: done.b } : null,
           recent: last.results || [] };
}
/* A BATCH PER CALL, not a self-call. A worker cannot reliably fetch its own
   public hostname, which is why the chain died after one week. Each call now
   reads as many weeks as it can inside its time budget, and the nightly cron
   picks up whatever is left - so the load finishes on its own either way. */
async function walkStep(env, request, ctx, maxWeeks) {
  await walkTable(env);
  const stop = await env.OVERHANG.prepare(
    "SELECT v FROM wire_walk_flag WHERE k='stop'").first();
  if (stop && stop.v === '1') return { ok: true, stopped: true, note: "Walk is stopped." };

  const started = Date.now();
  const budget  = 9 * 60 * 1000;          /* stop starting new weeks after nine minutes */
  const cap     = Math.max(1, Math.min(60, maxWeeks || 10));
  const did = [];
  let failed = 0;

  for (let i = 0; i < cap; i++) {
    if (Date.now() - started > budget) break;
    const s2 = await env.OVERHANG.prepare(
      "SELECT v FROM wire_walk_flag WHERE k='stop'").first();
    if (s2 && s2.v === '1') break;

    const w = await env.OVERHANG.prepare(
      `SELECT * FROM wire_walk WHERE status='pending' ORDER BY week_to DESC LIMIT 1`).first();
    if (!w) break;

    await env.OVERHANG.prepare(
      "UPDATE wire_walk SET status='running' WHERE week_from=?").bind(w.week_from).run();

    let res = null, err = "";
    try { res = await scan(env, w.week_from, w.week_to); }
    catch (e) { err = String(e); }
    if (err) failed++;

    await env.OVERHANG.prepare(
      `UPDATE wire_walk SET status=?, rows_written=?, api_calls=?, ran_at=datetime('now'), note=?
        WHERE week_from=?`
    ).bind(err ? 'failed' : 'done', res ? (res.rows_written || 0) : 0,
           res ? (res.api_calls || 0) : 0, err || '', w.week_from).run();

    did.push({ week: [w.week_from, w.week_to], rows: res ? res.rows_written : 0,
               error: err || undefined });
  }

  const left = await env.OVERHANG.prepare(
    "SELECT COUNT(*) c FROM wire_walk WHERE status='pending'").first();
  if (!left.c) { try { await sendRescans(env); } catch (e) {} }
  const mins = Math.round(left.c * 1.1);
  return { ok: failed === 0, weeks_read: did.length, failed,
           rows_written: did.reduce((t, x) => t + (x.rows || 0), 0),
           weeks: did, weeks_left: left.c,
           time_left: left.c ? "about " + (mins >= 90 ? Math.round(mins / 60) + " hours" : mins + " minutes") : "done",
           note: left.c
             ? "Call ?action=walk_step again for the next " + cap + " weeks, or leave it - the "
               + "nightly job carries on by itself. Add &weeks=20 to read more in one call."
             : "Every planned week has been read." };
}

/* ---- what the company itself publishes, from its SEC submissions file ---- */
async function addProfileColumns(env) {
  for (const c of ["website TEXT", "city TEXT", "state_loc TEXT", "phone TEXT",
                   "former_names TEXT", "fy_end TEXT"]) {
    try { await env.OVERHANG.prepare("ALTER TABLE cik_sic ADD COLUMN " + c).run(); } catch (e) {}
  }
}
function profileOf(d) {
  const a = (d.addresses && (d.addresses.business || d.addresses.mailing)) || {};
  let site = String(d.website || "").trim();
  if (site && !/^https?:\/\//i.test(site)) site = "https://" + site;
  const former = Array.isArray(d.formerNames)
    ? d.formerNames.map(f => String(f.name || "").trim()).filter(Boolean).slice(0, 4).join(" | ")
    : "";
  return {
    website: site,
    city: String(a.city || "").trim(),
    state_loc: String(a.stateOrCountry || "").trim(),
    phone: String(d.phone || "").trim(),
    former_names: former,
    fy_end: String(d.fiscalYearEnd || "").trim()
  };
}
/* one company, fetched once and kept - so a search never waits on the SEC twice */
async function fetchProfile(env, cik) {
  const padded = String(Number(cik)).padStart(10, "0");
  try {
    const res = await fetch("https://data.sec.gov/submissions/CIK" + padded + ".json",
      { headers: { "User-Agent": CONTACT, "Accept": "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    const p = profileOf(d);
    await env.OVERHANG.prepare(
      `CREATE TABLE IF NOT EXISTS cik_sic (cik TEXT PRIMARY KEY, sic TEXT, sic_desc TEXT,
         sector TEXT, state_inc TEXT, name TEXT, fetched_at TEXT DEFAULT (datetime('now')))`).run();
    await addProfileColumns(env);
    await env.OVERHANG.prepare(
      `INSERT INTO cik_sic (cik, sic, sic_desc, sector, state_inc, name,
                            website, city, state_loc, phone, former_names, fy_end, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(cik) DO UPDATE SET sic=excluded.sic, sic_desc=excluded.sic_desc,
         sector=excluded.sector, state_inc=excluded.state_inc, name=excluded.name,
         website=excluded.website, city=excluded.city, state_loc=excluded.state_loc,
         phone=excluded.phone, former_names=excluded.former_names, fy_end=excluded.fy_end,
         fetched_at=datetime('now')`
    ).bind(String(cik), d.sic || "", d.sicDescription || "", sectorOf(d.sic),
           d.stateOfIncorporation || "", d.name || "",
           p.website, p.city, p.state_loc, p.phone, p.former_names, p.fy_end).run();
    return { sic: d.sic || "", sic_desc: d.sicDescription || "", sector: sectorOf(d.sic),
             state_inc: d.stateOfIncorporation || "", name: d.name || "", ...p };
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------
   WHO THIS COMPANY IS  —  the facts, from the SEC's own files.
   Name and exchange from the CIK map; SIC, sector and state of
   incorporation from cik_sic. Nothing here is our opinion.
------------------------------------------------------------------ */
async function companyCard(env, tk, cikHint) {
  let t = null;
  try {
    t = await env.OVERHANG.prepare(
      "SELECT cik, ticker, title, exchange FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1"
    ).bind(tk).first();
  } catch (e) {}
  if (!t && cikHint) {
    try {
      t = await env.OVERHANG.prepare(
        "SELECT cik, ticker, title, exchange FROM cik_tickers WHERE CAST(cik AS INTEGER) = CAST(? AS INTEGER) LIMIT 1"
      ).bind(cikHint).first();
    } catch (e) {}
  }
  const cik = (t && t.cik) || cikHint || "";
  let s = null;
  if (cik) {
    try {
      s = await env.OVERHANG.prepare(
        `SELECT sic, sic_desc, sector, state_inc, name, website, city, state_loc,
                phone, former_names, fy_end
           FROM cik_sic WHERE CAST(cik AS INTEGER) = CAST(? AS INTEGER)`
      ).bind(cik).first();
    } catch (e) {}
    /* never looked up, or looked up before we kept the profile - get it once */
    if (!s || (!s.website && !s.city && !s.former_names)) {
      const fresh = await fetchProfile(env, cik);
      if (fresh) s = fresh;
    }
  }
  if (!t && !s) return null;
  return {
    ticker: (t && t.ticker) ? String(t.ticker).toUpperCase() : tk,
    name: (t && t.title) || (s && s.name) || "",
    exchange: (t && t.exchange) || "",
    cik: cik,
    sic: (s && s.sic) || "",
    business: (s && s.sic_desc) || "",
    sector: (s && s.sector) || "",
    state_inc: (s && s.state_inc) || "",
    website: (s && s.website) || "",
    city: (s && s.city) || "",
    state_loc: (s && s.state_loc) || "",
    former_names: (s && s.former_names) ? String(s.former_names).split(" | ").filter(Boolean) : [],
    fy_end: (s && s.fy_end) || "",
    edgar: cik ? "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik + "&type=&dateb=&owner=include&count=40" : ""
  };
}

/* ------------------------------------------------------------------
   ?wire=1&q=TICKER  —  what the site's search box asks for.
   Returns .about (the free answer: how many, how heavy, how far back)
   and .rows (the filings themselves).
------------------------------------------------------------------ */
async function wireSearch(env, asked, q, request) {
  const tk = asked.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  let rows = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT * FROM v_wire_filings WHERE UPPER(ticker) = ? ORDER BY filed_on DESC LIMIT 500`
    ).bind(tk).all();
    rows = r.results || [];
  } catch (e) { rows = []; }

  /* a name rather than a ticker - resolve through the SEC's CIK map */
  if (!rows.length && asked.length > 4) {
    try {
      const m = await env.OVERHANG.prepare(
        `SELECT ticker FROM cik_tickers WHERE title LIKE ? COLLATE NOCASE
          ORDER BY LENGTH(title) LIMIT 1`).bind("%" + asked + "%").first();
      if (m && m.ticker) {
        const r2 = await env.OVERHANG.prepare(
          `SELECT * FROM v_wire_filings WHERE UPPER(ticker) = ? ORDER BY filed_on DESC LIMIT 500`
        ).bind(String(m.ticker).toUpperCase()).all();
        rows = r2.results || [];
      }
    } catch (e) {}
  }

  let docket = null;
  try {
    docket = await env.OVERHANG.prepare(
      "SELECT tests_yes, tests_total, exhibit_read FROM detections WHERE UPPER(ticker) = ?"
    ).bind(tk).first();
  } catch (e) {}
  for (const f of rows) f.on_docket = docket
    ? { yes: docket.tests_yes, total: docket.tests_total, exhibit: docket.exhibit_read } : null;

  const forms = [];
  for (const f of rows) if (f.form && forms.indexOf(f.form) === -1) forms.push(f.form);

  let held = null;
  try {
    held = await env.OVERHANG.prepare(
      "SELECT MIN(filed_on) a, MAX(filed_on) b FROM wire_hits").first();
  } catch (e) {}

  const company = await companyCard(env, tk, rows.length ? rows[0].cik : "");
  const pendingWeeks = await walkPending(env);

  /* ⚠ THE GATE, ASKED AFTER THE ANSWER IS BUILT AND BEFORE IT IS SENT. The
     counts, the company and the terms are free; the documents are not.
     ⚠ THE SAMPLE IS OPEN. His call, 11 Sep 2026: TOVX is the worked example
     on the home page, the company he has read every filing of — the full
     report, filings included, is free to anyone so the product can be
     checked before it is bought. */
  const SAMPLES = ["TOVX"];
  const gate = SAMPLES.indexOf(tk) > -1 ? { paid: true, how: "the sample" } : await paidFor(env, q, request);

  /* ⚠ THE CAP, CHECKED BEFORE ANYTHING IS SERVED AND COUNTED ONLY IF IT IS.
     A refusal costs the buyer nothing, which matters: somebody who hits his
     ceiling and is told so has not also lost a search finding that out. */
  let cap = null, spent = null;
  if (gate.paid && gate.email && gate.sku) {
    cap = await capsFor(env, gate.sku);
    if (cap) {
      spent = await used(env, gate.email);
      /* ⚠ try/catch, NOT .catch() CHAINED ON .first(). A driver that returns a
         value rather than a promise makes that line throw on the word catch,
         and the whole search dies with it — a meter must never be able to
         break the product it meters. */
      let alreadyToday = null;
      try {
        alreadyToday = await env.OVERHANG.prepare(
          `SELECT 1 FROM wire_use WHERE email = ? AND day = date('now') AND ticker = ?`)
          .bind(gate.email, tk).first();
      } catch (e) { alreadyToday = null; }

      /* ⚠ A COMPANY ALREADY LOOKED AT TODAY IS NEVER REFUSED. It has already
         been paid for; refusing a reload would be indefensible. */
      if (!alreadyToday) {
        const overYear  = spent.year  >= cap.year;
        const overMonth = cap.month && spent.month >= cap.month;
        if (overYear || overMonth) {
          gate.paid = false;
          gate.capped = {
            reason: overYear ? "year" : "month",
            companies_this_month: spent.month, companies_this_year: spent.year,
            allowed_a_month: cap.month, allowed_a_year: cap.year,
            on: cap.label,
            note: "This is a count of DIFFERENT COMPANIES, not of page loads. " +
                  "Anything already looked at today, or any company already " +
                  "counted, opens as normal.",
            /* ⚠ A REFUSAL THAT OFFERS SOMETHING BEATS A REFUSAL. */
            what_to_do: cap.sku === "wire_year"
              ? "The professional year covers four hundred companies a month " +
                "and three thousand a year."
              : "Write to research@warrantwire.com and we will sort it out."
          };
        } else {
          await useOne(env, gate.email, tk);
          spent.month++; spent.year++;
        }
      }
    }
  }

  return {
    ok: true, asked: tk, company: company,
    paid: gate.paid,
    /* what is left, on every paid answer, so nobody meets the ceiling as a
       surprise */
    allowance: (cap && spent) ? {
      companies_this_month: spent.month, of: cap.month,
      companies_this_year: spent.year, of_year: cap.year,
      counts: "different companies, not page loads"
    } : undefined,
    /* said plainly so the page can offer the right thing */
    gate: gate.paid ? undefined
      : { why: gate.capped ? "you have reached the cap on your subscription" : gate.why,
          capped: gate.capped,
          detail: gate.detail, pay_is_set_to: gate.pay_is_set_to,
          price_cents: 1200,
          note: "The answer is free. The list — which filing, on what day, in " +
                "what form — is twelve dollars." },
    about: rows.length ? {
      ticker: tk,
      company: (company && company.name) || rows[0].company,
      exchange: (company && company.exchange) || "",
      business: (company && company.business) || "",
      filings: rows.length,
      heavy: rows.filter(f => f.heavy > 0).length,
      first: rows[rows.length - 1].filed_on,
      latest: rows[0].filed_on,
      forms: forms,
      on_docket: docket ? true : false
    } : null,
    /* ⚠ UNPAID, EVERY ROW LOSES ITS ACCESSION, ITS DATE AND ITS FORM. It
       keeps its marks, which is what the page reads to say WHICH TERMS are
       in this company's paper — the free answer — without saying which
       document any of them sits in. */
    rows: gate.paid ? rows : veil(rows),
    coverage: held ? { from: held.a, to: held.b } : null,
    building: pendingWeeks > 0, weeks_left: pendingWeeks,
    note: NOTE
  };
}

/* ------------------------------------------------------------------
   THE COMPANY SEARCH  —  ?company=1&ticker=TOVX  |  &name=theriva
   Every filing we hold for one company, newest first, in the same
   shape as the free wire list so the page renders it identically.
   Reads the database only: no EDGAR call in the buyer's path.
   Coverage is reported with the answer — we say how far back we
   actually hold, rather than implying more.
------------------------------------------------------------------ */
async function readCompany(env, q, request) {
  const ticker = (q.get("ticker") || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  const name   = (q.get("name") || "").trim();
  if (!ticker && !name) throw new Error("ticker or name required");

  /* a name resolves through the SEC's own CIK map, loaded here Mondays */
  let resolved = null;
  if (!ticker) {
    const m = await env.OVERHANG.prepare(
      `SELECT cik, ticker, title FROM cik_tickers
        WHERE title LIKE ? COLLATE NOCASE ORDER BY LENGTH(title) LIMIT 25`
    ).bind("%" + name + "%").all();
    const hits = m.results || [];
    if (!hits.length) return { ok: true, found: false, asked: name, candidates: [], note: NOTE };
    if (hits.length > 1 && !hits.some(h => String(h.title).toLowerCase() === name.toLowerCase()))
      return { ok: true, found: false, asked: name, candidates: hits, note: NOTE };
    resolved = hits.find(h => String(h.title).toLowerCase() === name.toLowerCase()) || hits[0];
  }
  const tk  = ticker || String(resolved.ticker || "").toUpperCase();
  const cik = resolved ? String(resolved.cik || "") : "";

  /* the filing-level view carries labels, heavy and ticker already */
  let rows = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT * FROM v_wire_filings WHERE UPPER(ticker) = ? ORDER BY filed_on DESC LIMIT 500`
    ).bind(tk).all();
    rows = r.results || [];
  } catch (e) { rows = []; }

  /* older marks may predate the ticker backfill - fall back to the CIK */
  if (!rows.length && cik) {
    try {
      const r2 = await env.OVERHANG.prepare(
        `SELECT * FROM v_wire_filings WHERE CAST(cik AS INTEGER) = CAST(? AS INTEGER)
          ORDER BY filed_on DESC LIMIT 500`
      ).bind(cik).all();
      rows = r2.results || [];
    } catch (e) {}
  }

  /* already on the research docket - same mark the free list carries */
  let docket = null;
  try {
    docket = await env.OVERHANG.prepare(
      "SELECT tests_yes, tests_total, exhibit_read FROM detections WHERE UPPER(ticker) = ?"
    ).bind(tk).first();
  } catch (e) { docket = null; }
  for (const f of rows) {
    f.on_docket = docket ? { yes: docket.tests_yes, total: docket.tests_total, exhibit: docket.exhibit_read } : null;
  }

  /* what we actually hold, so the answer does not overstate its reach */
  let held = null;
  try {
    held = await env.OVERHANG.prepare(
      "SELECT MIN(filed_on) a, MAX(filed_on) b FROM wire_hits").first();
  } catch (e) {}

  const card = await companyCard(env, tk, cik || (rows.length ? rows[0].cik : ""));

  /* ⚠ THE SAME GATE. This endpoint returns the same list under another name,
     and gating one of the two would simply move the hole rather than close
     it — which is exactly how the product was given away twice before. */
  const gate = await paidFor(env, q, request);

  return {
    ok: true, found: rows.length > 0,
    paid: gate.paid,
    gate: gate.paid ? undefined
      : { why: gate.why, detail: gate.detail, pay_is_set_to: gate.pay_is_set_to,
          price_cents: 1200,
          note: "The answer is free. The list is twelve dollars." },
    ticker: tk, company_card: card,
    company: rows.length ? rows[0].company : (resolved ? resolved.title : ""),
    cik: cik || (rows.length ? rows[0].cik : ""),
    filings: rows.length,
    heavy: rows.filter(f => f.heavy > 0).length,
    first_filing: rows.length ? rows[rows.length - 1].filed_on : null,
    last_filing:  rows.length ? rows[0].filed_on : null,
    coverage: held ? { from: held.a, to: held.b } : null,
    on_docket: docket ? true : false,
    wire: gate.paid ? rows : veil(rows),
    note: NOTE
  };
}

async function readFiling(env, q) {
  const acc = q.get("accession");
  if (!acc) throw new Error("accession required");
  const r = await env.OVERHANG.prepare(
    `SELECT phrase, label, form, filed_on, company, cik, doc_url
       FROM wire_hits WHERE accession = ? ORDER BY label`
  ).bind(acc).all();
  return { ok:true, accession: acc, marks: r.results || [], note: NOTE };
}

async function stats(env) {
  const a = await env.OVERHANG.prepare(
    "SELECT COUNT(*) c, MIN(filed_on) a, MAX(filed_on) b FROM wire_hits").first();
  const f = await env.OVERHANG.prepare(
    "SELECT COUNT(*) c FROM v_wire_filings").first();
  const p = await env.OVERHANG.prepare(
    "SELECT COUNT(*) c FROM wire_phrases WHERE active=1").first();
  const r = await env.OVERHANG.prepare(
    "SELECT * FROM wire_runs ORDER BY id DESC LIMIT 5").all();
  const top = await env.OVERHANG.prepare(
    `SELECT label, COUNT(*) n FROM wire_hits GROUP BY label ORDER BY n DESC LIMIT 10`).all();
  return { ok:true, marks: a.c, range: [a.a, a.b], filings: f.c,
           phrases_active: p.c, by_label: top.results || [], last_runs: r.results || [] };
}

const NOTE =
  "These are filings whose text contains language we watch for. A match is not a finding and says " +
  "nothing about the company - the words are ordinary and lawful, and many of these deals are " +
  "unremarkable. It means the document is worth reading.";

function today() { return new Date().toISOString().slice(0,10); }
function addDays(d, n) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0,10);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}