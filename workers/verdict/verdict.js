/* BUILT 2026-09-11 · verdict-2a · worker name: verdict · source: warrantwire.com/workers/verdict */
/* ============================================================================
   THE VERDICT WORKER
   Cloudflare Worker · binding: OVERHANG (D1, database `overhang`)

   ⚠ 2a — THE VERDICT DOES NOT KEEP PHOTOGRAPHS. His ruling, 11 Sep 2026:
   `people-photos` is the one store for every picture of every person — and
   the `people` worker owns it, with a source recorded on every upload. This
   worker EVALUATES THE DATA and, when it names a person, ASKS `people` for the
   face. It never touches a bucket. The finder that read firm websites for
   headshots (1g) is gone from here; it belongs in `people`, as an upload with
   a source, and will be added there.

   ----------------------------------------------------------------------------
   ⚠ WHAT THIS IS FOR, because the site got built backwards once already.

   A list of filings is not a product. Anyone can pull the same filings off
   EDGAR for nothing. What a man pays for is the SENTENCE AT THE TOP — the thing
   the filings add up to, stated plainly, before he reads a single document.

   This worker computes that sentence. Every number in it comes out of the
   database; nothing is typed by hand and nothing is written in advance. Point
   it at a ticker and it returns the verdict block that goes above the filings.

   ⚠ IT COMPUTES, IT DOES NOT CONCLUDE. The verdict names what the record shows
   — repriced, diluted, split — and never why anybody did it. Motive is not in
   the database and does not belong in a sentence this site generates
   automatically.

   ⚠ IT SAYS SO WHEN IT DOES NOT KNOW. A missing figure prints as "not on file"
   and the line is left out of the verdict. A verdict assembled from three of
   five numbers says it was assembled from three. Silence about a gap is how a
   product like this gets caught out.
   ----------------------------------------------------------------------------

   ROUTES
     ?health=1                     build stamp and whether the binding is bound
     ?schema=1&key=...             every table and column actually in the database
     ?ticker=TOVX                  the verdict block as JSON
     ?ticker=TOVX&format=html      the verdict block as a fragment to drop in a page

   BINDINGS: OVERHANG (D1) · LOG_KEY (secret)
   ASKS:     the `people` worker, for photographs — one call per verdict

   The schema route exists because these queries were written against a local
   copy built from the research notes, not against the live database. Run it
   once and any column that is named differently shows up immediately instead of
   as five silent zeroes.
   ============================================================================ */

const BUILD = "verdict-2a · 2026-09-11";

/* ⚠ WHERE THE FACES LIVE. One line to check if the people worker ever moves. */
const PEOPLE = "https://people.realroofers.workers.dev";

/* the same id rule the people worker uses, so a name here finds its file
   there: a slug of the name. (A person CIK would be better; the parties table
   does not carry one yet.) */
function personId(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 60);
}

/* ⚠ ASKED ONCE PER VERDICT, NOT ONCE PER PERSON. The people worker lists
   every photograph it holds in one call; matching is then a lookup. If it is
   not answering, nobody gets a face and the verdict is otherwise unchanged —
   the numbers are the product, the picture is a courtesy. */
async function facesHeld() {
  try {
    const r = await fetch(PEOPLE + "/?photos=1", { cf: { cacheTtl: 300 } });
    if (!r.ok) return {};
    const j = await r.json();
    const held = {};
    for (const p of (j.photos || [])) held[String(p.id)] = { source: p.source || null };
    return held;
  } catch (e) { return {}; }
}

