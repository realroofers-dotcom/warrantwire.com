/* ============================================================================
   NUJOBI  —  Cloudflare Worker  ·  worker name: nujobi
   The marketplace underneath all of it. One seller register, one verification,
   one payout path.

   Built 2026-09-10 · nujobi-1c — profiles, reviews, and the photo

   ----------------------------------------------------------------------------
   ⚠ ONE ENGINE, THREE SHOPFRONTS. His observation, 10 Sep 2026: the reader
   marketplace and Nujobi are the same thing. They are — a verified person
   sells work he wrote, sets his own price, is paid straight to his bank, and
   carries a public record. Only the goods differ:

       kind = read      a filing put into plain English      wire · 8k10q
       kind = opinion   what a named person makes of it      wire · 8k10q
       kind = story     a piece of journalism                nujobi

   Built as one marketplace, this is a `kind` column. Built twice, it is two
   verification systems, two payout paths, and one person registered twice.

   ----------------------------------------------------------------------------
   ⚠ TWO DIRECTIONS OF TRADE, AND THEY ARE NOT THE SAME SHAPE.

     COMMISSIONED  a buyer names a filing and asks    request → bids → work → pay
     ALREADY MADE  a story exists and is offered      listing → buy

   A read is nearly always the first. A story is nearly always the second. The
   tables carry both because a reader may also publish something nobody asked
   for, and a journalist may be commissioned.

   ----------------------------------------------------------------------------
   ⚠ NOBODY IS ANONYMOUS. His rule, and it is enforced here rather than only
   written on a page: a full name of at least two parts, an email and a
   telephone number, or the application is refused. Nothing a seller writes is
   published before a person has verified them.

   ⚠ AND NO BANK DETAILS LIVE HERE. Payment to sellers is by ACHplug. This
   worker records THAT a seller can be paid, never HOW — no routing number, no
   account number, not in a column and not in a note. That data belongs in one
   place and this is not it.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              IMG        R2 bucket → gig-worker-photo
   SECRETS    LOG_KEY

   ----------------------------------------------------------------------------
   ⚠ THE PHOTO IS THE ONE THING ON THIS SITE A STRANGER SUPPLIES AND EVERYONE
   ELSE LOOKS AT. So:

     · only a VERIFIED seller with a token may upload, and only his own —
       a public upload address is free image hosting for whoever finds it
     · the type is read from the FILE'S OWN FIRST BYTES, never from what the
       upload claims it is. A .jpg header on an HTML file is the oldest trick
       there is, and a browser that sniffs it renders the HTML
     · two megabytes, refused above it
     · THE KEY IS BUILT FROM THE SELLER ID, never from the filename. A name
       like "../../x" or one carrying a second extension must not be able to
       decide where anything lands
     · served back through this worker with a fixed content type and
       nosniff, so the bucket stays private and the browser cannot be
       persuaded to treat a photo as anything else

   ⚠ ONE THING THIS CANNOT DO, and it is worth knowing: a photo out of a phone
   often carries EXIF, and EXIF often carries GPS. Stripping it needs an image
   library this worker does not have. Until then a seller uploading a picture
   taken at home is publishing where home is. Say so where they upload.

   PUBLIC — no key
     ?sellers=1[&site=&kind=]     the verified roster
     ?listings=1[&site=&kind=]    what is for sale
     ?action=join                 apply to sell        (name, email, phone…)
     ?action=request              ask for a piece of work
     ?request=<id>                one request and its bids

   SELLER — needs the token issued at verification
     ?action=bid&token=…          bid on a request
     ?action=offer&token=…        list something already written
     ?action=me&token=…           what is mine

   PRIVATE — needs LOG_KEY
     ?action=applications         who has applied
     ?action=verify&id=…          verify one, and issue their token
     ?action=refuse&id=…
     ?action=requests             every request
     ?action=stats
   ========================================================================== */

const BUILD = "nujobi-1c · 2026-09-10 08:50 ET";

/* what may be sold, and where it may be sold */
const KINDS = ["read", "opinion", "story"];
const SITES = ["wire", "k8", "nujobi"];

/* ⚠ THE FLAT FEE, IN ONE PLACE. Not a percentage — his rule — so the better a
   seller is paid the smaller the share it takes. Stored in cents against each
   sale so a later change never rewrites history. */
const FEE_CENTS = {
  text:  2500,   /* the written work alone */
  voice: 5000,   /* written, plus a machine voice reading it */
  own:   7500    /* written, plus the seller's own recording */
};

