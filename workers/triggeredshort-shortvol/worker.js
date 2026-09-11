// ============================================================================
// TRIGGERED SHORT - FINRA DAILY SHORT VOLUME COLLECTOR
// ----------------------------------------------------------------------------
// Pulls FINRA's daily short sale volume file, keeps only watchlist tickers,
// stores one row per ticker per day.
//
// SOURCE: https://cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt
//   Pipe-delimited. Header row, then:
//     Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
//   Published the NEXT TRADING MORNING. No key, no login, no rate limit.
//
// BINDINGS
//   OVERHANG   D1 (same database as the crawler and social collector)
//   LOG_KEY    secret - same master key
//
// CRON
//   30 13 * * 2-6   9:30am ET Tue-Sat, so it picks up the prior session
//
// WHAT THIS NUMBER IS NOT
//   Short VOLUME is not short INTEREST. A market maker filling a buy order
//   marks the sell short even if it covers seconds later. 40-60% short volume
//   is ordinary and says nothing about positioning. The signal is a CHANGE in
//   a ticker's own baseline, never the level. v_shortvol_outliers does that.
// ============================================================================

const FINRA_BASE = "https://cdn.finra.org/equity/regsho/daily/";

export default {

  async scheduled(event, env, ctx) {
    ctx.waitUntil(collectDay(env, lastTradingDay()));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- public read-only series ----------------------------------------
    if (url.searchParams.get("shortvol")) {
      return json(await publicSeries(url, env), 200);
    }

    const key = request.headers.get("X-Auth-Key") || url.searchParams.get("key");
    if (!key || key !== env.LOG_KEY) return json({ error: "unauthorized" }, 401);

    const action = url.searchParams.get("action") || "status";

    if (action === "run") {
      const day = url.searchParams.get("day") || lastTradingDay();
      return json(await collectDay(env, day), 200);
    }

    if (action === "backfill") {
      const from = url.searchParams.get("from");          // YYYY-MM-DD, newest
      const days = Math.min(Number(url.searchParams.get("days") || 30), 180);
      if (!from) return json({ error: "from required" }, 400);
      return json(await backfill(env, from, days), 200);
    }

    if (action === "outliers") {
      const r = await env.OVERHANG.prepare("SELECT * FROM v_shortvol_outliers").all();
      return json({ outliers: r.results }, 200);
    }

    if (action === "coverage") {
      const r = await env.OVERHANG.prepare("SELECT * FROM v_shortvol_coverage").all();
      return json({ coverage: r.results }, 200);
    }

    if (action === "export") {
      const t = String(url.searchParams.get("ticker") || "").toUpperCase();
      const sql = t
        ? "SELECT ticker, day, short_volume, short_exempt, total_volume, short_pct FROM shortvol_daily WHERE ticker = ? AND venue='CNMS' ORDER BY day"
        : "SELECT ticker, day, short_volume, short_exempt, total_volume, short_pct FROM shortvol_daily WHERE venue='CNMS' ORDER BY ticker, day";
      const st = t ? env.OVERHANG.prepare(sql).bind(t) : env.OVERHANG.prepare(sql);
      const r = await st.all();
      let csv = "ticker,day,short_volume,short_exempt,total_volume,short_pct\n";
      for (const x of (r.results || [])) {
        csv += [x.ticker, x.day, x.short_volume, x.short_exempt, x.total_volume, x.short_pct].join(",") + "\n";
      }
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="shortvol.csv"',
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const cov = await env.OVERHANG.prepare("SELECT * FROM v_shortvol_coverage").all();
    const runs = await env.OVERHANG.prepare(
      "SELECT * FROM shortvol_runs ORDER BY id DESC LIMIT 20"
    ).all();
    return json({ coverage: cov.results, recent_runs: runs.results }, 200);
  },
};

// ---------------------------------------------------------------- collection

async function collectDay(env, day) {
  // which tickers do we care about
  const wl = await watchlist(env);
  if (!wl.size) {
    await logRun(env, day, 0, 0, 0, "watchlist empty");
    return { day: day, error: "watchlist empty - seed collector_watchlist or social_watchlist" };
  }

  const ymd = day.replace(/-/g, "");
  const url = FINRA_BASE + "CNMSshvol" + ymd + ".txt";

  let http = 0;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "triggeredshort.com research collector" },
    });
    http = r.status;

    if (!r.ok) {
      // 404 = holiday, weekend, or not published yet. Not an error worth alarm.
      await logRun(env, day, 0, http, 0, http === 404 ? "no file (holiday/weekend/not yet posted)" : "http " + http);
      return { day: day, http: http, note: http === 404 ? "no file for that date" : "fetch failed" };
    }

    const text = await r.text();
    const lines = text.split("\n");
    let kept = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.indexOf("|") < 0) continue;

      const f = line.split("|");
      if (f.length < 5) continue;

      const sym = (f[1] || "").trim().toUpperCase();
      if (!wl.has(sym)) continue;

      const shortVol = num(f[2]);
      const shortEx  = num(f[3]);
      const totalVol = num(f[4]);
      const venue    = (f[5] || "CNMS").trim() || "CNMS";
      const pct = totalVol > 0 ? Math.round((shortVol / totalVol) * 1000) / 10 : null;

      await env.OVERHANG.prepare(
        "INSERT INTO shortvol_daily (ticker, day, venue, short_volume, short_exempt, total_volume, short_pct) " +
        "VALUES (?,?,?,?,?,?,?) " +
        "ON CONFLICT(ticker, day, venue) DO UPDATE SET " +
        "short_volume=excluded.short_volume, short_exempt=excluded.short_exempt, " +
        "total_volume=excluded.total_volume, short_pct=excluded.short_pct, " +
        "collected_at=datetime('now')"
      ).bind(sym, day, venue, shortVol, shortEx, totalVol, pct).run();

      kept++;
    }

    await logRun(env, day, 1, http, kept, kept + " rows");
    return { day: day, rows_kept: kept, watchlist_size: wl.size };

  } catch (e) {
    await logRun(env, day, 0, http, 0, String(e).slice(0, 200));
    return { day: day, error: String(e).slice(0, 200) };
  }
}