/* ⚠ EVERY QUERY IS PARAMETERISED. No caller-supplied string ever reaches SQL. */
const SQL = {
  issuer: `SELECT id, ticker, name, cik, state FROM issuers
           WHERE UPPER(ticker) = ?1 LIMIT 1`,

  /* the first and last share count on file, and the multiple between them */
  dilution: `SELECT
      (SELECT as_of  FROM share_counts WHERE issuer_id=?1 ORDER BY as_of ASC  LIMIT 1) AS from_date,
      (SELECT shares FROM share_counts WHERE issuer_id=?1 ORDER BY as_of ASC  LIMIT 1) AS from_shares,
      (SELECT as_of  FROM share_counts WHERE issuer_id=?1 ORDER BY as_of DESC LIMIT 1) AS to_date,
      (SELECT shares FROM share_counts WHERE issuer_id=?1 ORDER BY as_of DESC LIMIT 1) AS to_shares`,

  /* ⚠ COMPOUNDED IN SQL, NOT TYPED. Three splits of 35, 10 and 25 are not
     "1-for-70" — they multiply to 1-for-8,750, and the multiplied figure is the
     one a holder actually lived through. */
  splits: `SELECT COUNT(*) AS n, MIN(effective) AS first_eff, MAX(effective) AS last_eff,
      EXP(SUM(LN(ratio_from / ratio_to))) AS compounded
      FROM splits WHERE issuer_id=?1`,

  overhang: `SELECT as_of, tranche, outstanding, exercise_price
      FROM warrants WHERE issuer_id=?1 AND status='outstanding'
      ORDER BY as_of DESC LIMIT 1`,

  /* ⚠ THE PREMIUM IS MEASURED ON THE DAY THEY EXERCISED, NOT THE DAY THEY
     REPRICED. Repricing is an offer; exercising is the act. On TOVX those are
     consecutive sessions — $0.43 then $0.42 — and measuring the wrong one
     reports 26% where the documented figure is 29%. Caught in testing. */
  reprice: `SELECT f.closed, f.warrant_price,
      (SELECT MAX(warrant_price) FROM financings
         WHERE issuer_id=?1 AND closed < f.closed AND warrant_price IS NOT NULL) AS was,
      (SELECT close FROM prices WHERE issuer_id=?1 AND d > f.closed ORDER BY d ASC LIMIT 1) AS close_next,
      (SELECT d     FROM prices WHERE issuer_id=?1 AND d > f.closed ORDER BY d ASC LIMIT 1) AS d_next
      FROM financings f
      WHERE f.issuer_id=?1 AND f.kind='inducement'
      ORDER BY f.closed DESC LIMIT 1`,

  spend: `SELECT period, months, rnd, gna, cash
      FROM financials WHERE issuer_id=?1 ORDER BY period DESC LIMIT 1`,

  repriceCount: `SELECT COUNT(*) AS n FROM financings
      WHERE issuer_id=?1 AND kind='inducement'`,

  /* ⚠ THE ROLE COMES FROM THIS DEAL, THE COUNT COMES FROM ALL OF THEM. A first
     attempt used MAX(role) across every row and returned the alphabetical
     winner — which on placeholder rows is a dash. What a reader wants is: what
     did this person do HERE, and where else does the name turn up.

     ⚠ AND THE COUNT IS THE POINT. "Leslie Marlow, issuer counsel" is a name.
     "Leslie Marlow, issuer counsel — also on 6 other issuers, 250 filings" is
     the finding, and it is computed, not asserted. */
  parties: `SELECT p.id, p.name, p.kind, p.firm, p.url,
        mine.role, mine.first_seen, mine.last_seen,
        (SELECT COUNT(DISTINCT issuer_id) FROM roles WHERE party_id=p.id) AS issuers,
        (SELECT SUM(filings)              FROM roles WHERE party_id=p.id) AS all_filings
      FROM parties p
      JOIN roles mine ON mine.party_id = p.id AND mine.issuer_id = ?1
      WHERE mine.role IS NOT NULL AND mine.role <> '—'
      ORDER BY issuers DESC, all_filings DESC`
};

const num = n => n == null ? null : Number(n).toLocaleString("en-US");
/* ⚠ CENTS ON A SHARE PRICE, NONE ON A DOLLAR FIGURE. "$872,000.00 of research"
   reads like a machine wrote it; $0.54 without cents is wrong. The rule is the
   size of the number, not the field it came from. */
const money = n => {
  if (n == null) return null;
  const v = Number(n);
  return Math.abs(v) < 100
    ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "$" + Math.round(v).toLocaleString("en-US");
};

/* ⚠ ONE QUERY THAT FAILS DOES NOT TAKE THE PAGE DOWN. A missing table returns
   null for that line and the verdict is assembled from what survived. */
async function many(db, sql, id) {
  try {
    const n = (sql.match(/\?1/g) || []).length;
    const r = await db.prepare(sql.replace(/\?1/g, "?")).bind(...Array(n).fill(id)).all();
    return r.results || [];
  } catch (e) { return []; }
}

