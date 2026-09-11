/* ============================================================================
   NEWSROOM  —  Cloudflare Worker
   Where a person types what the sites say, and watches what everyone else is
   running.

   Built 2026-09-11 21:30 ET · newsroom-1e

   ----------------------------------------------------------------------------
   ⚠ WHY THIS IS NOT PART OF AMALIA

   It was, for about an hour, and that was wrong. Amalia BROADCASTS — five
   times a day, off the wire's own counts. The newsroom is PEOPLE: staff
   accounts, shifts, other publishers' headlines, and words typed by a
   journalist at four in the morning.

   Bolting one onto the other meant a part-time reporter's token lived in the
   same worker as her voice and her schedule, and a change to either risked
   the other. They share the database and nothing else.

   ----------------------------------------------------------------------------
   ⚠ THE NEWSROOM IS NOT A PUBLISHER OF OTHER PEOPLE'S WORK.

   It watches WSJ, FT, NYT, Gulf News and the SEC so a reporter on shift knows
   what is already out there before they file. HEADLINE, SOURCE, TIME AND LINK
   — never the article. A reporter clicks through and reads it where it was
   published, which is where the publisher wants them.

   Nothing from those feeds reaches warrantwire.com, 8k10q.com or newsweed.com.
   It is a reading tool for staff and that is all it is.

   ----------------------------------------------------------------------------
   ⚠ ACCESS IS TRUST — his ruling, 11 Sep 2026. A reporter publishes straight;
   nothing waits for approval. That is exactly why the record of WHO DID WHAT
   matters more here, not less: when something wrong is on the front page at
   four o'clock, the question is who wrote it, and the answer has to be in a
   table rather than in somebody's memory.

   ⚠ LOG_KEY IS THE SAME KEY ON EVERY WORKER. Staff get their OWN tokens,
   revoked one at a time. A staff token opens the newsroom and nothing else —
   not the read worker, not the pay desk, not Amalia's voices.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang   (shared with amalia and read)
              AI         Workers AI      (recording a bulletin)
              AUDIO      R2 bucket       (where recordings sit)
   SECRETS    LOG_KEY    the owner's key
   CRON       0 * * * *  hourly, for repeating bulletins

   THE DESK — a staff token, or the owner key
     ?action=bulletin&text=…&placed=top|body&hours=&max=&sites=
     ?action=breaking&text=…      write it and record it now
     ?action=bulletins            everything queued
     ?action=edit&id=&text=…      replace the words — drops any recording
     ?action=repeat&id=&hours=    repeat it, 0 to stop
     ?action=reair&id=            record it again now
     ?action=voice&id=&by=        POST a human recording as the body
     ?action=unvoice&id=          drop the recording, use Amalia's voice
     ?action=drop&id=             take it down
     ?action=news[&source=]       what the others are running
     ?action=feeds                the watch list
     ?action=testfeeds            try every feed now
     ?action=log                  who did what

   OWNERS ONLY
     ?action=addstaff&name=&role=reporter|editor|owner&sites=
     ?action=staff                the people
     ?action=revoke&name=|&token=
     ?action=addfeed&name=&url=   ·  ?action=dropfeed&id=

   PUBLIC, NO KEY
     ?breaking=1[&site=]          what is live — the corner of a home page
     ?bvoice=<id>                 the recording
     ?archive=1[&q=&from=&to=]    every bulletin ever, with its date and time
     ?rss=1[&site=]               the feed — also a podcast
   ========================================================================== */

const BUILD = "newsroom-1f · 2026-09-12 13:30 ET";

const ENGINE = { model: "@cf/mistralai/mistral-small-3.1-24b-instruct" };
const TTS = { model: "@cf/deepgram/aura-1", voice: "asteria", shape: "aura" };


