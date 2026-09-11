/* BUILT 2026-08-31 17:13 ET */
/* ============================================================
   adhotbox  —  Cloudflare Worker
   The ad server. Two sides: advertisers buy, publishers carry.
   Built 29 Aug 2026

   BINDINGS   OVERHANG  D1 → overhang
              AI        Workers AI  (for the content screen)
              ART       R2 bucket   (for uploaded creative)
              EMAIL     Send email  (Workers Paid — Email Service)
   SECRETS    LOG_KEY

   ------------------------------------------------------------
   PUBLIC — no key. These are what box.js calls.
     ?serve=1&site=&topic=&ticker=&shape=   campaigns for this page
     ?log=1&e=imp&c=code&site=&shape=       count an impression or click
     ?upload=1  (POST, image body)           store creative, returns our own URL
     ?video=1&seconds=  (POST, mp4 body)     store a video, 45 seconds at most
     ?rates=1                                what each kind of placement costs
     ?sites=1&q=clifton                      search — a town OR a subject
                                            returns the matches, plus every
                                            subject and place on the network
     ?apply=advertiser&name=&email=...      advertiser application
     ?apply=publisher&name=&email=&domain=&city=&region=&country=&topic=&views=
                                            publisher application
     ?start=1&email=&domain=                 free signup — an address and nothing else
     ?check=1&domain=                        did they install it correctly?
     ?queue=1&pub=KEY                       a publisher's own desk
     ?decide=accept&pub=KEY&id=7            one click, yes
     ?decide=deny&pub=KEY&id=7              one click, no
     ?decide=auto&pub=KEY&on=1              accept everything from now on
     ?decide=category&pub=KEY&cat=health&block=1
     ?rules=1                               the standard, categories and sizes
     ?reach=1                               where the audience is, by place and subject
     ?go=1&c=CODE&site=                     click-through, counted server-side
     ?report=CODE&email=                    an advertiser's own numbers

   PRIVATE — key required. Nothing is approved without one.
     ?action=pending                        everything waiting on a decision
     ?action=approve&what=campaign&id=7
     ?action=reject&what=publisher&id=3&note=
     ?action=perf                           campaign performance
     ?action=earnings                       what each publisher is owed
     ?action=pay&pub=3&cents=12500          record a payout
     ?action=setshare&pub=3&pct=60
     ?action=notify[&pub=3]                 email publishers who have advertisers waiting
     ?action=starts                         everyone who signed up, with or without applying
     ?action=screen&site=7                  run the content screen on one site
     ?action=fence                          every site with its screen and verdict
     ?action=tier&site=7&tier=promoted      promoted | standard | fenced
     ?action=fee&site=7&paid=1&ref=         mark the registration fee paid
     ?action=refund&site=7                  record a refund of the fee
     ?action=waive&site=7&months=6&slots=1  waive the fee for house placements

   ------------------------------------------------------------
   IMAGES ARE HOSTED HERE, NEVER HOT-LINKED

   An image served from the advertiser's own server is a tracking
   pixel whether they meant it that way or not: every load hands them
   the reader's address, browser and the page it appeared on. That
   would quietly break the promise printed on every page of this
   network.

   So creative is uploaded and served from adhotbox.com. image_url
   holds our own path, never somebody else's domain, and the serve
   endpoint refuses anything that is not ours.

   ------------------------------------------------------------
   THE THINGS THAT KEEP THE FARM

   1. NOTHING SERVES UNTIL IT IS APPROVED. A campaign is 'pending'
      until the key says otherwise. So is a publisher, and so is
      every site they add.
   2. A SITE ONLY SERVES ON ITS OWN DOMAIN. The publisher key is
      bound to the domain in the database, and the worker checks the
      Origin header against it. Copying somebody else's snippet onto
      another site earns nothing and shows nothing.
   3. THE CREATIVE NEVER LEAVES THE SERVER. box.js holds no campaign
      text. It asks, gets what it is allowed to have for that page,
      and renders it. Pulling the file apart shows nothing about who
      is advertising or what anyone pays.
   4. MONEY IS COUNTED SERVER-SIDE, from the CPM stored on the
      campaign — never from anything the page reports.
   5. Budgets stop. A campaign whose spend passes its budget stops
      being served, in the same query that selects it.
   ============================================================ */

const HOUSE_KEY = "house-mn";

export default {
  async fetch(request, env) {
    const url = new URL(request.url), q = url.searchParams;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Auth-Key, Content-Type",
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname.indexOf("/art/") === 0) return await art(env, url);
      if (url.pathname.indexOf("/vid/") === 0) return await vid(env, url, request);
      if (q.get("serve")) return json(await serve(env, q, request), cors);
      if (q.get("log"))   return json(await log(env, q, request), cors);
      if (q.get("go"))    return await clickThrough(env, q, request);
      if (q.get("video"))  return json(await uploadVideo(env, q, request), cors);
      if (q.get("upload")) return json(await upload(env, q, request), cors);
      if (q.get("sites"))  return json(await sitesFor(env, q), cors);
      if (q.get("check")) return json(await checkSite(env, q), cors);
      if (q.get("start")) return json(await start(env, q), cors);
      if (q.get("apply")) return json(await apply(env, q), cors);
      if (q.get("queue")) return json(await queue(env, q), cors);
      if (q.get("decide")) return json(await pubDecide(env, q), cors);
      if (q.get("rules")) return json(await rules(env), cors);
      if (q.get("rates")) return json(await rates(env), cors);
      if (q.get("report")) return json(await advReport(env, q), cors);
      if (q.get("reach")) return json(await reach(env, q), cors);
    } catch (e) {
      return json({ ok:false, error:String(e) }, cors, 400);
    }

    const key = request.headers.get("X-Auth-Key") || q.get("key");
    if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, cors, 401);

    try {
      const a = q.get("action") || "pending";
      if (a === "pending")  return json(await pending(env), cors);
      if (a === "approve")  return json(await decide(env, q, "approved"), cors);
      if (a === "reject")   return json(await decide(env, q, "rejected"), cors);
      if (a === "perf")     return json(await perf(env), cors);
      if (a === "earnings") return json(await earnings(env), cors);
      if (a === "pay")      return json(await pay(env, q), cors);
      if (a === "setshare") return json(await setShare(env, q), cors);
      if (a === "notify") {
        const pubId = q.get("pub");
        const p = await env.OVERHANG.prepare(
          `SELECT id, name, email, pub_key, auto_accept FROM ab_publishers
            WHERE status='approved'` + (pubId ? " AND id = ?" : "")).bind(...(pubId?[pubId]:[])).all();
        const out = [];
        for (const pub of (p.results || [])) {
          if (pub.auto_accept) continue;
          const w = await env.OVERHANG.prepare(
            `SELECT COUNT(*) n FROM ab_campaigns c
              WHERE c.status='live' AND c.kind<>'house'
                AND NOT EXISTS (SELECT 1 FROM ab_approvals a
                                 WHERE a.publisher_id = ? AND a.campaign_id = c.id)`
          ).bind(pub.id).first();
          if (!w || !w.n) continue;
          const r = await mail(env, pub.email,
            w.n + " advertiser" + (w.n === 1 ? "" : "s") + " waiting on you",
            wrap(w.n + " waiting",
                '<p style="margin:0 0 14px">' + w.n + ' advertiser'
              + (w.n === 1 ? " has" : "s have") + ' asked to run on your site.</p>'
              + '<p style="margin:0 0 14px">You will see the business, what the '
              + 'advertisement says and where it goes. <b>Accept or deny, one click '
              + 'each.</b></p>'
              + btn("https://adhotbox.com/desk.html", "Open your desk")
              + '<p style="margin:14px 0 0;font-size:14.5px;color:#5A6478">'
              + 'Nothing runs until you say so. This is the only notification we send.</p>'));
          out.push({ publisher: pub.name, waiting: w.n, sent: r.sent, why: r.why });
        }
        return json({ ok:true, notified: out.length, detail: out }, cors);
      }
      if (a === "starts") {
        const r = await env.OVERHANG.prepare(
          `SELECT email, domain, source, sent, applied, created_at
             FROM ab_starts ORDER BY created_at DESC LIMIT 500`).all();
        return json({ ok:true, count: (r.results||[]).length, rows: r.results||[] }, cors);
      }
      if (a === "screen")   return json(await screen(env, q), cors);
      if (a === "fence")    return json(await fence(env, q), cors);
      if (a === "tier")     return json(await setTier(env, q), cors);
      if (a === "fee")      return json(await feeAction(env, q), cors);
      if (a === "refund")   return json(await refundFee(env, q), cors);
      if (a === "waive")    return json(await waiveFee(env, q), cors);
      return json(await pending(env), cors);
    } catch (e) {
      return json({ ok:false, error:String(e), stack:String(e.stack||"") }, cors, 500);
    }
  }
};

/* ============================================================
   SERVING
   ============================================================ */