async function backfill(env, from, days) {
  const out = [];
  const d = new Date(from + "T00:00:00Z");

  for (let i = 0; i < days; i++) {
    const day = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();

    if (dow !== 0 && dow !== 6) {            // skip weekends
      const have = await env.OVERHANG.prepare(
        "SELECT 1 FROM shortvol_daily WHERE day = ? LIMIT 1"
      ).bind(day).first();

      if (have) out.push({ day: day, skipped: true });
      else out.push(await collectDay(env, day));
    }

    d.setUTCDate(d.getUTCDate() - 1);
  }

  return { from: from, days: days, results: out };
}

// ------------------------------------------------------------------- public

async function publicSeries(url, env) {
  const t = String(url.searchParams.get("ticker") || "").toUpperCase();
  if (!t) {
    const r = await env.OVERHANG.prepare("SELECT * FROM v_shortvol_coverage").all();
    return { coverage: r.results };
  }
  const days = Math.min(Number(url.searchParams.get("days") || 90), 400);
  const r = await env.OVERHANG.prepare(
    "SELECT day, short_volume, short_exempt, total_volume, short_pct " +
    "FROM shortvol_daily WHERE ticker = ? AND venue = 'CNMS' ORDER BY day DESC LIMIT ?"
  ).bind(t, days).all();
  return {
    ticker: t,
    series: (r.results || []).reverse(),
    note: "Short volume is not short interest. Market-maker sells are marked short and covered the same day. Read changes against this ticker's own baseline, not the level.",
  };
}

// ------------------------------------------------------------------ helpers

// Pull tickers from BOTH watchlists so this collector needs no separate seeding.
async function watchlist(env) {
  const set = new Set();
  try {
    const a = await env.OVERHANG.prepare(
      "SELECT ticker FROM social_watchlist WHERE active = 1"
    ).all();
    for (const x of (a.results || [])) if (x.ticker) set.add(x.ticker.toUpperCase());
  } catch (e) {}
  try {
    const b = await env.OVERHANG.prepare(
      "SELECT ticker FROM collector_watchlist WHERE ticker IS NOT NULL"
    ).all();
    for (const x of (b.results || [])) if (x.ticker) set.add(x.ticker.toUpperCase());
  } catch (e) {}
  return set;
}

function num(s) {
  const n = parseInt(String(s || "").trim(), 10);
  return isNaN(n) ? 0 : n;
}

function lastTradingDay() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

async function logRun(env, day, ok, http, rows, note) {
  try {
    await env.OVERHANG.prepare(
      "INSERT INTO shortvol_runs (day, venue, ok, http, rows_kept, note) VALUES (?,'CNMS',?,?,?,?)"
    ).bind(day, ok, http, rows, note).run();
  } catch (e) {}
}

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
    },
  });
}