export default {
  async fetch(req, env) {
    const u = new URL(req.url), q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      /* ---------- public, no key ---------- */
      if (q.get("bvoice")) return await serveBulletinAudio(env, q, req);
      if (q.get("breaking")) return json(await liveBulletin(env, q.get("site")), H);
      if (q.get("archive")) return json(await archive(env, q), H);
      if (q.get("rss") || u.pathname === "/rss" || u.pathname === "/feed")
        return await rssFeed(env, q, u);

      /* ---------- the desk ---------- */
      const me = await whoIsAsking(env, req, q);
      if (!me) return json({ ok:false, error:"unauthorized",
        note:"A staff token or the owner key is needed." }, H, 401);

      const a = q.get("action") || "bulletins";

      if (a === "staff")     return json(can(me,"staff") ? await listStaff(env)
                               : { ok:false, error:"owners only" }, H);
      if (a === "addstaff")  return json(can(me,"staff") ? await addStaff(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "revoke")    return json(can(me,"staff") ? await revokeStaff(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "addfeed")   return json(can(me,"staff") ? await addFeed(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "dropfeed")  return json(can(me,"staff") ? await dropFeed(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "addsite")   return json(can(me,"staff") ? await addSite(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "dropsite")  return json(can(me,"staff") ? await dropSite(env, q)
                               : { ok:false, error:"owners only" }, H);
      if (a === "sites")     return json(await listSites(env), H);
      if (a === "retag")     return json(can(me,"staff") ? await retagFeeds(env)
                               : { ok:false, error:"owners only" }, H);

      if (a === "log")       return json(await newsroomLog(env, q), H);
      if (a === "news")      return json(await watchNews(env, q), H);
      if (a === "feeds")     return json(await listFeeds(env), H);
      if (a === "testfeeds") return json(await testFeeds(env), H);

      if (a === "bulletin")  return json(await postBulletin(env, q, req, me), H);
      if (a === "bulletins") return json(await listBulletins(env, me), H);
      if (a === "breaking")  return json(await breaking(env, q, req, me), H);
      if (a === "edit")      return json(await guard(env, me, q, editBulletin), H);
      if (a === "repeat")    return json(await guard(env, me, q, setRepeat), H);
      if (a === "reair")     return json(await guard(env, me, q,
                               (e,q2) => reair(e, q2.get("id"))), H);
      if (a === "voice")     return json(await guard(env, me, q,
                               (e,q2) => humanVoice(e, q2, req)), H);
      if (a === "unvoice")   return json(await guard(env, me, q,
                               (e,q2) => dropVoice(e, q2.get("id"))), H);
      if (a === "drop")      return json(await guard(env, me, q,
                               (e,q2) => dropBulletin(e, q2.get("id"))), H);

      return json({ ok:false, error:"no such action", you: me.name, role: me.role }, H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  },

  /* ⚠ HOURLY, FOR REPEATS ONLY. Breaking news happens whenever; the
     broadcasts keep their own hours over in the amalia worker and are
     never disturbed by anything here. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(setup(env).then(() => sweepRepeats(env)));
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS bulletins (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       text TEXT NOT NULL,
       kind TEXT DEFAULT 'report',
       placed TEXT DEFAULT 'body',
       runs_from TEXT, runs_until TEXT,
       max_reads INTEGER DEFAULT 0,
       reads INTEGER DEFAULT 0,
       live INTEGER DEFAULT 1,
       made TEXT DEFAULT (datetime('now')),
       last_read TEXT,
       voice TEXT, voice_key TEXT, voice_type TEXT, voice_by TEXT,
       voice_secs INTEGER,
       repeat_hours INTEGER DEFAULT 0,
       last_aired TEXT, airings INTEGER DEFAULT 0, audio_key TEXT,
       sites TEXT DEFAULT 'all', by_who TEXT, by_role TEXT)`).run();

  for (const col of ["voice TEXT","voice_key TEXT","voice_type TEXT","voice_by TEXT",
                     "voice_secs INTEGER","repeat_hours INTEGER DEFAULT 0",
                     "last_aired TEXT","airings INTEGER DEFAULT 0","audio_key TEXT",
                     "sites TEXT DEFAULT 'all'","by_who TEXT","by_role TEXT"]) {
    try { await env.OVERHANG.prepare(
      "ALTER TABLE bulletins ADD COLUMN " + col).run(); } catch (e) {}
  }

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS staff (
       token TEXT PRIMARY KEY, name TEXT NOT NULL,
       role TEXT DEFAULT 'reporter', sites TEXT DEFAULT 'all',
       active INTEGER DEFAULT 1, made TEXT DEFAULT (datetime('now')),
       last_seen TEXT, posts INTEGER DEFAULT 0, note TEXT)`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS newsroom_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       at TEXT DEFAULT (datetime('now')),
       who TEXT, role TEXT, did TEXT, bulletin INTEGER, detail TEXT)`).run();

  /* ============================================================
     THE SITES

     ⚠ ONE NEWSROOM, MANY MASTHEADS. His point, 11 Sep 2026: this
     serves warrantwire, 8k10q, newsweed, musicisnews,
     comedyisnews and whatever comes next. So the list of sites is
     a TABLE, not three names written into the code — a new
     masthead is one row, not a redeploy.

     Each site has its own feed, its own RSS, its own corner. A
     bulletin filed for one never appears on another.
     ============================================================ */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS sites (
       key TEXT PRIMARY KEY,          /* wire, 8k10q, newsweed, music … */
       title TEXT NOT NULL,
       home TEXT NOT NULL,
       about TEXT,
       active INTEGER DEFAULT 1,
       made TEXT DEFAULT (datetime('now')))`).run();

  try {
    const n = await env.OVERHANG.prepare("SELECT COUNT(*) c FROM sites").first();
    if (!n || !n.c) {
      const seed = [
        ["wire", "Warrant Wire — breaking", "https://warrantwire.com",
         "Warrant financings as they are filed, and what they mean."],
        ["8k10q", "8K10Q — breaking", "https://8k10q.com",
         "Filings read in plain English."],
        ["newsweed", "Newsweed — breaking", "https://newsweed.com",
         "News that has been checked."],
        ["music", "Music Is News", "https://musicisnews.com",
         "Music, and the business behind it."],
        ["comedy", "Comedy Is News", "https://comedyisnews.com",
         "Comedy, and the business behind it."]
      ];
      for (const [k, t, h, a2] of seed)
        await env.OVERHANG.prepare(
          "INSERT INTO sites (key, title, home, about) VALUES (?,?,?,?)")
          .bind(k, t, h, a2).run();
    }
  } catch (e) {}

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS feeds (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL, url TEXT NOT NULL, active INTEGER DEFAULT 1,
       sites TEXT DEFAULT 'all',     /* which mastheads care about it */
       last_ok TEXT, last_error TEXT, items INTEGER DEFAULT 0,
       made TEXT DEFAULT (datetime('now')))`).run();

  /* ⚠ A MUSIC SITE DOES NOT NEED SEC FILINGS, and the wire does not need the
     music press. A feed carries which mastheads care about it, so a reporter
     on shift sees what is relevant to what they are writing and not a wall
     of everything. */
  try { await env.OVERHANG.prepare(
    "ALTER TABLE feeds ADD COLUMN sites TEXT DEFAULT 'all'").run(); } catch (e) {}

  /* ⚠ WHAT ACTUALLY PUBLISHES A FEED, and nothing that does not. Bloomberg
     retired its public feeds; anything sold as one is a third party scraping
     them, and a newsroom built on somebody's scraper breaks the week they get
     blocked. A dead feed here is one row to replace — never a redeploy. */
  try {
    const n = await env.OVERHANG.prepare("SELECT COUNT(*) c FROM feeds").first();
    if (!n || !n.c) {
      const seed = [
        ["WSJ Markets",   "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",   "wire,8k10q,newsweed"],
        ["WSJ Business",  "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness",  "wire,8k10q,newsweed"],
        ["WSJ Economy",   "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed", "wire,8k10q,newsweed"],
        ["FT Companies",  "https://www.ft.com/companies?format=rss",                        "wire,8k10q"],
        ["FT Markets",    "https://www.ft.com/markets?format=rss",                          "wire,8k10q"],
        ["NYT Business",  "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",      "all"],
        ["NYT DealBook",  "https://rss.nytimes.com/services/xml/rss/nyt/DealBook.xml",      "wire,8k10q"],
        ["NYT Economy",   "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml",       "wire,8k10q,newsweed"],
        ["NYT Arts",      "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",          "music,comedy"],
        ["NYT Music",     "https://rss.nytimes.com/services/xml/rss/nyt/Music.xml",         "music"],
        ["NYT Television","https://rss.nytimes.com/services/xml/rss/nyt/Television.xml",    "comedy"],
        ["Gulf News Business", "https://gulfnews.com/rss?generatorName=business",           "wire,newsweed"],
        ["Gulf News Markets",  "https://gulfnews.com/rss?generatorName=business/markets",   "wire,newsweed"],
        ["SEC latest 8-K", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom", "wire,8k10q"]
      ];
      for (const row of seed)
        await env.OVERHANG.prepare(
          "INSERT INTO feeds (name, url, sites) VALUES (?,?,?)")
          .bind(row[0], row[1], row[2] || "all").run();
    }
  } catch (e) {}
}


/* ⚠ NEW YORK, ALWAYS. The stamp on a bulletin is the time a New York
   newsroom filed it, not the time on a server in some other country. */
function nowNY(d) {
  const now = d || new Date();
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).formatToParts(now);
  const g = t => (f.find(p => p.type === t) || {}).value;
  const dowMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const n = dowMap[g("weekday")];
  return { date: g("year") + "-" + g("month") + "-" + g("day"),
           hour: +g("hour"), min: +g("minute"), dow: n, day_name: names[n] };
}

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}

/* ============================================================
   WHO IS ASKING

   Three roles and they are deliberately few:

     reporter  writes, records, changes and takes down HIS OWN
     editor    all of that, on anybody's
     owner     the above, plus adding and revoking people

   ⚠ A REPORTER PUBLISHES STRAIGHT. Nothing waits for approval —
   access is trust. What a reporter cannot do is touch somebody
   else's work or hand out access.

   ⚠ A REPORTER'S TOKEN OPENS THE NEWSROOM AND NOTHING ELSE. It
   is not LOG_KEY, it does not work on the read worker, the pay
   desk or anywhere else, and revoking it costs one click.
   ============================================================ */
async function whoIsAsking(env, req, q) {
  const given = req.headers.get("X-Auth-Key") || q.get("key") || q.get("token") || "";
  if (!given) return null;

  /* the owner's key still works, and outranks everything */
  if (env.LOG_KEY && given === env.LOG_KEY)
    return { token: "owner", name: "Mark Nejmeh", role: "owner", sites: "all", owner: true };

  try {
    const r = await env.OVERHANG.prepare(
      "SELECT token, name, role, sites, active FROM staff WHERE token = ?")
      .bind(given).first();
    if (!r || !r.active) return null;
    await env.OVERHANG.prepare(
      "UPDATE staff SET last_seen = datetime('now') WHERE token = ?").bind(given).run();
    return { token: r.token, name: r.name, role: r.role || "reporter",
             sites: r.sites || "all", owner: false };
  } catch (e) { return null; }
}

function can(me, what, bulletin) {
  if (!me) return false;
  if (me.role === "owner") return true;
  if (what === "staff") return false;                 /* owners only */
  if (me.role === "editor") return true;
  /* a reporter, on their own work only */
  if (!bulletin) return what === "post";
  return String(bulletin.by_who || "") === String(me.token);
}

async function noted(env, me, did, bulletin, detail) {
  try {
    await env.OVERHANG.prepare(
      `INSERT INTO newsroom_log (who, role, did, bulletin, detail)
       VALUES (?,?,?,?,?)`)
      .bind(me ? me.name : "?", me ? me.role : "?", did,
            bulletin || null, String(detail || "").slice(0, 300)).run();
  } catch (e) {}
}

/* ============================================================
   THE STAFF LIST — owners only
   ============================================================ */
function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return "wn_" + Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function addStaff(env, q) {
  const name = String(q.get("name") || "").trim();
  const role = ["reporter", "editor", "owner"].indexOf(q.get("role")) >= 0
    ? q.get("role") : "reporter";
  const sites = String(q.get("sites") || "all").trim();
  if (name.length < 2) return { ok:false, build: BUILD, error:"a name, please" };

  const token = newToken();
  await env.OVERHANG.prepare(
    "INSERT INTO staff (token, name, role, sites, note) VALUES (?,?,?,?,?)")
    .bind(token, name, role, sites, String(q.get("note") || "").slice(0, 200)).run();

  return { ok:true, build: BUILD, name, role, sites, token,
    note: "Give them this token. It opens the newsroom and nothing else. " +
          "IT IS SHOWN ONCE — write it down now. Revoke it any time with " +
          "?action=revoke&token=…" };
}

async function listStaff(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT name, role, sites, active, made, last_seen, posts, note,
            substr(token,1,9) || '…' AS token_starts
       FROM staff ORDER BY active DESC, name`).all();
  return { ok:true, build: BUILD, rows: r.results || [],
    note: "Tokens are never shown again after they are made." };
}

async function revokeStaff(env, q) {
  const t = q.get("token");
  const nm = q.get("name");
  if (!t && !nm) return { ok:false, build: BUILD, error:"pass &token= or &name=" };
  const r = t
    ? await env.OVERHANG.prepare("UPDATE staff SET active=0 WHERE token=?").bind(t).run()
    : await env.OVERHANG.prepare("UPDATE staff SET active=0 WHERE name=?").bind(nm).run();
  return { ok:true, build: BUILD, revoked: t || nm,
    note: "Their token stops working now. What they filed stays on the record — " +
          "revoking somebody does not unpublish their work." };
}

async function newsroomLog(env, q) {
  const r = await env.OVERHANG.prepare(
    `SELECT at, who, role, did, bulletin, detail FROM newsroom_log
      ORDER BY id DESC LIMIT ?`).bind(Math.min(200, +(q.get("limit") || 60))).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}


/* ⚠ A REPORTER TOUCHES HIS OWN WORK AND NOBODY ELSE'S. Checked here, once,
   for every action that names a bulletin — rather than in nine places where
   one could be forgotten. */
async function guard(env, me, q, fn) {
  const id = q.get("id");
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  const b = await env.OVERHANG.prepare(
    "SELECT id, by_who, by_role, text FROM bulletins WHERE id = ?").bind(id).first();
  if (!b) return { ok:false, build: BUILD, error:"no bulletin with that id" };
  if (!can(me, "touch", b))
    return { ok:false, build: BUILD, error:"that is not yours",
      note:"A reporter may change and take down their own bulletins. An editor " +
           "may do it to anybody's." };
  const out = await fn(env, q);
  await noted(env, me, q.get("action"), id, (b.text || "").slice(0, 80));
  return out;
}


/* ============================================================
   CHANGING A BULLETIN AFTER IT IS UP

   ⚠ REPLACING THE WORDS DROPS THE RECORDING. A recording of the
   old words sitting under new text is the worst thing this could
   do — a listener hears one thing and reads another. Change the
   text and the audio goes; record it again.
   ============================================================ */
async function editBulletin(env, q) {
  const id = q.get("id");
  const text = String(q.get("text") || "").trim();
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  if (text.length < 3) return { ok:false, build: BUILD, error:"nothing to say" };

  const had = await env.OVERHANG.prepare(
    "SELECT voice, voice_key, audio_key FROM bulletins WHERE id = ?").bind(id).first();
  if (!had) return { ok:false, build: BUILD, error:"no bulletin with that id" };

  await env.OVERHANG.prepare(
    `UPDATE bulletins SET text = ?, voice = NULL, voice_key = NULL,
            voice_by = NULL, audio_key = NULL WHERE id = ?`).bind(text, id).run();

  return { ok:true, build: BUILD, id, text,
    recording_dropped: !!(had.voice_key || had.audio_key),
    note: had.voice_key || had.audio_key
      ? "The words changed, so the old recording was dropped. Record it again " +
        "before anyone hears it — audio of the old words under new text is the " +
        "one mistake worth avoiding here."
      : "Changed. There was no recording to drop." };
}

/* ============================================================
   REPEATING IT

   ⚠ ON OR OFF, and off is the default. A bulletin that re-airs
   for ever is a bulletin nobody hears after the second time.
   ============================================================ */
async function setRepeat(env, q) {
  const id = q.get("id");
  const hours = Math.max(0, Math.min(24, +(q.get("hours") || 0)));
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  await env.OVERHANG.prepare(
    "UPDATE bulletins SET repeat_hours = ? WHERE id = ?").bind(hours, id).run();
  return { ok:true, build: BUILD, id, repeat_hours: hours,
    note: hours
      ? "It will be recorded again every " + hours +
        (hours === 1 ? " hour" : " hours") + " while it is live."
      : "Repeating is off. It stays as it is." };
}

/* record a bulletin again, now — used by the hourly repeat and by hand */
async function reair(env, id) {
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  const b = await env.OVERHANG.prepare(
    "SELECT id, text, voice FROM bulletins WHERE id = ? AND live = 1").bind(id).first();
  if (!b) return { ok:false, build: BUILD, error:"no live bulletin with that id" };

  /* ⚠ NEVER OVERWRITE A HUMAN RECORDING. If a person read it, that is the
     version, and re-airing must not quietly replace them with a machine. */
  if (b.voice === "human")
    return { ok:false, build: BUILD, id,
      error:"a person recorded this one — re-airing would replace their voice " +
            "with Amalia's. Drop the recording first if that is what you want." };

  if (!env.AUDIO) return { ok:false, build: BUILD, error:"no AUDIO binding" };

  const script = breathe(
    "This is breaking news, from Warrant Wire. Amalia here. " + b.text +
    " That is all I have for the moment. Thank you.");

  let bytes;
  try { bytes = (await speakAll(env, script)).bytes; }
  catch (e) { return { ok:false, build: BUILD, error:"the voice refused: " + String(e) }; }

  const key = "bulletin/" + id + "-amalia.mp3";
  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-cache" } });
  await env.OVERHANG.prepare(
    `UPDATE bulletins SET audio_key = ?, last_aired = datetime('now'),
            airings = COALESCE(airings,0) + 1 WHERE id = ?`).bind(key, id).run();

  return { ok:true, build: BUILD, id, key, bytes: bytes.byteLength,
    script, playback: "/?bvoice=" + id };
}

/* ============================================================
   THE HOURLY SWEEP

   ⚠ IT RUNS ON EVERY CRON FIRE, BEFORE THE BROADCAST GUARD.
   Breaking news happens whenever, and the scheduled broadcasts
   are never disturbed by it — so the sweep cannot sit inside the
   window check that decides whether a broadcast is due.
   ============================================================ */
async function sweepRepeats(env) {
  let done = 0;
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT id, repeat_hours, last_aired FROM bulletins
        WHERE live = 1 AND COALESCE(repeat_hours,0) > 0
          AND (voice IS NULL OR voice <> 'human')
          AND (runs_until IS NULL OR runs_until >= datetime('now'))
          AND (last_aired IS NULL
               OR last_aired <= datetime('now', '-' || repeat_hours || ' hours'))`).all();
    for (const b of (r.results || [])) {
      try { await reair(env, b.id); done++; } catch (e) {}
    }
  } catch (e) {}
  return done;
}






/* ============================================================
   THE MASTHEADS

   ⚠ ADDING A SITE IS A ROW, NOT A DEPLOY. Each one gets its own
   corner, its own RSS, its own slice of the newsroom. Nothing
   filed for one appears on another.
   ============================================================ */
async function listSites(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT s.key, s.title, s.home, s.about, s.active,
            (SELECT COUNT(*) FROM bulletins b
              WHERE b.sites = 'all'
                 OR ',' || b.sites || ',' LIKE '%,' || s.key || ',%') AS bulletins,
            (SELECT COUNT(*) FROM feeds f
              WHERE f.active = 1 AND (f.sites = 'all'
                 OR ',' || f.sites || ',' LIKE '%,' || s.key || ',%')) AS feeds
       FROM sites s ORDER BY s.active DESC, s.key`).all();
  return { ok:true, build: BUILD, rows: r.results || [],
    note: "Each site's corner asks ?breaking=1&site=KEY and its feed is " +
          "?rss=1&site=KEY." };
}

async function addSite(env, q) {
  const key = String(q.get("key") || "").trim().toLowerCase();
  const title = String(q.get("title") || "").trim();
  const home = String(q.get("home") || "").trim();
  if (!/^[a-z0-9_-]{2,20}$/.test(key))
    return { ok:false, build: BUILD,
      error:"a short key, letters and numbers only — wire, music, comedy" };
  if (title.length < 2 || !/^https?:\/\//.test(home))
    return { ok:false, build: BUILD, error:"a title and a full https address, please" };

  await env.OVERHANG.prepare(
    `INSERT INTO sites (key, title, home, about) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET title=excluded.title, home=excluded.home,
       about=excluded.about, active=1`)
    .bind(key, title, home, String(q.get("about") || "").slice(0, 300)).run();

  return { ok:true, build: BUILD, key, title, home,
    corner: "?breaking=1&site=" + key,
    feed: "?rss=1&site=" + key,
    note: "Point that site's corner and feed at those two, and tag its " +
          "sources with ?action=addfeed&sites=" + key };
}

async function dropSite(env, q) {
  const key = String(q.get("key") || "").trim().toLowerCase();
  if (!key) return { ok:false, build: BUILD, error:"which one? pass &key=" };
  await env.OVERHANG.prepare("UPDATE sites SET active = 0 WHERE key = ?").bind(key).run();
  return { ok:true, build: BUILD, key,
    note: "Off the list. What was filed for it stays on the record." };
}


/* ============================================================
   PUTTING THE FEEDS BACK ON THEIR OWN MASTHEADS

   ⚠ WHY THIS EXISTS. The feeds table was created while this code
   was briefly living inside the amalia worker, before feeds knew
   about mastheads. When the newsroom started up it found rows
   already there, skipped its seed, and the new `sites` column
   defaulted to 'all' — so the music site was being offered SEC
   filings and the wire the television pages.

   Run once. It is safe to run again: it sets, it does not
   duplicate, and it only adds a feed that is missing.
   ============================================================ */
async function retagFeeds(env) {
  const want = {
    "WSJ Markets":        "wire,8k10q,newsweed",
    "WSJ Business":       "wire,8k10q,newsweed",
    "WSJ Economy":        "wire,8k10q,newsweed",
    "FT Companies":       "wire,8k10q",
    "FT Markets":         "wire,8k10q",
    "NYT Business":       "all",
    "NYT DealBook":       "wire,8k10q",
    "NYT Economy":        "wire,8k10q,newsweed",
    "NYT Arts":           "music,comedy",
    "NYT Music":          "music",
    "NYT Television":     "comedy",
    "Gulf News Business": "wire,newsweed",
    "Gulf News Markets":  "wire,newsweed",
    "SEC latest 8-K":     "wire,8k10q"
  };
  const urls = {
    "NYT Arts":       "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
    "NYT Music":      "https://rss.nytimes.com/services/xml/rss/nyt/Music.xml",
    "NYT Television": "https://rss.nytimes.com/services/xml/rss/nyt/Television.xml"
  };

  let set = 0, added = 0;
  for (const name of Object.keys(want)) {
    const had = await env.OVERHANG.prepare(
      "SELECT id FROM feeds WHERE name = ?").bind(name).first();
    if (had) {
      await env.OVERHANG.prepare(
        "UPDATE feeds SET sites = ? WHERE id = ?").bind(want[name], had.id).run();
      set++;
    } else if (urls[name]) {
      await env.OVERHANG.prepare(
        "INSERT INTO feeds (name, url, sites) VALUES (?,?,?)")
        .bind(name, urls[name], want[name]).run();
      added++;
    }
  }

  const r = await env.OVERHANG.prepare(
    "SELECT name, sites FROM feeds WHERE active = 1 ORDER BY id").all();
  return { ok:true, build: BUILD, retagged: set, added,
    now: (r.results || []),
    note: "Run ?action=sites again — each masthead should now show only the " +
          "sources that matter to it." };
}

/* ============================================================
   WATCHING THE OTHERS

   ⚠ THE WORKER FETCHES, NOT THE BROWSER. A page cannot read
   somebody else's feed directly — the browser refuses it — so
   the fetching happens here and the desk asks us.

   ⚠ HEADLINE, SOURCE, TIME AND LINK. NOTHING ELSE IS TAKEN.
   No summary, no body, no image. A reporter clicks through and
   reads it where it was published, which is where the publisher
   wants them.
   ============================================================ */
function tagText(block, tag) {
  const m = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i").exec(block);
  if (!m) return "";
  let t = m[1];
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
       .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return t.replace(/\s+/g, " ").trim();
}

function tagAttr(block, tag, attr) {
  const m = new RegExp("<" + tag + "[^>]*\\b" + attr + "=[\"']([^\"']+)[\"']", "i").exec(block);
  return m ? m[1] : "";
}

function parseFeed(xmlText, source) {
  const out = [];
  const isAtom = /<feed[\s>]/i.test(xmlText);
  const parts = xmlText.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);

  for (const raw of parts.slice(0, 25)) {
    const block = "<x " + raw;
    const title = tagText(block, "title");
    if (!title) continue;

    let link = isAtom ? tagAttr(block, "link", "href") : tagText(block, "link");
    if (!link) link = tagText(block, "guid");

    const when = tagText(block, "pubDate") || tagText(block, "updated") ||
                 tagText(block, "published") || tagText(block, "dc:date");

    let t = 0;
    try { const d = new Date(when); if (!isNaN(d)) t = d.getTime(); } catch (e) {}

    out.push({ source, title: title.slice(0, 200), link, when, at: t });
  }
  return out;
}

async function watchNews(env, q) {
  const only = String(q.get("source") || "").trim().toLowerCase();
  /* ⚠ ONLY WHAT THIS MASTHEAD CARES ABOUT. A reporter writing for the music
     site should not be handed a wall of SEC filings, and a reporter on the
     wire does not need the television pages. */
  const forSite = String(q.get("site") || "").trim().toLowerCase();

  let feeds = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT id, name, url, sites FROM feeds
        WHERE active = 1
          AND (? = '' OR sites = 'all' OR sites IS NULL
               OR ',' || sites || ',' LIKE '%,' || ? || ',%')
        ORDER BY id`).bind(forSite, forSite).all();
    feeds = r.results || [];
  } catch (e) { return { ok:false, build: BUILD, error: String(e) }; }

  const items = [], trouble = [];
  for (const f of feeds) {
    if (only && f.name.toLowerCase().indexOf(only) < 0) continue;
    try {
      const res = await fetch(f.url, {
        headers: { "User-Agent": "WarrantWire newsroom (research@warrantwire.com)" },
        cf: { cacheTtl: 240, cacheEverything: true }
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const got = parseFeed(text, f.name);
      items.push(...got);
      await env.OVERHANG.prepare(
        "UPDATE feeds SET last_ok = datetime('now'), items = ?, last_error = NULL WHERE id = ?")
        .bind(got.length, f.id).run().catch(() => {});
    } catch (e) {
      trouble.push({ source: f.name, why: String(e).slice(0, 120) });
      await env.OVERHANG.prepare(
        "UPDATE feeds SET last_error = ? WHERE id = ?")
        .bind(String(e).slice(0, 200), f.id).run().catch(() => {});
    }
  }

  items.sort((a, b) => b.at - a.at);

  return { ok:true, build: BUILD,
    site: forSite || "everything",
    sources: feeds.length, showing: Math.min(items.length, 60),
    items: items.slice(0, 60).map(x => ({
      source: x.source, headline: x.title, link: x.link, when: x.when })),
    trouble: trouble.length ? trouble : undefined,
    note: "Headlines and links only. Click through and read it where it was " +
          "published — nothing of theirs is copied here." };
}

/* ⚠ TRY EVERY ONE AND SAY WHICH ANSWERED. Feeds move without notice, and
   finding out from an empty newsroom panel at six in the morning is the wrong
   time. This calls each one once and reports what came back. */
async function testFeeds(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id, name, url FROM feeds WHERE active = 1 ORDER BY id").all();
  const out = [];
  for (const f of (r.results || [])) {
    const row = { id: f.id, name: f.name };
    try {
      const res = await fetch(f.url, {
        headers: { "User-Agent": "WarrantWire newsroom (research@warrantwire.com)" } });
      row.status = res.status;
      if (res.ok) {
        const t = await res.text();
        const got = parseFeed(t, f.name);
        row.items = got.length;
        row.working = got.length > 0;
        row.newest = got.length ? got[0].title.slice(0, 70) : null;
        if (!got.length) row.why = "answered, but nothing parsed out of it";
      } else {
        row.working = false;
        row.why = "HTTP " + res.status;
      }
    } catch (e) {
      row.working = false;
      row.why = String(e).slice(0, 120);
    }
    out.push(row);
    await env.OVERHANG.prepare(
      "UPDATE feeds SET last_ok = CASE WHEN ? THEN datetime('now') ELSE last_ok END, " +
      "last_error = CASE WHEN ? THEN NULL ELSE ? END WHERE id = ?")
      .bind(row.working ? 1 : 0, row.working ? 1 : 0,
            row.why || null, f.id).run().catch(() => {});
  }
  const live = out.filter(x => x.working).length;
  return { ok:true, build: BUILD, tried: out.length, working: live, rows: out,
    note: live === out.length
      ? "All of them answered."
      : "Anything not working is one row to replace — ?action=dropfeed&id= and " +
        "?action=addfeed&name=&url=. No redeploy." };
}

async function listFeeds(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id, name, url, active, last_ok, last_error, items FROM feeds ORDER BY id").all();
  return { ok:true, build: BUILD, rows: r.results || [],
    note: "A feed that stops working shows its last error here. Bloomberg has " +
          "no public feed at all — anything claiming to be one is a third party " +
          "scraping them." };
}

async function addFeed(env, q) {
  const name = String(q.get("name") || "").trim();
  const url = String(q.get("url") || "").trim();
  if (name.length < 2 || !/^https?:\/\//.test(url))
    return { ok:false, build: BUILD, error:"a name and a full https address, please" };
  const sites = String(q.get("sites") || "all").trim().toLowerCase();
  const ins = await env.OVERHANG.prepare(
    "INSERT INTO feeds (name, url, sites) VALUES (?,?,?)").bind(name, url, sites).run();
  return { ok:true, build: BUILD, id: ins.meta && ins.meta.last_row_id, name, url, sites };
}

async function dropFeed(env, q) {
  const id = q.get("id");
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  await env.OVERHANG.prepare("UPDATE feeds SET active = 0 WHERE id = ?").bind(id).run();
  return { ok:true, build: BUILD, id, note: "Off the watch list." };
}


/* ============================================================
   THE FEED OUT

   ⚠ THE AUDIO GOES IN AS AN ENCLOSURE, WHICH MAKES THIS A
   PODCAST AS WELL AS A NEWS FEED. Apple, Spotify and every
   podcast app read RSS and look for exactly that tag. The same
   file serves a reader with a feed reader and a listener in a
   car, and neither needed anything built for them.

   ⚠ EVERY SITE ASKS FOR ITS OWN SLICE. ?site=wire, ?site=newsweed,
   ?site=8k10q — or nothing, and it carries everything marked for
   all. A bulletin filed for one site never leaks into another's
   feed.

   ⚠ THE FEED CARRIES WHAT WAS PUBLISHED, INCLUDING WHAT HAS
   SINCE BEEN TAKEN DOWN. A subscriber who read it at four
   o'clock should still find it at six. Anything else is quietly
   rewriting the record.
   ============================================================ */
function xml(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* RSS wants RFC 822. Our dates are stored as "YYYY-MM-DD HH:MM:SS" in UTC. */
function rfc822(sqlTime) {
  try {
    const d = new Date(String(sqlTime).replace(" ", "T") + "Z");
    if (isNaN(d)) return "";
    const D = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
    const M = ["Jan","Feb","Mar","Apr","May","Jun",
               "Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
    const p = n => ("0" + n).slice(-2);
    return D + ", " + p(d.getUTCDate()) + " " + M + " " + d.getUTCFullYear() + " " +
           p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" +
           p(d.getUTCSeconds()) + " GMT";
  } catch (e) { return ""; }
}

/* ⚠ THE MASTHEAD COMES FROM THE TABLE, NOT FROM CODE. A new site is a row. */
async function siteMeta(env, key) {
  const k = String(key || "").trim().toLowerCase();
  if (k) {
    try {
      const r = await env.OVERHANG.prepare(
        "SELECT key, title, home, about FROM sites WHERE key = ? AND active = 1")
        .bind(k).first();
      if (r) return r;
    } catch (e) {}
  }
  return { key: "", title: "Warrant Wire — breaking",
           home: "https://warrantwire.com",
           about: "Warrant financings as they are filed, and what they mean." };
}

async function rssFeed(env, q, u) {
  const site = String(q.get("site") || "").trim().toLowerCase();
  const meta = await siteMeta(env, site);
  const self = "https://" + u.hostname + "/?rss=1" + (site ? "&site=" + site : "");
  const limit = Math.max(1, Math.min(100, +(q.get("limit") || 40)));

  let rows = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT id, text, kind, placed, made, voice, voice_by, voice_key,
              audio_key, sites
         FROM bulletins
        WHERE (? = '' OR sites = 'all' OR sites IS NULL
               OR ',' || sites || ',' LIKE '%,' || ? || ',%')
        ORDER BY made DESC, id DESC LIMIT ?`).bind(site, site, limit).all();
    rows = r.results || [];
  } catch (e) {}

  const base = "https://" + u.hostname;
  const items = rows.map(x => {
    const breaking = x.placed === "top" || x.kind === "breaking";
    const words = String(x.text || "");
    const title = (breaking ? "Breaking: " : "") +
      (words.length > 90 ? words.slice(0, 88).replace(/\s+\S*$/, "") + "…" : words);
    const who = x.voice === "human" ? (x.voice_by || "a person") : "Amalia";
    const body = words + "\n\nRead by " + who + ".";
    const audio = (x.voice_key || x.audio_key) ? base + "/?bvoice=" + x.id : null;

    return "  <item>\n" +
      "    <title>" + xml(title) + "</title>\n" +
      "    <link>" + xml(meta.home) + "</link>\n" +
      "    <guid isPermaLink=\"false\">warrantwire-bulletin-" + x.id + "</guid>\n" +
      "    <pubDate>" + rfc822(x.made) + "</pubDate>\n" +
      "    <description>" + xml(body) + "</description>\n" +
      "    <category>" + (breaking ? "Breaking" : "Report") + "</category>\n" +
      (audio
        ? "    <enclosure url=\"" + xml(audio) + "\" type=\"audio/mpeg\" length=\"0\"/>\n" +
          "    <itunes:author>" + xml(who) + "</itunes:author>\n"
        : "") +
      "  </item>";
  }).join("\n");

  const body =
'<?xml version="1.0" encoding="UTF-8"?>\n' +
'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">\n' +
'<channel>\n' +
'  <title>' + xml(meta.title) + '</title>\n' +
'  <link>' + xml(meta.home) + '</link>\n' +
'  <description>' + xml(meta.about) + '</description>\n' +
'  <language>en-us</language>\n' +
'  <lastBuildDate>' + rfc822(rows.length ? rows[0].made : "") + '</lastBuildDate>\n' +
'  <atom:link href="' + xml(self) + '" rel="self" type="application/rss+xml"/>\n' +
'  <itunes:author>Mark Nejmeh</itunes:author>\n' +
'  <itunes:explicit>false</itunes:explicit>\n' +
'  <copyright>Every figure quoted comes from a filing and can be checked ' +
     'against it. Nothing here is investment advice.</copyright>\n' +
items + '\n' +
'</channel>\n</rss>\n';

  return new Response(body, { headers: {
    "content-type": "application/rss+xml; charset=utf-8",
    "cache-control": "public, max-age=120",
    "access-control-allow-origin": "*"
  }});
}


/* ============================================================
   THE ARCHIVE — every bulletin ever, searchable by anyone

   ⚠ NOTHING IS EVER DELETED. Taking a bulletin down sets it to
   not-live; the row stays, with the words as published and the
   time they went up. What was said cannot be unsaid, and a
   record that can be quietly edited is worth nothing.

   ⚠ WHOSE VOICE IT WAS IS PART OF THE RECORD. A reader should
   be able to see, months later, whether a person read a thing
   or a machine did.
   ============================================================ */
async function archive(env, q) {
  const term = String(q.get("q") || "").trim();
  const from = String(q.get("from") || "").trim();
  const to   = String(q.get("to") || "").trim();
  const limit = Math.max(1, Math.min(200, +(q.get("limit") || 50)));

  let sql = `SELECT id, text, kind, placed, made, runs_until, live,
                    voice, voice_by, audio_key, voice_key,
                    airings, last_aired, reads
               FROM bulletins WHERE 1=1`;
  const b = [];
  if (term) { sql += " AND LOWER(text) LIKE ?"; b.push("%" + term.toLowerCase() + "%"); }
  if (from) { sql += " AND made >= ?"; b.push(from); }
  if (to)   { sql += " AND made <= ?"; b.push(to + " 23:59:59"); }
  sql += " ORDER BY made DESC, id DESC LIMIT " + limit;

  let rows = [];
  try {
    const r = await env.OVERHANG.prepare(sql).bind(...b).all();
    rows = r.results || [];
  } catch (e) { return { ok:false, build: BUILD, error: String(e) }; }

  let total = 0, first = null;
  try {
    const t = await env.OVERHANG.prepare(
      "SELECT COUNT(*) n, MIN(made) f FROM bulletins").first();
    total = (t && t.n) || 0; first = t && t.f;
  } catch (e) {}

  return { ok:true, build: BUILD,
    searched: term || null,
    from: from || null, to: to || null,
    showing: rows.length, held: total, since: first,
    rows: rows.map(x => ({
      id: x.id,
      text: x.text,
      when: x.made,                       /* UTC, as stored */
      breaking: x.placed === "top" || x.kind === "breaking",
      still_up: !!x.live,
      ran_until: x.runs_until,
      voice: x.voice === "human" ? "a person" : (x.audio_key ? "Amalia" : "not recorded"),
      read_by: x.voice === "human" ? (x.voice_by || "a person") : null,
      audio: (x.voice_key || x.audio_key) ? "/?bvoice=" + x.id : null,
      times_recorded: x.airings || 0,
      last_recorded: x.last_aired,
      times_read_in_a_broadcast: x.reads || 0
    })),
    note: "Every bulletin ever put out, newest first. Taking one down does not " +
          "remove it — the words and the time stay exactly as published." };
}


/* ============================================================
   WHAT IS LIVE RIGHT NOW — for the corner of the home page
   ============================================================ */
async function liveBulletin(env, site) {
  const want = String(site || "").trim().toLowerCase();
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT id, text, kind, placed, voice, voice_by, voice_secs, made,
              audio_key, repeat_hours, airings, last_aired
         FROM bulletins
        WHERE live = 1
          AND (runs_from  IS NULL OR runs_from  <= datetime('now'))
          AND (runs_until IS NULL OR runs_until >= datetime('now'))
          AND (? = '' OR sites = 'all' OR sites IS NULL
               OR ',' || sites || ',' LIKE '%,' || ? || ',%')
        ORDER BY CASE placed WHEN 'top' THEN 0 ELSE 1 END, id DESC
        LIMIT 1`).bind(want, want).first();

    if (!r) return { ok:true, build: BUILD, live: false };

    return { ok:true, build: BUILD, live: true,
      id: r.id,
      text: r.text,
      breaking: r.placed === "top" || r.kind === "breaking",
      posted: r.made,
      audio: (r.voice === "human" || r.audio_key) ? "/?bvoice=" + r.id : null,
      read_by: r.voice === "human" ? (r.voice_by || "a person") : null,
      voice: r.voice === "human" ? "human" : "amalia",
      note: r.voice === "human"
        ? "Read by a person. Say so on the page."
        : "No recording yet — the words alone." };
  } catch (e) {
    return { ok:false, build: BUILD, error: String(e) };
  }
}

/* every broadcast for one day, in order — what the page shows */

/* ============================================================
   THE BULLETIN QUEUE — typed by Mark, read by Amalia

   ⚠ TEXT IS TAKEN AS WRITTEN AND NEVER REWRITTEN. What he types
   is what she says, the same rule as everything else she reads.
   The only thing done to it is the pacing pass, so it breathes.

   ⚠ A BULLETIN COUNTS AS READ ONLY WHEN IT AIRS, never when a
   script is merely written. A test run must not use one up.
   ============================================================ */
async function postBulletin(env, q, req, me) {
  let text = q.get("text") || "";
  if (!text && req.method === "POST") text = await req.text();
  text = String(text).trim();
  if (text.length < 3) return { ok:false, build: BUILD, error:"nothing to say" };

  const placed = q.get("placed") === "top" ? "top" : "body";
  const hours = Math.max(1, Math.min(720, +(q.get("hours") || 24)));
  const max = Math.max(0, +(q.get("max") || 0));
  const kind = q.get("kind") || (placed === "top" ? "breaking" : "report");

  /* ⚠ WHICH FEEDS CARRY IT. The newsroom is not one site — his ruling,
     11 Sep 2026: it spreads across warrantwire, newsweed and 8k10q, and
     each site asks for its own feed. "all" is every site that asks. */
  let sites = String(q.get("sites") || "all").trim().toLowerCase();
  if (me && me.sites && me.sites !== "all" && sites === "all") sites = me.sites;

  const ins = await env.OVERHANG.prepare(
    `INSERT INTO bulletins (text, kind, placed, runs_from, runs_until, max_reads,
                            sites, by_who, by_role)
     VALUES (?,?,?, datetime('now'), datetime('now', ?), ?,?,?,?)`)
    .bind(text, kind, placed, "+" + hours + " hours", max, sites,
          me ? me.token : null, me ? me.role : null).run();

  const id = ins.meta && ins.meta.last_row_id;
  if (me) {
    await env.OVERHANG.prepare(
      "UPDATE staff SET posts = COALESCE(posts,0) + 1 WHERE token = ?")
      .bind(me.token).run().catch(() => {});
    await noted(env, me, "filed", id, text.slice(0, 80));
  }

  return { ok:true, build: BUILD,
    id,
    text, kind, placed, sites,
    filed_by: me ? me.name : null,
    runs_for_hours: hours,
    max_reads: max || "no limit",
    note: (placed === "top" || kind === "breaking")
      ? "Breaking. It goes on the site now and is NOT read in the scheduled " +
        "broadcasts — she only says to watch for it. What you typed is what " +
        "she says; it is never rewritten."
      : "A report. She reads it in every broadcast until it expires. What you " +
        "typed is what she says; it is never rewritten." };
}

async function listBulletins(env, me) {
  const r = await env.OVERHANG.prepare(
    `SELECT b.id, b.text, b.kind, b.placed, b.runs_from, b.runs_until,
            b.max_reads, b.reads, b.live, b.last_read, b.made,
            b.voice, b.voice_by, b.audio_key, b.repeat_hours, b.airings,
            b.sites, b.by_who, s.name AS by_name
       FROM bulletins b LEFT JOIN staff s ON s.token = b.by_who
      ORDER BY b.live DESC, b.id DESC LIMIT 60`).all();
  const rows = (r.results || []).map(x => {
    x.mine = !!(me && (me.role !== "reporter" || String(x.by_who) === String(me.token)));
    x.by_name = x.by_name || (x.by_who ? "someone" : "Mark Nejmeh");
    delete x.by_who;
    return x;
  });
  return { ok:true, build: BUILD, you: me ? { name: me.name, role: me.role } : null,
    rows,
    note: me && me.role === "reporter"
      ? "You may change and take down your own. The rest are shown so you know " +
        "what is already out."
      : undefined };
}

async function dropBulletin(env, id) {
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  await env.OVERHANG.prepare("UPDATE bulletins SET live = 0 WHERE id = ?")
    .bind(id).run();
  return { ok:true, build: BUILD, id, note: "off the queue. The record stays." };
}


/* ============================================================
   BREAKING — said now, not at the next slot

   ⚠ News said at the next scheduled broadcast is news said late.
   This writes the bulletin, scripts a short one-off around it and
   records it immediately, under its own key, so it can go out by
   email or sit at the top of the page within a minute.
   ============================================================ */
async function breaking(env, q, req, me) {
  const posted = await postBulletin(env, q, req, me);
  if (!posted.ok) return posted;

  const ny = nowNY();

  /* ⚠ THE NEWSROOM DOES NOT WRITE INTO AMALIA'S BROADCAST TABLE. A bulletin
     is not a broadcast; it is its own thing with its own recording, and the
     five scheduled broadcasts are never disturbed by it. */
  const script = breathe(
    "This is breaking news, from Warrant Wire. Amalia here. " + posted.text +
    " That is all I have for the moment. I will have more at the next " +
    "broadcast. Thank you.");

  if (!env.AUDIO) return { ok:true, build: BUILD, bulletin: posted, script,
    note: "written but not recorded — no AUDIO binding" };

  let bytes;
  try { bytes = (await speakAll(env, script)).bytes; }
  catch (e) { return { ok:false, build: BUILD, bulletin: posted, script,
    error: "the voice refused: " + String(e) }; }

  const key = "bulletin/" + posted.id + "-amalia.mp3";
  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-cache" } });
  await env.OVERHANG.prepare(
    `UPDATE bulletins SET audio_key = ?, last_aired = datetime('now'),
            airings = COALESCE(airings,0) + 1 WHERE id = ?`)
    .bind(key, posted.id).run();

  return { ok:true, build: BUILD, bulletin: posted, script,
    bytes: bytes.byteLength, filed_at: ny.date,
    playback: "/?bvoice=" + posted.id,
    note: "Recorded and live. It stays on the site until it expires. It is " +
          "NOT read in the scheduled broadcasts — she only says to watch for " +
          "it." };
}


/* ============================================================
   A HUMAN VOICE ON A BULLETIN

   ⚠ A PERSON MAY READ IT INSTEAD OF AMALIA, and when they do the
   page says so. A listener must always know whether they are
   hearing a person or a machine — on a site whose whole argument
   is that nobody checks, being caught passing one off as the
   other would be the end of it.

   The recording is uploaded as the raw body of a POST. It is
   stored in R2 beside the squawks and served back the same way.
   ============================================================ */
async function humanVoice(env, q, req) {
  const id = q.get("id");
  if (!id) return { ok:false, build: BUILD, error:"which bulletin? pass &id=" };
  if (req.method !== "POST")
    return { ok:false, build: BUILD, error:"POST the audio as the body" };
  if (!env.AUDIO) return { ok:false, build: BUILD, error:"no AUDIO binding" };

  const row = await env.OVERHANG.prepare(
    "SELECT id, text FROM bulletins WHERE id = ?").bind(id).first();
  if (!row) return { ok:false, build: BUILD, error:"no bulletin with that id" };

  const bytes = await req.arrayBuffer();
  if (!bytes || bytes.byteLength < 2000)
    return { ok:false, build: BUILD, error:"that is too small to be a recording",
             bytes: bytes ? bytes.byteLength : 0 };

  const type = req.headers.get("content-type") || "audio/webm";
  const ext = /mpeg|mp3/.test(type) ? "mp3" : /wav/.test(type) ? "wav" : "webm";
  const key = "bulletin/" + id + "." + ext;
  const by = (q.get("by") || "").trim().slice(0, 60);

  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: "no-cache" },
    customMetadata: { bulletin: String(id), by: by }
  });

  await env.OVERHANG.prepare(
    `UPDATE bulletins SET voice='human', voice_key=?, voice_type=?, voice_by=?,
            voice_secs=? WHERE id=?`)
    .bind(key, type, by || null, Math.round(bytes.byteLength / 4000), id).run();

  return { ok:true, build: BUILD, id, key, bytes: bytes.byteLength,
    voice: "human", by: by || "(not named)",
    playback: "/?bvoice=" + id,
    note: "The page will play this instead of Amalia, and will say it is a " +
          "person reading." };
}

