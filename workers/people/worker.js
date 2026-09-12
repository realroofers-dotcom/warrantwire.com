/* ============================================================================
   THE PEOPLE  —  Cloudflare Worker  ·  worker name: people
   Who is involved in a company, with names, at the top of the report.

   Built 2026-09-11 · people-1e — across every company, which is the point

   ----------------------------------------------------------------------------
   ⚠ WHERE EACH NAME COMES FROM, AND HOW GOOD IT IS. These are three different
   qualities of evidence and a page that mixes them is a page that gets one of
   them wrong in public.

     OFFICERS AND DIRECTORS   Form 4. Every insider filing carries the
                              person's name and the title THE COMPANY ITSELF
                              stated for them, in tagged XML. Exact, free, and
                              it is their own words about their own people.

     COUNSEL, AGENTS, BUYERS  The `parties` and `roles` tables, built here by
                              hand from reading filings. PARTIAL BY
                              CONSTRUCTION — a firm absent from the table is
                              not a firm that did no work, and every page
                              printing these must say so.

     THE COMPANY ITSELF       cik_tickers and cik_sic, already held.

   ⚠ A FORM 4 SAYS WHO FILED, NOT WHO IS IN POST TODAY. A chief executive who
   left in 2024 still has his Form 4s on file. So every person carries the date
   of their last filing, and anyone whose last filing is old is marked as such
   rather than presented as current.

   ⚠ AND NOBODY IS ACCUSED OF ANYTHING BY BEING ON THIS LIST. It is a list of
   who filed what. That is all it is and all it will ever be.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              IMG        R2 bucket → people-photos
   SECRETS    LOG_KEY

   ----------------------------------------------------------------------------
   ⚠ A PHOTOGRAPH OF A NAMED PERSON IS NOT A LOGO, AND THIS WORKER TREATS IT
   DIFFERENTLY IN ONE WAY: EVERY PHOTO MUST CARRY A SOURCE.

   A company's wordmark comes from the company. A person's face comes from
   somewhere — a proxy statement, a company website, a press release — and the
   day somebody asks where it came from, the answer has to already be recorded
   rather than remembered. `source` is required on upload and it is stored
   beside the file.

   ⚠ EVERYTHING ELSE IS THE SAME DISCIPLINE AS THE LOGO STORE. Only the owner
   uploads. The type is read from the file's own first bytes, never from what
   the upload claims. NO SVG — it is XML, XML carries script, and a browser
   runs it. The key is built from an id we control so a filename can never
   decide where anything lands. Served back with a fixed type and nosniff.

   PUBLIC
     ?people=1&ticker=TOVX        everyone we hold, grouped
     ?careers=1&ticker=TOVX       WHERE ELSE these people have been, and what
                                  the record shows happened there
     ?method=1                    where each name comes from, and the limits
   PRIVATE
     ?action=pull&ticker=TOVX     read the Form 4s and record the people
     ?action=careers&ticker=TOVX  walk each officer's and director's EDGAR
                                  ownership index and pull the other issuers
     ?action=stats

   ----------------------------------------------------------------------------
   ⚠ WHERE ELSE — people-1f, 12 Sep 2026. His ask: the report should say who
   is involved and where they have taken other companies, because a board
   member who ran Heat Biologics into NightHawk into Scorpius is a fact a
   holder of Theriva can use, and it is nowhere on the filing.

   THE SOURCE IS EDGAR'S OWN INDEX OF THE PERSON. Every Form 4 filer has a
   CIK, and the SEC keeps a page per CIK listing every issuer they have ever
   filed against, with the issuer's current name beside the old one:
     https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK=0001381450
   That is the person's own filing history, not a search and not a guess.

   FOR EACH OTHER ISSUER, THE RECORD IS COUNTED, NEVER CHARACTERISED:
     the names it has had (submissions JSON, formerNames),
     whether the SEC lists a ticker and exchange for it today,
     how many 8-Ks carried Item 3.01 (an exchange notice), 5.03 (charter
     amendment — where reverse splits live), 3.02 (unregistered sales),
     how many registration statements and prospectuses it has filed,
     the share count over time from its own 10-K/10-Q cover (dei), and
     the accumulated deficit from its own 10-K.
   Every one of those is the company's own filing. Nothing here says why.
   ========================================================================== */

const BUILD = "people-1f · 2026-09-12 · where else these people have been";
const CONTACT = "research@warrantwire.com";

/* ============================================================================
   THE FIRMS

   ⚠ THEY ARE ON THE COVER OF THE PROSPECTUS AND WE WERE NOT LOOKING. The page
   read a hand-built table, that table had nothing for this company, and the
   report showed no counsel and no agent — on a filing whose front page names
   Blank Rome. The names were never missing. We were.

   ⚠ MATCHED AGAINST A LIST, NOT PARSED OUT OF PROSE. Trying to work out which
   words on a cover page are a law firm produces "The Company" and "New York"
   as often as it produces anything. The set of firms doing this work is small
   and known, so the document is searched FOR THEM. A name that is not on the
   list is not guessed at — it is missed, and missing is recoverable by adding
   a line. A wrong name published under his byline is not.

   ⚠ AND WHERE IT WAS FOUND IS RECORDED. Counsel signs the EX-5.1 opinion;
   an agent is named on the cover of the 424B. Which document a name came from
   is the difference between a fact and an assertion.
   ============================================================================ */

/* ⚠ ONE ENTRY PER FIRM, WITH THE WAYS IT ACTUALLY APPEARS IN FILINGS. EDGAR
   text is inconsistent about ampersands, LLP, and periods in initials, so each
   firm carries its own spellings rather than relying on one clever pattern. */