async function one(db, sql, id) {
  try {
    const n = (sql.match(/\?1/g) || []).length;
    return await db.prepare(sql.replace(/\?1/g, "?")).bind(...Array(n).fill(id)).first();
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}

function build(rows) {
  const lines = [], missing = [], sentences = [];
  const ok = r => r && !r.__error;

  /* ---- dilution ---- */
  const d = rows.dilution;
  if (ok(d) && d.from_shares && d.to_shares) {
    const mult = d.to_shares / d.from_shares;
    lines.push({
      label: "Shares outstanding",
      value: `${num(d.from_shares)} → ${num(d.to_shares)}`,
      note: `${d.from_date} to ${d.to_date}`
    });
    if (mult >= 2) sentences.push({ subject: false,
      text: `A holder from ${d.from_date} has been diluted ${mult >= 10 ? Math.round(mult) : mult.toFixed(1)}-fold` });
  } else missing.push("share counts");

  /* ---- splits ---- */
  const s = rows.splits;
  if (ok(s) && s.n > 0 && s.compounded) {
    lines.push({
      label: "Reverse splits",
      value: `${s.n}, compounding 1-for-${Math.round(s.compounded).toLocaleString("en-US")}`,
      note: `${s.first_eff} to ${s.last_eff}`
    });
  } else missing.push("reverse splits");

  /* ---- overhang ---- */
  const w = rows.overhang;
  if (ok(w) && w.outstanding) {
    lines.push({
      label: "Warrant overhang",
      value: `${num(w.outstanding)} exercisable at ${money(w.exercise_price)}`,
      note: `${w.tranche || "outstanding"}, as of ${w.as_of}`
    });
    const dil = rows.dilution;
    if (ok(dil) && dil.to_shares) {
      const pct = w.outstanding / dil.to_shares * 100;
      lines.push({
        label: "Overhang as a share of the company",
        value: `${pct.toFixed(0)}% of shares outstanding`,
        note: "warrants ÷ shares on the latest cover"
      });
    }
  } else missing.push("warrants");

  /* ---- the reprice ---- */
  const r = rows.reprice, rc = rows.repriceCount;
  if (ok(r) && r.warrant_price != null && r.was != null) {
    const bits = [`${money(r.was)} → ${money(r.warrant_price)}`];
    let prem = null;
    if (r.close_next != null && r.close_next > 0) {
      prem = (r.warrant_price - r.close_next) / r.close_next * 100;
      bits.push(`exercised at ${Math.round(prem)}% above market`);
    }
    lines.push({ label: "Last reprice", value: bits.join(", "),
      note: `repriced ${r.closed}${r.d_next ? `, stock closed ${money(r.close_next)} on ${r.d_next}` : ""}` });

    const n = ok(rc) && rc.n ? rc.n : 1;
    sentences.unshift({ subject: true,
      text: `has repriced its warrants downward ${n === 1 ? "once" : n + " times"}` +
        (prem != null && prem > 0
          ? `, most recently into an exercise ${Math.round(prem)}% above the market price` : "") });
  } else missing.push("repricings");

  /* ---- spend ---- */
  const f = rows.spend;
  if (ok(f) && f.rnd != null && f.gna != null) {
    lines.push({
      label: "Research vs overhead",
      value: `${money(f.rnd)} R&D against ${money(f.gna)} G&A`,
      note: `${f.months || "?"} months to ${f.period}`
    });
    if (f.rnd > 0 && f.gna / f.rnd >= 1.5) sentences.push({ subject: false,
      text: `It spent ${(f.gna / f.rnd).toFixed(1)} times as much on overhead as on research` });
  } else missing.push("R&D and G&A");

  return { lines, missing, sentences };
}

/* ⚠ EVERY SENTENCE AFTER THE FIRST GETS A CAPITAL. The first version capitalised
   only one of them and shipped "...diluted 46-fold. it spent 4.7 times...".
   A verdict with a lowercase sentence in it is a verdict nobody trusts. */
/* ⚠ THE COMPANY NAME GOES IN FRONT OF THE SENTENCES THAT TAKE ONE, AND NO
   OTHERS. "has repriced its warrants" needs a subject; "A holder from 2024 has
   been diluted" already has one. The first version glued the name onto whatever
   happened to be first, so losing the warrants table produced
   "Theriva Biologics, Inc. A holder from 2024-08-26 has been diluted 46-fold."
   Found by deleting tables and reading the output, not by reading the code. */
function verdictSentence(name, parts) {
  if (!parts.sentences.length) return null;
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
  return parts.sentences
    .map(s => (s.subject ? `${name} ${s.text}` : cap(s.text)) + ".")
    .join(" ");
}

function html(v) {
  const esc = t => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = v.lines.map(l =>
    `<tr><th>${esc(l.label)}</th><td><b>${esc(l.value)}</b>` +
    (l.note ? `<span class="vn">${esc(l.note)}</span>` : "") + `</td></tr>`).join("");

  /* ⚠ A FACE AND A NAME, NOT A TABLE ROW. Presentation is the product here —
     a reader remembers a face beside a role and forgets a line of text. Where
     there is no photo the initials stand in at the same size so the row never
     collapses and the grid never goes ragged. */
  const cards = (v.parties || []).map(p => {
    const init = esc(p.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase());
    const face = p.photo
      ? `<img class="vface" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span class="vface vinit">${init}</span>`;
    const rec = p.also_on > 0
      ? `<span class="vrec">also on ${p.also_on} other issuer${p.also_on === 1 ? "" : "s"}` +
        (p.filings ? ` · ${Number(p.filings).toLocaleString("en-US")} filings` : "") + `</span>`
      : `<span class="vrec vonly">this issuer only</span>`;
    return `<figure class="vcard">${face}
      <figcaption>
        <b>${p.url ? `<a href="${esc(p.url)}" rel="nofollow noopener" target="_blank">${esc(p.name)}</a>` : esc(p.name)}</b>
        <span class="vrole">${esc(p.role || "")}</span>
        ${p.firm ? `<span class="vfirm">${esc(p.firm)}</span>` : ""}
        ${rec}
        ${p.photo_credit ? `<span class="vcred">Photo: ${esc(p.photo_credit)}</span>` : ""}
      </figcaption></figure>`;
  }).join("");

  return `<section class="verdict">
  <p class="vlead">${esc(v.verdict || "Not enough on file to reach a verdict.")}</p>
  <table class="vtab">${rows}</table>
  ${cards ? `<h3 class="vwho">Who arranged it</h3><div class="vgrid">${cards}</div>` : ""}
  ${v.missing.length ? `<p class="vgap">Not on file: ${esc(v.missing.join(", "))}.</p>` : ""}
  <p class="vfoot">Every figure above is computed from filings in the database, not typed.
  The filings themselves are below.</p>
</section>`;
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const J = (o, s = 200) => new Response(JSON.stringify(o, null, 2),
      { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

    if (u.searchParams.get("health")) {
      return J({ ok: true, build: BUILD,
        db: env.OVERHANG ? "bound" : "NOT BOUND",
        photos: "asked from " + PEOPLE + " — this worker holds none" });
    }

    if (!env.OVERHANG) return J({ error: "OVERHANG is not bound to this worker" }, 500);

    /* ⚠ THE SCHEMA ROUTE. These queries were written against a local copy built
       from the notes, not the live database. One call here shows any column
       that is named differently, instead of five silent zeroes on the page. */
    if (u.searchParams.get("schema")) {
      if (u.searchParams.get("key") !== (env.LOG_KEY || "")) return J({ error: "key" }, 403);
      const t = await env.OVERHANG.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const out = {};
      for (const row of (t.results || [])) {
        try {
          const c = await env.OVERHANG.prepare(`PRAGMA table_info(${row.name})`).all();
          out[row.name] = (c.results || []).map(x => x.name);
        } catch (e) { out[row.name] = "could not read"; }
      }
      return J({ build: BUILD, tables: out });
    }

    const tk = (u.searchParams.get("ticker") || "").trim().toUpperCase();
    if (!tk) return J({ error: "pass ?ticker=TOVX" }, 400);

    const iss = await one(env.OVERHANG, SQL.issuer, tk);
    if (!iss || iss.__error || !iss.id) {
      return J({ ticker: tk, found: false,
        note: "not in the database — we have not screened it, and that is not a clean bill of health" }, 404);
    }

    const rows = {};
    for (const k of ["dilution", "splits", "overhang", "reprice", "spend", "repriceCount"]) {
      rows[k] = await one(env.OVERHANG, SQL[k], iss.id);
    }

    const parts = build(rows);

    /* ⚠ WHO ARRANGED IT SITS WITH THE VERDICT, NOT IN A FOOTNOTE. The same
       handful of agents, counsel and buyers appear across unrelated issuers,
       and that is the whole argument — so the names go on the page beside the
       numbers, with a photo where one is on file. */
    /* ⚠ THE FACES ARE ASKED FOR, NOT KEPT. The people worker says which ids it
       holds a photograph for; a party whose id is on that list gets the
       people worker's address for it, and its recorded source. Nothing else. */
    const faces = await facesHeld();
    const people = (await many(env.OVERHANG, SQL.parties, iss.id)).map(p => {
      const id = personId(p.name);
      const held = p.kind === "person" ? faces[id] : null;
      return {
        name: p.name,
        kind: p.kind || "firm",
        firm: p.firm || null,
        role: p.role,
        url: p.url || null,
        photo: held ? `${PEOPLE}/?photo=${encodeURIComponent(id)}` : null,
        photo_source: held ? held.source : null,
        photo_credit: held ? held.source : null,
        also_on: (p.issuers || 1) - 1,
        filings: p.all_filings || 0,
        seen: p.first_seen && p.last_seen ? `${p.first_seen} to ${p.last_seen}` : null
      };
    });

    const out = {
      build: BUILD,
      ticker: iss.ticker,
      company: iss.name,
      cik: iss.cik,
      verdict: verdictSentence(iss.name, parts),
      lines: parts.lines,
      parties: people,
      parties_without_photos: people.filter(p => !p.photo).map(p => p.name),
      missing: parts.missing,
      computed_at: new Date().toISOString()
    };

    if (u.searchParams.get("format") === "html") {
      return new Response(html(out), {
        headers: { "content-type": "text/html;charset=utf-8", "access-control-allow-origin": "*" }
      });
    }
    return J(out);
  }
};