async function dropVoice(env, id) {
  if (!id) return { ok:false, build: BUILD, error:"which one? pass &id=" };
  await env.OVERHANG.prepare(
    "UPDATE bulletins SET voice=NULL, voice_key=NULL, voice_by=NULL WHERE id=?")
    .bind(id).run();
  return { ok:true, build: BUILD, id,
    note: "The recording is off. Amalia's voice will be used instead." };
}

async function serveBulletinAudio(env, q, req) {
  const id = String(q.get("bvoice") || "").replace(/\D/g, "");
  if (!id || !env.AUDIO) return new Response("not found", { status: 404 });
  const row = await env.OVERHANG.prepare(
    "SELECT voice_key, voice_type, audio_key FROM bulletins WHERE id = ?").bind(id).first();
  const useKey = (row && row.voice_key) || (row && row.audio_key);
  if (!useKey) return new Response("no recording", { status: 404 });
  const obj = await env.AUDIO.get(useKey);
  if (!obj) return new Response("no recording", { status: 404 });
  const h = new Headers();
  h.set("content-type", row.voice_key ? (row.voice_type || "audio/webm") : "audio/mpeg");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "no-store");
  h.set("access-control-allow-origin", "*");
  return new Response(obj.body, { headers: h });
}




const SPEECH = [
  { model: "@cf/deepgram/aura-1",    shape: "aura", speakers:
    ["athena", "luna", "stella", "asteria", "hera", "angus", "orion", "arcas"] },
  { model: "@cf/deepgram/aura-2-en", shape: "aura", speakers:
    ["athena", "luna", "stella", "asteria"] },
  { model: "@cf/myshell-ai/melotts", shape: "melo", speakers: ["EN-BR", "EN-US"] }
];

