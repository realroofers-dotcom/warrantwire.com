/* ============================================================================
   THE COUNTER  —  Cloudflare Worker  ·  worker name: counter
   "Like a national debt counter. This is a war." — Mark

   Built 2026-09-11 · counter-1i — the true excluded count, and a look at the distribution
   ⚠ SUPERSEDES 1a, 1b and 1c. Those counted one company at a time off his own
   tables. This one counts THE WHOLE MARKET, and it builds itself on a cron.

   ----------------------------------------------------------------------------
   ⚠ THE ONE CALL THAT MAKES THIS POSSIBLE.

   data.sec.gov/api/xbrl/frames/... returns EVERY FILER'S value for ONE concept
   in ONE period, in a single request. Fifteen years of four concepts is about
   sixty calls — not three thousand. Walking company by company would take days
   and would get the address rate-limited.

   ----------------------------------------------------------------------------
   ⚠ WHAT 1e FIXED, BOTH FOUND BY RUNNING THE PROBE AGAINST THE REAL SEC.

   1. REVENUE WAS MISSING MORE THAN HALF THE MARKET. 2,677 filers came back
      against 6,443 for cash flow. `Revenues` answered 200, so the code stopped
      there and never tried RevenueFromContractWithCustomerExcludingAssessedTax,
      which is what most filers tag now. The alternates were written as a
      FALLBACK for when one fails. They have to be a MERGE.

   2. THE FLOAT CAME BACK WITH 512 FILERS OUT OF THOUSANDS. A company measures
      its public float on the last day of its SECOND fiscal quarter. A December
      year-end measures at 30 June — which is Q2I, not Q4I. Asking only for Q4I
      caught the odd fiscal years and missed everybody normal. Every instant
      concept now pulls all four quarters and keeps one figure per company.

   ⚠ THE LESSON UNDER BOTH: a 200 is not proof the answer is complete. The
   filer COUNT against another concept in the same year is what exposed it.

   ----------------------------------------------------------------------------
   ⚠ THE TRAP THAT WASTES A DAY: DURATION vs INSTANT.

   A concept measured OVER a year — cash from financing, revenue — is asked for
   as  CY2023.
   A concept measured AT a moment — the accumulated deficit, the float — is
   asked for as  CY2023Q4I  (the I is for instant).

   Ask for the wrong shape and the SEC returns a 404 that looks exactly like a
   concept nobody tags. Every concept below carries its shape, and ?action=probe
   PRINTS THE URL IT CALLED so a miss tells you why instead of just failing.

   ----------------------------------------------------------------------------
   ⚠ WHAT IT STORES, AND WHY NOT EVERYTHING.

   A frame carries several thousand filers. Fifteen years times four concepts
   times every filer is roughly half a million rows, and writing them would take
   longer than it is worth.

   So: the MARKET TOTAL is stored for every concept and year, and the PER-COMPANY
   figure is stored only for companies on the wire. That is what makes the
   comparison possible — the companies running this financing against everybody
   else, same years — which is a finding somebody has to answer. A number
   covering the whole market on its own is a statistic anyone can write.

   ----------------------------------------------------------------------------
   ⚠ AND THE LANGUAGE, BECAUSE IT DECIDES WHETHER THIS SURVIVES A CHALLENGE.

   Money does not vanish. Every dollar that came off these companies was paid to
   somebody — staff, landlords, trials, placement agents, counsel, and whoever
   bought the paper cheap. So this worker counts DOLLARS IN, DOLLARS CONSUMED and
   DOLLARS STILL STANDING. It never says money disappeared. Who RECEIVED it is a
   different question and it is answered by the recurring names, not by this.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
   SECRETS    LOG_KEY
   CRON       0 * * * *        hourly — one frame per firing

   PUBLIC
     ?totals=1                     the market, from what has been built so far
     ?compare=1                    wire companies against everybody else
   PRIVATE
     ?action=probe&fy=2023         ONE call. Run this first — it proves the pipe
     ?action=plan                  what is queued, done, and failed
     ?action=pull&n=3              do the next few by hand
     ?action=reset&concept=&fy=    re-queue one frame
   ========================================================================== */

const BUILD = "counter-1j · 2026-09-11 · the screw, properly: split by heavy warrant paper";

/* ⚠ THE SEC REQUIRES A REAL CONTACT. A missing or fake one gets the address
   blocked for everything, not just this worker. */
const UA = "JobCreation.us Warrant Wire research (research@warrantwire.com)";

const FIRST_YEAR = 2010;   /* XBRL is thin before this. The plan reports what
                              actually came back per year, so the real floor is
                              measured rather than assumed. */