const FIRMS = [
  /* ---- counsel ---- */
  ["counsel","Blank Rome LLP",["blank rome"]],
  ["counsel","Gracin & Marlow, LLP",["gracin & marlow","gracin and marlow","gracin marlow"]],
  ["counsel","Sichenzia Ross Ference Carmel LLP",["sichenzia ross ference","sichenzia ross"]],
  ["counsel","Lowenstein Sandler LLP",["lowenstein sandler"]],
  ["counsel","Ellenoff Grossman & Schole LLP",["ellenoff grossman"]],
  ["counsel","Loeb & Loeb LLP",["loeb & loeb","loeb and loeb"]],
  ["counsel","Haynes and Boone, LLP",["haynes and boone","haynes & boone"]],
  ["counsel","Duane Morris LLP",["duane morris"]],
  ["counsel","Mintz, Levin",["mintz, levin","mintz levin"]],
  ["counsel","Goodwin Procter LLP",["goodwin procter"]],
  ["counsel","Cooley LLP",["cooley llp"]],
  ["counsel","Wilson Sonsini Goodrich & Rosati",["wilson sonsini"]],
  ["counsel","Sheppard, Mullin, Richter & Hampton LLP",["sheppard, mullin","sheppard mullin"]],
  ["counsel","Thompson Hine LLP",["thompson hine"]],
  ["counsel","Pryor Cashman LLP",["pryor cashman"]],
  ["counsel","Olshan Frome Wolosky LLP",["olshan frome"]],
  ["counsel","K&L Gates LLP",["k&l gates"]],
  ["counsel","Troutman Pepper",["troutman pepper"]],
  ["counsel","Dorsey & Whitney LLP",["dorsey & whitney","dorsey and whitney"]],
  ["counsel","Fox Rothschild LLP",["fox rothschild"]],
  ["counsel","Foley Hoag LLP",["foley hoag"]],
  ["counsel","Morgan, Lewis & Bockius LLP",["morgan, lewis","morgan lewis"]],
  ["counsel","Nelson Mullins Riley & Scarborough LLP",["nelson mullins"]],
  ["counsel","Bevilacqua PLLC",["bevilacqua pllc"]],
  ["counsel","Schiff Hardin",["schiff hardin"]],
  ["counsel","ArentFox Schiff LLP",["arentfox schiff","arent fox"]],
  ["counsel","Reed Smith LLP",["reed smith"]],
  ["counsel","Greenberg Traurig, LLP",["greenberg traurig"]],
  ["counsel","Katten Muchin Rosenman LLP",["katten muchin"]],
  ["counsel","Ropes & Gray LLP",["ropes & gray","ropes and gray"]],

  /* ---- placement agents and underwriters ---- */
  ["agent","A.G.P./Alliance Global Partners",["a.g.p./alliance global","alliance global partners","a.g.p."]],
  ["agent","H.C. Wainwright & Co.",["h.c. wainwright","hc wainwright","wainwright & co"]],
  ["agent","Maxim Group LLC",["maxim group"]],
  ["agent","Roth Capital Partners",["roth capital"]],
  ["agent","ThinkEquity LLC",["thinkequity"]],
  ["agent","EF Hutton",["ef hutton","e.f. hutton"]],
  ["agent","Aegis Capital Corp.",["aegis capital"]],
  ["agent","Ladenburg Thalmann & Co.",["ladenburg thalmann"]],
  ["agent","Titan Partners Group",["titan partners"]],
  ["agent","Craig-Hallum Capital Group",["craig-hallum","craig hallum"]],
  ["agent","Lake Street Capital Markets",["lake street capital"]],
  ["agent","The Benchmark Company",["benchmark company"]],
  ["agent","Cantor Fitzgerald & Co.",["cantor fitzgerald"]],
  ["agent","Jefferies LLC",["jefferies llc"]],
  ["agent","Piper Sandler & Co.",["piper sandler"]],
  ["agent","Oppenheimer & Co. Inc.",["oppenheimer & co"]],
  ["agent","Northland Securities",["northland securities","northland capital"]],
  ["agent","D. Boral Capital",["d. boral","boral capital"]],
  ["agent","Univest Securities, LLC",["univest securities"]],
  ["agent","Dawson James Securities",["dawson james"]],
  ["agent","Spartan Capital Securities",["spartan capital"]],
  ["agent","WallachBeth Capital LLC",["wallachbeth"]],
  ["agent","Chardan Capital Markets",["chardan capital","chardan"]],
  ["agent","Brookline Capital Markets",["brookline capital"]],
  ["agent","Joseph Gunnar & Co.",["joseph gunnar"]],
  ["agent","Paulson Investment Company",["paulson investment"]],
  ["agent","Newbridge Securities",["newbridge securities"]],
  ["agent","Kingswood Capital Partners",["kingswood capital"]],
  ["agent","Revere Securities",["revere securities"]],
  ["agent","Rodman & Renshaw",["rodman & renshaw","rodman and renshaw"]],
  ["agent","BTIG, LLC",["btig, llc"]],
  ["agent","Leerink Partners",["leerink"]],
  ["agent","Canaccord Genuity",["canaccord"]],
  ["agent","Stifel, Nicolaus & Company",["stifel, nicolaus","stifel nicolaus"]],
  ["agent","Truist Securities",["truist securities"]],
  ["agent","B. Riley Securities",["b. riley securities","b riley securities"]],

  /* ---- buyers that appear by name in the paper ---- */
  ["buyer","Empery Asset Management",["empery asset","empery tax efficient","empery debt"]],
  ["buyer","Sabby Management",["sabby management","sabby volatility"]],
  ["buyer","Anson Funds",["anson investments","anson east"]],
  ["buyer","Intracoastal Capital",["intracoastal capital"]],
  ["buyer","Hudson Bay Capital",["hudson bay capital"]],
  ["buyer","Armistice Capital",["armistice capital"]],
  ["buyer","Lincoln Park Capital",["lincoln park capital"]],
  ["buyer","Keystone Capital Partners",["keystone capital partners"]],
  ["buyer","3i, LP",["3i, lp","3i management"]],
  ["buyer","Alto Opportunity Master Fund",["alto opportunity"]],
  ["buyer","CVI Investments",["cvi investments"]],
  ["buyer","Bigger Capital Fund",["bigger capital"]],
  ["buyer","District 2 Capital",["district 2 capital"]],
  ["buyer","Iroquois Capital",["iroquois capital","iroquois master fund"]],
  ["buyer","Kingsbrook Opportunities",["kingsbrook opportunities"]],
  ["buyer","Sixth Borough Capital",["sixth borough"]],
  ["buyer","Walleye Capital",["walleye capital","walleye opportunities"]],
  ["buyer","Boothbay Fund Management",["boothbay"]],
  ["buyer","Altium Capital",["altium capital","altium growth"]],
  ["buyer","Nomis Bay",["nomis bay"]]
];

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      const a = q.get("action") || "";
      if (!a) {
        /* a photo is a file, so it answers before anything that returns JSON */
        if (q.get("photo")) return await servePhoto(env, q.get("photo"));
        if (q.get("photos")) return json(await heldPhotos(env), H);
        if (q.get("method")) return json(method(), H);
        if (q.get("people")) return json(await people(env, q.get("ticker"), u.origin), H);
        if (q.get("careers")) return json(await careers(env, q.get("ticker")), H);
        if (q.get("across")) return json(await across(env, q.get("role")), H);
        if (q.get("firm"))   return json(await oneFirm(env, q.get("firm")), H);
        if (q.get("swept"))  return json(await swept(env), H);
      }
      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      if (a === "pull") return json(await pull(env, q.get("ticker"), +(q.get("n") || 25)), H);
      if (a === "careers") return json(await pullCareers(env, q.get("ticker"), q.get("fresh") === "1"), H);
      if (a === "firms") return json(await scanFirms(env, q.get("ticker"), +(q.get("n") || 12)), H);
      if (a === "sweep") return json(await sweep(env, +(q.get("n") || 5), +(q.get("each") || 8)), H);
      if (a === "photo") return json(await putPhoto(env, q, req, u.origin), H);
      if (a === "dropphoto") return json(await dropPhoto(env, q.get("id")), H);
      return json(await stats(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS insiders (
       cik TEXT, person_cik TEXT, name TEXT,
       title TEXT, is_officer INTEGER, is_director INTEGER, is_ten_pct INTEGER,
       first_seen TEXT, last_seen TEXT, filings INTEGER DEFAULT 0,
       PRIMARY KEY (cik, person_cik))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS filing_firms (
       cik TEXT NOT NULL, firm TEXT NOT NULL, role TEXT NOT NULL,
       times INTEGER DEFAULT 1,
       first_seen TEXT, last_seen TEXT,
       /* ⚠ WHICH DOCUMENT IT CAME OUT OF. The difference between a fact and an
          assertion is being able to show where it was found. */
       last_accession TEXT, last_form TEXT,
       PRIMARY KEY (cik, firm, role))`).run();

  /* ⚠ WHERE ELSE. One row per person per issuer, straight off the SEC's
     index of that person. current_name is the SEC's own "Current Name" —
     it is how Heat Biologics is known to be Scorpius without anyone
     remembering it. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS careers (
       person_cik TEXT NOT NULL, issuer_cik TEXT NOT NULL,
       person_name TEXT, issuer_name TEXT, current_name TEXT,
       owner_type TEXT, last_transaction TEXT,
       pulled TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (person_cik, issuer_cik))`).run();

  /* the record of an issuer, counted out of its own filings, cached */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS issuer_record (
       cik TEXT PRIMARY KEY,
       name TEXT, former_names TEXT,          /* JSON [{name,from,to}] */
       ticker TEXT, exchange TEXT,            /* what the SEC lists TODAY; empty means none */
       sic TEXT, state TEXT,
       first_filing TEXT, last_filing TEXT,
       n_8k INTEGER, n_301 INTEGER, n_503 INTEGER, n_302 INTEGER,
       n_raises INTEGER,                      /* S-1, S-3, 424B, in the window */
       shares TEXT,                           /* JSON [{end,form,val}] from the 10-K/10-Q cover */
       shares_first INTEGER, shares_peak INTEGER, shares_trough INTEGER, shares_now INTEGER,
       deficit INTEGER, deficit_date TEXT,
       pulled TEXT DEFAULT (datetime('now')))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS person_photos (
       id TEXT PRIMARY KEY,        /* a person CIK, or a slug of the name */
       name TEXT,
       key TEXT, content_type TEXT, bytes INTEGER,
       source TEXT NOT NULL,       /* ⚠ REQUIRED. Where the picture came from. */
       added TEXT DEFAULT (datetime('now')))`).run();
}

function method() {
  return { ok:true, build: BUILD,
    officers_and_directors: {
      source: "Form 4, the insider filing. Name and title as tagged in the XML.",
      why_it_is_good:
        "It is the company's own statement about its own people, filed under " +
        "signature, and it is free.",
      the_limit:
        "⚠ A FORM 4 SAYS WHO FILED, NOT WHO IS IN POST TODAY. Someone who left " +
        "years ago still has filings on record. Every person carries the date " +
        "of their last one, and anyone stale is marked."
    },
    counsel_agents_and_buyers: {
      source: "The parties and roles tables, built here by hand from reading filings.",
      the_limit:
        "⚠ PARTIAL BY CONSTRUCTION. There is no tag for counsel or for a " +
        "placement agent. A firm absent from this list is NOT a firm that did " +
        "no work, and that sentence must print wherever these names print."
    },
    what_none_of_it_means:
      "A list of who filed what. Being named here is not an allegation of " +
      "anything, and nothing here says any person did anything wrong." };
}

/* ============================================================
   READING THE FORM 4s
   ============================================================ */
async function pull(env, ticker, n) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };
  n = Math.max(1, Math.min(100, n || 25));

  const co = await env.OVERHANG.prepare(
    "SELECT cik FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1").bind(tk).first();
  if (!co || !co.cik) return { ok:false, build: BUILD,
    error:"that ticker is not in the SEC's CIK map here" };

  const cik = String(co.cik).replace(/\D/g, "");
  const padded = cik.padStart(10, "0");

  /* the company's own filing history — the SEC's index, not a search */
  let recent;
  try {
    const r = await fetch("https://data.sec.gov/submissions/CIK" + padded + ".json",
      { headers: { "User-Agent": CONTACT } });
    if (!r.ok) return { ok:false, build: BUILD, error:"EDGAR " + r.status };
    const j = await r.json();
    recent = (j.filings && j.filings.recent) || {};
  } catch (e) { return { ok:false, build: BUILD, error:String(e).slice(0, 140) }; }

  const forms = recent.form || [];
  const accs  = recent.accessionNumber || [];
  const dates = recent.filingDate || [];
  const jobs = [];
  for (let i = 0; i < forms.length && jobs.length < n; i++)
    if (String(forms[i]) === "4") jobs.push({ acc: accs[i], filed: dates[i] });

  if (!jobs.length) return { ok:true, build: BUILD, ticker: tk, cik,
    found: 0, note:"No Form 4 filings on this company's recent index." };

  const seen = {};
  const errs = [];
  for (const job of jobs) {
    const got = await readForm4(cik, job.acc);
    if (!got.ok) { errs.push({ accession: job.acc, why: got.why }); await sleep(220); continue; }
    for (const p of got.people) {
      const k = p.person_cik || p.name.toLowerCase();
      const had = seen[k];
      if (had) {
        had.filings++;
        if (job.filed > had.last_seen) {
          had.last_seen = job.filed;
          /* ⚠ THE MOST RECENT TITLE WINS. A person who was a director and is
             now chief executive has both on file, and the current one is the
             one in the newest filing. */
          if (p.title) had.title = p.title;
          had.is_officer  = p.is_officer  || had.is_officer;
          had.is_director = p.is_director || had.is_director;
        }
        if (job.filed < had.first_seen) had.first_seen = job.filed;
      } else {
        seen[k] = { person_cik: p.person_cik || "", name: p.name, title: p.title || "",
          is_officer: p.is_officer ? 1 : 0, is_director: p.is_director ? 1 : 0,
          is_ten_pct: p.is_ten_pct ? 1 : 0,
          first_seen: job.filed, last_seen: job.filed, filings: 1 };
      }
    }
    await sleep(220);
  }

  let saved = 0;
  for (const k of Object.keys(seen)) {
    const p = seen[k];
    await env.OVERHANG.prepare(
      `INSERT INTO insiders (cik, person_cik, name, title, is_officer, is_director,
         is_ten_pct, first_seen, last_seen, filings)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(cik, person_cik) DO UPDATE SET
         name=excluded.name, title=excluded.title,
         is_officer=excluded.is_officer, is_director=excluded.is_director,
         is_ten_pct=excluded.is_ten_pct,
         first_seen=MIN(first_seen, excluded.first_seen),
         last_seen=MAX(last_seen, excluded.last_seen),
         filings=filings + excluded.filings`)
      .bind(cik, p.person_cik, p.name, p.title, p.is_officer, p.is_director,
            p.is_ten_pct, p.first_seen, p.last_seen, p.filings).run();
    saved++;
  }

  return { ok:true, build: BUILD, ticker: tk, cik,
    form_4s_read: jobs.length, people: saved,
    /* ⚠ A FAILED READ IS REPORTED. Silence would look like a company with
       fewer insiders than it has. */
    could_not_read: errs,
    note: errs.length
      ? "Some filings could not be read, so this run UNDER-REPORTS. Run it again."
      : "Every Form 4 in the window was read." };
}

/* ⚠ THE XML, NOT THE RENDERED PAGE. A Form 4 has a machine-readable document
   in the same folder as the human one, and the tags are exact: no guessing at
   which line of a table is the title. */
async function readForm4(cik, accession) {
  const bare = String(accession || "").replace(/-/g, "");
  const base = "https://www.sec.gov/Archives/edgar/data/" + cik + "/" + bare;
  try {
    const idx = await fetch(base + "/index.json", { headers: { "User-Agent": CONTACT } });
    if (!idx.ok) return { ok:false, why: "EDGAR " + idx.status };
    const j = await idx.json();
    const xml = ((j.directory && j.directory.item) || [])
      .map(x => x.name).filter(nm => /\.xml$/i.test(nm) && !/R\d+/i.test(nm));
    if (!xml.length) return { ok:false, why: "no xml in that filing" };

    const r = await fetch(base + "/" + xml[0], { headers: { "User-Agent": CONTACT } });
    if (!r.ok) return { ok:false, why: "EDGAR " + r.status };
    const t = await r.text();

    /* one Form 4 can carry several reporting owners */
    const people = [];
    const blocks = t.split(/<reportingOwner>/i).slice(1);
    for (const b of blocks) {
      const name = pick(b, "rptOwnerName");
      if (!name) continue;
      people.push({
        name: tidyName(name),
        person_cik: (pick(b, "rptOwnerCik") || "").replace(/\D/g, ""),
        title: pick(b, "officerTitle") || "",
        /* the flags are "1" or "true" depending on the filer's software */
        is_officer:  yes(pick(b, "isOfficer")),
        is_director: yes(pick(b, "isDirector")),
        is_ten_pct:  yes(pick(b, "isTenPercentOwner"))
      });
    }
    if (!people.length) return { ok:false, why: "no reporting owner in that xml" };
    return { ok:true, people };
  } catch (e) { return { ok:false, why: String(e).slice(0, 100) }; }
}

function pick(x, tag) {
  const m = String(x).match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&")
             .replace(/\s+/g, " ").trim() || null;
}
function yes(v) { return /^(1|true|y|yes)$/i.test(String(v || "").trim()) ? 1 : 0; }

/* ⚠ EDGAR WRITES A PERSON AS "SURNAME FIRSTNAME MIDDLE". Printed raw it reads
   as a filing system rather than as a person, and it is a person's name. */
function tidyName(n) {
  const raw = String(n || "").replace(/\s+/g, " ").trim();
  if (raw.indexOf(",") > 0) {
    const p = raw.split(",");
    return (p.slice(1).join(",").trim() + " " + p[0].trim()).replace(/\s+/g, " ").trim();
  }
  return raw;
}

/* ============================================================
   WHERE ELSE THESE PEOPLE HAVE BEEN
   ============================================================ */
const SEC_H = { "User-Agent": "WarrantWire/1.0 (" + CONTACT + ")" };

/* the SEC's own page for one person: every issuer they have filed against */
async function edgarOwner(personCik) {
  const p = String(personCik || "").replace(/\D/g, "").padStart(10, "0");
  const r = await fetch("https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK=" + p, { headers: SEC_H });
  if (!r.ok) return { ok:false, why: "EDGAR " + r.status };
  const html = await r.text();
  /* the issuer table: one <tr> per issuer, in this order —
       issuer name [Current Name: …] | issuer CIK | last transaction | type of owner
     The name cell is a link to getissuer&CIK=; that link carries the CIK. */
  const out = [];
  const rows = html.split(/<tr[^>]*>/i).slice(1);
  for (const row of rows) {
    const m = /getissuer&(?:amp;)?CIK=(\d+)/i.exec(row);
    if (!m) continue;
    const cells = row.split(/<td[^>]*>/i).slice(1).map(c =>
      c.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
    if (cells.length < 4) continue;
    let name = cells[0], current = "";
    const cn = /^(.*?)\s*Current Name:\s*(.+)$/i.exec(name);
    if (cn) { name = cn[1].trim(); current = cn[2].trim(); }
    /* ⚠ THE LAST CELL RUNS ON. On some rows EDGAR's footnote ("Items 1 - 47
       The information presented below…") lands in the owner-type cell. The
       type is everything before that footnote, and never more than a line. */
    const type = String(cells[3] || "").replace(/\s*Items\s+\d+\s*-\s*\d+.*$/i, "").slice(0, 120).trim();
    out.push({ issuer_cik: String(+m[1]), issuer_name: name, current_name: current,
               last_transaction: (cells[2] || "").slice(0, 10), owner_type: type });
  }
  return { ok:true, issuers: out };
}

/* the record of one issuer, counted out of its own filings */
async function issuerRecord(env, cik, fresh) {
  const c = String(cik || "").replace(/\D/g, "");
  if (!c) return null;
  if (!fresh) {
    const had = await env.OVERHANG.prepare(
      "SELECT * FROM issuer_record WHERE cik = ? AND pulled > datetime('now','-7 days')").bind(c).first();
    if (had) return had;
  }
  const pad = c.padStart(10, "0");
  let s;
  try {
    const r = await fetch("https://data.sec.gov/submissions/CIK" + pad + ".json", { headers: SEC_H });
    if (!r.ok) return null;
    s = await r.json();
  } catch (e) { return null; }

  const f = (s.filings && s.filings.recent) || {};
  const forms = f.form || [], dates = f.filingDate || [], items = f.items || [];
  let n8 = 0, n301 = 0, n503 = 0, n302 = 0, nRaise = 0;
  for (let i = 0; i < forms.length; i++) {
    const fm = String(forms[i]);
    if (/^8-K/.test(fm)) {
      n8++;
      const it = String(items[i] || "");
      if (/\b3\.01\b/.test(it)) n301++;
      if (/\b5\.03\b/.test(it)) n503++;
      if (/\b3\.02\b/.test(it)) n302++;
    }
    if (/^(S-1|S-3|424B)/.test(fm)) nRaise++;
  }
  const former = (s.formerNames || []).map(x => ({
    name: x.name, from: String(x.from || "").slice(0, 10), to: String(x.to || "").slice(0, 10) }));

  /* the share count off the cover of its own 10-K and 10-Q, and the deficit */
  let shares = [], deficit = null, deficitDate = "";
  try {
    const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK" + pad + ".json", { headers: SEC_H });
    if (r.ok) {
      const j = await r.json();
      const dei = j.facts && j.facts.dei && j.facts.dei.EntityCommonStockSharesOutstanding;
      const rows = (dei && dei.units && dei.units.shares) || [];
      const byEnd = {};
      for (const x of rows) {
        if (!/^10-[KQ]/.test(String(x.form || ""))) continue;
        /* one figure per report date; a filing that restates the same date keeps the later one */
        byEnd[x.end] = { end: x.end, form: x.form, val: Math.round(+x.val || 0) };
      }
      shares = Object.values(byEnd).sort((a, b) => a.end < b.end ? -1 : 1).slice(-24);
      const gaap = j.facts && j.facts["us-gaap"];
      const d = gaap && gaap.RetainedEarningsAccumulatedDeficit;
      const drows = ((d && d.units && d.units.USD) || []).filter(x => x.form === "10-K" && x.fp === "FY");
      if (drows.length) {
        drows.sort((a, b) => a.end < b.end ? -1 : 1);
        const last = drows[drows.length - 1];
        deficit = Math.round(+last.val || 0); deficitDate = last.end;
      }
    }
  } catch (e) {}

  const vals = shares.map(x => x.val).filter(v => v > 0);
  const rec = {
    cik: c, name: s.name || "", former_names: JSON.stringify(former),
    ticker: (s.tickers || []).join(","), exchange: (s.exchanges || []).filter(Boolean).join(","),
    sic: s.sicDescription || "", state: s.stateOfIncorporation || "",
    first_filing: dates.length ? dates[dates.length - 1] : "", last_filing: dates[0] || "",
    n_8k: n8, n_301: n301, n_503: n503, n_302: n302, n_raises: nRaise,
    shares: JSON.stringify(shares),
    shares_first: vals[0] || null, shares_peak: vals.length ? Math.max(...vals) : null,
    shares_trough: vals.length ? Math.min(...vals) : null, shares_now: vals[vals.length - 1] || null,
    deficit, deficit_date: deficitDate
  };
  await env.OVERHANG.prepare(
    `INSERT INTO issuer_record (cik, name, former_names, ticker, exchange, sic, state,
       first_filing, last_filing, n_8k, n_301, n_503, n_302, n_raises, shares,
       shares_first, shares_peak, shares_trough, shares_now, deficit, deficit_date, pulled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(cik) DO UPDATE SET
       name=excluded.name, former_names=excluded.former_names, ticker=excluded.ticker,
       exchange=excluded.exchange, sic=excluded.sic, state=excluded.state,
       first_filing=excluded.first_filing, last_filing=excluded.last_filing,
       n_8k=excluded.n_8k, n_301=excluded.n_301, n_503=excluded.n_503, n_302=excluded.n_302,
       n_raises=excluded.n_raises, shares=excluded.shares,
       shares_first=excluded.shares_first, shares_peak=excluded.shares_peak,
       shares_trough=excluded.shares_trough, shares_now=excluded.shares_now,
       deficit=excluded.deficit, deficit_date=excluded.deficit_date, pulled=datetime('now')`)
    .bind(rec.cik, rec.name, rec.former_names, rec.ticker, rec.exchange, rec.sic, rec.state,
          rec.first_filing, rec.last_filing, rec.n_8k, rec.n_301, rec.n_503, rec.n_302, rec.n_raises,
          rec.shares, rec.shares_first, rec.shares_peak, rec.shares_trough, rec.shares_now,
          rec.deficit, rec.deficit_date).run();
  return rec;
}

/* PRIVATE: walk each officer's and director's index and record the others */
async function pullCareers(env, ticker, fresh) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };
  const co = await env.OVERHANG.prepare(
    "SELECT cik FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1").bind(tk).first();
  if (!co || !co.cik) return { ok:false, build: BUILD, error:"that ticker is not in the SEC's CIK map here" };
  const cik = String(co.cik).replace(/\D/g, "");

  const ppl = await env.OVERHANG.prepare(
    `SELECT person_cik, name FROM insiders
      WHERE cik = ? AND (is_officer = 1 OR is_director = 1) AND person_cik <> ''`).bind(cik).all();
  const people = ppl.results || [];
  if (!people.length) return { ok:false, build: BUILD, error:"no officers or directors on file — run ?action=pull first" };

  const errs = [], issuers = {};
  let rows = 0;
  for (const p of people) {
    const got = await edgarOwner(p.person_cik);
    if (!got.ok) { errs.push({ person: p.name, why: got.why }); await sleep(250); continue; }
    for (const x of got.issuers) {
      await env.OVERHANG.prepare(
        `INSERT INTO careers (person_cik, issuer_cik, person_name, issuer_name, current_name,
           owner_type, last_transaction, pulled)
         VALUES (?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(person_cik, issuer_cik) DO UPDATE SET
           person_name=excluded.person_name, issuer_name=excluded.issuer_name,
           current_name=excluded.current_name, owner_type=excluded.owner_type,
           last_transaction=excluded.last_transaction, pulled=datetime('now')`)
        .bind(String(+p.person_cik), x.issuer_cik, p.name, x.issuer_name, x.current_name,
              x.owner_type, x.last_transaction).run();
      rows++;
      if (x.issuer_cik !== String(+cik)) issuers[x.issuer_cik] = 1;
    }
    await sleep(250);
  }
  /* the record of every OTHER issuer these people have been at */
  let pulled = 0;
  for (const ic of Object.keys(issuers)) {
    const r = await issuerRecord(env, ic, fresh);
    if (r) pulled++;
    await sleep(250);
  }
  return { ok:true, build: BUILD, ticker: tk, cik, people: people.length,
    career_rows: rows, other_issuers: Object.keys(issuers).length, records_pulled: pulled,
    could_not_read: errs,
    note: errs.length ? "Some people could not be read, so this UNDER-REPORTS. Run it again."
                      : "Every officer's and director's index was read." };
}

/* PUBLIC: where else, with the record of each place */
async function careers(env, ticker) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };
  const co = await env.OVERHANG.prepare(
    "SELECT cik FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1").bind(tk).first();
  if (!co || !co.cik) return { ok:false, build: BUILD, error:"that ticker is not in the SEC's CIK map here" };
  const cik = String(+String(co.cik).replace(/\D/g, ""));

  const r = await env.OVERHANG.prepare(
    `SELECT i.name AS here_name, i.title, i.is_officer, i.is_director, i.last_seen,
            c.person_cik, c.issuer_cik, c.issuer_name, c.current_name, c.owner_type, c.last_transaction,
            x.name AS rec_name, x.former_names, x.ticker AS rec_ticker, x.exchange, x.sic,
            x.first_filing, x.last_filing, x.n_8k, x.n_301, x.n_503, x.n_302, x.n_raises,
            x.shares, x.shares_first, x.shares_peak, x.shares_trough, x.shares_now,
            x.deficit, x.deficit_date, x.pulled
       FROM insiders i
       JOIN careers c ON CAST(c.person_cik AS INTEGER) = CAST(i.person_cik AS INTEGER)
       LEFT JOIN issuer_record x ON CAST(x.cik AS INTEGER) = CAST(c.issuer_cik AS INTEGER)
      WHERE CAST(i.cik AS INTEGER) = CAST(? AS INTEGER)
        AND (i.is_officer = 1 OR i.is_director = 1)
        AND CAST(c.issuer_cik AS INTEGER) <> CAST(? AS INTEGER)
      ORDER BY i.is_officer DESC, i.name, c.last_transaction DESC`).bind(cik, cik).all();

  const by = {};
  for (const row of (r.results || [])) {
    const k = row.person_cik;
    if (!by[k]) by[k] = { name: row.here_name, role_here: row.title || (row.is_officer ? "officer" : "director"),
                          last_filed_here: row.last_seen, elsewhere: [] };
    let shares = [];
    try { shares = JSON.parse(row.shares || "[]"); } catch (e) {}
    let former = [];
    try { former = JSON.parse(row.former_names || "[]"); } catch (e) {}
    const names = [row.issuer_name].concat(former.map(f => f.name)).concat(row.current_name ? [row.current_name] : []);
    by[k].elsewhere.push({
      issuer_cik: row.issuer_cik,
      as_filed: row.issuer_name, now_called: row.current_name || row.rec_name || row.issuer_name,
      names_it_has_had: [...new Set(names.map(n => String(n || "").trim()).filter(Boolean))],
      name_changes: former.length,
      role: row.owner_type, last_transaction: row.last_transaction,
      sec_lists_today: row.rec_name == null ? null
        : { ticker: row.rec_ticker || "", exchange: row.exchange || "",
            note: row.rec_ticker ? "" : "the SEC lists no ticker and no exchange for this company today" },
      what_it_is: row.sic || "", state: row.state || "",
      filings: row.rec_name == null ? null : {
        first: row.first_filing, last: row.last_filing,
        eight_ks: row.n_8k, exchange_notices_301: row.n_301, charter_amendments_503: row.n_503,
        unregistered_sales_302: row.n_302, registration_and_prospectus: row.n_raises },
      shares: row.rec_name == null ? null : {
        first: row.shares_first, peak: row.shares_peak, trough: row.shares_trough, now: row.shares_now,
        by_report: shares },
      deficit: row.deficit == null ? null : { amount: row.deficit, as_of: row.deficit_date },
      record_pulled: row.pulled || null,
      record_missing: row.rec_name == null ? "the record for this issuer has not been pulled" : ""
    });
  }
  const list = Object.values(by);
  return { ok:true, build: BUILD, ticker: tk, cik,
    people: list,
    people_with_other_issuers: list.filter(p => p.elsewhere.length).length,
    source: "Each person's own ownership index at the SEC (own-disp getowner), " +
            "and each issuer's own submissions and XBRL company facts.",
    what_it_is:
      "Where each officer and director has filed as an insider before, and what " +
      "that company's own filings show: the names it has had, whether the SEC " +
      "lists a ticker for it today, how many exchange notices and charter " +
      "amendments it filed, how often it registered stock, and its share count " +
      "and deficit over time.",
    not_an_accusation:
      "A count of what was filed. Nothing here says any person caused any of it, " +
      "and nothing here says what will happen at this company.",
    the_limit:
      "A person with no other issuers on their index may have served elsewhere " +
      "without filing a Form 4. Absence here is not a clean record; it is an " +
      "empty index." };
}

/* ============================================================
   READING THE FIRMS OUT OF THE FILINGS
   ============================================================ */
async function scanFirms(env, ticker, n) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };
  n = Math.max(1, Math.min(40, n || 12));

  /* ⚠ THE DOCUMENTS THAT NAME FIRMS ARE THE OFFERING DOCUMENTS. Counsel signs
     the EX-5.1; the agent is on the cover of the 424B; buyers are in the
     purchase agreement. A 10-Q names none of them. */
  const r = await env.OVERHANG.prepare(
    `SELECT accession, cik, form, filed_on FROM v_wire_filings
      WHERE UPPER(ticker) = ?
        AND (form LIKE '424B%' OR form LIKE 'S-1%' OR form LIKE 'S-3%'
             OR form LIKE 'EX-5%' OR form LIKE 'EX-10%' OR form = '8-K')
      ORDER BY filed_on DESC LIMIT ?`).bind(tk, n).all();

  const jobs = r.results || [];
  if (!jobs.length) return { ok:true, build: BUILD, ticker: tk, read: 0,
    note:"No offering documents held for that company." };

  const found = {};
  const errs = [];
  for (const j of jobs) {
    const doc = await grabText(j.cik, j.accession);
    if (!doc.ok) { errs.push({ accession: j.accession, why: doc.why }); await sleep(200); continue; }
    const lower = doc.text.toLowerCase();
    for (const [role, name, spellings] of FIRMS) {
      if (!spellings.some(x => lower.indexOf(x) > -1)) continue;
      const k = role + "|" + name;
      const had = found[k];
      if (had) {
        had.times++;
        if (j.filed_on > had.last_seen) {
          had.last_seen = j.filed_on; had.acc = j.accession; had.form = j.form;
        }
        if (j.filed_on < had.first_seen) had.first_seen = j.filed_on;
      } else {
        found[k] = { role, name, times: 1, first_seen: j.filed_on,
                     last_seen: j.filed_on, acc: j.accession, form: j.form };
      }
    }
    await sleep(200);
  }

  const cik = String(jobs[0].cik || "").replace(/\D/g, "");
  let saved = 0;
  for (const k of Object.keys(found)) {
    const f = found[k];
    await env.OVERHANG.prepare(
      `INSERT INTO filing_firms (cik, firm, role, times, first_seen, last_seen,
         last_accession, last_form)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(cik, firm, role) DO UPDATE SET
         times = excluded.times,
         first_seen = MIN(first_seen, excluded.first_seen),
         last_seen = MAX(last_seen, excluded.last_seen),
         last_accession = excluded.last_accession,
         last_form = excluded.last_form`)
      .bind(cik, f.name, f.role, f.times, f.first_seen, f.last_seen,
            f.acc, f.form).run();
    saved++;
  }

  return { ok:true, build: BUILD, ticker: tk, cik,
    documents_read: jobs.length - errs.length,
    firms_found: saved,
    firms: Object.values(found).map(f => ({
      role: f.role, firm: f.name, in_documents: f.times,
      first: f.first_seen, last: f.last_seen, from: f.acc })),
    /* ⚠ A DOCUMENT THAT COULD NOT BE READ IS REPORTED. Silence would look like
       a company that hired nobody. */
    could_not_read: errs,
    note: errs.length
      ? "Some documents could not be read, so this UNDER-REPORTS. Run it again."
      : "Every document in the window was read.",
    the_limit:
      "Firms are matched against a published list. A firm that is not on the " +
      "list is MISSED, never guessed at — a wrong name published is worse than " +
      "a missing one, and a missing one is fixed by adding a line." };
}

/* the whole filing as text, biggest document first */
async function grabText(cik, accession) {
  const bare = String(accession || "").replace(/-/g, "");
  const c = String(cik || "").replace(/\D/g, "");
  const base = "https://www.sec.gov/Archives/edgar/data/" + c + "/" + bare;
  try {
    const idx = await fetch(base + "/index.json", { headers: { "User-Agent": CONTACT } });
    if (!idx.ok) return { ok:false, why: "EDGAR " + idx.status };
    const j = await idx.json();
    const items = ((j.directory && j.directory.item) || [])
      .filter(x => /\.(htm|html|txt)$/i.test(x.name || ""))
      .filter(x => !/-index|R\d+\.htm|FilingSummary/i.test(x.name || ""))
      .map(x => ({ name: x.name, size: Number(x.size) || 0 }))
      .sort((a, b) => b.size - a.size);
    if (!items.length) return { ok:false, why: "nothing readable" };

    /* ⚠ THE COVER PAGE IS AT THE FRONT OF THE BIGGEST DOCUMENT, and counsel is
       on it. Reading only an exhibit would find the opinion and miss the
       agent. */
    const res = await fetch(base + "/" + items[0].name, { headers: { "User-Agent": CONTACT } });
    if (!res.ok) return { ok:false, why: "EDGAR " + res.status };
    const html = await res.text();
    return { ok:true, text: html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
                                .replace(/\s+/g, " ") };
  } catch (e) { return { ok:false, why: String(e).slice(0, 90) }; }
}

/* ============================================================
   WHO IS INVOLVED
   ============================================================ */
async function people(env, ticker, origin) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };

  const co = await env.OVERHANG.prepare(
    "SELECT cik, title FROM cik_tickers WHERE UPPER(ticker) = ? LIMIT 1").bind(tk).first();
  const cik = co ? String(co.cik).replace(/\D/g, "") : "";

  let ins = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT * FROM insiders WHERE CAST(cik AS INTEGER) = CAST(? AS INTEGER)
        ORDER BY is_officer DESC, last_seen DESC`).bind(cik).all();
    ins = r.results || [];
  } catch (e) {}

  /* ⚠ STALE IS MARKED, NOT HIDDEN. Two years without a Form 4 usually means
     the person has gone, and presenting him as current would be wrong. */
  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  /* which people we hold a photograph of — asked once, not once per person */
  let pics = {};
  try {
    const r = await env.OVERHANG.prepare("SELECT id FROM person_photos").all();
    for (const x of (r.results || [])) pics[x.id] = 1;
  } catch (e) {}
  const picFor = x => {
    /* ⚠ THE CIK IS STORED WITHOUT ITS LEADING ZEROS (photoId strips them);
       Form 4 carries it padded to ten. Strip here too or no face ever matches. */
    const id = String(x.person_cik || "").replace(/\D/g, "").replace(/^0+/, "") || slug(x.name);
    return pics[id] ? ((origin || "") + "/?photo=" + encodeURIComponent(id)) : null;
  };

  const shape = x => ({
    name: x.name, title: x.title || null,
    photo: picFor(x),
    officer: !!x.is_officer, director: !!x.is_director,
    ten_percent_holder: !!x.is_ten_pct,
    filings: x.filings, first_filed: x.first_seen, last_filed: x.last_seen,
    still_filing: x.last_seen >= twoYearsAgo,
    note: x.last_seen < twoYearsAgo
      ? "No Form 4 since " + x.last_seen + " — may no longer be in post."
      : undefined
  });

  const officers  = ins.filter(x => x.is_officer).map(shape);
  const directors = ins.filter(x => !x.is_officer && x.is_director).map(shape);
  const holders   = ins.filter(x => !x.is_officer && !x.is_director && x.is_ten_pct).map(shape);

  /* ⚠ READ OUT OF THE FILINGS NOW, NOT OUT OF A TABLE SOMEBODY TYPED. The
     hand-built parties table had nothing for TOVX and the report showed no
     counsel at all — on a company whose prospectus cover says Blank Rome. */
  let firms = [];
  let firmsNote = null;
  try {
    const f = await env.OVERHANG.prepare(
      `SELECT firm, role, times, first_seen, last_seen, last_accession, last_form
         FROM filing_firms
        WHERE CAST(cik AS INTEGER) = CAST(? AS INTEGER)
        ORDER BY CASE role WHEN 'counsel' THEN 1 WHEN 'agent' THEN 2
                           WHEN 'buyer' THEN 3 ELSE 4 END, times DESC`)
      .bind(cik).all();
    firms = (f.results || []).map(x => ({
      name: x.firm, role: x.role, appearances: x.times,
      since: x.first_seen, last: x.last_seen,
      /* one click to the document the name was found in */
      seen_in: x.last_form,
      accession: x.last_accession }));
  } catch (e) { firmsNote = "the firms table could not be read"; }

  return { ok:true, build: BUILD,
    ticker: tk, cik, company: co ? co.title : null,

    /* his order: the people first */
    officers, directors, ten_percent_holders: holders,

    firms,
    firms_warning:
      "Read out of the company's own filings and matched against a published " +
      "list of firms. There is no tag for counsel or for a placement agent, so " +
      "a firm that is not on the list is MISSED rather than guessed at \u2014 a " +
      "firm absent from this list is NOT a firm that did no work." +
      (firmsNote ? " " + firmsNote : ""),

    where_the_names_come_from:
      "Officers and directors are taken from Form 4, the insider filing — the " +
      "name and the title the company itself tagged. A Form 4 says who FILED, " +
      "not who is in post today, so anyone without a recent one is marked.",

    not_an_accusation:
      "A list of who filed what. Being named here is not an allegation of " +
      "anything, and nothing here says any person did anything wrong.",

    method: "/?method=1" };
}