function speechBody(shape, text, speaker) {
  if (shape === "melo") return { prompt: text, lang: "en" };
  return { text, speaker };
}

/* ============================================================
   AUDITION — hear them, do not read about them

   ?action=voices reports bytes, which tells you a model works and
   nothing about whether she sounds right. This renders the SAME
   line in every candidate voice into R2, and hands back a list of
   links to play. Pick one, put it in the TTS block, done.

   ⚠ SHE IS BRITISH AND THIRTY. aura-1's "athena" is the British
   voice; aura-2's speakers are American, which is what happened
   when the model was switched for expressiveness. MeloTTS has a
   speaker called EN-BR. All three are in the list below.
   ============================================================ */
const AUDITION = [
  { model: "@cf/deepgram/aura-1", speaker: "athena",  shape: "aura",
    note: "British female — the original choice" },
  { model: "@cf/deepgram/aura-1", speaker: "luna",    shape: "aura",
    note: "American female, softer" },
  { model: "@cf/deepgram/aura-1", speaker: "stella",  shape: "aura",
    note: "American female, brighter" },
  { model: "@cf/deepgram/aura-1", speaker: "asteria", shape: "aura",
    note: "American female, warm" },
  { model: "@cf/deepgram/aura-2-en", speaker: "athena", shape: "aura",
    note: "the more expressive model — but American" },
  { model: "@cf/myshell-ai/melotts", speaker: "EN-BR", shape: "melo",
    note: "British English" }
];