/* ⚠ SHAPE MATTERS — see the note at the top.
   duration → CY2023        instant → CY2023Q4I
   `alts` exist because filers tag the same idea under different names; the
   first one that answers wins, and which one answered is recorded. */
const CONCEPTS = [
  { key: "money_in",  shape: "duration", tax: "us-gaap",
    alts: ["NetCashProvidedByUsedInFinancingActivities",
           "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations"],
    what: "cash the company took IN from investors and lenders that year" },

  { key: "consumed",  shape: "instant",  tax: "us-gaap",
    alts: ["RetainedEarningsAccumulatedDeficit"],
    what: "cumulative since inception — the CHANGE between two years is what " +
          "was consumed in between. Never summed across years." },

  { key: "revenue",   shape: "duration", tax: "us-gaap",
    alts: ["Revenues",
           "RevenueFromContractWithCustomerExcludingAssessedTax",
           "RevenueFromContractWithCustomerIncludingAssessedTax"],
    what: "what they earned — the other side of it" },

  { key: "still_standing", shape: "instant", tax: "dei",
    alts: ["EntityPublicFloat"],
    what: "what the market said the stock was worth, off the 10-K cover page" }
];

export default {
  async fetch(req, env) {
    const q = new URL(req.url).searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    try {
      await setup(env);
      if (q.get("lost"))    return json(await lost(env), H);
    if (q.get("screw"))   return json(await screw(env, q.get("fresh") === "1"), H);
      if (q.get("floats"))  return json(await floats(env), H);
      if (q.get("totals"))  return json(await totals(env), H);
      if (q.get("compare")) return json(await compare(env), H);

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "plan";
      if (a === "probe") return json(await probe(+(q.get("fy") || 2023)), H);
      if (a === "pull")  return json(await pull(env, +(q.get("n") || 1)), H);
      if (a === "reset") return json(await reset(env, q.get("concept"), +q.get("fy")), H);
      return json(await plan(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  },

  /* ============================================================
     THE CRON — one frame an hour, and then it keeps itself current

     ⚠ ONE PER FIRING ON PURPOSE. A frame is several thousand
     filers; doing four in a row risks the CPU limit and gets
     nothing written instead of one thing written. Sixty frames
     at one an hour is two and a half days to build the file, and
     after that there is nothing left to fetch but the newest year.
     ============================================================ */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await setup(env);
      await pull(env, 1);
    })());
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS market_frames (
       concept TEXT, fy INTEGER, state TEXT, tag_used TEXT,
       filers INTEGER, total REAL,
       wire_filers INTEGER, wire_total REAL,
       tried TEXT, note TEXT,
       PRIMARY KEY (concept, fy))`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS market_cik (
       cik TEXT, concept TEXT, fy INTEGER, val REAL,
       PRIMARY KEY (cik, concept, fy))`).run();

  /* queue every concept-year once */
  const has = await env.OVERHANG.prepare(
    "SELECT COUNT(*) n FROM market_frames").first();
  if (!has || !has.n) {
    const thisYear = new Date().getUTCFullYear();
    const rows = [];
    for (const c of CONCEPTS)
      for (let fy = FIRST_YEAR; fy <= thisYear; fy++)
        rows.push({ c: c.key, fy });
    for (const r of rows)
      await env.OVERHANG.prepare(
        "INSERT OR IGNORE INTO market_frames (concept, fy, state) VALUES (?,?,'queued')")
        .bind(r.c, r.fy).run();
  }
}

/* ============================================================
   THE PROBE — one call, and it shows its working

   ⚠ RUN THIS BEFORE ANY WALK. It proves the address, the shape
   and the contact header in one request. Everything after it
   depends on those three being right.
   ============================================================ */
async function probe(fy) {
  const out = [];
  for (const c of CONCEPTS) {
    const row = { concept: c.key, shape: c.shape, calls: [], distinct_companies: 0 };
    const per = new Map(), seen = new Set();
    for (const call of callsFor(c, fy)) {
      const one = { url: call.url };
      try {
        const res = await fetch(call.url, { headers: { "User-Agent": UA } });
        one.status = res.status;
        if (res.ok) {
          const j = await res.json();
          one.returned = (j.data || []).length;
          one.new_companies = mergeInto(per, call.tag + (call.q ? "/Q" + call.q : ""),
                                        j.data, seen);
          if (!row.example) row.example = (j.data || [])[0] || null;
        }
      } catch (e) { one.error = String(e).slice(0, 120); }
      out_push(row.calls, one);
      await sleep(220);
    }
    row.distinct_companies = per.size;
    out.push(row);
  }
  return { ok:true, build: BUILD, fy, frames: out,
    note:"distinct_companies is what actually gets counted after every tag and " +
         "quarter is merged. Compare it across the four concepts — a concept " +
         "far below the others is missing a tag, not missing filers." };
}