async function stats(env) {
  const a = await env.OVERHANG.prepare(
    "SELECT COUNT(*) people, COUNT(DISTINCT cik) companies FROM insiders").first();
  return { ok:true, build: BUILD, held: a };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}


/* ============================================================================
   THE PHOTOGRAPHS
   ============================================================================ */

/* ⚠ EIGHT MEGABYTES, BECAUSE THESE ARE ALSO THE TRADING CARDS. The first
   version allowed one, which is right for a headshot on a web page and wrong
   for everything he will actually bring back — a phone photograph from a
   conference is four to twelve megabytes and would have been refused.

   ⚠ AND THE ORIGINAL BYTES ARE KEPT UNTOUCHED. Nothing here resizes or
   recompresses, so what goes in is what comes out. A card at two and a half
   by three and a half inches wants about 750 by 1050 pixels at 300 dots per
   inch; a 200-pixel picture off a website looks fine on the page and falls
   apart on card stock, and nobody finds out until the proof arrives. */
const PHOTO_MAX = 8 * 1024 * 1024;

/* ⚠ THE TYPE COMES FROM THE FILE, NOT THE UPLOAD, AND NEVER SVG. A caller
   controls the Content-Type header completely; he does not control the first
   bytes of what he sends. SVG is XML, XML carries script, and a browser runs
   it — it is the one image format that is also a program. */