export default {
  async fetch(req, env) {
    const u = new URL(req.url), q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      /* ---- public ---- */
      /* ⚠ THE ACTION IS READ FIRST, ALWAYS, AND EVERY BARE LOOKUP IS GUARDED
         BY IT. This bit the build twice. `?action=bid&request=1` was answered
         by the public request listing; then `?action=rate&seller=1` was
         answered by the public profile. Neither errored — the bid and the
         review simply never happened, and the caller got something back that
         looked like success.

         THE RULE: a parameter that names a thing (seller, request) is a lookup
         only when there is no action beside it. Anything added below follows
         it. */
      const a = q.get("action") || "";

      if (!a) {
        /* the photo is a file, not JSON, so it answers before anything else */
        if (q.get("photo")) return await servePhoto(env, q.get("photo"));
        if (q.get("seller"))  return json(await profile(env, q.get("seller"), u.origin), H);
        if (q.get("request")) return json(await oneRequest(env, q.get("request")), H);
      }
      if (q.get("sellers"))  return json(await roster(env, q, u.origin), H);
      if (q.get("listings")) return json(await listings(env, q), H);
      if (a === "join")    return json(await join(env, q), H);
      if (a === "rate")    return json(await rate(env, q), H);
      if (a === "request") return json(await makeRequest(env, q), H);

      /* ---- seller, by token ---- */
      if (a === "bid" || a === "offer" || a === "me" || a === "photo") {
        const me = await bySeller(env, q.get("token"));
        if (!me) return json({ ok:false, error:"not a verified seller" }, H, 401);
        if (a === "bid")   return json(await bid(env, me, q), H);
        if (a === "offer") return json(await offer(env, me, q), H);
        if (a === "photo") return json(await putPhoto(env, me, req, u.origin), H);
        return json(await mine(env, me), H);
      }

      /* ---- owner ---- */
      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      if (a === "applications") return json(await applications(env), H);
      if (a === "verify")       return json(await verify(env, q.get("id")), H);
      if (a === "refuse")       return json(await refuse(env, q.get("id"), q.get("why")), H);
      if (a === "requests")     return json(await allRequests(env), H);
      return json(await stats(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  /* ⚠ NO BANK COLUMNS ANYWHERE IN THIS SCHEMA. `us_bank` records that a seller
     CAN be paid. How is ACHplug's business and lives there. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS mk_sellers (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL, sort TEXT,
       email TEXT NOT NULL, phone TEXT NOT NULL,
       org TEXT, credential TEXT, about TEXT, seen TEXT,
       kinds TEXT, price_cents INTEGER,
       /* the profile a buyer reads before he spends anything */
       photo TEXT, photo_key TEXT, education TEXT, twitter TEXT, linkedin TEXT,
       covers TEXT, since_year INTEGER,
       /* ⚠ HELD, NOT PUBLISHED. Age tells a buyer nothing he can use and is
          the first thing that gets used against a young journalist — who is
          exactly the person this is meant to bring in. What a buyer judges on
          is since_year: how long the seller has been doing this. Publishing
          born_year is a one-line change if he wants it. */
       born_year INTEGER,
       us_bank INTEGER DEFAULT 0,
       state TEXT DEFAULT 'applied',
       token TEXT, why TEXT,
       applied TEXT DEFAULT (datetime('now')), verified TEXT)`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS mk_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       site TEXT, kind TEXT,
       subject TEXT NOT NULL, ticker TEXT, accession TEXT,
       buyer_email TEXT NOT NULL, note TEXT,
       state TEXT DEFAULT 'open',
       made TEXT DEFAULT (datetime('now')))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS mk_bids (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       request_id INTEGER, seller_id INTEGER,
       cents INTEGER, delivery TEXT, note TEXT,
       state TEXT DEFAULT 'open',
       made TEXT DEFAULT (datetime('now')))`).run();

  /* the column is added to a table that already exists, once, quietly */
  try { await env.OVERHANG.prepare(
    "ALTER TABLE mk_sellers ADD COLUMN photo_key TEXT").run(); } catch (e) {}

  /* ⚠ ONE RATING PER BUYER PER JOB, AND IT PUBLISHES AS WRITTEN. Nobody —
     not the seller, not the house — can take one down. A marketplace where
     the owner also sells is exactly where that would be noticed first. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS mk_ratings (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       seller_id INTEGER NOT NULL,
       ref TEXT NOT NULL,
       buyer_name TEXT NOT NULL, buyer_email TEXT NOT NULL,
       stars INTEGER NOT NULL, words TEXT,
       made TEXT DEFAULT (datetime('now')),
       UNIQUE (ref, buyer_email))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS mk_listings (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       seller_id INTEGER, site TEXT, kind TEXT,
       title TEXT NOT NULL, blurb TEXT,
       ticker TEXT, accession TEXT,
       cents INTEGER, delivery TEXT,
       state TEXT DEFAULT 'live',
       made TEXT DEFAULT (datetime('now')))`).run();
}

/* ============================================================
   APPLYING TO SELL

   ⚠ REFUSED IF ANYTHING IS MISSING. A marketplace that accepts a
   half-filled application ends up with a roster nobody can be
   paid from and names nobody can check.
   ============================================================ */
async function join(env, q) {
  const name  = clean(q.get("name"));
  const email = clean(q.get("email")).toLowerCase();
  const phone = clean(q.get("phone"));

  const missing = [];
  /* ⚠ TWO PARTS TO A NAME. "Mark" is not a real name for this purpose and
     neither is a handle. This is the rule that keeps the roster worth having. */
  if (!name || name.split(/\s+/).length < 2) missing.push("a full name, first and last");
  if (!email || email.indexOf("@") < 1) missing.push("an email address");
  if (!phone || phone.replace(/\D/g, "").length < 7) missing.push("a telephone number");

  const kinds = (q.get("kinds") || "")
    .split(",").map(x => clean(x).toLowerCase())
    .filter(x => KINDS.indexOf(x) > -1);
  if (!kinds.length) missing.push("what you want to sell (read, opinion or story)");

  if (missing.length)
    return { ok:false, build: BUILD, error:"application incomplete", missing,
      note:"Nobody sells here anonymously. A real name, a real email and a real " +
           "telephone number, or there is nothing to verify." };

  const had = await env.OVERHANG.prepare(
    "SELECT id, state FROM mk_sellers WHERE email = ?").bind(email).first();
  if (had) return { ok:true, build: BUILD, already:true, id: had.id, state: had.state,
    note:"That address has already applied. Nothing was changed." };

  const r = await env.OVERHANG.prepare(
    `INSERT INTO mk_sellers (name, sort, email, phone, org, credential, about,
       seen, kinds, price_cents, photo, education, twitter, linkedin, covers,
       since_year, born_year, us_bank)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(name, surnameOf(name), email, phone,
          clean(q.get("org")) || null,
          clean(q.get("credential")) || null,
          /* ⚠ THE ABOUT IS SHORT ON PURPOSE. A profile a buyer reads in four
             seconds is worth more to the seller than a page nobody finishes. */
          shorten(q.get("about"), 320) || null,
          clean(q.get("seen")) || null,
          kinds.join(","),
          cents(q.get("price")),
          url(q.get("photo")),
          shorten(q.get("education"), 160) || null,
          handle(q.get("twitter")),
          url(q.get("linkedin"), "linkedin.com"),
          shorten(q.get("covers"), 200) || null,
          year(q.get("since")),
          year(q.get("born")),
          /^(1|y|yes|true)$/i.test(q.get("bank") || "") ? 1 : 0).run();

  return { ok:true, build: BUILD,
    id: (r && r.meta && r.meta.last_row_id) || (r && r.lastInsertRowid) || null,
    state:"applied",
    note:"Applied. Nothing publishes until a person has verified you." };
}

async function applications(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT id, name, email, phone, org, credential, kinds, price_cents,
            us_bank, state, applied FROM mk_sellers
      WHERE state = 'applied' ORDER BY applied`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

/* ⚠ THE TOKEN IS ISSUED HERE AND NOWHERE ELSE. It is what lets a seller bid
   and list; a seller who has not been verified by a person has none, and
   therefore cannot do either. */
async function verify(env, id) {
  if (!id) return { ok:false, error:"which application?" };
  const s = await env.OVERHANG.prepare(
    "SELECT * FROM mk_sellers WHERE id = ?").bind(id).first();
  if (!s) return { ok:false, error:"no such application" };
  if (s.token) return { ok:true, build: BUILD, already:true, id: s.id,
    name: s.name, token: s.token };

  const token = makeToken();
  await env.OVERHANG.prepare(
    "UPDATE mk_sellers SET state='verified', token=?, verified=datetime('now') " +
    "WHERE id = ?").bind(token, id).run();
  return { ok:true, build: BUILD, id: s.id, name: s.name, token,
    note:"Send this token to the seller. It is how they bid and list. It is " +
         "not a password and it is not recoverable — reissue by refusing and " +
         "verifying again." };
}

async function refuse(env, id, why) {
  if (!id) return { ok:false, error:"which application?" };
  await env.OVERHANG.prepare(
    "UPDATE mk_sellers SET state='refused', token=NULL, why=? WHERE id=?")
    .bind(clean(why) || null, id).run();
  return { ok:true, build: BUILD, id, state:"refused" };
}

/* ⚠ THE ROSTER IS VERIFIED SELLERS ONLY, AND CARRIES NO CONTACT DETAILS.
   His rule: the name is published, the telephone number is not. */
async function roster(env, q, origin) {
  const site = pick(q.get("site"), SITES);
  const kind = pick(q.get("kind"), KINDS);
  let sql = `SELECT id, name, org, credential, about, seen, kinds, price_cents,
                    photo, education, twitter, linkedin, covers, since_year,
                    verified,
                    (SELECT COUNT(*) FROM mk_ratings g WHERE g.seller_id = mk_sellers.id) reviews,
                    (SELECT ROUND(AVG(stars),1) FROM mk_ratings g WHERE g.seller_id = mk_sellers.id) stars
               FROM mk_sellers WHERE state = 'verified'`;
  const binds = [];
  if (kind) { sql += " AND (',' || kinds || ',') LIKE ?"; binds.push("%," + kind + ",%"); }
  /* ⚠ SURNAME ORDER, AND IT IS NOT NEGOTIABLE. The owner sells here too, so
     any ranked order is a lever the house controls. */
  sql += " ORDER BY sort, name";
  const st = env.OVERHANG.prepare(sql);
  const r = await (binds.length ? st.bind(...binds) : st).all();
  return { ok:true, build: BUILD, site: site || "all", kind: kind || "all",
    sellers: (r.results || []).map(x => pubSeller(x, origin)) };
}

/* ⚠ ONE PUBLIC SHAPE FOR A SELLER, USED BY BOTH THE ROSTER AND THE PROFILE.
   Two hand-written shapes is how a contact detail ends up published from one
   endpoint and not the other. Email and telephone are not in here, and this
   is the only place they could get out. */
function pubSeller(x, origin) {
  return {
    id: x.id, name: x.name, org: x.org || null,
    credential: x.credential || null,
    /* ⚠ A PHOTO WE HOLD BEATS A LINK SOMEBODY ELSE HOSTS. An address on a
       stranger's server can be swapped for anything after we have shown it. */
    photo: x.photo_key
             ? ((origin || "") + "/?photo=" + x.id)
             : (x.photo || null),
    about: x.about || null,
    education: x.education || null,
    twitter: x.twitter || null,
    linkedin: x.linkedin || null,
    covers: x.covers || null,
    reading_since: x.since_year || null,
    sells: String(x.kinds || "").split(",").filter(Boolean),
    price: x.price_cents ? money(x.price_cents) : null,
    /* ⚠ NO RATING IS INVENTED. A seller with no reviews shows none rather
       than a default of five stars or a hopeful zero. */
    reviews: Number(x.reviews) || 0,
    stars: (Number(x.reviews) || 0) ? Number(x.stars) : null,
    verified_on: x.verified || null
  };
}

/* the profile a buyer reads before he spends anything */
async function profile(env, id, origin) {
  const x = await env.OVERHANG.prepare(
    `SELECT *,
            (SELECT COUNT(*) FROM mk_ratings g WHERE g.seller_id = mk_sellers.id) reviews,
            (SELECT ROUND(AVG(stars),1) FROM mk_ratings g WHERE g.seller_id = mk_sellers.id) stars
       FROM mk_sellers WHERE id = ? AND state = 'verified'`).bind(id).first();
  if (!x) return { ok:false, error:"no such reader" };

  const r = await env.OVERHANG.prepare(
    `SELECT stars, words, buyer_name, made FROM mk_ratings
      WHERE seller_id = ? ORDER BY made DESC LIMIT 50`).bind(id).all();

  const l = await env.OVERHANG.prepare(
    `SELECT id, kind, title, blurb, ticker, cents, made FROM mk_listings
      WHERE seller_id = ? AND state = 'live' ORDER BY made DESC LIMIT 25`).bind(id).all();

  return { ok:true, build: BUILD,
    seller: pubSeller(x, origin),
    reviews: (r.results || []).map(v => ({
      stars: v.stars, said: v.words, by: v.buyer_name, on: v.made })),
    for_sale: (l.results || []).map(v => ({
      id: v.id, kind: v.kind, title: v.title, blurb: v.blurb,
      ticker: v.ticker, price: money(v.cents), made: v.made })) };
}

/* ============================================================
   A BUYER RATES A FINISHED JOB

   ⚠ IT PUBLISHES AS WRITTEN AND NOBODY CAN TAKE IT DOWN — not
   the seller and not the house. That is the whole value of it.
   The owner sells here too, so the day a rating can be removed
   is the day the list is worth nothing.

   ⚠ AND THE RATER IS NAMED. An anonymous review on a site whose
   rule is that nobody is anonymous would be the one hole in it.
   ============================================================ */
async function rate(env, q) {
  const seller = q.get("seller");
  const ref    = clean(q.get("ref"));
  const name   = clean(q.get("name"));
  const email  = clean(q.get("email")).toLowerCase();
  const stars  = Math.round(Number(q.get("stars")));

  const missing = [];
  if (!seller) missing.push("which reader");
  if (!ref)    missing.push("which job (the reference on your receipt)");
  if (!name || name.split(/\s+/).length < 2) missing.push("your full name");
  if (!email || email.indexOf("@") < 1) missing.push("your email address");
  if (!(stars >= 1 && stars <= 5)) missing.push("a rating from one to five");
  if (missing.length) return { ok:false, build: BUILD, error:"incomplete", missing };

  const s = await env.OVERHANG.prepare(
    "SELECT id FROM mk_sellers WHERE id = ? AND state = 'verified'").bind(seller).first();
  if (!s) return { ok:false, error:"no such reader" };

  try {
    await env.OVERHANG.prepare(
      `INSERT INTO mk_ratings (seller_id, ref, buyer_name, buyer_email, stars, words)
       VALUES (?,?,?,?,?,?)`)
      .bind(seller, ref, name, email, stars, shorten(q.get("words"), 600) || null).run();
  } catch (e) {
    /* the UNIQUE on (ref, buyer_email) is what stops one buyer rating the same
       job twice, and it is enforced by the database rather than by a check */
    return { ok:false, build: BUILD,
      error:"you have already rated that job",
      note:"A rating cannot be changed once it is published. That is what makes " +
           "the others worth reading." };
  }
  return { ok:true, build: BUILD, published:true,
    note:"Published as written. Nobody can remove it, including us." };
}

/* ============================================================
   A BUYER ASKS FOR SOMETHING
   ============================================================ */
async function makeRequest(env, q) {
  const subject = clean(q.get("subject"));
  const email   = clean(q.get("email")).toLowerCase();
  if (!subject) return { ok:false, error:"what do you want read or written?" };
  if (!email || email.indexOf("@") < 1)
    return { ok:false, error:"an email address, so the bids can reach you" };

  const kind = pick(q.get("kind"), KINDS) || "read";
  const site = pick(q.get("site"), SITES) || "wire";

  const r = await env.OVERHANG.prepare(
    `INSERT INTO mk_requests (site, kind, subject, ticker, accession, buyer_email, note)
     VALUES (?,?,?,?,?,?,?)`)
    .bind(site, kind, subject,
          (clean(q.get("ticker")) || "").toUpperCase() || null,
          clean(q.get("accession")) || null,
          email, clean(q.get("note")) || null).run();

  const id = (r && r.meta && r.meta.last_row_id) || (r && r.lastInsertRowid) || null;
  return { ok:true, build: BUILD, id, kind, site,
    note:"Open for bids. Nothing is owed and no bid has to be taken." };
}

async function oneRequest(env, id) {
  const q = await env.OVERHANG.prepare(
    "SELECT id, site, kind, subject, ticker, state, made FROM mk_requests WHERE id=?")
    .bind(id).first();
  if (!q) return { ok:false, error:"no such request" };
  /* ⚠ THE BUYER'S ADDRESS IS NEVER RETURNED HERE. This endpoint is public. */
  const b = await env.OVERHANG.prepare(
    `SELECT b.id, b.cents, b.delivery, b.note, b.made, s.name, s.credential
       FROM mk_bids b JOIN mk_sellers s ON s.id = b.seller_id
      WHERE b.request_id = ? AND b.state = 'open'
      ORDER BY b.cents`).bind(id).all();
  return { ok:true, build: BUILD, request: q,
    bids: (b.results || []).map(x => ({
      id: x.id, by: x.name, credential: x.credential,
      price: money(x.cents), delivery: x.delivery, note: x.note, made: x.made })) };
}

async function allRequests(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM mk_bids b WHERE b.request_id = r.id) bids
       FROM mk_requests r ORDER BY r.made DESC LIMIT 200`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

/* ============================================================
   A SELLER BIDS, OR LISTS SOMETHING ALREADY WRITTEN
   ============================================================ */
async function bySeller(env, token) {
  if (!token || String(token).length < 12) return null;
  return await env.OVERHANG.prepare(
    "SELECT * FROM mk_sellers WHERE token = ? AND state = 'verified'")
    .bind(token).first();
}

async function bid(env, me, q) {
  const rid = q.get("request");
  const amount = cents(q.get("price"));
  if (!rid) return { ok:false, error:"which request?" };
  if (!amount) return { ok:false, error:"what do you charge for it?" };

  const r = await env.OVERHANG.prepare(
    "SELECT id, kind, state FROM mk_requests WHERE id = ?").bind(rid).first();
  if (!r) return { ok:false, error:"no such request" };
  if (r.state !== "open") return { ok:false, error:"that request is closed" };

  /* ⚠ A SELLER MAY ONLY BID ON WHAT HE IS VERIFIED TO SELL. Somebody verified
     for stories has no business bidding on a filing read. */
  const kinds = String(me.kinds || "").split(",");
  if (kinds.indexOf(r.kind) < 0)
    return { ok:false, error:"you are not verified for " + r.kind };

  const delivery = pick(q.get("delivery"), ["text", "voice", "own"]) || "text";

  const had = await env.OVERHANG.prepare(
    "SELECT id FROM mk_bids WHERE request_id=? AND seller_id=? AND state='open'")
    .bind(rid, me.id).first();
  if (had) {
    await env.OVERHANG.prepare(
      "UPDATE mk_bids SET cents=?, delivery=?, note=?, made=datetime('now') WHERE id=?")
      .bind(amount, delivery, clean(q.get("note")) || null, had.id).run();
    return { ok:true, build: BUILD, id: had.id, replaced:true,
      price: money(amount), you_keep: money(amount - FEE_CENTS[delivery]) };
  }

  const ins = await env.OVERHANG.prepare(
    "INSERT INTO mk_bids (request_id, seller_id, cents, delivery, note) VALUES (?,?,?,?,?)")
    .bind(rid, me.id, amount, delivery, clean(q.get("note")) || null).run();
  return { ok:true, build: BUILD,
    id: (ins && ins.meta && ins.meta.last_row_id) || (ins && ins.lastInsertRowid) || null,
    price: money(amount), fee: money(FEE_CENTS[delivery]),
    you_keep: money(amount - FEE_CENTS[delivery]) };
}

async function offer(env, me, q) {
  const title = clean(q.get("title"));
  const amount = cents(q.get("price"));
  const kind = pick(q.get("kind"), KINDS);
  if (!title)  return { ok:false, error:"what is it called?" };
  if (!amount) return { ok:false, error:"what does it cost?" };
  if (!kind)   return { ok:false, error:"read, opinion or story?" };
  if (String(me.kinds || "").split(",").indexOf(kind) < 0)
    return { ok:false, error:"you are not verified for " + kind };

  const delivery = pick(q.get("delivery"), ["text", "voice", "own"]) || "text";
  const site = pick(q.get("site"), SITES) || (kind === "story" ? "nujobi" : "wire");

  const ins = await env.OVERHANG.prepare(
    `INSERT INTO mk_listings (seller_id, site, kind, title, blurb, ticker,
       accession, cents, delivery) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(me.id, site, kind, title, clean(q.get("blurb")) || null,
          (clean(q.get("ticker")) || "").toUpperCase() || null,
          clean(q.get("accession")) || null, amount, delivery).run();
  return { ok:true, build: BUILD,
    id: (ins && ins.meta && ins.meta.last_row_id) || (ins && ins.lastInsertRowid) || null,
    price: money(amount), fee: money(FEE_CENTS[delivery]),
    you_keep: money(amount - FEE_CENTS[delivery]) };
}

async function listings(env, q) {
  const site = pick(q.get("site"), SITES);
  const kind = pick(q.get("kind"), KINDS);
  let sql = `SELECT l.id, l.site, l.kind, l.title, l.blurb, l.ticker, l.cents,
                    l.delivery, l.made, s.name, s.credential
               FROM mk_listings l JOIN mk_sellers s ON s.id = l.seller_id
              WHERE l.state = 'live' AND s.state = 'verified'`;
  const binds = [];
  if (site) { sql += " AND l.site = ?"; binds.push(site); }
  if (kind) { sql += " AND l.kind = ?"; binds.push(kind); }
  sql += " ORDER BY l.made DESC LIMIT 100";
  const st = env.OVERHANG.prepare(sql);
  const r = await (binds.length ? st.bind(...binds) : st).all();
  return { ok:true, build: BUILD,
    listings: (r.results || []).map(x => ({
      id: x.id, site: x.site, kind: x.kind, title: x.title, blurb: x.blurb,
      ticker: x.ticker, price: money(x.cents), delivery: x.delivery,
      by: x.name, credential: x.credential, made: x.made })) };
}

async function mine(env, me) {
  const b = await env.OVERHANG.prepare(
    `SELECT b.id, b.cents, b.state, b.made, r.subject, r.kind
       FROM mk_bids b JOIN mk_requests r ON r.id = b.request_id
      WHERE b.seller_id = ? ORDER BY b.made DESC LIMIT 50`).bind(me.id).all();
  const l = await env.OVERHANG.prepare(
    "SELECT id, kind, title, cents, state, made FROM mk_listings " +
    "WHERE seller_id = ? ORDER BY made DESC LIMIT 50").bind(me.id).all();
  return { ok:true, build: BUILD,
    you: { name: me.name, sells: String(me.kinds || "").split(",").filter(Boolean),
           since: me.verified },
    bids: b.results || [], listings: l.results || [] };
}

async function stats(env) {
  const one = async (label, sql) => {
    try { return (await env.OVERHANG.prepare(sql).first()) || {}; }
    catch (e) { return { failed: label }; }
  };
  return { ok:true, build: BUILD,
    sellers:  await one("sellers",
      "SELECT COUNT(*) all_of_them, " +
      "SUM(CASE WHEN state='verified' THEN 1 ELSE 0 END) verified, " +
      "SUM(CASE WHEN state='applied' THEN 1 ELSE 0 END) waiting FROM mk_sellers"),
    requests: await one("requests",
      "SELECT COUNT(*) all_of_them, " +
      "SUM(CASE WHEN state='open' THEN 1 ELSE 0 END) open FROM mk_requests"),
    bids:     await one("bids", "SELECT COUNT(*) all_of_them FROM mk_bids"),
    listings: await one("listings",
      "SELECT COUNT(*) all_of_them, " +
      "SUM(CASE WHEN state='live' THEN 1 ELSE 0 END) live FROM mk_listings"),
    fee: { text: money(FEE_CENTS.text), voice: money(FEE_CENTS.voice),
           own: money(FEE_CENTS.own) } };
}

/* ---------- small tools ---------- */
function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
function shorten(v, n) {
  const t = clean(v);
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s\S*$/, "") + "\u2026";
}
/* ⚠ ONLY http AND https, AND NOTHING ELSE. A profile field that a stranger
   fills in and a buyer clicks is the one place a javascript: address would
   reach a reader. Anything that is not a plain web address is dropped. */
function url(v, mustContain) {
  const t = clean(v);
  if (!/^https?:\/\//i.test(t)) return null;
  if (t.length > 300) return null;
  if (mustContain && t.toLowerCase().indexOf(mustContain) < 0) return null;
  return t;
}
/* a handle, however they wrote it — @name, x.com/name, twitter.com/name */
function handle(v) {
  const t = clean(v).replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "")
                    .replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(t) ? t : null;
}
function year(v) {
  const n = Math.round(Number(String(v == null ? "" : v).replace(/\D/g, "")));
  /* a year that cannot be true is not stored — 19 or 2099 is a typo */
  return (n >= 1900 && n <= 2100) ? n : null;
}
function pick(v, allowed) {
  const x = clean(v).toLowerCase();
  return allowed.indexOf(x) > -1 ? x : null;
}
function cents(v) {
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return 0;
  /* a price is given in dollars; stored in cents so nothing rounds twice */
  return Math.round(n * 100);
}
function money(c) {
  const n = Number(c) || 0;
  return "$" + (n / 100).toFixed(n % 100 ? 2 : 0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/* ⚠ SURNAME, WORKED OUT. The roster says it is ordered by surname and it has
   to be true whoever adds a seller. Credentials after a comma come off first,
   so "Jane Roe, CFA" files under Roe. */
function surnameOf(name) {
  const n = clean(name).split(",")[0].trim().split(/\s+/);
  return n.length > 1 ? (n[n.length - 1] + " " + n.slice(0, -1).join(" ")) : (n[0] || "");
}
/* ⚠ crypto.randomUUID IS AVAILABLE ON WORKERS and is the right source here —
   a token made from Date.now() or Math.random() is guessable, and this one is
   the only thing standing between a stranger and bidding under a real name. */
function makeToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2, "0")).join("");
}
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}