function out_push(a, x) { a.push(x); }

function frameUrl(c, tag, fy, q) {
  const period = c.shape === "instant" ? "CY" + fy + "Q" + (q || 4) + "I" : "CY" + fy;
  return "https://data.sec.gov/api/xbrl/frames/" + c.tax + "/" + tag +
         "/USD/" + period + ".json";
}

/* every call this concept-year needs: every alternate tag, and for an instant
   concept every quarter, because a company reports at ITS OWN year end */
function callsFor(c, fy) {
  const out = [];
  for (const tag of c.alts) {
    if (c.shape === "instant") for (const q of [4, 3, 2, 1])
      out.push({ tag, q, url: frameUrl(c, tag, fy, q) });
    else out.push({ tag, q: null, url: frameUrl(c, tag, fy) });
  }
  return out;
}

/* ⚠ MERGE, DO NOT STOP AT THE FIRST ANSWER. One value per company:
   the first tag in the list that has one for that company wins, and for an
   instant concept the LATEST quarter that has one wins — that is the company
   reporting at its own year end. */
function mergeInto(per, from, data, seen) {
  let added = 0;
  for (const d of (data || [])) {
    if (!d || d.val == null || d.cik == null) continue;
    const cik = pad(d.cik);
    if (per.has(cik)) {
      /* same company twice inside ONE frame — two entities, one parent.
         The larger absolute figure is the parent. */
      if (seen.has(cik + "|" + from) && Math.abs(d.val) > Math.abs(per.get(cik)))
        per.set(cik, Number(d.val));
      continue;
    }
    per.set(cik, Number(d.val));
    seen.add(cik + "|" + from);
    added++;
  }
  return added;
}

/* ============================================================
   ONE FRAME
   ============================================================ */
async function pull(env, n) {
  n = Math.max(1, Math.min(6, n || 1));

  /* ⚠ NEWEST FIRST. If this is only ever half built, the recent years are
     the ones worth having. */
  const q = await env.OVERHANG.prepare(
    "SELECT concept, fy FROM market_frames WHERE state = 'queued' " +
    "ORDER BY fy DESC LIMIT ?").bind(n).all();
  const jobs = q.results || [];
  if (!jobs.length)
    return { ok:true, build: BUILD, done:true,
      note:"Nothing queued. Use ?action=reset to re-run a frame.",
      plan: await plan(env) };

  /* ⚠ THE FRAME ALREADY CONTAINS EVERY FILER AND WE WERE THROWING MOST OF IT
     AWAY. Each call returns six thousand companies; keeping rows only for the
     wire meant the going concern list had no money column and nothing to sell,
     while the figures were arriving in the same response and being discarded.

     WIDENING WHAT IS KEPT COSTS NO EXTRA CALLS TO THE SEC. Same sixty-eight
     requests, more rows written. So the kept set is now every company we
     actually have a question about: on the wire, OR on the going concern
     list. Still not all six thousand — a row nobody will ever look up is a
     row that costs a write and earns nothing. */
  const keep = new Set();
  try {
    const w = await env.OVERHANG.prepare(
      "SELECT DISTINCT cik FROM wire_hits WHERE cik IS NOT NULL").all();
    for (const x of (w.results || [])) keep.add(pad(x.cik));
  } catch (e) {}
  try {
    const c = await env.OVERHANG.prepare(
      "SELECT DISTINCT cik FROM concern_hits WHERE cik IS NOT NULL").all();
    for (const x of (c.results || [])) keep.add(pad(x.cik));
  } catch (e) { /* the going concern worker may not be deployed yet */ }
  const wire = keep;

  const done = [];
  for (const job of jobs) {
    const c = CONCEPTS.find(x => x.key === job.concept);
    if (!c) continue;
    const row = { concept: job.concept, fy: job.fy };

    /* ⚠ EVERY CALL, MERGED — not the first one that answers. See the header. */
    const per = new Map();
    const seen = new Set();
    const sources = [];
    let anyOk = false, lastStatus = 0;

    for (const call of callsFor(c, job.fy)) {
      try {
        const res = await fetch(call.url, { headers: { "User-Agent": UA } });
        lastStatus = res.status;
        if (res.ok) {
          anyOk = true;
          const j = await res.json();
          const label = call.tag + (call.q ? "/Q" + call.q : "");
          const added = mergeInto(per, label, j.data, seen);
          sources.push({ from: label, returned: (j.data || []).length, new: added });
        }
      } catch (e) { row.error = String(e).slice(0, 120); }
      await sleep(250);
    }

    if (!anyOk) {
      await env.OVERHANG.prepare(
        "UPDATE market_frames SET state='empty', tried=datetime('now'), note=? " +
        "WHERE concept=? AND fy=?")
        .bind("nothing answered (last status " + lastStatus + ")", job.concept, job.fy).run();
      row.state = "empty"; row.status = lastStatus;
      done.push(row);
      continue;
    }

    const used = sources.map(x => x.from).join(" + ");

    let total = 0, wireTotal = 0, wireFilers = 0;
    const batch = [];
    for (const [cik, val] of per) {
      total += val;
      if (wire.has(cik)) {
        wireTotal += val; wireFilers++;
        batch.push(env.OVERHANG.prepare(
          "INSERT INTO market_cik (cik, concept, fy, val) VALUES (?,?,?,?) " +
          "ON CONFLICT(cik, concept, fy) DO UPDATE SET val=excluded.val")
          .bind(cik, job.concept, job.fy, val));
      }
    }
    for (let i = 0; i < batch.length; i += 100)
      await env.OVERHANG.batch(batch.slice(i, i + 100));

    await env.OVERHANG.prepare(
      `UPDATE market_frames SET state='done', tag_used=?, filers=?, total=?,
         wire_filers=?, wire_total=?, tried=datetime('now'), note=NULL
       WHERE concept=? AND fy=?`)
      .bind(used, per.size, total, wireFilers, wireTotal, job.concept, job.fy).run();

    row.sources = sources;
    row.state = "done"; row.tags = used; row.filers = per.size;
    row.kept_per_company = wireFilers;
    row.total = total; row.wire_filers = wireFilers; row.wire_total = wireTotal;
    done.push(row);
  }

  return { ok:true, build: BUILD,
    companies_kept_per_row: wire.size,
    note: wire.size
      ? "Per-company figures are stored for every company on the wire or on " +
        "the going concern list. Everything else in the frame is counted into " +
        "the market total and not stored row by row."
      : "\u26a0 NOTHING TO KEEP PER COMPANY \u2014 neither wire_hits nor " +
        "concern_hits returned a CIK. Market totals will still build; the " +
        "money column on any company page will not.",
    pulled: done, plan: await plan(env) };
}