function sniffImage(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { type:"image/jpeg", ext:"jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
    return { type:"image/png", ext:"png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { type:"image/webp", ext:"webp" };
  return null;
}

/* ⚠ THE ID IS OURS. A person CIK where there is one — it is the only thing
   about a person that never changes — otherwise a slug of the name. Never a
   filename: "../../x" must not be able to decide where anything lands. */
function slug(n) {
  return String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 60);
}
function photoId(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  /* a CIK if it looks like one, otherwise a slug of whatever was sent */
  if (digits.length >= 6 && digits.length === t.replace(/\s/g, "").length)
    return digits.replace(/^0+/, "") || null;
  return slug(t) || null;
}

async function putPhoto(env, q, req, origin) {
  if (!env.IMG) return { ok:false, build: BUILD,
    error:"no IMG binding — bind the R2 bucket people-photos as IMG" };
  if (req.method !== "POST" && req.method !== "PUT")
    return { ok:false, build: BUILD, error:"send the image as the body of a POST" };

  const id = photoId(q.get("id"));
  const name = (q.get("name") || "").trim();
  const source = (q.get("source") || "").trim();

  if (!id) return { ok:false, build: BUILD,
    error:"an id, please — the person's CIK if you have it, otherwise their name" };

  /* ⚠ REFUSED WITHOUT A SOURCE, AND THAT IS THE POINT OF THE FIELD. A face on
     a page about a company's filings will be asked about. The answer has to
     be recorded at the moment of upload, not remembered later. */
  if (source.length < 4) return { ok:false, build: BUILD,
    error:"a source, please — where this picture came from",
    note:"For example: 'photographed by Mark Nejmeh, <conference>, <date>' " +
         "\u2014 which is the strongest one there is, because it is his own " +
         "picture and nobody can withdraw it. Or the 2026 proxy statement, or " +
         "the company's own site on a given date. A photograph of a named " +
         "person with no recorded source is not published here." };

  const bytes = await req.arrayBuffer();
  if (!bytes || !bytes.byteLength) return { ok:false, build: BUILD, error:"nothing was sent" };
  if (bytes.byteLength > PHOTO_MAX)
    return { ok:false, build: BUILD, error:"too large",
      sent: bytes.byteLength, limit: PHOTO_MAX,
      note:"Eight megabytes. If a photograph you took yourself is bigger than " +
           "that, say so rather than shrinking it \u2014 the cards need the " +
           "resolution and the limit is ours to change." };

  const kind = sniffImage(bytes);
  if (!kind) return { ok:false, build: BUILD,
    error:"that is not a JPEG, a PNG or a WebP",
    note:"SVG is refused on purpose: it is XML, XML can carry script, and a " +
         "browser runs it. Send a JPEG." };

  const key = "person/" + id + "." + kind.ext;

  const had = await env.OVERHANG.prepare(
    "SELECT key FROM person_photos WHERE id = ?").bind(id).first();
  if (had && had.key && had.key !== key) {
    try { await env.IMG.delete(had.key); } catch (e) {}
  }

  await env.IMG.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=86400" },
    customMetadata: { id } });

  await env.OVERHANG.prepare(
    `INSERT INTO person_photos (id, name, key, content_type, bytes, source)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, key=excluded.key,
       content_type=excluded.content_type, bytes=excluded.bytes,
       source=excluded.source, added=datetime('now')`)
    .bind(id, name || null, key, kind.type, bytes.byteLength, source).run();

  return { ok:true, build: BUILD, id, key, name: name || null, source,
    type: kind.type, bytes: bytes.byteLength,
    shows_at: (origin || "") + "/?photo=" + encodeURIComponent(id),
    /* ⚠ SAID ON EVERY UPLOAD BECAUSE IT IS EASY TO FORGET AND IMPOSSIBLE TO
       UNDO. A photograph off a phone usually carries EXIF, and EXIF usually
       carries the place it was taken. This worker cannot strip it. On a
       picture taken at a conference that is the conference; on one taken at
       home it is home. */
    careful: "This file is stored exactly as sent. A photograph from a phone " +
             "normally carries EXIF, and EXIF normally carries GPS. Nothing " +
             "here removes it.",
    /* enough to judge whether it will hold up in print */
    print_note: bytes.byteLength < 250 * 1024
      ? "\u26a0 Under 250KB. Fine on a page. Probably too small for a card at " +
        "300 dots per inch \u2014 check before it goes to print."
      : "Large enough to be worth checking for a card." };
}