/* ============================================================================
   THE PHOTO
   ============================================================================ */

const PHOTO_MAX = 2 * 1024 * 1024;   /* two megabytes */

/* ⚠ THE TYPE COMES FROM THE FILE, NEVER FROM WHAT THE UPLOAD CLAIMS. A caller
   controls the Content-Type header completely; he does not control the first
   bytes of the file he is sending. An HTML page announced as image/jpeg, in a
   bucket, served to a reader, is a stored cross-site script — and it is the
   oldest trick there is. */
function sniff(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
    return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A)
    return { type: "image/png", ext: "png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { type: "image/webp", ext: "webp" };
  return null;
}

async function putPhoto(env, me, req, origin) {
  if (!env.IMG) return { ok:false, build: BUILD,
    error:"no IMG binding — bind the R2 bucket gig-worker-photo as IMG" };
  if (req.method !== "POST" && req.method !== "PUT")
    return { ok:false, build: BUILD, error:"send the image as the body of a POST" };

  const bytes = await req.arrayBuffer();
  if (!bytes || !bytes.byteLength)
    return { ok:false, build: BUILD, error:"nothing was sent" };
  if (bytes.byteLength > PHOTO_MAX)
    return { ok:false, build: BUILD,
      error:"too large", sent: bytes.byteLength, limit: PHOTO_MAX,
      note:"Two megabytes. A profile photo does not need more." };

  const kind = sniff(bytes);
  if (!kind) return { ok:false, build: BUILD,
    error:"that is not a JPEG, a PNG or a WebP",
    note:"The type is read from the file itself, not from what the upload says " +
         "it is. Anything else is refused." };

  /* ⚠ THE KEY IS OURS, NOT HIS. Built from the seller id, so a filename like
     "../../x" or one carrying a second extension cannot decide where anything
     lands — and one seller can never overwrite another's picture. */
  const key = "seller/" + me.id + "." + kind.ext;

  /* an earlier photo in a different format would otherwise be left orphaned */
  if (me.photo_key && me.photo_key !== key) {
    try { await env.IMG.delete(me.photo_key); } catch (e) {}
  }

  await env.IMG.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=300" },
    customMetadata: { seller: String(me.id) } });

  await env.OVERHANG.prepare(
    "UPDATE mk_sellers SET photo_key = ?, photo = NULL WHERE id = ?")
    .bind(key, me.id).run();

  return { ok:true, build: BUILD,
    type: kind.type, bytes: bytes.byteLength,
    photo: (origin || "") + "/?photo=" + me.id,
    note:"⚠ A photo from a phone often carries EXIF, and EXIF often carries the " +
         "place it was taken. This worker cannot strip it. If the picture was " +
         "taken at home, send a different one." };
}