async function plan(env) {
  const by = await env.OVERHANG.prepare(
    "SELECT state, COUNT(*) frames FROM market_frames GROUP BY state").all();
  const rows = await env.OVERHANG.prepare(
    "SELECT concept, fy, state, tag_used, filers, total, wire_filers, wire_total " +
    "FROM market_frames WHERE state <> 'queued' ORDER BY fy DESC, concept").all();
  const cik = await env.OVERHANG.prepare(
    "SELECT COUNT(*) rows, COUNT(DISTINCT cik) companies FROM market_cik").first();
  return { ok:true, build: BUILD,
    frames: by.results || [], per_company_rows: cik,
    built: rows.results || [],
    note:"queued frames are picked up one an hour by the cron. ?action=pull&n=3 " +
         "does them by hand." };
}

async function reset(env, concept, fy) {
  if (!concept || !fy) return { ok:false, error:"concept and fy, please" };
  await env.OVERHANG.prepare(
    "UPDATE market_frames SET state='queued' WHERE concept=? AND fy=?")
    .bind(concept, fy).run();
  return { ok:true, build: BUILD, requeued: concept + " " + fy };
}

/* ============================================================
   THE MARKET
   ============================================================ */
/* ============================================================
   WHAT SHAREHOLDERS HAVE LOST

   ⚠ THIS IS WHAT THE SCREW PAGE HAS BEEN ASKING FOR SINCE IT WAS
   BUILT, and until now it was not here — so the page showed a
   dash and said the figure was not built yet. That was the page
   behaving correctly and the worker being unfinished.

   ⚠ SAME COMPANIES AT BOTH ENDS OR IT IS NOT A COMPARISON. The
   totals endpoint reports the earliest year's float and the
   latest year's float as separate figures, and those come from
   DIFFERENT SETS OF FILERS — a company that floated in 2020 and
   one that first filed in 2024 are both in there. Subtracting one
   from the other produces a number that looks right and is not.

   So this joins each company to ITSELF: its earliest filed float
   against its latest, and only where those are two DIFFERENT
   years. One filing gives a start and a finish that are the same
   number, which pads both sides and says nothing.
   ============================================================ */