async function servePhoto(env, id) {
  const H = { "Access-Control-Allow-Origin":"*" };
  if (!env.IMG) return new Response("no image store", { status:500, headers:H });
  const want = photoId(id);
  const row = want ? await env.OVERHANG.prepare(
    "SELECT key FROM person_photos WHERE id = ?").bind(want).first() : null;
  if (!row || !row.key) return new Response("no photo", { status:404, headers:H });

  const obj = await env.IMG.get(row.key);
  if (!obj) return new Response("no photo", { status:404, headers:H });

  const h = new Headers(H);
  /* the type is set from the key we chose, and nosniff stops a browser
     deciding for itself that a file is something else */
  h.set("content-type", row.key.endsWith(".png") ? "image/png"
                       : row.key.endsWith(".webp") ? "image/webp" : "image/jpeg");
  h.set("x-content-type-options", "nosniff");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "public, max-age=86400");
  h.set("content-disposition", "inline");
  return new Response(obj.body, { headers: h });
}

async function dropPhoto(env, id) {
  const want = photoId(id);
  if (!want) return { ok:false, error:"which one?" };
  const row = await env.OVERHANG.prepare(
    "SELECT key FROM person_photos WHERE id = ?").bind(want).first();
  if (!row) return { ok:false, error:"no such photo" };
  try { if (env.IMG) await env.IMG.delete(row.key); } catch (e) {}
  await env.OVERHANG.prepare("DELETE FROM person_photos WHERE id = ?").bind(want).run();
  return { ok:true, build: BUILD, removed: want };
}