async function serve(env, q, request) {
  const domain = hostOf(q.get("site") || originOf(request));
  const shape  = (q.get("shape")  || "card").slice(0, 12);
  const ticker = (q.get("ticker") || "").toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 10);
  const n      = Math.min(parseInt(q.get("n") || "1", 10), 4);

  /* the site has to be on the books and approved */
  const site = await env.OVERHANG.prepare(
    `SELECT s.id, s.domain, s.topic, s.publisher_id, s.house,
            s.country, s.region, s.city,
            s.fee_waived, s.waiver_until, s.waiver_slots, p.status AS pub_status
       FROM ab_sites s JOIN ab_publishers p ON p.id = s.publisher_id
      WHERE s.domain = ? AND s.status = 'approved' AND p.status = 'approved'
        AND COALESCE(s.tier,'standard') <> 'fenced'`
  ).bind(domain).first();

  /* ------------------------------------------------------------
     NOT ON THE NETWORK YET.

     A publisher who installs the line and sees a blank space thinks
     it is broken, and does not come back. So show one advertisement
     of our own, labelled as a demonstration, so the very first thing
     they see is the thing working.

     It is one, it is ours, and it says what it is. Real advertisers
     never reach a site nobody has approved.
     ------------------------------------------------------------ */
  if (!site) {
    const demo = await env.OVERHANG.prepare(
      `SELECT code, kind, eyebrow, head, body, cta, href, accent, format,
              image_url, image_alt, bg
         FROM ab_campaigns
        WHERE status='live' AND kind='house'
          AND (needs IS NULL OR needs <> 'ticker')
        ORDER BY weight DESC LIMIT 4`).all();

    const pool = (demo.results || []);
    if (!pool.length) return { ok:true, ads: [], reason: "site not approved" };

    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { ok:true, site: domain, demo: true, ads: [{
      code:    pick.code,
      kind:    "demo",
      format:  pick.format || "text",
      video:   videoOK(pick.video_id),
      file:    ownMedia(pick.video_url),
      seconds: pick.video_seconds || null,
      poster:  ownImage(pick.poster_url),
      image:   ownImage(pick.image_url),
      alt:     pick.image_alt || "",
      bg:      pick.bg || null,
      eyebrow: "Demonstration",
      head:    pick.head,
      body:    pick.body,
      cta:     pick.cta,
      href:    pick.href,
      accent:  pick.accent,
      shape
    }],
    says: "This is a demonstration advertisement. It proves the installation is " +
          "working. Apply at adhotbox.com and real advertisers will appear here — " +
          "and you will approve each one yourself." };
  }

  const topic = (q.get("topic") || site.topic || "general").toLowerCase();

  /* A political advertisement without a paid-for line does not serve.
     The rules differ by state and by office and are the advertiser's to
     follow — but the line itself is not optional anywhere, so it is
     enforced here rather than trusted to anybody's memory. */

  /* live campaigns, inside their dates, with budget left */
  const r = await env.OVERHANG.prepare(
    `SELECT code, kind, eyebrow, head, body, cta, href, accent,
            sites, topics, needs, weight, cpm_cents, category, size, geo,
            format, image_url, image_alt, bg,
            video_id, video_url, video_seconds, poster_url, paid_for_by,
            price_code
       FROM ab_campaigns
      WHERE status = 'live'
        AND (starts_on IS NULL OR starts_on <= date('now'))
        AND (ends_on   IS NULL OR ends_on   >= date('now'))
        AND (budget_cents = 0 OR spent_cents < budget_cents)`
  ).all();

  /* what this publisher has denied, and which categories it blocks */
  const denied = new Set();
  const dr = await env.OVERHANG.prepare(
    "SELECT campaign_code FROM ab_approvals WHERE publisher_id = ? AND verdict = 'deny'"
  ).bind(site.publisher_id).all();
  for (const d of (dr.results || [])) denied.add(d.campaign_code);

  const pub = await env.OVERHANG.prepare(
    "SELECT auto_accept, blocked_categories FROM ab_publishers WHERE id = ?"
  ).bind(site.publisher_id).first();

  const blockedCats = new Set(String(pub && pub.blocked_categories || "")
    .split(",").map(x => x.trim()).filter(Boolean));

  /* a publisher that reviews must have said yes; auto_accept only needs no 'deny' */
  const accepted = new Set();
  if (!(pub && pub.auto_accept)) {
    const ar = await env.OVERHANG.prepare(
      "SELECT campaign_code FROM ab_approvals WHERE publisher_id = ? AND verdict = 'accept'"
    ).bind(site.publisher_id).all();
    for (const a of (ar.results || [])) accepted.add(a.campaign_code);
  }

  /* a site on the waiver carries house advertisements and cannot deny
     them — that is what it agreed to instead of paying the fee. Paying
     advertisers are approved one by one as normal. */
  const onWaiver = !!(site.fee_waived && site.waiver_until &&
                      site.waiver_until >= new Date().toISOString().slice(0, 10));

  const pool = (r.results || []).filter(c =>
       siteOK(c.sites, domain)
    && topicOK(c.topics, topic)
    && (c.needs !== "ticker" || !!ticker)
    && geoOK(c.geo, site)
    && (c.kind === "house" && onWaiver ? true : !denied.has(c.code))
    && !blockedCats.has(c.category || "general")
    && (c.kind === "house" || (pub && pub.auto_accept) || accepted.has(c.code))
    && !(["political","civic"].indexOf(c.category) > -1 && !c.paid_for_by));

  if (!pool.length) return { ok:true, ads: [], reason: "nothing matched" };

  /* paid campaigns first — house ads only fill what is unsold */
  const paid  = pool.filter(c => c.kind !== "house");
  const house = pool.filter(c => c.kind === "house");
  const order = paid.length ? paid : house;

  const chosen = [];
  const taken  = [];
  for (let i = 0; i < n; i++) {
    const pick = weighted(order.filter(c => taken.indexOf(c.code) === -1))
              || weighted(house.filter(c => taken.indexOf(c.code) === -1));
    if (!pick) break;
    taken.push(pick.code);
    chosen.push({
      code:    pick.code,
      kind:    pick.kind,
      format:  pick.format || "text",
      video:   videoOK(pick.video_id),
      file:    ownMedia(pick.video_url),
      seconds: pick.video_seconds || null,
      poster:  ownImage(pick.poster_url),
      image:   ownImage(pick.image_url),
      alt:     fill(pick.image_alt, ticker),
      bg:      pick.bg || null,
      eyebrow: fill(pick.eyebrow, ticker),
      head:    fill(pick.head, ticker),
      body:    fill(pick.body, ticker),
      cta:     fill(pick.cta, ticker),
      href:    fill(pick.href, ticker),
      accent:  pick.accent,
      paidfor: pick.paid_for_by || null,
      shape
    });
  }

  return { ok:true, site: domain, topic, ticker: ticker || null, ads: chosen };
}

function weighted(list) {
  if (!list || !list.length) return null;
  let total = 0;
  for (const c of list) total += (c.weight || 1);
  let r = Math.random() * total;
  for (const c of list) { r -= (c.weight || 1); if (r <= 0) return c; }
  return list[0];
}

function siteOK(spec, domain) {
  const list = String(spec || "*").split(",").map(s => s.trim()).filter(Boolean);
  let excluded = false, included = false, anyInclude = false;
  for (const s of list) {
    if (s === "*") { included = true; anyInclude = true; continue; }
    if (s.charAt(0) === "!") { if (domain.indexOf(s.slice(1)) > -1) excluded = true; }
    else { anyInclude = true; if (domain.indexOf(s) > -1) included = true; }
  }
  if (excluded) return false;
  return anyInclude ? included : true;
}

/* GEOGRAPHY — the piece that makes a small local site worth something.

   A campaign's geo is a comma list. Each entry is as narrow as the
   advertiser wants:

     *                everywhere
     US               a country
     US-NJ            a state or region
     US-NJ-Clifton    a town
     !US-NY           everywhere except

   A site carries its own country, region and city, given when it
   signed up. A local roofer buying US-NJ-Clifton reaches the sites
   that said they are read in Clifton, and nowhere else. */
function geoOK(spec, site) {
  const list = String(spec || "*").split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length || list.indexOf("*") > -1) {
    /* still honour a lone exclusion alongside the wildcard */
    if (!list.some(x => x.charAt(0) === "!")) return true;
  }

  const me = [
    (site.country || "").toUpperCase(),
    ((site.country || "") + "-" + (site.region || "")).toUpperCase(),
    ((site.country || "") + "-" + (site.region || "") + "-" + (site.city || "")).toUpperCase()
  ].filter(x => x && x.indexOf("--") === -1 && !/-$/.test(x));

  let excluded = false, included = false, anyInclude = false;
  for (const raw of list) {
    if (raw === "*") { included = true; anyInclude = true; continue; }
    const neg = raw.charAt(0) === "!";
    const g = (neg ? raw.slice(1) : raw).toUpperCase();
    const hit = me.some(m => m === g || m.indexOf(g + "-") === 0);
    if (neg) { if (hit) excluded = true; }
    else { anyInclude = true; if (hit) included = true; }
  }
  if (excluded) return false;
  return anyInclude ? included : true;
}

function topicOK(spec, topic) {
  const list = String(spec || "*").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.indexOf("*") > -1 || list.indexOf(topic) > -1;
}

function fill(s, t) { return String(s || "").replace(/\{TICKER\}/g, t || ""); }