const AUDITION_LINE =
  "Afternoon. Amalia again. It's half past twelve in New York. " +
  "Eighty-three degrees and clear. Thirty-one filings carried warrant " +
  "language today. Eighteen of them heavy... A quiet one. " +
  "Greenwave... new warrant terms today. An equity line. And an ownership " +
  "blocker. Don't forget... get your summary for the day. Only five dollars. " +
  "Or why not the year subscription... only three hundred and ten. " +
  "Thank you... and see you after the bell.";

async function audition(env) {
  if (!env.AI) return { ok:false, error:"no AI binding" };
  if (!env.AUDIO) return { ok:false, error:"no AUDIO binding" };
  const out = [];

  for (let i = 0; i < AUDITION.length; i++) {
    const v = AUDITION[i];
    const row = { n: i + 1, model: v.model, speaker: v.speaker, note: v.note };
    try {
      const r = await env.AI.run(v.model, speechBody(v.shape, AUDITION_LINE, v.speaker));
      let bytes;
      if (r instanceof ReadableStream) bytes = await new Response(r).arrayBuffer();
      else if (r instanceof ArrayBuffer) bytes = r;
      else if (r && typeof r.audio === "string")
        bytes = Uint8Array.from(atob(r.audio), c => c.charCodeAt(0)).buffer;
      if (!bytes) { row.error = "no audio came back"; out.push(row); continue; }

      const key = "audition/" + (i + 1) + ".mp3";
      await env.AUDIO.put(key, bytes, {
        httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-store" }
      });
      row.seconds_of_audio_bytes = bytes.byteLength;
      row.listen = "/?audition=" + (i + 1);
    } catch (e) {
      row.error = String(e).slice(0, 200);
    }
    out.push(row);
  }

  return { ok:true, build: BUILD, voices: out,
    note: "Open each ?audition=N and listen. When you have picked one, tell " +
          "Claude the number and it goes into the TTS block at the top." };
}