/* ⚠ THE SOURCE IS PUBLISHED WITH THE LIST. Where a face came from is not a
   private note; it is the answer to the question the picture invites. */
async function heldPhotos(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id, name, source, bytes, added FROM person_photos ORDER BY name").all();
  return { ok:true, build: BUILD, photos: r.results || [],
    shows_at: "/?photo=<id>",
    note:"Every photograph carries the source it came from. One without a " +
         "source is not stored." };
}


/* ============================================================================
   ACROSS EVERY COMPANY

   ⚠ THIS IS THE POINT OF THE WHOLE THING. One law firm on one filing is a fact
   about that filing. THE SAME FIRM ON SEVEN ISSUERS' PAPER IS A FINDING, and
   it cannot be seen one company at a time — which is exactly how the site has
   been reading them.

   ⚠ AND IT IS A COUNT, NOT AN ACCUSATION. A firm that appears on many deals
   may simply be the firm this kind of company hires. The number is the
   finding. Why is not, and this worker never says why.
   ============================================================================ */

async function sweep(env, companies, each) {
  companies = Math.max(1, Math.min(25, companies || 5));
  each = Math.max(1, Math.min(20, each || 8));

  /* ⚠ COMPANIES NOT YET SCANNED, NEWEST PAPER FIRST. A sweep that starts at
     the alphabet spends its first hour on shells nobody asked about. */
  const r = await env.OVERHANG.prepare(
    `SELECT f.ticker, MAX(f.filed_on) latest
       FROM v_wire_filings f
       LEFT JOIN filing_firms g ON CAST(g.cik AS INTEGER) = CAST(f.cik AS INTEGER)
      WHERE f.ticker IS NOT NULL AND f.ticker <> '' AND g.cik IS NULL
        AND (f.form LIKE '424B%' OR f.form LIKE 'S-1%' OR f.form LIKE 'S-3%')
      GROUP BY f.ticker ORDER BY latest DESC LIMIT ?`).bind(companies).all();

  const todo = r.results || [];
  if (!todo.length) return { ok:true, build: BUILD, done: 0,
    note:"Every company with offering paper has been swept at least once." };

  const out = [];
  for (const c of todo) {
    const one = await scanFirms(env, c.ticker, each);
    out.push({ ticker: c.ticker,
      documents: one.documents_read || 0,
      firms: one.firms_found || 0,
      error: one.error || undefined });
  }
  return { ok:true, build: BUILD, swept: out.length, companies: out,
    note:"Run it again to take the next few. Nothing is scanned twice." };
}