async function servePhoto(env, id) {
  const H = { "Access-Control-Allow-Origin":"*" };
  if (!env.IMG) return new Response("no image store", { status: 500, headers: H });

  const s = await env.OVERHANG.prepare(
    "SELECT photo_key FROM mk_sellers WHERE id = ? AND state = 'verified'")
    .bind(id).first();
  /* ⚠ ONLY A VERIFIED SELLER'S PHOTO IS SERVED. A refused application's
     picture stops being reachable the moment it is refused, which is the same
     rule the roster and the listings already follow. */
  if (!s || !s.photo_key) return new Response("no photo", { status: 404, headers: H });

  const obj = await env.IMG.get(s.photo_key);
  if (!obj) return new Response("no photo", { status: 404, headers: H });

  const h = new Headers(H);
  /* ⚠ THE TYPE IS SET HERE FROM THE KEY WE CHOSE, and X-Content-Type-Options
     stops a browser deciding for itself that a file is something else. Between
     the two, a photo can only ever be rendered as a photo. */
  h.set("content-type", s.photo_key.endsWith(".png") ? "image/png"
                       : s.photo_key.endsWith(".webp") ? "image/webp" : "image/jpeg");
  h.set("x-content-type-options", "nosniff");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "public, max-age=300");
  h.set("content-disposition", "inline");
  return new Response(obj.body, { headers: h });
}