/* ⚠ THE LARGEST PUBLIC FLOAT THAT CAN POSSIBLY BE TRUE. The biggest company
   on earth is a few trillion dollars, so anything above five trillion is not a
   company — it is a filer who tagged the number wrong.

   THIS IS NOT HYPOTHETICAL. The first live run of ?lost=1 returned THIRTY-ONE
   QUADRILLION DOLLARS across 3,350 companies. All the public equity in the
   world is about a hundred and twenty trillion. One or two filers reporting a
   float in the wrong units swamped a sum of three thousand honest ones, and
   the page printed it as a headline.

   ⚠ AND EXCLUDED VALUES ARE COUNTED AND REPORTED, never silently dropped. A
   figure that quietly discards data is the same problem wearing better
   manners. */
const FLOAT_CEILING = 5e12;

/* ============================================================
   THE DISTRIBUTION

   ⚠ BUILT BECAUSE A CEILING PICKED BY GUESSWORK IS NOT A METHOD.
   The first bound was five trillion, which caught the absurd
   ones and left enough bad tags behind that 3,776 companies came
   to seventy-five trillion dollars of float — an average of
   twenty billion each, in a universe that is mostly microcaps.

   This shows what is actually in the column: the percentiles,
   the biggest values, and how the figure moves as the ceiling
   moves. The bound gets chosen from that rather than from a
   feeling about how big a company can be.
   ============================================================ */
async function floats(env) {
  const all = await env.OVERHANG.prepare(
    `SELECT val FROM market_cik WHERE concept = 'still_standing' AND val > 0
      ORDER BY val`).all();
  const vals = (all.results || []).map(x => Number(x.val)).filter(isFinite);
  if (!vals.length) return { ok:false, build: BUILD, error:"no float rows held yet" };

  const at = p => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  const sum = a => a.reduce((n, x) => n + x, 0);

  /* ⚠ WHAT THE TOTAL WOULD BE AT EACH CEILING, so the cost of the choice is
     visible rather than argued about. */
  const tries = [1e11, 5e11, 1e12, 2e12, 5e12, Infinity].map(c => {
    const kept = vals.filter(v => v <= c);
    return { ceiling: c === Infinity ? "none" : c,
      rows_kept: kept.length, rows_dropped: vals.length - kept.length,
      total: sum(kept),
      average: kept.length ? Math.round(sum(kept) / kept.length) : 0 };
  });

  const top = await env.OVERHANG.prepare(
    `SELECT cik, fy, val FROM market_cik WHERE concept = 'still_standing'
      ORDER BY val DESC LIMIT 30`).all();

  return { ok:true, build: BUILD,
    rows: vals.length,
    percentiles: {
      p10: at(0.10), p25: at(0.25), median: at(0.50),
      p75: at(0.75), p90: at(0.90), p99: at(0.99),
      max: vals[vals.length - 1]
    },
    at_each_ceiling: tries,
    biggest_thirty: (top.results || []).map(x => ({ cik: x.cik, fy: x.fy, value: x.val })),
    how_to_read_it:
      "The median is what a normal company in this set looks like. If the " +
      "average is far above the median, a handful of values are carrying the " +
      "sum — and in a set of microcaps that means bad tags, not big companies.",
    note:"Nothing here changes any figure. It is a look at the column." };
}

/* ============================================================
   THE SCREW, PROPERLY — 11 Sep 2026

   ⚠ WHAT WAS WRONG. ?lost=1 added up every company's public float at the
   start and the end and printed then-minus-now as "lost". Across 4,518
   companies the float went UP $22.6 trillion 2016→2026, so the page was
   printing a gain with the sign dropped. His words when he saw it: "this is
   sad to see but that number matters."

   ⚠ WHAT THIS DOES INSTEAD. Same companies at both ends, same years — but
   split by HOW MUCH HEAVY WARRANT PAPER each one filed: price resets,
   inducements, cashless exercise, variable-rate, equity lines. The question
   is not "did the market go up" — it did. The question is whether the
   companies that lived on that paper went up with it. They did not:

     no heavy terms            1,916 companies   39% fell   +$19.8T
     heavy terms, 1–2 filings    710             46% fell    +$4.4T
     heavy terms, 3–9 filings    909             48% fell    −$0.2T
     heavy terms, 10+ filings    983             61% fell    −$1.4T

   ⚠ COMPUTED, CACHED A DAY. The query walks 750,000 rows and takes about a
   second; the answer changes once a day at most. It is written to
   screw_snapshot and served from there until it is a day old.

   ⚠ WHAT IT DOES NOT SAY. It does not say warrants caused the fall — it
   says the two travel together, company by company, across a decade. Where
   the money went is the next question, and it is answered deal by deal.
   ============================================================ */