/* ⚠ HOW FAR THROUGH IT IS, so a table can say what it covers rather than
   implying it covers everything. A league table over a tenth of the market
   presented as the market is the easiest lie to tell by accident. */
async function swept(env) {
  const a = await env.OVERHANG.prepare(
    `SELECT COUNT(DISTINCT ticker) n FROM v_wire_filings
      WHERE ticker IS NOT NULL AND ticker <> ''
        AND (form LIKE '424B%' OR form LIKE 'S-1%' OR form LIKE 'S-3%')`).first();
  const b = await env.OVERHANG.prepare(
    "SELECT COUNT(DISTINCT cik) n FROM filing_firms").first();
  const done = Number(b && b.n) || 0, all = Number(a && a.n) || 0;
  return { ok:true, build: BUILD,
    companies_with_offering_paper: all,
    companies_swept: done,
    per_cent: all ? +((done / all) * 100).toFixed(1) : 0,
    note: done < all
      ? "⚠ THIS IS " + (all ? Math.round((done/all)*100) : 0) + "% OF THE " +
        "COMPANIES WITH OFFERING PAPER. Any count taken from it is a count of " +
        "what has been read, not of the market."
      : "Every company with offering paper has been read." };
}

/* the league table */
async function across(env, role) {
  const want = String(role || "").toLowerCase().trim();
  const ok = ["counsel","agent","buyer"].indexOf(want) > -1 ? want : null;

  let sql = `SELECT firm, role,
                    COUNT(DISTINCT cik) companies,
                    SUM(times) filings,
                    MIN(first_seen) first_seen, MAX(last_seen) last_seen
               FROM filing_firms`;
  const b = [];
  if (ok) { sql += " WHERE role = ?"; b.push(ok); }
  sql += " GROUP BY firm, role ORDER BY companies DESC, filings DESC LIMIT 200";

  const st = env.OVERHANG.prepare(sql);
  const r = await (b.length ? st.bind(...b) : st).all();

  const cover = await swept(env);
  return { ok:true, build: BUILD,
    role: ok || "all",
    rows: r.results || [],
    coverage: { companies_swept: cover.companies_swept,
                of: cover.companies_with_offering_paper,
                per_cent: cover.per_cent },
    what_it_is:
      "How many DIFFERENT companies' offering documents each firm is named in, " +
      "read out of the filings themselves.",
    not_an_accusation:
      "A count of appearances. A firm that appears on many deals may simply be " +
      "the firm this kind of company hires. The count is the finding; why is " +
      "not measured here and is never asserted.",
    the_limit: cover.note };
}

/* one firm, and every company it appears on */
async function oneFirm(env, name) {
  const n = String(name || "").trim();
  if (!n) return { ok:false, build: BUILD, error:"which firm?" };

  const r = await env.OVERHANG.prepare(
    `SELECT g.cik, g.role, g.times, g.first_seen, g.last_seen,
            g.last_accession, g.last_form,
            (SELECT ticker FROM cik_tickers t
              WHERE CAST(t.cik AS INTEGER) = CAST(g.cik AS INTEGER) LIMIT 1) ticker,
            (SELECT title FROM cik_tickers t
              WHERE CAST(t.cik AS INTEGER) = CAST(g.cik AS INTEGER) LIMIT 1) company
       FROM filing_firms g
      WHERE LOWER(g.firm) = LOWER(?)
      ORDER BY g.last_seen DESC LIMIT 300`).bind(n).all();

  const rows = r.results || [];
  return { ok:true, build: BUILD, firm: n,
    companies: rows.length,
    roles: [...new Set(rows.map(x => x.role))],
    rows,
    not_an_accusation:
      "A list of companies whose filings name this firm. Nothing here says " +
      "this firm or any person did anything wrong." };
}