async function serveAudition(env, q, req) {
  const n = String(q.get("audition") || "").replace(/\D/g, "");
  if (!n || !env.AUDIO) return new Response("not found", { status: 404 });
  const obj = await env.AUDIO.get("audition/" + n + ".mp3");
  if (!obj) return new Response("not rendered yet — run ?action=audition first",
                                { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("content-type", "audio/mpeg");
  h.set("cache-control", "no-store");
  h.set("access-control-allow-origin", "*");
  return new Response(obj.body, { headers: h });
}


const TAIL = " ... End of report.";


/* ============================================================
   HOW A NAME IS SAID, not how it is spelled

   ⚠ AURA READ "Amalia" AS "Amelia". It is a spelling engine, not
   a person — it has no idea whose name it is.

   ⚠ THIS TOUCHES ONLY WHAT IS SENT TO THE VOICE. The stored
   script, the page, the archive and anything anyone reads keep
   the correct spelling. Respelling a name in the text itself
   would put "Ah-MAH-lia" in front of a reader, which is worse
   than the mistake.

   Add a line when a word comes out wrong. It is a table, not a
   rule — every one of these is somebody's actual name.
   ============================================================ */
const SAY_IT_LIKE = [
  [/\bAmalia\b/g,  "Ah-MAH-lia"],     /* not Amelia */
  [/\bNejmeh\b/g,  "NEJ-meh"],
  [/\bWallachBeth\b/g, "Wallach Beth"],
  [/\bSichenzia\b/g,   "Sick-EN-zia"],
  [/\bTheriva\b/g,     "Thu-REE-va"],
  [/\bHaoxin\b/g,      "How-shin"],
  [/\b8K10Q\b/gi,      "eight K ten Q"]
];

function sayItLike(text) {
  let t = String(text || "");
  for (const [re, as] of SAY_IT_LIKE) t = t.replace(re, as);
  return t;
}

const SPEECH_LIMIT = 1800;   /* under the 2000 cap, with room for safety */

function intoChunks(text, limit) {
  limit = limit || SPEECH_LIMIT;
  const t = String(text || "").trim();
  if (t.length <= limit) return [t];

  /* ⚠ AN ELLIPSIS IS A PAUSE, NOT A SENTENCE END. Splitting on it cut a
     sentence in half — "The company's own words on that..." in one piece and
     "assuming the exercise..." in the next — and that break is audible. Hide
     the ellipses, split on real sentence ends, put them back. */
  const HIDE = "\u0001";
  const parts = t.replace(/\.\.\./g, HIDE)
                 .split(/(?<=[.!?])\s+/)
                 .map(x => x.replace(new RegExp(HIDE, "g"), "..."));
  const out = [];
  let cur = "";
  for (const p of parts) {
    const piece = p.trim();
    if (!piece) continue;
    if ((cur + " " + piece).trim().length <= limit) {
      cur = (cur ? cur + " " : "") + piece;
      continue;
    }
    if (cur) out.push(cur);
    /* a single sentence longer than the limit: break it at a comma or an
       ellipsis rather than mid-word */
    if (piece.length > limit) {
      let rest = piece;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(", ", limit);
        if (cut < limit * 0.5) cut = rest.lastIndexOf("... ", limit);
        if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
        if (cut < 1) cut = limit;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).replace(/^[,\s.]+/, "");
      }
      cur = rest;
    } else {
      cur = piece;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* speak one piece and hand back its bytes */
async function speakOne(env, text) {
  /* ⚠ THE RESPELLING HAPPENS HERE AND NOWHERE ELSE — the last moment before
     the voice, so nothing a reader ever sees is affected. */
  const r = await env.AI.run(TTS.model,
    speechBody(TTS.shape, sayItLike(text), TTS.voice));
  if (r instanceof ReadableStream) return await new Response(r).arrayBuffer();
  if (r instanceof ArrayBuffer) return r;
  if (r && typeof r.audio === "string")
    return Uint8Array.from(atob(r.audio), c => c.charCodeAt(0)).buffer;
  throw new Error("speech came back in a shape this worker does not know: " +
                  JSON.stringify(r && typeof r === "object" ? Object.keys(r) : typeof r));
}

/* speak the whole thing, however long, and join it */
async function speakAll(env, text) {
  const chunks = intoChunks(text);
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    /* ⚠ THE LAST PIECE GETS THE SACRIFICIAL TAIL. Deepgram clips the final
       syllables, so the recording of "Stephen, for 8K10Q." came out as half
       his name. The tail takes the clip instead, and the real last line
       survives whole. */
    const c = (i === chunks.length - 1) ? chunks[i] + TAIL : chunks[i];
    buffers.push(await speakOne(env, c));
  }

  let total = 0;
  for (const b of buffers) total += b.byteLength;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const b of buffers) { joined.set(new Uint8Array(b), at); at += b.byteLength; }
  return { bytes: joined.buffer, pieces: chunks.length, chars: text.length };
}


function breathe(text) {
  let t = String(text || "");

  /* ⚠ A COMPANY NAME IS THE THING A LISTENER IS WAITING FOR. Give it a beat
     before it so the voice lifts into it, and one after so it lands. Aura
     holds an ellipsis longer than a full stop, which is the whole trick. */
  /* ⚠ A PRONOUN IS NOT A COMPANY. This rule gave "It... carried a variable
     rate transaction" because "It" looked like a name. Lift only into a real
     name. */
  const NOT_A_NAME = /^(It|The|This|That|A|An|And|But|He|She|They|We|There|Today|Every|What|Want|Get|Or|First|Warrant|Thank|Afternoon|Morning|Evening|Amalia|Stephen)$/;
  t = t.replace(/\. ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?) (filed|carried) /g,
                (m, name, verb) =>
                  NOT_A_NAME.test(name.split(" ")[0]) ? m
                    : ". ... " + name + "... " + verb + " ");
  t = t.replace(/\. ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?), (new |twice|once|three)/g,
                ". ... $1... $2");

  /* an em-dash mid-sentence is a place to stop — and what follows a full
     stop starts with a capital, or it reads as a stumble */
  t = t.replace(/\s+—\s+([a-z])/g, (m, c) => ". " + c.toUpperCase());
  t = t.replace(/\s+—\s+/g, ". ");

  /* ⚠ SHE SPEAKS IN COMPLETE SENTENCES. This rule used to chop
     "a, b, and c." into "A. B. And c." to slow her down, and it bought
     pauses at the cost of grammar — she came out reading a list of
     fragments. An ellipsis gives the same pause INSIDE a sentence, so
     the comma-list is kept whole and simply breathes.

     "an equity line, an ownership blocker, and a floor price"
       becomes
     "an equity line... an ownership blocker... and a floor price" */

  /* ⚠ AND IT ONLY FIRES ON A REAL LIST. It was matching any sentence with two
     commas in it and inserting "and" before whatever followed the second one —
     so "the fees to the firms, the legal and offering expenses, straight out of
     the filings" gained an "and" it never had. A clause opening with because,
     which, so, since, straight, taken or written is NOT the third item in a
     list. */
  const NOT_A_LIST_ITEM =
    /^(because|which|who|that|so|since|while|unless|before|after|though|although|when|where|if|as|straight|taken|written|read|said|at|on|in|to|by|for|from|with|into|under|over|without|against)\b/i;
  t = t.replace(/([a-z]{3,}), ([a-z][a-z ]{3,}), (?:and )?([a-z][a-z ]{3,})\./g,
                (m, a, b, c) =>
                  (NOT_A_LIST_ITEM.test(b.trim()) || NOT_A_LIST_ITEM.test(c.trim()))
                    ? m
                    : a + "... " + b + "... and " + c + ".");

  /* the sign-off pause he asked for, wherever it lands */
  t = t.replace(/\bI will be back after\b/gi, "I will be back... after");
  /* ⚠ DO NOT EXPAND A SIGN-OFF THAT IS ALREADY THERE. The model now writes
     "And that's that... See you back after the bell" itself, and this rule
     found "back after the bell" inside it and expanded it a second time:
     "See you And that's that... See you back after the bell." Hide any
     finished sign-off first, expand what is left, then put it back. */
  /* ⚠ ONE SIGN-OFF, WRITTEN ONCE. His wording: "Thank you... and see you
     after the bell." Hide any finished sign-off — new wording or old — expand
     whatever short form is left, then put the finished one back. Then unwind
     any that arrived already doubled. */
  t = t.replace(/Thank you\.{2,3}\s*and see you(?: later,)? after the bell/gi, "\u0002");
  t = t.replace(/Thank you\.{2,3}\s*and see you(?: later,)? at half twelve/gi, "\u0003");
  t = t.replace(/And that's that\.{2,3}\s*See you back after the bell/gi, "\u0002");
  t = t.replace(/And that's that\.{2,3}\s*See you at half twelve/gi, "\u0003");

  t = t.replace(/\bBack after the bell\b/gi, "\u0002");
  t = t.replace(/\bBack at half twelve\b/gi, "\u0003");

  t = t.replace(/\u0002/g, "Thank you... and see you later, after the bell");
  t = t.replace(/\u0003/g, "Thank you... and see you later, at half twelve");

  /* collapse one that arrived already doubled, however many times */
  let guard = 0;
  while (/Thank you\.{2,3}\s*and see you[^.]*Thank you\.{2,3}\s*and see you/i.test(t)
         && guard++ < 8)
    t = t.replace(/(Thank you\.{2,3}\s*and see you)[^.]*?Thank you\.{2,3}\s*and see you/i, "$1");

  /* a beat before the price, so it is not swallowed by the sentence before */
  t = t.replace(/\.\s+It costs five dollars/g, "... It costs five dollars");

  /* she takes a breath after saying who she is, and before the verdict */
  t = t.replace(/^(Amalia[^.]*\.)\s*/, "$1.. ");
  t = t.replace(/\.\s+(It is a quiet one|A quiet one|It is a heavy one|A heavy one)/g,
                "... $1");

  /* Nothing should start lowercase after a full stop, whatever put it there —
     but AN ELLIPSIS IS A PAUSE, NOT AN ENDING, and what follows it carries on
     in lower case. Hide the ellipses, capitalise, put them back. */
  t = t.replace(/\.\.\./g, "\u0001");
  t = t.replace(/([.!?])\s+([a-z])/g, (m, p, c) => p + " " + c.toUpperCase());
  t = t.replace(/\u0001/g, "...");

  /* ⚠ CONTRACTIONS. "It is half past twelve" is a newsreader. "It's half
     twelve" is a person. Deepgram takes its register from the words, and
     formal English comes out stiff and unhappy however many pauses it has.
     Done here so it applies whatever the model wrote. */
  const SHORTEN = [
    [/\bIt is\b/g, "It's"], [/\bit is\b/g, "it's"],
    [/\bThat is\b/g, "That's"], [/\bthat is\b/g, "that's"],
    [/\bThere is\b/g, "There's"], [/\bthere is\b/g, "there's"],
    [/\bwhat is\b/g, "what's"], [/\bWhat is\b/g, "What's"],
    [/\bdo not\b/g, "don't"], [/\bDo not\b/g, "Don't"],
    [/\bdoes not\b/g, "doesn't"], [/\bcannot\b/g, "can't"],
    [/\bcould not\b/g, "couldn't"], [/\bdid not\b/g, "didn't"],
    [/\bhas not\b/g, "hasn't"], [/\bhave not\b/g, "haven't"],
    [/\bwas not\b/g, "wasn't"], [/\bis not\b/g, "isn't"],
    [/\bI will\b/g, "I'll"], [/\bwe will\b/g, "we'll"],
    [/\byou will\b/g, "you'll"], [/\bI am\b/g, "I'm"],
    /* ⚠ "I have" ONLY CONTRACTS WHEN SOMETHING FOLLOWS IT.
       "That is all I have for the moment" became "that's all I've for the
       moment", which is not English. "I have more" contracts; "all I have"
       does not. The test is whether a past participle follows. */
    [/\bI have (?=been|had|got|seen|read|heard|said|told|found|been)\b/g, "I've "],
    [/\bwill not\b/g, "won't"]
  ];
  for (const [re, to] of SHORTEN) t = t.replace(re, to);

  /* ⚠ TIDY THE PAUSES LAST, AND IN THIS ORDER. An ellipsis already in the
     text plus one added here gives five dots, or a stranded full stop beside
     an ellipsis, and the voice stumbles on both. Fold them together, then
     make sure every ellipsis has exactly one space after it. */
  t = t.replace(/\.\s*\.\.\./g, "...");     /* ". ..."  -> "..." */
  t = t.replace(/\.\.\.\s*\./g, "...");     /* "... ."  -> "..." */
  t = t.replace(/\.{4,}/g, "...");           /* "....."   -> "..." */
  t = t.replace(/\.\.\.\s*/g, "... ");      /* one space after each */

  /* ⚠ AND A GENERAL GUARD: no sentence said twice in a row, whatever put it
     there. Cheap, and it catches the next version of this mistake. */
  const parts = t.split(/(?<=[.!?])\s+/);
  const kept = [];
  for (const seg of parts) {
    const clean = seg.trim();
    if (!clean) continue;
    const prev = kept.length ? kept[kept.length - 1].trim().toLowerCase() : "";
    if (clean.toLowerCase() === prev) continue;
    kept.push(clean);
  }
  t = kept.join(" ");

  t = t.replace(/[ \t]{2,}/g, " ").trim();

  return t;
}
function up(s) { return s.charAt(0).toUpperCase() + s.slice(1); }