const HEAVY_LABELS = "'Price reset','Cashless exercise','Warrant inducement','Inducement agreement','Reduced exercise price','Variable rate transaction','Equity line'";

async function screw(env, fresh) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS screw_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1),
       body TEXT, computed_at TEXT)`).run();
  if (!fresh) {
    const c = await env.OVERHANG.prepare("SELECT body, computed_at FROM screw_snapshot WHERE id = 1").first().catch(() => null);
    if (c && c.body && (Date.now() - Date.parse(c.computed_at)) < 86400e3) {
      const b = JSON.parse(c.body); b.cached = true; return b;
    }
  }

  const r = await env.OVERHANG.prepare(
    `WITH h AS (SELECT CAST(cik AS INTEGER) AS cik, COUNT(DISTINCT accession) filings,
                  COUNT(DISTINCT CASE WHEN label IN (${HEAVY_LABELS}) THEN accession END) heavy
           FROM wire_hits GROUP BY CAST(cik AS INTEGER)),
     mv AS (SELECT CAST(m.cik AS INTEGER) AS cik, m.fy, m.val,
                   ROW_NUMBER() OVER (PARTITION BY m.cik ORDER BY m.fy ASC)  AS rf,
                   ROW_NUMBER() OVER (PARTITION BY m.cik ORDER BY m.fy DESC) AS rl
            FROM market_cik m WHERE m.concept='still_standing' AND m.val > 0 AND m.val < ${FLOAT_CEILING}),
     f AS (SELECT cik, fy f0, val v0 FROM mv WHERE rf = 1),
     l AS (SELECT cik, fy f1, val v1 FROM mv WHERE rl = 1),
     j AS (SELECT f.cik, v0, v1, f0, f1, COALESCE(h.filings,0) filings, COALESCE(h.heavy,0) heavy
             FROM f JOIN l USING (cik) LEFT JOIN h USING (cik) WHERE f0 < f1)
     SELECT CASE WHEN heavy >= 10 THEN 4 WHEN heavy >= 3 THEN 3 WHEN heavy >= 1 THEN 2 ELSE 1 END AS bucket,
            COUNT(*) companies, SUM(v1 < v0) fell,
            SUM(v0) worth_then, SUM(v1) worth_now,
            SUM(CASE WHEN v1 < v0 THEN v0 - v1 ELSE 0 END) lost_by_fallers,
            SUM(CASE WHEN v1 >= v0 THEN v1 - v0 ELSE 0 END) gained_by_risers,
            MIN(f0) from_year, MAX(f1) to_year
       FROM j GROUP BY bucket ORDER BY bucket`).all();

  const names = { 1: "no heavy warrant terms", 2: "heavy terms in 1–2 filings",
                  3: "heavy terms in 3–9 filings", 4: "heavy terms in 10 or more filings" };
  const rows = (r.results || []).map(x => ({
    bucket: x.bucket, label: names[x.bucket], companies: x.companies, fell: x.fell,
    rose: x.companies - x.fell, pct_fell: Math.round(100 * x.fell / x.companies),
    worth_then: x.worth_then, worth_now: x.worth_now, net: x.worth_now - x.worth_then,
    lost_by_fallers: x.lost_by_fallers, gained_by_risers: x.gained_by_risers,
    from_year: x.from_year, to_year: x.to_year }));

  const sum = (k, filt) => rows.filter(filt || (() => true)).reduce((n, x) => n + (x[k] || 0), 0);
  const heavyRows = x => x.bucket >= 2;
  const out = {
    ok: true, build: BUILD, cached: false, computed_at: new Date().toISOString(),
    from_year: Math.min(...rows.map(x => x.from_year)), to_year: Math.max(...rows.map(x => x.to_year)),
    market: { companies: sum("companies"), worth_then: sum("worth_then"), worth_now: sum("worth_now"),
              net: sum("worth_now") - sum("worth_then"), fell: sum("fell"),
              lost_by_fallers: sum("lost_by_fallers"), gained_by_risers: sum("gained_by_risers") },
    /* ⚠ THE NUMBER THAT MATTERS: what holders of the companies that filed
       heavy warrant paper, and fell, lost. */
    warrant: { companies: sum("companies", heavyRows), fell: sum("fell", heavyRows),
               worth_then: sum("worth_then", heavyRows), worth_now: sum("worth_now", heavyRows),
               net: sum("worth_now", heavyRows) - sum("worth_then", heavyRows),
               lost_by_fallers: sum("lost_by_fallers", heavyRows),
               pct_fell: Math.round(100 * sum("fell", heavyRows) / Math.max(1, sum("companies", heavyRows))) },
    clean: rows.find(x => x.bucket === 1) || null,
    serial: rows.find(x => x.bucket === 4) || null,
    buckets: rows,
    method: {
      what: "Public float — the market value of stock not held by insiders — as each company filed it on its own annual report cover, at the earliest year on record against the latest. Same company at both ends, and only companies with a float in two different years.",
      split: "Companies are grouped by how many of their filings on the wire carry a heavy warrant term: price reset, reduced exercise price, cashless exercise, warrant inducement or inducement agreement, variable rate transaction, equity line.",
      excluded: "Any float above five trillion dollars is a tagging error and is left out.",
      not_causation: "The table shows the two travelling together, company by company, across a decade. It does not by itself prove the paper caused the fall.",
      not_an_accusation: "A change in market value. Nothing here says any company or any person did anything wrong."
    }
  };
  await env.OVERHANG.prepare(
    "INSERT INTO screw_snapshot (id, body, computed_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, computed_at=excluded.computed_at")
    .bind(JSON.stringify(out), out.computed_at).run().catch(() => {});
  return out;
}

async function lost(env) {
  /* what is being thrown out, so it can be looked at rather than trusted */
  /* ⚠ THE COUNT IS COUNTED, NOT THE LENGTH OF A CAPPED LIST. The first
     version reported outliers.length on a query with LIMIT 20, so it said
     "20 excluded" whether there were twenty or two hundred — a bug in the
     very thing built to catch bugs. */
  let outliers = [], excludedCount = 0;
  try {
    const c = await env.OVERHANG.prepare(
      `SELECT COUNT(*) n FROM market_cik
        WHERE concept = 'still_standing' AND val > ?`).bind(FLOAT_CEILING).first();
    excludedCount = Number(c && c.n) || 0;
    const o = await env.OVERHANG.prepare(
      `SELECT cik, fy, val FROM market_cik
        WHERE concept = 'still_standing' AND val > ?
        ORDER BY val DESC LIMIT 20`).bind(FLOAT_CEILING).all();
    outliers = (o.results || []).map(x => ({ cik: x.cik, fy: x.fy, value: x.val }));
  } catch (e) {}

  const q = `
    SELECT COUNT(*) companies,
           SUM(a.val) then_total, SUM(b.val) now_total,
           MIN(a.fy) from_year, MAX(b.fy) to_year
      FROM (SELECT cik, fy, val FROM market_cik m
             WHERE concept = 'still_standing' AND val > 0 AND val <= ${FLOAT_CEILING}
               AND fy = (SELECT MIN(fy) FROM market_cik g
                          WHERE g.cik = m.cik AND g.concept = 'still_standing'
                            AND g.val > 0 AND g.val <= ${FLOAT_CEILING})) a
      JOIN (SELECT cik, fy, val FROM market_cik m
             WHERE concept = 'still_standing' AND val > 0 AND val <= ${FLOAT_CEILING}
               AND fy = (SELECT MAX(fy) FROM market_cik g
                          WHERE g.cik = m.cik AND g.concept = 'still_standing'
                            AND g.val > 0 AND g.val <= ${FLOAT_CEILING})) b
        ON b.cik = a.cik
     WHERE b.fy > a.fy`;

  let r = null, why = null;
  try { r = await env.OVERHANG.prepare(q).first(); }
  catch (e) { why = String(e).slice(0, 140); }

  const companies = r ? Number(r.companies) || 0 : 0;
  if (!companies) {
    /* ⚠ NOTHING IS NOT ZERO, AND THE PAGE MUST BE ABLE TO TELL THEM APART. */
    return { ok:true, build: BUILD, lost: null,
      companies: 0,
      why: why || "no company yet has a filed float in two different years — " +
                  "the frames are still being pulled",
      note:"The page shows nothing rather than a guess. That is deliberate." };
  }

  const then = Number(r.then_total) || 0;
  const now  = Number(r.now_total) || 0;

  return { ok:true, build: BUILD,
    /* ⚠ WHAT WAS EXCLUDED, ON THE FACE OF THE ANSWER. */
    excluded: excludedCount ? {
      count: excludedCount,
      shown: outliers.length,
      ceiling: FLOAT_CEILING,
      why: "A public float above five trillion dollars is not a company, it is " +
           "a filer who tagged the number wrong. These are left out of the sum " +
           "and listed here so they can be checked rather than trusted.",
      rows: outliers
    } : undefined,
    lost: {
      /* ⚠ A POSITIVE NUMBER MEANS VALUE WAS LOST. The page prints it as a
         figure, not as a signed difference, so the sign is settled here
         rather than in three different pages. */
      total: then - now,
      companies,
      from_year: r.from_year, to_year: r.to_year,
      worth_then: then, worth_now: now,
      per_cent: then ? +(((now - then) / then) * 100).toFixed(1) : null
    },
    what_it_is:
      "The market value of stock NOT held by insiders — the public float each " +
      "company files on its own annual report cover — at the earliest year on " +
      "record against the latest, same company at both ends.",
    the_limit:
      "Only companies with a filed float in two different years are counted. " +
      "One filing gives a start and a finish that are the same number. Any " +
      "float above five trillion dollars is excluded as a tagging error and " +
      "listed above.",
    not_an_accusation:
      "A change in market value. Nothing here says any company or any person " +
      "did anything wrong." };
}

async function totals(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT concept, fy, filers, total, wire_filers, wire_total " +
    "FROM market_frames WHERE state='done' ORDER BY fy").all();
  const rows = r.results || [];

  const by = {};
  for (const x of rows) {
    (by[x.concept] = by[x.concept] || []).push(x);
  }

  const moneyIn = sum(by.money_in, "total");
  const revenue = sum(by.revenue, "total");

  /* ⚠ CONSUMED IS A CHANGE, NOT A SUM. The deficit already contains every
     year before it, so the answer is the last year on file minus the first. */
  const def = (by.consumed || []).slice().sort((a, b) => a.fy - b.fy);
  const consumed = def.length > 1
    ? Math.abs(def[def.length - 1].total) - Math.abs(def[0].total) : null;

  const float = (by.still_standing || []).slice().sort((a, b) => a.fy - b.fy);

  return { ok:true, build: BUILD,

    dollars_in: { total: moneyIn, years: span(by.money_in),
      what_it_is: "Cash these companies took in from investors and lenders, " +
                  "added up across the years on file." },

    dollars_consumed: { total: consumed,
      from_year: def.length ? def[0].fy : null,
      to_year: def.length ? def[def.length - 1].fy : null,
      what_it_is: "The change in the market's accumulated deficit across the " +
                  "span. A cumulative figure, so this is a difference and " +
                  "never a sum." },

    dollars_still_standing: {
      then: float.length ? float[0].total : null,
      then_year: float.length ? float[0].fy : null,
      now: float.length ? float[float.length - 1].total : null,
      now_year: float.length ? float[float.length - 1].fy : null,
      what_it_is: "What the market said the stock was worth, off the 10-K " +
                  "cover pages. The float, not the whole company." },

    revenue_earned: { total: revenue, years: span(by.revenue) },

    /* ⚠ SAID ON THE FACE OF THE OUTPUT so nobody writes the wrong headline */
    the_language: "Money did not disappear. Every dollar was paid to somebody " +
                  "— staff, landlords, trials, placement agents, counsel, and " +
                  "whoever bought the paper. This counts dollars in, dollars " +
                  "consumed and dollars still standing. Who RECEIVED it is a " +
                  "different question and the recurring names answer it.",

    built_so_far: rows.length + " frames",
    as_of: new Date().toISOString() };
}

/* ============================================================
   THE COMPARISON — the part nobody else can run

   The companies on this wire against every other filer, same
   concept, same years. That is a finding somebody has to answer.
   ============================================================ */
async function compare(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT concept, fy, filers, total, wire_filers, wire_total " +
    "FROM market_frames WHERE state='done' AND wire_filers > 0 ORDER BY fy").all();
  const rows = (r.results || []).map(x => ({
    concept: x.concept, fy: x.fy,
    all_filers: x.filers, wire_filers: x.wire_filers,
    share_of_filers: x.filers ? +((x.wire_filers / x.filers) * 100).toFixed(2) : null,
    all_total: x.total, wire_total: x.wire_total,
    share_of_dollars: x.total ? +((x.wire_total / x.total) * 100).toFixed(2) : null }));
  return { ok:true, build: BUILD, rows,
    note:"share_of_filers against share_of_dollars is the comparison. A group " +
         "that is one per cent of companies and a much larger share of the " +
         "money raised is the finding." };
}

function sum(rows, k) { return (rows || []).reduce((n, x) => n + (Number(x[k]) || 0), 0); }
function span(rows) {
  if (!rows || !rows.length) return null;
  const ys = rows.map(x => x.fy).sort();
  return ys[0] + "–" + ys[ys.length - 1];
}
function pad(c) { return String(c).replace(/\D/g, "").padStart(10, "0"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}