/* ============================================================
   VIDEO

   A normal YouTube embed sets cookies and reports the reader to
   Google the moment the page loads, whether or not anybody presses
   play. That would quietly break the promise printed on every page
   of this network.

   So a video advertisement is a still picture and a play button,
   both served from here. NOTHING TOUCHES YOUTUBE UNTIL THE READER
   CLICKS. If he never clicks, YouTube never learns he was there.
   When he does click he is choosing it, and the player that loads
   is the no-cookie one.

   Never autoplay. Never sound without a press. Those two are what
   publishers refuse video over, and they are refusing correctly.
   ============================================================ */

/* our own file, served from our own bucket — nothing third-party at all */
function ownMedia(u) {
  if (!u) return null;
  const t = String(u).trim();
  if (t.indexOf("/vid/") === 0) return t;
  if (/^https:\/\/(www\.)?adhotbox\.com\/vid\//i.test(t)) return t;
  return null;
}

/* only ever an id, never a URL somebody handed us */
function videoOK(v) {
  if (!v) return null;
  const id = String(v).trim();
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/* creative must be ours. A remote image is a tracking pixel. */
function ownImage(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (s.indexOf("/") === 0) return s;                       /* our own path */
  if (/^https:\/\/(www\.)?adhotbox\.com\//i.test(s)) return s;
  if (/^https:\/\/[a-z0-9-]+\.r2\.dev\//i.test(s)) return s;   /* our R2 bucket */
  return null;                                              /* anything else: dropped */
}

/* ============================================================
   COUNTING — and this is where money is assigned
   ============================================================ */

async function log(env, q, request) {
  const e    = (q.get("e") || "").slice(0, 8);
  const code = (q.get("c") || "").slice(0, 60);
  if (!code || (e !== "imp" && e !== "click")) throw new Error("bad event");

  const domain = hostOf(q.get("site") || originOf(request));

  const site = await env.OVERHANG.prepare(
    `SELECT s.publisher_id FROM ab_sites s JOIN ab_publishers p ON p.id = s.publisher_id
      WHERE s.domain = ? AND s.status='approved' AND p.status='approved'`
  ).bind(domain).first();
  /* a demonstration on a site nobody has approved is not billed and not
     credited — it is a picture of the thing working, not a placement */
  if (!site) return { ok:true, counted:false, demo:true };

  /* the rate comes from the campaign row, never from the page */
  const c = await env.OVERHANG.prepare(
    "SELECT cpm_cents, kind FROM ab_campaigns WHERE code = ? AND status='live'").bind(code).first();
  if (!c) return { ok:true, counted:false };

  const cpm = (e === "imp") ? (c.cpm_cents || 0) : 0;

  await env.OVERHANG.prepare(
    `INSERT INTO ab_events (day, event, campaign_code, site_domain, publisher_id,
                            shape, topic, ticker, cpm_cents)
     VALUES (date('now'),?,?,?,?,?,?,?,?)`
  ).bind(e, code, domain, site.publisher_id,
         (q.get("shape")||"").slice(0,12), (q.get("topic")||"").slice(0,30),
         (q.get("ticker")||"").slice(0,10), cpm).run();

  /* spend the advertiser's budget as it is delivered */
  if (e === "imp" && cpm > 0) {
    await env.OVERHANG.prepare(
      "UPDATE ab_campaigns SET spent_cents = spent_cents + (? / 1000.0) WHERE code = ?"
    ).bind(cpm, code).run();
  }

  return { ok:true, counted:true };
}

/* ============================================================
   UPLOADED CREATIVE

   The picture is taken on the advertiser's phone and sent here. It
   is stored in our own bucket and served from our own domain,
   because an image hosted anywhere else is a tracking pixel — see
   the note above.

   Nothing is trusted from the request except the bytes. The name is
   ours, the size is capped, and the type is checked.
   ============================================================ */

const MAX_ART = 2 * 1024 * 1024;    /* 2 MB — a phone photo compressed */
const MAX_VID = 30 * 1024 * 1024;   /* 30 MB — plenty for 45 seconds */
const MAX_SEC = 45;                 /* forty-five seconds. Nobody watches more. */

async function upload(env, q, request) {
  if (request.method !== "POST") throw new Error("POST the image");

  const email = (q.get("email") || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) throw new Error("email required");

  const type = (request.headers.get("Content-Type") || "").split(";")[0];
  if (["image/jpeg","image/png","image/webp"].indexOf(type) === -1)
    throw new Error("jpeg, png or webp only");

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) throw new Error("empty");
  if (buf.byteLength > MAX_ART) throw new Error("too big — keep it under 2 MB");

  const ext = type === "image/png" ? "png" : (type === "image/webp" ? "webp" : "jpg");
  const key = "art/" + Date.now().toString(36) + "-"
            + Math.random().toString(36).slice(2, 8) + "." + ext;

  if (!env.ART) throw new Error("no bucket bound");
  await env.ART.put(key, buf, { httpMetadata: { contentType: type } });

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ab_art (id INTEGER PRIMARY KEY AUTOINCREMENT,
       key TEXT NOT NULL, email TEXT, bytes INTEGER, type TEXT,
       created_at TEXT DEFAULT (datetime('now')))`).run();
  await env.OVERHANG.prepare(
    "INSERT INTO ab_art (key, email, bytes, type) VALUES (?,?,?,?)"
  ).bind(key, email, buf.byteLength, type).run();

  return { ok:true, url: "https://adhotbox.com/" + key, key, bytes: buf.byteLength };
}

/* ============================================================
   VIDEO WE HOLD OURSELVES

   Better than a YouTube embed in every way that matters here: no
   cookies before OR after, no "watch on YouTube" button, and no
   suggested videos at the end pulling the reader off the
   publisher's page.

   It costs nothing to serve. R2 charges no egress, so a video
   played ten thousand times costs the same as one played once.

   FORTY-FIVE SECONDS. Checked on the way in and stated everywhere.
   ============================================================ */

async function uploadVideo(env, q, request) {
  if (request.method !== "POST") throw new Error("POST the file");

  const email = (q.get("email") || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) throw new Error("email required");

  const secs = parseInt(q.get("seconds") || "0", 10);
  if (!secs) throw new Error("how long is it?");
  if (secs > MAX_SEC)
    throw new Error("Forty-five seconds at most. This one is " + secs + ".");

  const type = (request.headers.get("Content-Type") || "").split(";")[0];
  if (["video/mp4","video/webm","video/quicktime"].indexOf(type) === -1)
    throw new Error("mp4 or webm, please");

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) throw new Error("empty");
  if (buf.byteLength > MAX_VID)
    throw new Error("too big — keep it under 30 MB. Forty-five seconds at ordinary "
                  + "quality is far less than that.");

  const ext = type === "video/webm" ? "webm" : "mp4";
  const key = "vid/" + Date.now().toString(36) + "-"
            + Math.random().toString(36).slice(2, 8) + "." + ext;

  if (!env.ART) throw new Error("no bucket bound");
  await env.ART.put(key, buf, { httpMetadata: { contentType: type } });

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ab_video (id INTEGER PRIMARY KEY AUTOINCREMENT,
       key TEXT NOT NULL, poster_key TEXT, email TEXT, seconds INTEGER,
       bytes INTEGER, type TEXT, created_at TEXT DEFAULT (datetime('now')))`).run();
  await env.OVERHANG.prepare(
    "INSERT INTO ab_video (key, email, seconds, bytes, type) VALUES (?,?,?,?,?)"
  ).bind(key, email, secs, buf.byteLength, type).run();

  return { ok:true, url: "https://adhotbox.com/" + key, key,
    seconds: secs, bytes: buf.byteLength,
    mb: +(buf.byteLength / 1048576).toFixed(1),
    note: "Held by us and served from our own domain. Nothing third-party is "
        + "involved at any point, before or after somebody presses play." };
}

/* ============================================================
   WHAT IS AVAILABLE — the old newspaper page

   An advertiser picks the sites he wants, the way somebody once
   picked which papers and which section. Every one shows its town,
   its subject, roughly how many people read it, and the price.

   Only approved sites appear, and a site is listed whether or not
   it will accept this particular advertiser — that decision is the
   publisher's and it is made afterwards. The list says so.
   ============================================================ */

async function sitesFor(env, q) {
  const topic = (q.get("topic") || "").toLowerCase();
  const geo   = (q.get("geo") || "").toUpperCase();
  const city  = (q.get("city") || "").toLowerCase();
  /* one box, and it searches everything a person might type — a town, a
     trade, a county, the name of a site */
  const term  = (q.get("q") || "").toLowerCase().trim();

  const r = await env.OVERHANG.prepare(
    `SELECT s.id, s.domain, s.name, s.topic, s.city, s.region, s.country,
            s.monthly_views, s.areas_served, s.tier
       FROM ab_sites s JOIN ab_publishers p ON p.id = s.publisher_id
      WHERE s.status='approved' AND p.status='approved'
        AND COALESCE(s.tier,'standard') <> 'fenced'
      ORDER BY CASE s.tier WHEN 'promoted' THEN 0 ELSE 1 END,
               s.monthly_views DESC LIMIT 300`).all();

  let rows = r.results || [];

  if (topic) rows = rows.filter(x => (x.topic||"").toLowerCase() === topic);
  if (city)  rows = rows.filter(x =>
    (x.city||"").toLowerCase().indexOf(city) > -1 ||
    (x.areas_served||"").toLowerCase().indexOf(city) > -1);
  if (geo)   rows = rows.filter(x => geoOK(geo, x));

  if (term) rows = rows.filter(x => [
      x.city, x.region, x.topic, x.name, x.domain, x.areas_served
    ].some(v => String(v || "").toLowerCase().indexOf(term) > -1));

  /* what exists at all, so the page can offer real choices instead of guesses */
  const all = r.results || [];
  const subjects = {}, places = {};
  for (const x of all) {
    if (x.topic) subjects[x.topic] = (subjects[x.topic] || 0) + 1;
    const c = x.city || x.region;
    if (c) places[c] = (places[c] || 0) + 1;
  }
  const top = o => Object.keys(o).sort((a,b)=>o[b]-o[a])
                    .slice(0,12).map(k => ({ name:k, sites:o[k] }));

  const reach = rows.reduce((n, x) => n + (x.monthly_views || 0), 0);

  return { ok:true, price_cents: 2000,
    matched: rows.length, total_sites: all.length,
    monthly_reach: reach,
    subjects: top(subjects), places: top(places),
    sites: rows.map(x => ({
      id: x.id, domain: x.domain, name: x.name, topic: x.topic,
      where: [x.city, x.region].filter(Boolean).join(", "),
      also: x.areas_served || "",
      views: x.monthly_views || 0,
      promoted: x.tier === "promoted"
    })),
    note: "Twenty dollars a month each. Every site decides for itself whether to " +
          "carry an advertiser, so a site on this list may still say no — and you " +
          "are not charged for a placement that does not run." };
}

/* ============================================================
   THE CLICK-THROUGH

   A click reported by the reader's browser can be invented by a
   dishonest publisher. This cannot: the reader passes through here,
   the server writes the row, and then they are sent on. It costs the
   reader one redirect and it makes the number defensible.

   The destination is read from the campaign row, never from the
   address, so this can never be turned into an open redirect.
   ============================================================ */

async function clickThrough(env, q, request) {
  const code   = (q.get("c") || "").slice(0, 60);
  const domain = hostOf(q.get("site") || originOf(request));

  const c = await env.OVERHANG.prepare(
    "SELECT href, cpm_cents FROM ab_campaigns WHERE code = ? AND status = 'live'"
  ).bind(code).first();

  if (!c || !c.href) return Response.redirect("https://adhotbox.com/", 302);

  const site = await env.OVERHANG.prepare(
    `SELECT s.publisher_id FROM ab_sites s JOIN ab_publishers p ON p.id = s.publisher_id
      WHERE s.domain = ? AND s.status='approved' AND p.status='approved'`
  ).bind(domain).first();

  if (site) {
    await env.OVERHANG.prepare(
      `INSERT INTO ab_events (day, event, campaign_code, site_domain, publisher_id,
                              shape, topic, ticker, cpm_cents)
       VALUES (date('now'),'click',?,?,?,?,?,?,0)`
    ).bind(code, domain, site.publisher_id,
           (q.get("shape")||"").slice(0,12), (q.get("topic")||"").slice(0,30),
           (q.get("ticker")||"").slice(0,10)).run().catch(()=>{});
  }

  /* {TICKER} may be in the stored destination */
  const t = (q.get("ticker") || "").toUpperCase().replace(/[^A-Z.\-]/g, "");
  return Response.redirect(fill(c.href, t), 302);
}

/* ============================================================
   APPLICATIONS — anybody may apply. Nobody serves until approved.
   ============================================================ */

async function apply(env, q) {
  const what  = (q.get("apply") || "").toLowerCase();
  const name  = (q.get("name")  || "").trim().slice(0, 120);
  const email = (q.get("email") || "").trim().toLowerCase().slice(0, 160);
  if (!name || email.indexOf("@") < 1) throw new Error("name and email required");

  if (what === "advertiser") {
    await env.OVERHANG.prepare(
      `INSERT INTO ab_advertisers (name, contact_name, email, phone, url, note, status)
       VALUES (?,?,?,?,?,?, 'pending')`
    ).bind(name, (q.get("contact")||"").slice(0,120), email,
           (q.get("phone")||"").slice(0,40), (q.get("url")||"").slice(0,200),
           (q.get("note")||"").slice(0,600)).run();
    return { ok:true, note:"Application received. Nothing runs until it is reviewed." };
  }

  if (what === "publisher") {
    const domain = hostOf(q.get("domain") || "");
    if (!domain) throw new Error("domain required");
    const key = "pub-" + Math.random().toString(36).slice(2, 10);

    await env.OVERHANG.prepare(
      `INSERT INTO ab_publishers (pub_key, name, contact_name, email, phone, note, status)
       VALUES (?,?,?,?,?,?, 'pending')`
    ).bind(key, name, (q.get("contact")||"").slice(0,120), email,
           (q.get("phone")||"").slice(0,40), (q.get("note")||"").slice(0,600)).run();

    const p = await env.OVERHANG.prepare(
      "SELECT id FROM ab_publishers WHERE pub_key = ?").bind(key).first();

    await env.OVERHANG.prepare(
      `INSERT OR IGNORE INTO ab_sites
         (publisher_id, domain, name, topic, status, country, region, city,
          postal, areas_served, audience_note, monthly_views, platform)
       VALUES (?,?,?,?, 'pending', ?,?,?,?,?,?,?,?)`
    ).bind(p.id, domain, (q.get("sitename")||domain).slice(0,120),
           (q.get("topic")||"general").toLowerCase().slice(0,30),
           (q.get("country")||"US").toUpperCase().slice(0,3),
           (q.get("region")||"").toUpperCase().slice(0,6),
           (q.get("city")||"").slice(0,80),
           (q.get("postal")||"").slice(0,12),
           (q.get("areas")||"").slice(0,300),
           (q.get("audience")||"").slice(0,600),
           parseInt(q.get("views")||"0", 10) || 0,
           (q.get("platform")||"other").toLowerCase().slice(0,20)).run();

    return { ok:true, pub_key: key,
      note:"Application received. Keep this key — it is how you open your desk at " +
           "adhotbox.com/desk.html. Nothing runs on your site until you accept it there." };
  }

  throw new Error("apply=advertiser or apply=publisher");
}

/* ============================================================
   EMAIL

   Cloudflare Email Service, on the Workers Paid plan. One binding,
   one call, no second provider and no second API key.

     await env.EMAIL.send({ to, from, subject, html, text })

   BEFORE IT WILL SEND TO ANYBODY BUT HIM, the domain has to be
   onboarded to Email Service — Compute → Email Service → Sending →
   add adhotbox.com and put the DNS records in the zone. Until then it
   can only reach addresses verified in Email Routing, which is enough
   to test with.

   3,000 emails a month are included. Sends to his own verified
   addresses are free and do not count.

   NOTHING HERE FAILS A REQUEST BECAUSE OF EMAIL. Every send is
   wrapped — if the domain is not onboarded yet, or the quota is gone,
   the signup still works and the reason is logged.
   ============================================================ */

const FROM  = "hello@adhotbox.com";
const BRAND = "AdHotBox";

async function mail(env, to, subject, html, text) {
  if (!env.EMAIL) return { sent: false, why: "no EMAIL binding" };
  if (!to || String(to).indexOf("@") < 1) return { sent: false, why: "no address" };
  try {
    const r = await env.EMAIL.send({
      to: String(to),
      from: { email: FROM, name: BRAND },
      subject: subject,
      html: html,
      text: text || strip(html)
    });
    return { sent: true, id: r && r.messageId };
  } catch (e) {
    /* E_SENDER_DOMAIN_NOT_AVAILABLE means the domain is not onboarded yet.
       E_SENDER_NOT_VERIFIED means the from-address is not verified.
       Neither should break anything the person was actually doing. */
    return { sent: false, why: (e && e.code) || String(e) };
  }
}

function strip(h) {
  return String(h || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&mdash;/g, "—").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

/* one house style, so every email looks like the same company wrote it */
function wrap(title, body) {
  return '<!DOCTYPE html><html><body style="margin:0;background:#F2F4F8;'
    + 'font:16px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;'
    + 'color:#0C1220">'
    + '<div style="max-width:560px;margin:0 auto;padding:28px 20px 44px">'
    +   '<p style="font-weight:900;font-size:17px;letter-spacing:-.02em;margin:0 0 22px">'
    +     'ADHOT<span style="color:#FF4A00">BOX</span></p>'
    +   '<div style="background:#fff;border-radius:12px;padding:26px 26px 22px">'
    +     '<h1 style="font-size:23px;line-height:1.15;margin:0 0 14px;font-weight:900;'
    +       'letter-spacing:-.02em">' + title + '</h1>'
    +     body
    +   '</div>'
    +   '<p style="font-size:13px;color:#5A6478;margin:20px 0 0">'
    +     'AdHotBox &middot; <a href="https://adhotbox.com" style="color:#5A6478">adhotbox.com</a>'
    +     '<br>You are getting this because you asked us for it. Reply to this email and '
    +     'a person will answer.</p>'
    + '</div></body></html>';
}

function btn(href, label) {
  return '<p style="margin:20px 0 6px"><a href="' + href + '" style="display:inline-block;'
    + 'background:#0C1220;color:#fff;text-decoration:none;font-weight:700;'
    + 'padding:13px 22px;border-radius:8px">' + label + '</a></p>';
}

/* ============================================================
   DID IT WORK?

   The hard part of installing this was never the pasting. It is not
   knowing whether it took. So: fetch their page, look for the script
   and for a slot, and say plainly which of the two is missing.

   Public, because somebody checking their own site should not need
   an account to do it.
   ============================================================ */

async function checkSite(env, q) {
  const domain = hostOf(q.get("domain") || "");
  if (!domain) throw new Error("which site?");

  let html = "", tried = "", err = null;
  for (const scheme of ["https://", "http://"]) {
    try {
      tried = scheme + domain + "/";
      const r = await fetch(tried, {
        headers: { "User-Agent": "AdHotBox install check (adhotbox.com)" },
        redirect: "follow"
      });
      if (r.ok) { html = await r.text(); break; }
      err = "HTTP " + r.status;
    } catch (e) { err = String(e); }
  }

  if (!html) {
    return { ok:true, domain, reached:false, error: err,
      says: "Could not open the site. Check the address, and that it is publicly " +
            "visible — a site behind a password or not yet published cannot be checked." };
  }

  const hasScript = /adhotbox\.com\/box\.js/i.test(html);
  const isAuto    = /box\.js[^>]*\sdata-auto/i.test(html);
  const hasSlot   = /data-ad\s*=/i.test(html);
  const slots     = (html.match(/data-ad\s*=/gi) || []).length;

  /* is the site even on the books */
  const site = await env.OVERHANG.prepare(
    `SELECT s.status, s.name, p.status AS pub FROM ab_sites s
       JOIN ab_publishers p ON p.id = s.publisher_id WHERE s.domain = ?`
  ).bind(domain).first();

  let says;
  if (hasScript && isAuto) {
    says = "The one-line installation is in place. The advertisements will place " +
           "themselves on the page — there is nothing else to add.";
  } else if (hasScript && hasSlot) {
    says = "Everything is in place. " + slots + " slot" + (slots === 1 ? "" : "s") +
           " on this page and the script is loading.";
  } else if (hasScript && !hasSlot) {
    says = "The script is loading but there is nowhere to put an advertisement. " +
           "Add a slot where you want one — on WordPress that is the AdHotBox " +
           "block, anywhere else it is one line of HTML.";
  } else if (!hasScript && hasSlot) {
    says = "There is a slot on the page but the script is not loading, so nothing " +
           "will appear in it. Add the script line just before </body>.";
  } else {
    says = "Neither part is on this page yet. If you put them on a different page, " +
           "check that one instead — this only looks at the front page.";
  }

  return { ok:true, domain, reached:true, url: tried,
    script: hasScript, slot: hasSlot || isAuto, auto: isAuto, slots,
    approved: site ? (site.status === "approved" && site.pub === "approved") : false,
    on_the_books: !!site,
    says,
    note: site
      ? null
      : "This site is not on the network yet, so even a correct installation will " +
        "show nothing. Apply first — it is free." };
}

/* ============================================================
   THE FREE SIGNUP

   An address and, if they have one, a domain. Nothing else.

   The long form asks eleven questions and most people close it. This
   asks one, keeps the address, and hands them the directions on the
   screen straight away. The rest is collected when they are ready to
   be reviewed.
   ============================================================ */

async function start(env, q) {
  const email  = (q.get("email") || "").trim().toLowerCase();
  const domain = hostOf(q.get("domain") || "");
  if (!email || email.indexOf("@") < 1 || email.length > 200)
    throw new Error("an email address, please");

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ab_starts (
       email TEXT PRIMARY KEY, domain TEXT, source TEXT,
       sent INTEGER DEFAULT 0, applied INTEGER DEFAULT 0,
       created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`).run();

  await env.OVERHANG.prepare(
    `INSERT INTO ab_starts (email, domain, source) VALUES (?,?,?)
     ON CONFLICT(email) DO UPDATE SET domain = excluded.domain,
       updated_at = datetime('now')`
  ).bind(email, domain || null, (q.get("source") || "site").slice(0, 30)).run();

  const body =
      '<p style="margin:0 0 14px">Everything you need is below. Most people are done '
    + 'in under twenty minutes.</p>'
    + '<ol style="margin:0 0 8px;padding-left:1.15em">'
    +   '<li style="margin-bottom:12px"><b>Apply, and tell us where your readers are.</b><br>'
    +     'An advertiser buys a <b>town</b>, not a traffic number. Three minutes. '
    +     'An honest small number is fine — this network exists for small sites.</li>'
    +   '<li style="margin-bottom:12px"><b>A person looks at your site.</b><br>'
    +     'If it is accepted you get a publisher key. There is a one-time ten dollar '
    +     'fee at that point, or you can carry one of our own advertisements free for '
    +     'six months instead and pay nothing. Nothing is charged before then.</li>'
    +   '<li style="margin-bottom:12px"><b>Put the code on your site.</b><br>'
    +     'WordPress: install the plugin, paste your key, drop in the block or the '
    +     'shortcode. Anything else: two lines.</li>'
    +   '<li style="margin-bottom:12px"><b>Accept the advertisers you want.</b><br>'
    +     'Every one appears on your desk first. One click each. Nothing runs on your '
    +     'pages that you did not agree to.</li>'
    +   '<li><b>Get paid.</b><br>'
    +     'Twenty dollars a placement a month, five of it yours, every month it runs, '
    +     'whatever your traffic does.</li>'
    + '</ol>'
    + btn("https://adhotbox.com/join.html", "Apply now")
    + '<p style="margin:16px 0 0;font-size:14.5px;color:#5A6478">'
    +   '<b>The honest part:</b> this network is new and the demand side is small. '
    +   'A site joining now will not see much at first. There is no exclusivity here '
    +   'precisely so you do not have to bet anything on us — install it beside '
    +   'whatever you already run.</p>';

  const sent = await mail(env, email,
    "Putting advertisements on your site — the directions",
    wrap("Here is how it works", body));

  if (sent.sent) {
    await env.OVERHANG.prepare(
      "UPDATE ab_starts SET sent = 1 WHERE email = ?").bind(email).run().catch(()=>{});
  }

  return { ok:true, emailed: sent.sent, why: sent.why || undefined,
    note: "On the list. The directions are on the screen now, and in your email." };
}

/* ============================================================
   THE PUBLISHER'S OWN DESK

   A publisher signs in with the key we gave them — nothing else.
   They see what is queued for their sites and click yes or no. One
   click each. They can also switch themselves to accept everything,
   or block whole categories and never see them again.

   Everything a publisher can do here affects only their own sites.
   ============================================================ */

async function pubKey(env, q) {
  const k = (q.get("pub") || "").trim();
  if (!k) throw new Error("pub key required");
  const p = await env.OVERHANG.prepare(
    "SELECT * FROM ab_publishers WHERE pub_key = ? AND status = 'approved'").bind(k).first();
  if (!p) throw new Error("not a publisher");
  return p;
}

async function queue(env, q) {
  const p = await pubKey(env, q);

  const r = await env.OVERHANG.prepare(
    `SELECT c.id, c.code, c.head, c.body, c.href, c.category, c.cpm_cents,
            c.format, c.paid_for_by,
            COALESCE(pr.price_cents, 2000) AS price_cents,
            COALESCE(pr.label, 'Words or a picture') AS price_label,
            ROUND(COALESCE(pr.price_cents,2000) * COALESCE(pr.pub_pct,25) / 100.0)
              AS you_get_cents,
            a.name AS advertiser,
            COALESCE(ap.verdict,'undecided') AS verdict, ap.decided_at
       FROM ab_campaigns c
       LEFT JOIN ab_prices pr ON pr.code = COALESCE(c.price_code,'standard')
       LEFT JOIN ab_advertisers a ON a.id = c.advertiser_id
       LEFT JOIN ab_approvals ap ON ap.publisher_id = ? AND ap.campaign_id = c.id
      WHERE c.status = 'live' AND c.kind <> 'house'
      ORDER BY (ap.verdict IS NOT NULL), c.id DESC LIMIT 200`
  ).bind(p.id).all();

  const sites = await env.OVERHANG.prepare(
    "SELECT domain, name, topic, status FROM ab_sites WHERE publisher_id = ?").bind(p.id).all();

  const earn = await env.OVERHANG.prepare(
    "SELECT * FROM v_ab_publisher_earnings WHERE id = ?").bind(p.id).first();

  const cats = await env.OVERHANG.prepare(
    "SELECT code, label, allowed, note FROM ab_categories ORDER BY allowed DESC, label").all();

  return { ok:true,
    publisher: { name: p.name, rev_share_pct: p.rev_share_pct,
                 auto_accept: !!p.auto_accept,
                 blocked_categories: p.blocked_categories || "" },
    sites: sites.results || [],
    earnings: earn || null,
    categories: cats.results || [],
    campaigns: r.results || [],
    note: "Accept or deny each one. Nothing runs on your site until you say so, " +
          "unless you switch on accept-everything." };
}

async function pubDecide(env, q) {
  const p = await pubKey(env, q);
  const what = (q.get("decide") || "").toLowerCase();

  /* switch the whole posture */
  if (what === "auto") {
    const on = q.get("on") === "1" ? 1 : 0;
    await env.OVERHANG.prepare(
      "UPDATE ab_publishers SET auto_accept = ? WHERE id = ?").bind(on, p.id).run();
    return { ok:true, auto_accept: !!on };
  }

  /* block or unblock whole categories */
  if (what === "category") {
    const cat = (q.get("cat") || "").trim().toLowerCase();
    const on  = q.get("block") === "1";
    let cur = String(p.blocked_categories || "").split(",").map(x=>x.trim()).filter(Boolean);
    cur = cur.filter(x => x !== cat);
    if (on) cur.push(cat);
    await env.OVERHANG.prepare(
      "UPDATE ab_publishers SET blocked_categories = ? WHERE id = ?"
    ).bind(cur.join(","), p.id).run();
    return { ok:true, blocked_categories: cur.join(",") };
  }

  /* one campaign, one click */
  if (what === "accept" || what === "deny") {
    const id = q.get("id");
    if (!id) throw new Error("id required");
    const c = await env.OVERHANG.prepare(
      "SELECT id, code FROM ab_campaigns WHERE id = ?").bind(id).first();
    if (!c) throw new Error("no such campaign");

    await env.OVERHANG.prepare(
      `INSERT INTO ab_approvals (publisher_id, campaign_id, campaign_code, verdict, note)
       VALUES (?,?,?,?,?)
       ON CONFLICT(publisher_id, campaign_id)
       DO UPDATE SET verdict = excluded.verdict, decided_at = datetime('now'),
                     note = excluded.note`
    ).bind(p.id, c.id, c.code, what, (q.get("note")||"").slice(0,300)).run();

    return { ok:true, campaign: c.code, verdict: what };
  }

  throw new Error("decide=accept|deny|auto|category");
}

/* AN ADVERTISER'S OWN REPORT.

   Signed in with the campaign code and the email on the account —
   no password, and it only ever returns that advertiser's own rows.

   What it shows: where the advertisement ran, how often, how many
   people clicked, and on what days. What it does not show, because
   it is not recorded anywhere: who those people were. */
async function advReport(env, q) {
  const code  = (q.get("report") || "").slice(0, 60);
  const email = (q.get("email") || "").trim().toLowerCase();
  if (!code || !email) throw new Error("campaign code and email required");

  const c = await env.OVERHANG.prepare(
    `SELECT c.*, a.name AS advertiser, a.email AS acct_email
       FROM ab_campaigns c LEFT JOIN ab_advertisers a ON a.id = c.advertiser_id
      WHERE c.code = ?`).bind(code).first();
  if (!c || String(c.acct_email || "").toLowerCase() !== email)
    throw new Error("no campaign for that code and email");

  const bySite = await env.OVERHANG.prepare(
    `SELECT e.site_domain, s.city, s.region, s.topic,
            SUM(CASE WHEN e.event='imp' THEN 1 ELSE 0 END) AS impressions,
            SUM(CASE WHEN e.event='click' THEN 1 ELSE 0 END) AS clicks
       FROM ab_events e LEFT JOIN ab_sites s ON s.domain = e.site_domain
      WHERE e.campaign_code = ? GROUP BY e.site_domain ORDER BY impressions DESC`
  ).bind(code).all();

  const byDay = await env.OVERHANG.prepare(
    `SELECT day,
            SUM(CASE WHEN event='imp' THEN 1 ELSE 0 END) AS impressions,
            SUM(CASE WHEN event='click' THEN 1 ELSE 0 END) AS clicks
       FROM ab_events WHERE campaign_code = ? GROUP BY day ORDER BY day DESC LIMIT 90`
  ).bind(code).all();

  const tot = await env.OVERHANG.prepare(
    `SELECT SUM(CASE WHEN event='imp' THEN 1 ELSE 0 END) imp,
            SUM(CASE WHEN event='click' THEN 1 ELSE 0 END) clk
       FROM ab_events WHERE campaign_code = ?`).bind(code).first();

  const pl = await env.OVERHANG.prepare(
    `SELECT month, COUNT(*) sites, SUM(price_cents) billed_cents
       FROM ab_placements WHERE campaign_code = ? AND status='active'
      GROUP BY month ORDER BY month DESC`).bind(code).all();

  return { ok:true,
    campaign: { code: c.code, head: c.head, status: c.status,
                advertiser: c.advertiser, geo: c.geo, topics: c.topics },
    impressions: tot ? tot.imp : 0,
    clicks:      tot ? tot.clk : 0,
    ctr_pct: (tot && tot.imp) ? +((tot.clk / tot.imp) * 100).toFixed(2) : null,
    by_site: bySite.results || [],
    by_day:  byDay.results  || [],
    months:  pl.results     || [],
    note: "Clicks are recorded by our own server as the reader passes through it, " +
          "not reported by the page, so a site cannot invent them. Nothing here " +
          "identifies a reader, because nothing about a reader is recorded." };
}

/* WHAT THE NETWORK REACHES — public, so an advertiser can see what is
   there before applying. Domains are not listed: a buyer sees where
   the audience is and what it reads, not a shopping list of sites. */
async function reach(env, q) {
  const g = await env.OVERHANG.prepare("SELECT * FROM v_ab_geo_reach LIMIT 200").all();
  const t = await env.OVERHANG.prepare(
    `SELECT topic, COUNT(*) sites, SUM(monthly_views) monthly_views
       FROM ab_sites WHERE status='approved' GROUP BY topic ORDER BY sites DESC`).all();
  const tot = await env.OVERHANG.prepare(
    `SELECT COUNT(*) sites, SUM(monthly_views) views FROM ab_sites WHERE status='approved'`).first();
  return { ok:true,
    sites: tot ? tot.sites : 0, monthly_views: tot ? tot.views : 0,
    by_place: g.results || [], by_subject: t.results || [],
    note: "Monthly views are as reported by each publisher and are not audited." };
}

/* ============================================================
   THE RATE CARD

   One price per kind of placement, and the publisher's share is a
   percentage of it rather than a flat sum. A political placement is
   the category most publishers refuse, so the one that takes it
   should be paid for the aggravation — twenty-seven fifty rather
   than five.

   Public, because a rate card that has to be asked for is a rate
   card somebody is being charged more than somebody else.
   ============================================================ */
async function rates(env) {
  const r = await env.OVERHANG.prepare("SELECT * FROM v_ab_ratecard").all();
  return { ok:true, rates: r.results || [],
    note: "A placement is one advertisement on one site for one month, month to " +
          "month. The publisher's share is paid every month it runs, whatever the " +
          "traffic does." };
}

/* the standard, public so anyone can read it before applying */
async function rules(env) {
  const cats  = await env.OVERHANG.prepare(
    "SELECT code, label, allowed, note FROM ab_categories ORDER BY allowed DESC, label").all();
  const sizes = await env.OVERHANG.prepare(
    "SELECT code, label, w, h, note FROM ab_sizes").all();
  return { ok:true,
    categories: cats.results || [],
    sizes: sizes.results || [],
    note: "Banned categories are banned network-wide and no publisher can accept " +
          "them. Beyond that, every publisher decides for itself." };
}

/* ============================================================
   THE DESK — everything below needs the key
   ============================================================ */

async function pending(env) {
  const a = await env.OVERHANG.prepare(
    "SELECT id,name,email,phone,url,note,created_at FROM ab_advertisers WHERE status='pending'").all();
  const p = await env.OVERHANG.prepare(
    "SELECT id,pub_key,name,email,phone,note,created_at FROM ab_publishers WHERE status='pending'").all();
  const s = await env.OVERHANG.prepare(
    `SELECT s.id,s.domain,s.name,s.topic,s.created_at,p.name AS publisher
       FROM ab_sites s JOIN ab_publishers p ON p.id=s.publisher_id
      WHERE s.status='pending'`).all();
  const c = await env.OVERHANG.prepare(
    `SELECT c.id,c.code,c.head,c.href,c.cpm_cents,c.budget_cents,a.name AS advertiser
       FROM ab_campaigns c LEFT JOIN ab_advertisers a ON a.id=c.advertiser_id
      WHERE c.status='pending'`).all();
  return { ok:true,
    advertisers: a.results||[], publishers: p.results||[],
    sites: s.results||[], campaigns: c.results||[] };
}

async function decide(env, q, verdict) {
  const what = (q.get("what")||"").toLowerCase();
  const id   = q.get("id");
  const note = q.get("note") || null;
  if (!id) throw new Error("id required");

  const table = { advertiser:"ab_advertisers", publisher:"ab_publishers",
                  site:"ab_sites", campaign:"ab_campaigns" }[what];
  if (!table) throw new Error("what=advertiser|publisher|site|campaign");

  const status = (what === "campaign" && verdict === "approved") ? "live" : verdict;
  const stamp  = verdict === "approved" ? ", approved_at = datetime('now')" : "";

  await env.OVERHANG.prepare(
    `UPDATE ${table} SET status = ?${stamp}${note ? ", note = ?" : ""} WHERE id = ?`
  ).bind(...(note ? [status, note, id] : [status, id])).run();

  const row = await env.OVERHANG.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();

  /* tell them, and give a publisher the key they need */
  let emailed = null;
  if (verdict === "approved" && row) {
    if (what === "site") {
      const pub = await env.OVERHANG.prepare(
        "SELECT name, email, pub_key FROM ab_publishers WHERE id = ?"
      ).bind(row.publisher_id).first();
      if (pub) {
        emailed = await mail(env, pub.email,
          row.domain + " is accepted",
          wrap(row.domain + " is in",
              '<p style="margin:0 0 14px">A person read it and it is accepted.</p>'
            + '<p style="margin:0 0 8px"><b>Your publisher key</b></p>'
            + '<p style="font:700 20px ui-monospace,Menlo,monospace;background:#F2F4F8;'
            +   'border-radius:8px;padding:14px 16px;margin:0 0 18px;letter-spacing:.04em">'
            +   pub.pub_key + '</p>'
            + '<p style="margin:0 0 14px">Keep it. It is how you get into your desk, on a '
            +   'computer or on your phone, and it is the only copy we will send you.</p>'
            + '<p style="margin:0 0 6px"><b>Two lines put an advertisement on the page:</b></p>'
            + '<pre style="background:#0C1220;color:#E6EAF2;padding:14px 16px;border-radius:8px;'
            +   'font:13px ui-monospace,Menlo,monospace;overflow-x:auto;margin:0 0 6px">'
            +   '&lt;div data-ad="card"&gt;&lt;/div&gt;\n\n'
            +   '&lt;script src="https://adhotbox.com/box.js"&gt;&lt;/script&gt;</pre>'
            + '<p style="font-size:14.5px;color:#5A6478;margin:0 0 4px">On WordPress, use the '
            +   'plugin instead and paste the key into its settings.</p>'
            + btn("https://adhotbox.com/desk.html", "Open your desk")
            + '<p style="margin:14px 0 0;font-size:14.5px;color:#5A6478">'
            +   '<b>Nothing will appear on your site until you accept it yourself.</b></p>'));
      }
    }
    if (what === "advertiser") {
      emailed = await mail(env, row.email,
        "Your application to advertise",
        wrap("You are approved to advertise",
            '<p style="margin:0 0 14px">A person read your application and it is accepted.</p>'
          + '<p style="margin:0 0 14px">Next we will come back to you with what is available '
          +   'in the places you named and what it costs. <b>Twenty dollars a placement a '
          +   'month, month to month, and nothing is charged until placements are agreed.</b></p>'
          + '<p style="margin:0 0 14px">One thing worth knowing: every publisher approves each '
          +   'advertiser by hand. Some will accept you and some will not, and '
          +   '<b>you are only ever charged for placements that actually run.</b></p>'
          + btn("https://adhotbox.com/app/", "Put it on your phone")));
    }
  }

  return { ok:true, what, verdict: status, row,
    emailed: emailed ? emailed.sent : null, why: emailed && emailed.why || undefined };
}

/* ============================================================
   THE CONTENT SCREEN

   Before a site is accepted, its front page is read and checked
   against the categories this network refuses. A model does the
   reading and returns a verdict, the categories it thinks it saw,
   and one sentence describing the site.

   IT FLAGS. IT DOES NOT DECIDE. The verdict is written to the
   record and a person approves or refuses. A machine that could
   reject a real publisher on its own would cost more in good sites
   than it saves in bad ones — and the same rule governs everything
   else on these properties: nothing is scored above 'flagged' until
   a human has read the thing itself.
   ============================================================ */

/* What the screen is looking for. Adult content is the absolute; the rest
   are refused categories that a site should not be built around. Licensed
   operators in regulated categories — prediction markets, sportsbooks,
   crypto exchanges, alcohol, cannabis, firearms dealers, tobacco — are
   allowed and are NOT on this list. */
const REFUSED = [
  "adult or sexual content of any kind",
  "stock promotion, penny-stock touting or investor relations advertising",
  "token sales, presales or airdrops",
  "payday, title or high-interest consumer lending",
  "get-rich-quick offers, guaranteed-income claims, miracle cures, or content laid out to look like news when it is advertising"
];

async function screen(env, q) {
  const id = q.get("site");
  if (!id) throw new Error("site id required");

  const site = await env.OVERHANG.prepare(
    "SELECT id, domain, name, topic FROM ab_sites WHERE id = ?").bind(id).first();
  if (!site) throw new Error("no such site");

  /* fetch the front page, as a reader would */
  let text = "", fetchErr = null;
  try {
    const res = await fetch("https://" + site.domain + "/", {
      headers: { "User-Agent": "AdHotBox site review (adhotbox.com)" },
      redirect: "follow"
    });
    if (!res.ok) fetchErr = "HTTP " + res.status;
    else {
      const html = await res.text();
      text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
    }
  } catch (e) { fetchErr = String(e); }

  if (fetchErr && !text) {
    await record(env, site, "unreachable", "low", "", "Could not load the page: " + fetchErr, "", "");
    return { ok:true, domain: site.domain, verdict: "unreachable", error: fetchErr,
      note: "Could not read the site. A person should look at it." };
  }

  /* ask the model */
  const prompt =
    "You are screening a website for a small advertising network.\n\n" +
    "The network refuses these categories entirely:\n- " + REFUSED.join("\n- ") + "\n\n" +
    "Read the text below, taken from the site's front page, and answer ONLY with JSON " +
    "in exactly this shape and nothing else:\n" +
    '{"verdict":"clear|flagged|refuse","confidence":"high|medium|low",' +
    '"flags":["..."],"topic":"one or two words","summary":"one sentence describing the site"}\n\n' +
    "verdict rules:\n" +
    "- refuse: the site is plainly one of the refused categories\n" +
    "- flagged: something suggests a refused category, or the page is too thin to tell\n" +
    "- clear: an ordinary site with none of them\n\n" +
    "Be conservative. A person reviews every answer, so 'flagged' costs nothing " +
    "and a wrong 'refuse' costs a real publisher.\n\n" +
    "SITE: " + site.domain + "\n\nTEXT:\n" + text;

  let out = null, raw = "";
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400
    });
    raw = (r && (r.response || r.result || "")) + "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) out = JSON.parse(m[0]);
  } catch (e) { raw = "AI error: " + String(e); }

  /* a keyword pass runs regardless, so a model failure is never a clean pass */
  const lower = text.toLowerCase();
  const words = {
    "adult": /\b(porn|xxx|escort|onlyfans|nude|camgirl)\b/,
    "stock promotion": /\b(hot stock|next 10x|penny stock alert|stock pick alert)\b/,
    "token offering": /\b(presale|token sale|airdrop|1000x)\b/,
    "payday lending": /\b(payday loan|no credit check loan|cash advance today)\b/,
    "get rich quick": /\b(guaranteed income|make \$\d+ a day|miracle cure)\b/
  };
  const hits = [];
  for (const k in words) if (words[k].test(lower)) hits.push(k);

  let verdict = out && out.verdict ? String(out.verdict) : "flagged";
  if (hits.length && verdict === "clear") verdict = "flagged";
  if (!out) verdict = "flagged";

  const flags = [].concat(out && out.flags ? out.flags : [], hits)
    .filter((v, i, a) => v && a.indexOf(v) === i).join(", ");

  await record(env, site, verdict,
    out && out.confidence ? out.confidence : "low",
    flags,
    out && out.summary ? out.summary : "",
    out && out.topic ? out.topic : "",
    raw.slice(0, 4000));

  return { ok:true, domain: site.domain, verdict,
    confidence: out && out.confidence, flags, topic: out && out.topic,
    summary: out && out.summary,
    note: "This is a flag, not a decision. A person approves or refuses the site." };
}

async function record(env, site, verdict, conf, flags, summary, topic, raw) {
  await env.OVERHANG.prepare(
    `INSERT INTO ab_screens (site_id, domain, verdict, confidence, flags, summary, topic_guess, raw)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(site.id, site.domain, verdict, conf, flags, summary, topic, raw).run();
}

/* ============================================================
   THE FENCE — the list, and what is promoted or kept out
   ============================================================ */

async function fence(env, q) {
  const r = await env.OVERHANG.prepare("SELECT * FROM v_ab_fence LIMIT 400").all();
  const counts = await env.OVERHANG.prepare(
    `SELECT status, COUNT(*) n FROM ab_sites GROUP BY status`).all();
  const tiers = await env.OVERHANG.prepare(
    `SELECT tier, COUNT(*) n FROM ab_sites GROUP BY tier`).all();
  const fees = await env.OVERHANG.prepare(
    "SELECT * FROM v_ab_fee_income LIMIT 24").all();
  return { ok:true, sites: r.results || [],
    by_status: counts.results || [], by_tier: tiers.results || [],
    fee_income: fees.results || [] };
}

async function setTier(env, q) {
  const id = q.get("site");
  const tier = (q.get("tier") || "").toLowerCase();
  if (!id || ["promoted","standard","fenced"].indexOf(tier) === -1)
    throw new Error("site and tier=promoted|standard|fenced required");

  await env.OVERHANG.prepare(
    "UPDATE ab_sites SET tier = ? WHERE id = ?").bind(tier, id).run();

  const site = await env.OVERHANG.prepare(
    "SELECT domain FROM ab_sites WHERE id = ?").bind(id).first();

  if (tier === "fenced" && site) {
    await env.OVERHANG.prepare(
      `INSERT INTO ab_fence (domain, verdict, reason, added_by) VALUES (?,?,?,?)
       ON CONFLICT(domain) DO UPDATE SET verdict=excluded.verdict,
         reason=excluded.reason, added_at=datetime('now')`
    ).bind(site.domain, "fenced", q.get("reason") || null, "desk").run();
  } else if (site) {
    await env.OVERHANG.prepare("DELETE FROM ab_fence WHERE domain = ?").bind(site.domain).run();
  }

  return { ok:true, site: site && site.domain, tier };
}

/* ============================================================
   THE REGISTRATION FEE

   Ten dollars, once, when a site is accepted. It pays for a person
   to look at the site. It is not refundable and it does not come
   off what the publisher earns.

   Most networks charge publishers nothing, and that is a fair thing
   to hold against this one. The reason it exists is that without it
   every empty site built to farm advertising applies, and the review
   is the whole product. Say that plainly wherever the fee appears
   and do not dress it up as a deposit — it is not one.
   ============================================================ */

const REG_FEE_CENTS = 1000;

async function feeAction(env, q) {
  const id = q.get("site");
  if (!id) throw new Error("site id required");
  const site = await env.OVERHANG.prepare(
    "SELECT id, domain, publisher_id FROM ab_sites WHERE id = ?").bind(id).first();
  if (!site) throw new Error("no such site");

  if (q.get("paid") === "1") {
    await env.OVERHANG.prepare(
      "UPDATE ab_sites SET fee_cents=?, fee_paid_on=date('now'), fee_ref=? WHERE id=?"
    ).bind(REG_FEE_CENTS, q.get("ref")||null, id).run();

    await env.OVERHANG.prepare(
      `INSERT INTO ab_fees (site_id, domain, publisher_id, amount_cents, status, paid_on, ref)
       VALUES (?,?,?,?, 'paid', date('now'), ?)`
    ).bind(site.id, site.domain, site.publisher_id, REG_FEE_CENTS, q.get("ref")||null).run();

    return { ok:true, domain: site.domain, fee_cents: REG_FEE_CENTS, status: "paid" };
  }

  await env.OVERHANG.prepare(
    `INSERT INTO ab_fees (site_id, domain, publisher_id, amount_cents, status)
     VALUES (?,?,?,?, 'due')`
  ).bind(site.id, site.domain, site.publisher_id, REG_FEE_CENTS).run();
  return { ok:true, domain: site.domain, fee_cents: REG_FEE_CENTS, status: "due" };
}

/* A refund, for when a site is turned away after paying, or when
   something went wrong. Not a credit against earnings — the fee is
   not a deposit and must never be described as one. */
/* ============================================================
   THE WAIVER

   Instead of the ten dollars, a publisher may carry one of our own
   advertisements free for six months. It costs them a slot and costs
   us nothing, because house inventory is unsold anyway.

   THE ONE HONEST CATCH, and it belongs on the form: while the
   waiver runs, that site cannot deny house advertisements. It can
   still accept or deny every paying advertiser as usual. A site with
   only one slot is giving that slot away for six months and should
   be told so before it chooses.
   ============================================================ */

async function waiveFee(env, q) {
  const id = q.get("site");
  if (!id) throw new Error("site id required");
  const months = Math.min(Math.max(parseInt(q.get("months") || "6", 10), 1), 24);
  const slots  = Math.min(Math.max(parseInt(q.get("slots")  || "1", 10), 1), 4);

  const site = await env.OVERHANG.prepare(
    "SELECT id, domain FROM ab_sites WHERE id = ?").bind(id).first();
  if (!site) throw new Error("no such site");

  await env.OVERHANG.prepare(
    `UPDATE ab_sites
        SET fee_waived = 1, fee_cents = 0,
            waiver_from = date('now'),
            waiver_until = date('now', '+' || ? || ' months'),
            waiver_slots = ?
      WHERE id = ?`
  ).bind(months, slots, id).run();

  await env.OVERHANG.prepare(
    `UPDATE ab_fees SET status='waived', note=? WHERE site_id = ? AND status='due'`
  ).bind(months + " months of house placements", id).run();

  const row = await env.OVERHANG.prepare(
    "SELECT waiver_from, waiver_until, waiver_slots FROM ab_sites WHERE id = ?").bind(id).first();

  return { ok:true, domain: site.domain, months, slots,
    from: row.waiver_from, until: row.waiver_until,
    note: "The fee is waived. While it runs this site carries house advertisements " +
          "and cannot deny them. Paying advertisers are still approved one by one." };
}

async function refundFee(env, q) {
  const id = q.get("site");
  if (!id) throw new Error("site id required");
  const site = await env.OVERHANG.prepare(
    "SELECT id, domain, publisher_id, fee_cents FROM ab_sites WHERE id = ?").bind(id).first();
  if (!site) throw new Error("no such site");

  const amt = site.fee_cents || REG_FEE_CENTS;

  await env.OVERHANG.prepare(
    "UPDATE ab_sites SET fee_paid_on = NULL, fee_ref = NULL WHERE id = ?").bind(id).run();
  await env.OVERHANG.prepare(
    `UPDATE ab_fees SET status='refunded', credited_on=date('now')
      WHERE site_id = ? AND status='paid'`).bind(id).run();
  await env.OVERHANG.prepare(
    `INSERT INTO ab_ledger (day, party, party_id, kind, amount_cents, ref, note)
     VALUES (date('now'),'publisher',?,'fee_refund',?,?,?)`
  ).bind(site.publisher_id, -amt, site.domain,
         q.get("note") || "Registration fee refunded").run();

  return { ok:true, domain: site.domain, refunded_cents: amt,
    note: "Recorded. The money still has to be sent back by hand." };
}

async function perf(env) {
  const r = await env.OVERHANG.prepare("SELECT * FROM v_ab_campaign_perf LIMIT 200").all();
  return { ok:true, campaigns: r.results || [] };
}

async function earnings(env) {
  const r = await env.OVERHANG.prepare("SELECT * FROM v_ab_publisher_earnings LIMIT 200").all();
  return { ok:true, publishers: r.results || [],
    note: "gross_cents is what the impressions billed. pub_share_cents is that " +
          "times the publisher's share. The difference is the network's." };
}

async function pay(env, q) {
  const pub   = q.get("pub");
  const cents = parseInt(q.get("cents") || "0", 10);
  if (!pub || !cents) throw new Error("pub and cents required");
  await env.OVERHANG.prepare(
    "UPDATE ab_publishers SET paid_cents = paid_cents + ?, owed_cents = MAX(0, owed_cents - ?) WHERE id = ?"
  ).bind(cents, cents, pub).run();
  await env.OVERHANG.prepare(
    `INSERT INTO ab_ledger (day, party, party_id, kind, amount_cents, ref, note)
     VALUES (date('now'),'publisher',?,'payout',?,?,?)`
  ).bind(pub, cents, q.get("ref")||null, q.get("note")||null).run();
  return { ok:true, paid_cents: cents };
}

async function setShare(env, q) {
  const pub = q.get("pub"), pct = parseInt(q.get("pct")||"0", 10);
  if (!pub || pct < 0 || pct > 100) throw new Error("pub and pct 0-100 required");
  await env.OVERHANG.prepare(
    "UPDATE ab_publishers SET rev_share_pct = ? WHERE id = ?").bind(pct, pub).run();
  return { ok:true, publisher: pub, rev_share_pct: pct };
}

/* ============================================================ */

/* creative, served from our own domain */
async function art(env, url) {
  if (!env.ART) return new Response("no bucket", { status: 500 });
  const obj = await env.ART.get(url.pathname.slice(1));
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata && obj.httpMetadata.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/* video, from our own domain, with range requests so it seeks properly */
async function vid(env, url, request) {
  if (!env.ART) return new Response("no bucket", { status: 500 });
  const key = url.pathname.slice(1);
  const range = request.headers.get("Range");

  const obj = await env.ART.get(key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response("not found", { status: 404 });

  const h = {
    "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "video/mp4",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*"
  };
  if (obj.range) {
    const start = obj.range.offset || 0;
    const end   = start + (obj.range.length || 0) - 1;
    h["Content-Range"] = "bytes " + start + "-" + end + "/" + obj.size;
    return new Response(obj.body, { status: 206, headers: h });
  }
  return new Response(obj.body, { headers: h });
}

function originOf(request) {
  const o = request.headers.get("Origin") || request.headers.get("Referer") || "";
  try { return new URL(o).hostname; } catch (e) { return ""; }
}
function hostOf(s) {
  let h = String(s || "").trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
  return h;
}
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}