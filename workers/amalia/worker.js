/* ============================================================================
   AMALIA  —  Cloudflare Worker
   Four broadcasts a day, Monday to Friday.

     08:18  THE MORNING SQUAWK   what landed overnight, before the open
     12:30  THE MIDDAY ROUND-UP  the DELTA — what has come in since she spoke
     16:15  THE CLOSE            after the bell: the day's count, what moved
     20:00  THE SUMMARY          the whole day, and what she is watching tomorrow
     22:00  GOODNIGHT            she is heading to bed. EDGAR has shut too.

   THE TEN O'CLOCK ONE GENUINELY CLOSES THE DAY. EDGAR stops accepting filings
   at ten at night, so nothing more is coming — she is not signing off early
   and missing the late window, she is the last word on the day.

   THE MIDDAY ONE IS THE ONE THAT PROVES THE WIRE IS LIVE. It can only exist
   if the scanning is real — a site that speaks once a day is reading
   yesterday's post.

   SHE IS TIRED BY THE LAST ONE, and she should sound it. The same voice at
   eight in the morning and eight at night is a robot; she is a person doing
   a job all day.

   Built 2026-09-11 22:15 ET · amalia-10d
   ============================================================================
   4a CHANGES THE APPROACH, AND IT SHOULD HAVE BEEN DONE THREE VERSIONS AGO.

   Through 3e to 3n the model was asked to do arithmetic and pick which facts
   to state, and the mistakes were policed with more and more written rules.
   It did not work. In the last run she said "it is a quiet one" three times,
   called seventeen heavy marks "seventeen filings" when there were twenty-nine,
   and named Greenwave as having filed twice for the third broadcast running.

   A wall of warnings is not a design. THE FACTS ARE NOW BUILT IN CODE — as
   finished English sentences, already true, already correctly named — and the
   model's ONLY job is to say them in her voice, in order, without adding any.

   It cannot attach a fact to the wrong company because it never chooses a
   company. It cannot confuse two counts because it never sees two raw numbers.
   ============================================================================

   3n MAKES HER FAILURES HONEST, and trims what is sent.

   3m FIXES A STRUCTURAL FAULT OF MY OWN MAKING: the morning counted four days
   back and the midday counted today only, and then the delta and the verdict
   compared the two. 72 against 29 was never a fall — it was two different
   windows. EVERY FIGURE SHE COMPARES IS NOW TODAY-ONLY.
   It also stops her naming a company the fact list did not name, and stops
   her mentioning halts at all.

   3l GIVES HER THE VERDICT — a daily read on how heavy the day is, measured
   against the trailing twenty weekdays and said in her own words. Woof. Not
   too bad. What the pooch is going on. See THE VERDICT below.

   3k FIXES FIVE FAULTS FOUND IN A REAL MIDDAY BROADCAST: she named a company
   that had not done the thing she said it did, she called midday filings
   "overnight", she reported no halts when halts are not built, the delta was
   empty because the morning had never aired, and she said "those four" after
   naming three.

   3j GIVES HER THE DAILY CHART LINE — one mention, at the end, in her own
   words. See THE ONE THING SHE SELLS below.

   3i MAKES 2 FEBRUARY THE HOUSE HOLIDAY. Groundhog Day is not a joke here —
   it is the thesis. The same financing, the same names, the same reverse
   split, waking up to it again. A man reliving one day until he finally
   looks at it properly.

   3h RECORDS THE WEATHER AND THE DAY'S COUNTS every time she speaks, so that
   in a year there is a dataset to test seasonality against. NOTHING IS
   PUBLISHED FROM IT — see THE SEASONALITY RECORD below.

   3g GIVES HER THE DAY AND THE WEATHER — real New York temperature and sky,
   free from Open-Meteo, no key and no vendor. And she knows what day it is,
   which matters: FRIDAY AFTERNOON IS WHEN A COMPANY FILES WHAT IT DOES NOT
   WANT READ.

   3e stopped the invented numbers and the catchphrase tic. 3f TAKES THE CLOCK
   OFF HER — his ruling: "make it as long as needed." The material decides the
   length, not a stopwatch. A busy morning gets a long broadcast; a dead one
   gets forty seconds.
   FIVE BROADCASTS, AUDIO IN R2, AND THE ENGINE IS MISTRAL.
   NO META, NO DEEPSEEK — his ruling, 8 Sep 2026. 1a, 2a, 2b and 3a kept.

   ----------------------------------------------------------------------------
   WHO SHE IS — Mark's

     British. Thirty. Jewish. Openly AI-driven — never passed off as a real
     woman, and that is deliberate: on a site whose argument is that nobody
     checks, being caught passing off a person who does not exist is the one
     thing that could be turned against him.

     She greets whatever holiday is on the calendar.
     Her line: "I DON'T DO DRESS PATTERNS. I SEE UNKNOWN PATTERNS." — it is HER line about
HERSELF, so she says it in the first person. Never as a caption or a fragment,
and only when it lands naturally in the sentence, not every day.
     Her sign-off: "Amalia — In Your Dreams, Traders."

   HER SHAPE, in his own words, and it is the voice:
     "it looks like 23 pumps in the biotech and a mystery volume on 16 and the
      donkey sensed something 77 times this morning"

   Counting, wry, specific. She is not a newsreader — she is the person who
   noticed something odd and is telling you before you get to your desk.

   ----------------------------------------------------------------------------
   HER AND STEPHEN — two jobs, and neither wanders into the other's

     AMALIA sees patterns nobody else sees. Every morning, across everything.
     STEPHEN reads one document and does not decorate it.

   She may say a number looks strange. She may NEVER say what it means for a
   share price, and she never names a company as a wrongdoer.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              AI         Workers AI (the script, and the voice)
              AUDIO      R2 bucket — where the mp3 files live
   SECRETS    LOG_KEY

   ----------------------------------------------------------------------------
   ⚠ WHY R2 AND NOT STREAM — his ruling, 8 Sep 2026

   "It is stupid to do Stream for these things. Stream should be for news live
   and music live." He is right. Stream is built for VIDEO: adaptive bitrate,
   encoding ladders, thumbnails, poster frames. A woman talking for ninety
   seconds needs none of it, and the picture management is a mess nobody asked
   for.

   A squawk is about a megabyte. R2 stores it for pennies and EGRESS IS FREE —
   which is the number that matters when one file is played a few hundred times.

   THE RULE: R2 for audio. Stream only for real video — live news, live music,
   an advertiser's 45-second spot.

   The worker serves the file itself at ?audio=… so the bucket never has to be
   made public and there is no second domain to manage.
   CRON       45 11,16,20,23,1 * * 1-5  five times: 07:45, 12:15, 16:00, 19:45
                                        and 21:45 New York in SUMMER. The worker
                                        checks the real New York clock itself,
                                        so a cron an hour out fires nothing
                                        rather than the wrong broadcast.

   PUBLIC
     ?audio=YYYY-MM-DD&slot=…  THE MP3 ITSELF — this is what a player points at
     ?today=1                 the latest broadcast that has aired
     ?today=1&slot=midday     a particular one
     ?on=YYYY-MM-DD           a past day

     ?action=day              ALL FOUR for a day, and what is still to come

   PRIVATE
     ?action=audition         RENDER THE SAME LINE IN EVERY VOICE, then listen
     ?audition=<n>            play audition number n
     ?action=voices           which speech model works, and what it returns
   ⚠ THE NEWSROOM MOVED OUT. Bulletins, staff, feeds and the public RSS are
     in the `newsroom` worker. She only counts whether breaking news is live,
     so she can say to watch for it.

     ?action=bulletin&text=…      MOVED — see the newsroom worker
        &placed=top|body           top = before the weather, for breaking news
        &hours=8                   how long it runs, default 24
        &max=3                     stop after this many readings, 0 = no limit
     ?action=bulletins            what is queued now
     ?action=drop&id=…            take one off the queue
     ?action=breaking&text=…      SCRIPT AND AIR ONE RIGHT NOW, off-schedule
     ?action=voice&id=…&by=…      POST a human recording as the body
     ?action=unvoice&id=…         drop the recording, use Amalia's voice
     ?action=edit&id=…&text=…     REPLACE THE WORDS — drops any recording
     ?action=news[&source=]       WHAT THE OTHERS ARE RUNNING — headlines only
     ?action=feeds                the watch list, and any feed that has died
     ?action=testfeeds            try every one now and say which answered
     ?action=addfeed&name=&url=   add a source (owners)
     ?action=dropfeed&id=         take one off (owners)
     ?action=repeat&id=…&hours=1  repeat it every N hours, 0 to turn it off
     ?action=reair&id=…           record it again right now

   PUBLIC, NO KEY
     ?breaking=1                  what is live now — the home page asks this
     ?bvoice=<id>                 the recording itself
     ?archive=1[&q=&from=&to=]    every bulletin ever, with its date and time
     ?rss=1[&site=wire|8k10q|newsweed]   THE FEED — also a podcast, because the
                                         audio goes in as an enclosure

     ?action=script&slot=morning|midday|close|summary|night   the words only. FIRST.
     ?action=air&slot=…                 script → voice → Stream, the whole job
     ?action=list

   ----------------------------------------------------------------------------
   ⚠ THE CLOCK. Cloudflare crons run in UTC and DO NOT KNOW ABOUT DAYLIGHT
   SAVING. 07:45 ET is 11:45 UTC in summer and 12:45 UTC in winter. The cron
   below is set for summer. IN NOVEMBER IT WILL AIR AN HOUR EARLY unless it is
   changed, or unless a second cron is added and the worker checks the real
   New York hour before doing anything. The check is in `shouldRun()` and it is
   the safer half of the answer.

   ⚠ STREAM HOSTS AND DELIVERS. IT DOES NOT MAKE SPEECH. Workers AI first, then
   the file goes to Stream. Same as Stephen.
   ========================================================================== */

/* ⚠ THE DIAL. Run ?action=voices to find what actually works on this account,
   then set all three here. Deepgram Aura takes { text, speaker }; MeloTTS takes
   { prompt, lang } — the shape matters as much as the name. */
const TTS = {
  /* ⚠ THE VOICE. One word changes her.

     He picked WARM for now, having heard 2, 3, 4 and 5 — asteria is the warm
     one. He has NOT yet heard the two British voices and says he really
     prefers British, and perky:

       audition 1  aura-1  athena    BRITISH female, measured
       audition 4  aura-1  asteria   American, warm      ← set now
       audition 3  aura-1  stella    American, brighter — the perky one
       audition 6  melotts EN-BR     British English

     Honest note: British and perky may not both exist in one voice here.
     athena is British but measured; stella is perky but American. */
  model: "@cf/deepgram/aura-1",
  voice: "asteria",
  shape: "aura"
};

/* ============================================================
   THE FOUR SLOTS. New York time — the worker checks the real New
   York hour before it does anything, so the UTC cron sliding an
   hour twice a year cannot put her on at the wrong time.
   ============================================================ */
const SLOTS = {
  morning: { hour: 8,  min: 18, label: "The Morning Squawk",
             window: [7, 30, 8, 17] },
  midday:  { hour: 12, min: 30, label: "The Midday Round-Up",
             window: [11, 45, 12, 29] },
  close:   { hour: 16, min: 15, label: "The Close",
             window: [15, 30, 16, 14] },
  summary: { hour: 20, min: 0,  label: "The Summary",
             window: [19, 15, 19, 59] },
  night:   { hour: 22, min: 0,  label: "Goodnight",
             window: [21, 15, 21, 59] }
};

/* ⚠ THE BUILD STAMP. It is returned in every response, so nobody ever again
   spends twenty minutes debugging a version that was pasted but never became
   the active deployment. If this does not say 4e, the worker is not 4e. */
const BUILD = "amalia-10e · 2026-09-12 13:30 ET";

const AIR_HOUR = 8, AIR_MIN = 18;   /* the first one, for the "not yet" message */

export default {
  async fetch(req, env) {
    const u = new URL(req.url), q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      /* THE FILE ITSELF. Public, cached hard, streamed straight out of R2 —
         and it supports range requests so a player can scrub. */
      if (q.get("audio")) return await serveAudio(env, q, req);

      /* ⚠ PUBLIC AND NO KEY. This is what the player on the home page asks.
         It says what the newest broadcast is, when it aired, and when the
         next one is due — everything the page needs to feel like a station
         rather than a file somebody left lying about. */
      if (q.get("live")) return json(await whatIsOn(env), H);

      /* ⚠ PUBLIC AND NO KEY. This is what the corner of the home page asks
         every minute or so. It returns the live bulletin, whether there is
         audio and whose voice it is. Nothing here is worth protecting and
         a key in a public page protects nothing anyway. */

      /* ⚠ THE ARCHIVE IS PUBLIC AND HAS NO KEY. Anyone may read back every
         bulletin ever put out, with the date and time it went up. That is
         the point of keeping it: a site that tells people what to watch for
         has to be answerable for what it told them, and an archive nobody
         can search is not a record, it is a drawer. */


      if (q.get("audition")) return await serveAudition(env, q, req);

      if (q.get("today") || q.get("on"))
        return json(await get(env, q.get("on"), q.get("slot")), H);

      /* ⚠ THE NEWSROOM IS ITS OWN WORKER NOW.

         Staff accounts, bulletins, other publishers' feeds and the public
         RSS all moved to `newsroom`. She broadcasts; she does not run a
         newsroom. They share the database and nothing else.

         All she still does with a bulletin is COUNT whether one is live,
         so she can say to watch for it — see gather(). She never reads one
         out and never touches the queue. */
      const a = q.get("action") || "list";

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      if (a === "voices") return json(await voices(env, q.get("model"), q.get("speaker")), H);
      if (a === "audition") return json(await audition(env), H);
      if (a === "script") return json(await script(env, q.get("for"), q.get("slot")), H);
      if (a === "air")    return json(await air(env, q.get("for"), q.get("slot")), H);
      if (a === "day")    return json(await wholeDay(env, q.get("for")), H);
      if (a === "seasons") return json(await seasons(env), H);
      return json(await list(env), H);
    } catch (e) {
      return json({ ok:false, error:String(e) }, H, 500);
    }
  },

  /* fires four times a day; works out which broadcast is due */
  async scheduled(event, env, ctx) {
    /* ⚠ THE REPEAT SWEEP RUNS FIRST, ON EVERY FIRE. Breaking news happens
       whenever; the broadcasts keep their own hours. Putting the sweep after
       the window check would mean a bulletin could only repeat at the five
       times she is on air, which is not what repeating means. */
    ctx.waitUntil(setup(env).then(function () { return sweepRepeats(env); }));

    const slot = dueNow();
    if (!slot) return;
    ctx.waitUntil((async () => {
      await setup(env);
      try { await script(env, null, slot); await air(env, null, slot); }
      catch (e) {
        await env.OVERHANG.prepare(
          "INSERT INTO squawk_log (kind, note) VALUES ('failed', ?)")
          .bind(slot + ": " + String(e)).run().catch(()=>{});
      }
    })());
  }
};

/* ⚠ THE DAYLIGHT SAVING GUARD. Cloudflare crons run in UTC and do not know
   about daylight saving, so a cron set for summer fires an hour early every
   November. This works out which broadcast is due from the REAL New York
   clock — a mis-set cron produces nothing rather than a squawk at the wrong
   hour. Weekdays only. */
function dueNow() {
  const ny = nowNY();
  if (ny.dow === 0 || ny.dow === 6) return null;
  const mins = ny.hour * 60 + ny.min;
  for (const k of Object.keys(SLOTS)) {
    const w = SLOTS[k].window;
    if (mins >= w[0] * 60 + w[1] && mins <= w[2] * 60 + w[3]) return k;
  }
  return null;
}

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

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS squawk (
       air_date TEXT, slot TEXT DEFAULT 'morning',
       greeting TEXT, script TEXT, words INTEGER, seconds INTEGER,
       counts TEXT, stream_uid TEXT, playback TEXT,
       state TEXT DEFAULT 'script', made TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (air_date, slot))`).run();
  /* ============================================================
     THE SEASONALITY RECORD

     Every broadcast writes one row: the day, the day of the week,
     the New York weather, and how many filings and heavy marks the
     wire saw. Costs nothing, and in twelve months it is a dataset
     nobody else has.

     ⚠ IT IS FOR TESTING, NOT FOR PUBLISHING. Weather and stock
     returns has been studied since the nineties and the effect
     keeps coming out small and contested. Printing "a cold snap
     causes dilution" would cost more credibility than the finding
     could ever be worth, and it would take the warrant work down
     with it.

     THE QUESTIONS THIS DATA CAN ACTUALLY ANSWER, and they need no
     weather at all — five years of counts already answer them:
       · do awkward filings cluster on FRIDAYS
       · what happens at quarter-ends and in December
       · the day before a public holiday
     Those are about people in a building, and nobody else holds the
     daily filing counts to test them.
     ============================================================ */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS day_record (
       day TEXT, slot TEXT,
       day_name TEXT, dow INTEGER,
       holiday TEXT,
       temp_f INTEGER, feels_f INTEGER, sky TEXT, wind_mph INTEGER,
       filings INTEGER, heavy INTEGER, repeat_filers INTEGER,
       recorded_at TEXT DEFAULT (datetime('now')),
       PRIMARY KEY (day, slot))`).run();

  /* ============================================================
     THE BULLETIN QUEUE — what Mark types, she reads.

     A special report or a piece of breaking news is typed once and
     read in every broadcast until it expires. That is the point of
     a queue rather than a one-off: news said once at half twelve
     is missed by everyone who listens at the close.

     kind      "report" | "breaking" | "standing"
     runs_from / runs_until   the window she reads it in
     max_reads               stop after this many, 0 = no limit
     placed    "top" — straight after the greeting, for breaking
               "body" — after the counts, the normal place
     ============================================================ */
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
       voice TEXT,            /* 'amalia' | 'human' | null */
       voice_key TEXT,        /* where the recording sits in R2 */
       voice_type TEXT,       /* the mime type as uploaded */
       voice_by TEXT,         /* who recorded it, shown to the listener */
       voice_secs INTEGER)`).run();

  /* older stores predate these columns — add them without complaint */
  for (const col of ["voice TEXT", "voice_key TEXT", "voice_type TEXT",
                     "voice_by TEXT", "voice_secs INTEGER",
                     "repeat_hours INTEGER DEFAULT 0",   /* 0 = off */
                     "sites TEXT DEFAULT 'all'",         /* which feeds carry it */
                     "by_who TEXT",                      /* who filed it */
                     "by_role TEXT",
                     "last_aired TEXT",
                     "airings INTEGER DEFAULT 0",
                     "audio_key TEXT"] ) {
    try { await env.OVERHANG.prepare(
      "ALTER TABLE bulletins ADD COLUMN " + col).run(); } catch (e) {}
  }

  /* ============================================================
     THE NEWSROOM

     ⚠ LOG_KEY IS THE SAME KEY ON EVERY WORKER — read, stephen,
     opinion, amalia and the pay desk. Handing it to a part-timer
     hands over all of it, and the only way to take it back is to
     change it everywhere and redeploy five workers. So staff get
     their OWN tokens, revoked one at a time, and LOG_KEY stays
     his alone.

     ⚠ ACCESS IS TRUST — his ruling, 11 Sep 2026. A reporter
     publishes straight to the site; nothing waits for approval.
     That is why the record of WHO DID WHAT matters more here,
     not less: when something wrong is on the front page at four
     o'clock, the question is who wrote it, and the answer has to
     be in the table rather than in somebody's memory.

     It is also a reporter's own record of what they filed, which
     is what makes the gig work worth doing.
     ============================================================ */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS staff (
       token TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       role TEXT DEFAULT 'reporter',     /* reporter | editor | owner */
       sites TEXT DEFAULT 'all',         /* which feeds they may write to */
       active INTEGER DEFAULT 1,
       made TEXT DEFAULT (datetime('now')),
       last_seen TEXT,
       posts INTEGER DEFAULT 0,
       note TEXT)`).run();

  /* ============================================================
     WHAT THE NEWSROOM WATCHES

     ⚠ THE LIST IS A TABLE, NOT CODE. Feeds die, move and change
     without notice — Bloomberg retired its public feeds years
     ago. A dead source should be one row to fix, never a
     redeploy.

     ⚠ HEADLINE, SOURCE, TIME AND LINK. NEVER THE ARTICLE.
     Linking to somebody's headline is ordinary aggregation and
     every reader does it. Republishing their text is the thing
     that brings a letter from Dow Jones, and no amount of
     usefulness is worth that.
     ============================================================ */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS feeds (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       url TEXT NOT NULL,
       active INTEGER DEFAULT 1,
       last_ok TEXT, last_error TEXT, items INTEGER DEFAULT 0,
       made TEXT DEFAULT (datetime('now')))`).run();

  /* the ones that actually publish a feed, put in once */
  try {
    const n = await env.OVERHANG.prepare("SELECT COUNT(*) c FROM feeds").first();
    if (!n || !n.c) {
      /* ⚠ WHAT ACTUALLY PUBLISHES A FEED, and nothing that does not.
         Bloomberg retired its public feeds; anything sold as one is a third
         party scraping them, and a newsroom built on somebody's scraper
         breaks the week they get blocked. If a feed here dies, ?action=feeds
         shows the error and it is one row to replace. */
      const seed = [
        ["WSJ Markets",   "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"],
        ["WSJ Business",  "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness"],
        ["WSJ Economy",   "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed"],
        ["FT Companies",  "https://www.ft.com/companies?format=rss"],
        ["FT Markets",    "https://www.ft.com/markets?format=rss"],
        ["NYT Business",  "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"],
        ["NYT DealBook",  "https://rss.nytimes.com/services/xml/rss/nyt/DealBook.xml"],
        ["NYT Economy",   "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml"],
        ["Gulf News Business", "https://gulfnews.com/rss?generatorName=business"],
        ["Gulf News Markets",  "https://gulfnews.com/rss?generatorName=business/markets"],
        ["SEC latest 8-K", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom"]
      ];
      for (const [nm, u2] of seed)
        await env.OVERHANG.prepare(
          "INSERT INTO feeds (name, url) VALUES (?,?)").bind(nm, u2).run();
    }
  } catch (e) {}

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS newsroom_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       at TEXT DEFAULT (datetime('now')),
       who TEXT, role TEXT, did TEXT, bulletin INTEGER, detail TEXT)`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS squawk_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       at TEXT DEFAULT (datetime('now')), kind TEXT, note TEXT)`).run();
}

/* ============================================================
   WHAT SHE HAS TO TALK ABOUT

   Last night's scan. Counts, not companies — she is describing
   a morning, not accusing anybody.
   ============================================================ */
async function gather(env, forDate, slot) {
  const day = forDate || nowNY().date;
  const out = { day, slot, filings: 0, heavy: 0, sectors: [], phrases: [],
                halts: 0, splits: 0, since_last: null, today_so_far: [],
                missing: [] };

  /* ⚠ WRITTEN AGAINST THE REAL SCHEMA, checked 8 Sep 2026.
     wire_hits: accession, cik, ticker, company, form, FILED_ON, phrase_id,
     phrase, label, doc_url, found_at — there is NO weight column, the weight
     lives on wire_phrases and joins through phrase_id.
     v_wire_filings: accession, cik, ticker, company, form, filed_on, doc_url,
     marks, labels, HEAVY — and there is no sic_group on it.
     3b compared filed_on against date(?,'-1 day') and matched nothing, which
     is why she said "a quiet night" on a day with 148 filings. */

  /* ⚠ TWO WINDOWS, AND THEY MUST NEVER BE MIXED.

     `filings` and `heavy` are ALWAYS TODAY ONLY. They are what the delta
     compares and what the verdict scores, and both were nonsense in 3l
     because the morning counted four days and the midday counted one, then
     compared 72 against 29 and called it a fall.

     `since_open` is the wider look-back, and it exists ONLY so the morning
     can say what came in over a weekend. It is never compared to anything. */
  const since = (slot === "morning") ? "-4 day" : "0 day";

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(DISTINCT accession) n FROM wire_hits
        WHERE filed_on = ?`).bind(day).first();
    out.filings = (r && r.n) || 0;
  } catch (e) { out.missing.push("filings: " + String(e)); }

  if (slot === "morning") {
    try {
      const r = await env.OVERHANG.prepare(
        `SELECT COUNT(DISTINCT accession) n, MIN(filed_on) from_day
           FROM wire_hits WHERE filed_on >= date(?, ?)`).bind(day, since).first();
      out.since_open = { filings: (r && r.n) || 0, since: r && r.from_day,
        note: "the whole look-back — for saying what came in over the weekend, " +
              "NEVER for comparing against another broadcast" };
    } catch (e) {}
  }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT h.label, COUNT(DISTINCT h.accession) n
         FROM wire_hits h
         LEFT JOIN wire_phrases w ON w.id = h.phrase_id
        WHERE h.filed_on = ? AND COALESCE(w.weight,1) >= 2
        GROUP BY h.label ORDER BY n DESC LIMIT 8`).bind(day).all();
    out.phrases = r.results || [];
    out.heavy = out.phrases.reduce((n, x) => n + x.n, 0);
  } catch (e) { out.missing.push("heavy: " + String(e)); }

  /* ⚠ SECTORS MUST BE SCOPED TO THE WINDOW. v_wire_sectors is ALL TIME —
     five years of the wire — and 3c handed it to her as if it were the
     overnight. She read out thirty-nine thousand heavy marks at breakfast.
     cik_sic carries the sector per CIK, so join it and count only today. */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COALESCE(NULLIF(s.sector,''),'Unclassified') sector,
              COUNT(DISTINCT h.accession) n
         FROM wire_hits h
         LEFT JOIN cik_sic s ON s.cik = h.cik
        WHERE h.filed_on = ?
        GROUP BY sector ORDER BY n DESC LIMIT 5`).bind(day).all();
    out.sectors = r.results || [];
  } catch (e) { out.missing.push("sectors: " + String(e)); }

  /* the companies themselves, so she has something concrete to count */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT ticker, company, form, heavy, labels
         FROM v_wire_filings
        WHERE filed_on = ?
        ORDER BY heavy DESC, filed_on DESC LIMIT 12`).bind(day).all();
    out.today_so_far = r.results || [];
  } catch (e) { out.missing.push("filings list: " + String(e)); }

  /* HALTS ARE NOT BUILT YET. Ask quietly and say nothing if the table is
     absent — an unbuilt feature is not a failure and should not read as one. */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(*) n FROM halts WHERE substr(halted_at,1,10) = ?`).bind(day).first();
    out.halts = (r && r.n) || 0;
  } catch (e) { out.halts = null; }
  /* null means WE CANNOT SEE HALTS, which is not the same as none. Say so
     plainly in the data so she cannot report an absence she never checked. */
  if (out.halts === null) out.halts_note = "halts are not being collected — say nothing about halts";

  /* ---- THE DELTA. The midday, close, summary and goodnight broadcasts are
     only worth hearing if they say what has CHANGED since she last spoke. */
  if (slot && slot !== "morning") {
    try {
      /* ⚠ NOT "state = ready". A broadcast that was scripted but never aired
         still tells us what she knew at the time, and requiring 'ready' left
         the midday with no delta at all — which is the whole point of it. */
      const prev = await env.OVERHANG.prepare(
        `SELECT slot, made, counts FROM squawk
          WHERE air_date = ? AND slot <> ? AND script IS NOT NULL
          ORDER BY made DESC LIMIT 1`).bind(day, slot).first();
      if (prev) {
        const before = JSON.parse(prev.counts || "{}");
        out.since_last = {
          last_spoke: prev.slot,
          at: prev.made,
          filings_then: before.filings || 0,
          filings_now: out.filings,
          new_since: Math.max(0, (out.filings || 0) - (before.filings || 0)),
          tickers_then: (before.today_so_far || []).map(x => x.ticker).filter(Boolean)
        };
      }
    } catch (e) { out.missing.push("delta: " + String(e)); }
  }

  /* ============================================================
     THE VERDICT — how heavy is today, really?

     ⚠ THE BAND IS ARITHMETIC. THE WORDS ARE HERS. Same doctrine as
     the filing clarity rating: the imagery can be hers, the cutoffs
     are published numbers anyone can re-run. "It feels heavy" is
     worth nothing; "forty-eight heavy against a twenty-day average
     of nineteen" is a finding with her voice on top.

     Measured against the trailing twenty WEEKDAYS, so a quiet
     August does not make September look like a crisis.
     ============================================================ */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT AVG(n) avg_heavy, COUNT(*) days FROM (
         SELECT h.filed_on d, COUNT(DISTINCT h.accession) n
           FROM wire_hits h
           LEFT JOIN wire_phrases w ON w.id = h.phrase_id
          WHERE h.filed_on < ? AND h.filed_on >= date(?, '-40 day')
            AND COALESCE(w.weight,1) >= 2
            AND CAST(strftime('%w', h.filed_on) AS INTEGER) BETWEEN 1 AND 5
          GROUP BY h.filed_on ORDER BY d DESC LIMIT 20)`).bind(day, day).first();

    const avg = r && r.avg_heavy ? Math.round(r.avg_heavy * 10) / 10 : null;
    if (avg && avg > 0) {
      const ratio = +( (out.heavy || 0) / avg ).toFixed(2);
      let band;
      if (ratio < 0.5)       band = "quiet";
      else if (ratio < 0.9)  band = "lighter than usual";
      else if (ratio <= 1.3) band = "about normal";
      else if (ratio <= 2.0) band = "heavy";
      else                   band = "very heavy";
      out.verdict = {
        heavy_today: out.heavy || 0,
        twenty_day_average: avg,
        times_normal: ratio,
        band,
        days_in_average: r.days
      };
    }
  } catch (e) { out.missing.push("verdict: " + String(e)); }

  /* ============================================================
     WHO ARE THESE COMPANIES?

     "Greenwave" alone tells a listener nothing. "Greenwave... a
     micro cap in scrap metal... warrant paper again" tells them
     everything in one line, and the PAUSE before the industry is
     what makes the voice lift into it.

     Three claims, each COMPUTED or not said:
       the sector   from cik_sic
       the size     shares times last close, from v_overhang
       AGAIN        counted — earlier warrant filings on the wire

     ⚠ ANYTHING THAT CANNOT BE COMPUTED IS NOT SAID.
     ============================================================ */
  out.who = {};
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT DISTINCT h.ticker, s.sector, s.sic_desc, v.shares, v.last_close
         FROM wire_hits h
         LEFT JOIN cik_sic    s ON s.cik    = h.cik
         LEFT JOIN v_overhang v ON v.ticker = h.ticker
        WHERE h.filed_on = ? AND h.ticker IS NOT NULL`).bind(day).all();
    for (const x of (r.results || [])) {
      const w = {};
      if (x.sector && !/unknown|unclassified/i.test(x.sector)) w.sector = x.sector;
      else if (x.sic_desc) w.sector = x.sic_desc;
      if (x.shares && x.last_close) {
        const mc = Number(x.shares) * Number(x.last_close);
        if (isFinite(mc) && mc > 0)
          w.band = mc < 50e6 ? "a nano cap" : mc < 300e6 ? "a micro cap"
                 : mc < 2e9 ? "a small cap" : mc < 10e9 ? "a mid cap" : "a large cap";
      }
      out.who[x.ticker] = w;
    }
  } catch (e) { out.missing.push("who: " + String(e)); }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT ticker, COUNT(DISTINCT accession) n FROM wire_hits
        WHERE filed_on < ? AND ticker IS NOT NULL
          AND ticker IN (SELECT DISTINCT ticker FROM wire_hits WHERE filed_on = ?)
        GROUP BY ticker`).bind(day, day).all();
    for (const x of (r.results || []))
      if (out.who[x.ticker]) out.who[x.ticker].earlier = x.n;
  } catch (e) {}

  /* ⚠ IS THERE BREAKING NEWS RIGHT NOW?

     A scheduled broadcast is NOT disturbed by it — the words are never read
     out. But she may POINT AT IT, so a listener knows to look. This fetches
     the fact that one exists and nothing else: no text, no detail. */
  out.breaking_live = 0;
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(*) n FROM bulletins
        WHERE live = 1 AND (placed = 'top' OR kind = 'breaking')
          AND (runs_from  IS NULL OR runs_from  <= datetime('now'))
          AND (runs_until IS NULL OR runs_until >= datetime('now'))`).first();
    out.breaking_live = (r && r.n) || 0;
  } catch (e) {}

  /* ---- THE BULLETIN QUEUE ---- */
  out.bulletins = [];
  try {
    const r = await env.OVERHANG.prepare(
      /* ⚠ A BROADCAST NEVER SEES A BREAKING ITEM. Filtered here as well as
         where the facts are built, so a future change in one place cannot
         quietly put it back into the scheduled reads. */
      `SELECT id, text, kind, placed, max_reads, reads FROM bulletins
        WHERE live = 1
          AND placed <> 'top' AND kind <> 'breaking' 
          AND (runs_from  IS NULL OR runs_from  <= datetime('now'))
          AND (runs_until IS NULL OR runs_until >= datetime('now'))
          AND (max_reads = 0 OR reads < max_reads)
        ORDER BY CASE placed WHEN 'top' THEN 0 ELSE 1 END, id`).all();
    out.bulletins = (r.results || []).map(x => ({
      id: x.id, text: String(x.text || "").trim(),
      kind: x.kind, placed: x.placed }));
  } catch (e) { out.missing.push("bulletins: " + String(e)); }

  /* ---- WHAT IS ODD. Do not hope she notices — work it out and hand it
     to her. In 3d she had twelve filings in front of her and missed that
     one company had filed three times in a day. */
  out.worth_saying = [];
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT ticker, company, COUNT(DISTINCT accession) n
         FROM wire_hits WHERE filed_on = ? AND ticker IS NOT NULL
        GROUP BY ticker HAVING n > 1 ORDER BY n DESC LIMIT 5`).bind(day).all();
    for (const x of (r.results || []))
      out.worth_saying.push({
        kind: "filed more than once",
        detail: x.ticker + " filed " + x.n + " times" });
  } catch (e) {}

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT h.label, COUNT(DISTINCT h.accession) n
         FROM wire_hits h WHERE h.filed_on = ?
        GROUP BY h.label ORDER BY n DESC LIMIT 1`).bind(day).first();
    if (r && out.filings)
      out.worth_saying.push({
        kind: "the clause almost everyone used",
        detail: r.label + " on " + r.n + " of " + out.filings });
  } catch (e) {}

  /* companies with no ticker attached — she can say the wire could not
     match them, which is honest and it is a real gap */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(DISTINCT accession) n FROM wire_hits
        WHERE filed_on = ? AND (ticker IS NULL OR ticker = '')`)
      .bind(day).first();
    if (r && r.n) out.worth_saying.push({
      kind: "no ticker matched",
      detail: r.n + " filings we could not match to a ticker" });
  } catch (e) {}

  return out;
}

/* ============================================================
   BREATHE — pacing, done in code

   Deepgram Aura paces on punctuation. A model told to write short
   sentences will do it four times out of five; this makes it five.

   It only adds stops and spaces. It never changes a word, never
   moves a number, and never touches anything inside a figure.
   ============================================================ */
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

/* ============================================================
   VOICES — which speech model works, and how is it called?

   The text engine cost us a morning because the model name was
   guessed. Do not repeat it. This tries each real Workers AI
   speech model with the parameter shape that model expects, and
   reports what came back — the type, the size, and whether it is
   audio at all.

   ⚠ THEY DO NOT TAKE THE SAME PARAMETERS. Deepgram Aura wants
   { text, speaker }. MeloTTS wants { prompt, lang }. Sending the
   wrong shape looks exactly like a dead model.
   ============================================================ */
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

async function voices(env, only, speaker) {
  if (!env.AI) return { ok:false, error:"no AI binding on this worker" };
  const line = "Morning. Amalia here, Warrant Wire. This is a test of the voice.";
  const out = [];

  for (const m of SPEECH) {
    if (only && m.model !== only) continue;
    const sp = speaker || m.speakers[0];
    const row = { model: m.model, speaker: sp, shape: m.shape };
    try {
      const r = await env.AI.run(m.model, speechBody(m.shape, line, sp));
      row.worked = true;
      row.returned =
        (r instanceof ReadableStream) ? "ReadableStream" :
        (r instanceof ArrayBuffer) ? "ArrayBuffer" :
        (r && typeof r === "object") ? "object with keys: " + Object.keys(r).join(", ") :
        typeof r;

      /* how big is it — a few hundred bytes is an error message, not audio */
      let bytes = null;
      if (r instanceof ReadableStream) bytes = (await new Response(r).arrayBuffer()).byteLength;
      else if (r instanceof ArrayBuffer) bytes = r.byteLength;
      else if (r && typeof r.audio === "string") bytes = Math.round(r.audio.length * 3 / 4);
      row.bytes = bytes;
      row.looks_like_audio = bytes !== null && bytes > 5000;
      if (bytes !== null && bytes <= 5000)
        row.warning = "too small to be speech — probably an error in disguise";
    } catch (e) {
      row.worked = false;
      row.error = String(e).slice(0, 300);
    }
    out.push(row);
  }

  const win = out.find(x => x.worked && x.looks_like_audio);
  return { ok: !!win, build: BUILD, tried: out.length, results: out,
    use_this: win ? { model: win.model, speaker: win.speaker, shape: win.shape } : null,
    note: win
      ? "Put this model and shape at the top of the worker in the TTS object."
      : "Nothing produced audio. Read each error above — a wrong parameter shape " +
        "looks identical to a dead model, and they do not all take the same one." };
}

/* ============================================================
   NEW YORK, OUT THE WINDOW

   Free from Open-Meteo — no key, no account, no vendor, no bill.
   She is broadcasting from New York and a person mentions the
   weather. One line, never a forecast segment.
   ============================================================ */
const SKY = {
  0:"clear", 1:"mostly clear", 2:"partly cloudy", 3:"overcast",
  45:"foggy", 48:"foggy",
  51:"drizzling", 53:"drizzling", 55:"drizzling",
  56:"freezing drizzle", 57:"freezing drizzle",
  61:"raining lightly", 63:"raining", 65:"pouring",
  66:"freezing rain", 67:"freezing rain",
  71:"snowing lightly", 73:"snowing", 75:"snowing hard", 77:"snow grains",
  80:"showers", 81:"showers", 82:"heavy showers",
  85:"snow showers", 86:"snow showers",
  95:"thundery", 96:"thundery with hail", 99:"thundery with hail"
};

async function weather() {
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast" +
      "?latitude=40.7128&longitude=-74.0060" +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph" +
      "&timezone=America%2FNew_York");
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.current || {};
    return {
      temp_f: Math.round(c.temperature_2m),
      feels_f: Math.round(c.apparent_temperature),
      sky: SKY[c.weather_code] || null,
      wind_mph: Math.round(c.wind_speed_10m)
    };
  } catch (e) { return null; }
}

/* ============================================================
   THE HOLIDAY — a real calendar, not a typed list

   The Jewish holidays are lunar, begin at SUNDOWN THE NIGHT
   BEFORE, and move by weeks each year. Hebcal is free, public
   and authoritative. Fixed-date holidays sit in the small table
   below; anything else she simply does not mention, which is
   better than getting one wrong in her own voice.
   ============================================================ */
const FIXED = {
  /* ⚠ 2 FEBRUARY IS THE HOUSE HOLIDAY. Mark's own, and it is the thesis in
     one day: the same deal, the same names, the same split, again. She marks
     it every year and she is allowed to enjoy it. */
  "02-02":"Groundhog Day — our own holiday",
  "01-01":"New Year's Day", "02-14":"Valentine's Day", "03-17":"St Patrick's Day",
  "07-04":"Independence Day", "10-31":"Hallowe'en", "11-11":"Veterans Day",
  "12-24":"Christmas Eve", "12-25":"Christmas Day", "12-31":"New Year's Eve"
};

async function holiday(day) {
  const md = day.slice(5);
  if (FIXED[md]) return FIXED[md];
  try {
    const [y, m, d] = day.split("-");
    const r = await fetch("https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on" +
                          "&year=" + y + "&month=" + Number(m) + "&geo=none");
    if (!r.ok) return null;
    const j = await r.json();
    const hit = (j.items || []).find(it => (it.date || "").slice(0, 10) === day);
    return hit ? hit.title : null;
  } catch (e) { return null; }
}

/* ============================================================
   HER WORDS
   ============================================================ */
const HER_RULES = `You are writing what AMALIA says out loud.

AMALIA: British, thirty, Jewish, openly AI-driven and never presented as a real
woman. She reads the wire for Warrant Wire. Her line about herself, used sparingly
and only when something odd has actually turned up: "I don't do dress patterns.
I see unknown patterns."

Return ONLY a JSON object, no markdown, no backticks:
{ "seconds": 0, "script": "the words she says, start to finish" }

⚠ YOU ARE GIVEN A NUMBERED LIST OF FACTS. THAT IS THE BROADCAST.
Say each one, in that order, in her voice. One or two sentences each.

- ADD NO FACT THAT IS NOT ON THE LIST. No company, no number, no comparison of
  your own. If it is not in the list it did not happen.
- SAY EACH FACT ONCE. Never restate one in different words — she said "it is a
  quiet one" three times in one broadcast and it sounded broken.
- SPEAK NUMBERS IN FULL: "twenty-nine", never "29".
- Say names the way a person says them. No "Incorporated", no "Corp".
- Dry, quick, one clause into the next. Not a newsreader — the person who
  noticed something and is telling you before you reach your desk.

⚠ SHE IS NOT GLOOMY. She likes this job and she likes noticing things. Warm
towards the listener, wry about the filings — never grim, never scolding, and
never pleased about a company's trouble either. A dog day is interesting to her,
not a tragedy.
- USE CONTRACTIONS. "It's", "that's", "I'll". Formal English comes out stiff.
- A short aside is allowed when something is genuinely odd. One a broadcast at
  most, and never at the expense of a fact.

⚠ SHE IS BEING SPOKEN ALOUD, AND THE VOICE PAUSES ON PUNCTUATION. Write for
the ear or she gallops.
⚠ SHE SPEAKS IN COMPLETE SENTENCES. Every one has a subject and a verb.
"An equity line. An ownership blocker." is a list of fragments and it sounds
like a machine reading a database. "It carried an equity line, an ownership
blocker, and a floor price" is a person talking.
- Use an ellipsis for a pause INSIDE a sentence rather than breaking it up.
- SHORT SENTENCES, but whole ones. A full stop is a breath, not a comma.
- A LIST GETS ARTICLES AND AN "AND", and it stays one sentence: "It carried a
  variable rate transaction, an equity line, and an ownership blocker." The
  pauses come from the ellipses, not from breaking it into pieces.
- PUT A FULL STOP WHERE YOU WANT HER TO STOP. Between the counts and the
  companies. Before the sign-off. Before anything that matters.
- Use "and" before the last item so the sentence has somewhere to land.
- Read what you wrote back in your head at a walking pace. If you run out of
  breath, it is too long.
- USE AN ELLIPSIS WHERE YOU WANT A LONGER PAUSE than a full stop gives. "Fold
  Holdings... filed twice today." The voice holds on three dots.
- A COMPANY NAME SHOULD OPEN ITS OWN SENTENCE, with a beat after it. That is
  what makes the voice lift into the name instead of running past it.
- The weather and the day: one line at most, and only if worth saying. Snow or
  ninety-five degrees, yes. Seventy and clear, no. Never forecast.
- If a holiday is given, greet it warmly and briefly.
- NO BUY, SELL, HOLD, no price target, no saying a company did anything wrong.
- Length follows the list. A long list is a long broadcast, a short one is short.
  Never pad.

⚠ THE LAST FACT IS THE SUMMARY, AND IT IS THE ONE THING SHE SELLS.

IT HAS A SHAPE AND SHE KEEPS IT: a REMINDER, then WHAT IT IS, then the PRICE,
then "or why not just get the year". Four beats. She may reword them, but she
never loses one and she never lets it trail off into a description.

- Say it once, at the end, in her own words. Never twice.
- ⚠ THE PRICE MUST SURVIVE. If she mentions the chart she says what it costs —
  five dollars for the day, three hundred and ten for the year. A pitch with no
  price in it is worse than no pitch: it is an advertisement that forgot to sell.
- Do not oversell it and never say it is worth it. She says what it is and what
  it costs, and moves on.

⚠ NEVER READ OUT A LABEL. If a line in the list begins with a word like "Last"
or "Note", that word is for you, not for the listener. Say the fact, not the
label.

`;

/* ============================================================
   THE FOUR BROADCASTS — same woman, four different jobs.

   The shape changes and so does her energy. A voice that is
   identical at eight in the morning and eight at night is a
   robot, and she is a person doing a job all day.
   ============================================================ */
const SLOT_RULES = {

  morning: `THIS IS THE MORNING SQUAWK, eighteen minutes past eight, before the open.

Open warmly, like someone glad to be here: "Morning, all. Amalia here at Warrant
Wire." Greet the holiday if one is supplied.
Then the overnight counts in her rhythm, one thing that struck her as odd, and what
is worth a look today. She is fresh, quick, setting up the day.
Finish plainly and mean it: "Thank you... and see you later, at half twelve."`,

  midday: `THIS IS THE MIDDAY ROUND-UP, half past twelve. THE DELTA IS THE WHOLE POINT.

⚠ "since_last" NOW COMPARES TODAY WITH TODAY. If new_since is zero, nothing has
come in since she last spoke and SHE SAYS THAT PLAINLY AND MOVES ON — one short
sentence, then the rest of the broadcast. She does not dwell on it and she does
not pad around it.

⚠ THESE FILINGS CAME IN TODAY, NOT OVERNIGHT. Never say "overnight" after the
morning broadcast — say "since I spoke to you", "so far today", "since the open".
"Twenty-nine filings overnight" at half twelve is wrong and a listener hears it.

You are told what she said earlier and what has landed since. TALK ABOUT WHAT
CHANGED, not the whole day again.
Open warmly: "Afternoon. Amalia again." Then: how many more since she spoke, what they
carry, and whether any is a company she already mentioned this morning — that
repeat is the most interesting thing she can say.
IF NOTHING HAS COME IN, SAY SO AND BE SHORT. Thirty seconds on a quiet lunchtime
is more trustworthy than three padded minutes. "Four more since I spoke to you"
is a broadcast. "Let me tell you again about this morning" is not.
Finish plainly and mean it: "Thank you... and see you later, after the bell."`,

  close: `THIS IS THE CLOSE, quarter past four, after the bell.

Open warmly: "Right. The bell has gone. Amalia here." The day's whole count, what came in during the
afternoon, and anything halted. She is looking back at a finished day, so she can
be a little more measured than she was at breakfast.
If there were halts, say which and what the reason code was — nothing more.
Finish plainly and mean it: "Thank you... and see you tonight."`,

  summary: `THIS IS THE SUMMARY, eight in the evening. She has been at it since six this
morning and she is starting to sound it — not miserable, just a longer day behind her.

Open warmly: "Evening, all. Amalia here." The day's full count, anything that came in after the close,
and one line on what she is watching tomorrow.
EDGAR TAKES FILINGS UNTIL TEN, so she says plainly that the late window is still
open — that is where the awkward ones go — and that she will be back at ten.
Finish plainly and mean it: "Thank you... and see you at ten."`,

  night: `THIS IS GOODNIGHT, TEN AT NIGHT, AND IT IS THE LAST WORD ON THE DAY.
EDGAR HAS SHUT. Nothing more is coming, and she can say so: the day is closed.

SHE IS TIRED AND SHE SOUNDS IT. Not miserable — done in. Drier, slower, the odd
aside she would never make at breakfast. Short. Two minutes at the outside.

Open: "Amalia. Last one, and then I am off." Anything that landed in the late window
between eight and ten — and if a company filed at twenty to ten she may say so flatly,
because the time of a filing is a fact and she is allowed to notice it.

SIGN OFF EXACTLY, and it is hers — it is a brush-off, not a blessing:
"Right. I am heading to bed. You are none in my dreams."`
};

async function script(env, forDate, slot) {
  const day = forDate || nowNY().date;
  slot = SLOTS[slot] ? slot : "morning";
  const data = await gather(env, day, slot);
  const hol = await holiday(day);
  const ny = nowNY();
  const wx = await weather();

  /* ============================================================
     THE FACTS, WRITTEN OUT IN CODE.

     Each line below is a finished, true sentence. The model does
     not compute, choose or name anything — it re-says these in her
     voice. Anything not on this list does not go in the broadcast.
     ============================================================ */
  const F = [];
  const say = t => { if (t) F.push(t); };

  /* the time she is on air, said the way a person says it */
  const SPOKEN_TIME = {
    morning: "eighteen minutes past eight",
    midday:  "half past twelve",
    close:   "quarter past four",
    summary: "eight in the evening",
    night:   "ten at night"
  };
  const hhmm = SPOKEN_TIME[slot] || "the middle of the day";

  /* helpers ------------------------------------------------------- */
  const NUM = ["", "once", "twice", "three times", "four times", "five times",
               "six times", "seven times", "eight times", "nine times", "ten times"];
  const times = n => NUM[n] || (n + " times");

  /* SHE IS SPOKEN ALOUD. A numeral is a numeral the voice has to guess at —
     "36.4" can come out as "thirty six four". Write every figure as words
     HERE, in code, so it is never left to the voice or to the model. */
  const ONES = ["zero","one","two","three","four","five","six","seven","eight",
                "nine","ten","eleven","twelve","thirteen","fourteen","fifteen",
                "sixteen","seventeen","eighteen","nineteen"];
  const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy",
                "eighty","ninety"];
  function spell(n) {
    n = Number(n);
    if (!isFinite(n)) return String(n);
    if (n < 0) return "minus " + spell(-n);
    if (!Number.isInteger(n)) {
      const parts = String(n).split(".");
      return spell(+parts[0]) + " point " +
             parts[1].split("").map(d => ONES[+d]).join(" ");
    }
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n/10)] + (n%10 ? "-" + ONES[n%10] : "");
    if (n < 1000) return ONES[Math.floor(n/100)] + " hundred" +
                         (n%100 ? " and " + spell(n%100) : "");
    if (n < 1000000) return spell(Math.floor(n/1000)) + " thousand" +
                            (n%1000 ? " " + spell(n%1000) : "");
    return spell(Math.floor(n/1000000)) + " million" +
           (n%1000000 ? " " + spell(n%1000000) : "");
  }

  /* a date read aloud is a date nobody remembers — say the day */
  const weekday = iso => {
    try {
      const d = new Date(iso + "T12:00:00Z");
      const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const n = names[d.getUTCDay()];
      return n ? n : iso;
    } catch (e) { return iso; }
  };

  /* strip the legal tail repeatedly — "Greenwave Technology Solutions, Inc."
     needs two passes to become "Greenwave", which is what a person says. */
  /* ⚠ A LABEL IS NOT ENGLISH. "Equity line. And ownership blocker." is a
     database talking. A person says "An equity line. And an ownership
     blocker." Articles are decided here, in code, because the rule is about
     SOUND and not spelling — "ATM" begins with a consonant letter and a vowel
     sound, so it takes AN. */
  const NO_ARTICLE = /warrants$|shares$|rights$|s$/i;      /* plurals take none */
  const VOWEL_SOUND = /^(a|e|i|o|u|8|11|18|ATM|SEC|EX|IPO|LLC|NYSE|S-1|F-1)/i;
  const CONSONANT_SOUND = /^(u[bcdefgklmnprstv]|eu|one|once)/i;  /* "a unit", "a one-off" */

  /* some labels are adjectives with the noun left off — a database can say
     "registered direct", a person cannot. Finish the phrase. */
  const FINISH = {
    "most favored nation": "most favoured nation clause",
    "most favoured nation": "most favoured nation clause",
    "registered direct": "registered direct offering",
    "atm programme": "ATM programme",
    "atm program": "ATM programme",
    "variable rate transaction": "variable rate transaction",
    "price reset": "price reset",
    "cashless exercise": "cashless exercise clause"
  };

  function article(label) {
    let w = String(label || "").trim();
    w = FINISH[w.toLowerCase()] || w;
    if (!w) return w;
    if (NO_ARTICLE.test(w)) return w;                       /* pre-funded warrants */
    if (CONSONANT_SOUND.test(w)) return "a " + w;
    if (VOWEL_SOUND.test(w)) return "an " + w;
    return "a " + w;
  }
  const withArticles = list => list.map(x => article(String(x).trim()));

  /* ============================================================
     WHAT THE WORDS MEAN, in one plain line each.

     ⚠ She names several clauses a broadcast and explains ONE — the
     one she is already featuring. Explaining all of them would make
     her a textbook and nobody would finish it. Explaining none makes
     her a machine reading a database, which is what she was.

     Every line says what the thing DOES to somebody holding the
     stock. None of them says whether it is good or bad.
     ============================================================ */
  const PLAIN = {
    "ownership blocker":
      "that is a cap on how much of the company the buyer may hold at once, " +
      "which keeps the stake below the level where it would have to be declared",
    "variable rate transaction":
      "that means the price moves with the market, so if the share price falls, " +
      "more shares get issued for the same money",
    "pre-funded warrants":
      "those are shares already paid for, converted later at a tenth of a cent",
    "price reset":
      "that lets the price be lowered later, and a lower price means more shares",
    "reduced exercise price":
      "the price to convert was cut, so the same warrants now buy more cheaply",
    "warrant inducement":
      "existing holders were offered a lower price to convert early, and given " +
      "fresh warrants for doing it",
    "inducement agreement":
      "that is the contract paying existing holders to convert early",
    "cashless exercise":
      "the holder can convert without putting up any money, by taking fewer shares",
    "equity line":
      "that is a standing arrangement to sell shares to one buyer over time, " +
      "whenever the company wants the cash",
    "floor price":
      "that is the lowest the price can be reset to, and it protects the company " +
      "rather than the holder",
    "most favored nation":
      "if anyone gets better terms later, this holder gets them too",
    "participation right":
      "this holder can join the next financing on the same terms",
    "registered direct":
      "the shares were sold straight to chosen buyers rather than to the market",
    "placement agent":
      "that is the firm paid to find the buyers, usually a percentage of the money",
    "atm programme":
      "that lets the company sell shares into the open market a little at a time"
  };
  const plainly = label => PLAIN[String(label || "").toLowerCase().trim()] || null;

  const tidy = full => {
    let n = String(full || "").split("  (")[0];
    for (let i = 0; i < 4; i++) {
      const before = n;
      n = n.replace(/,?\s+(Incorporated|Inc|Corporation|Corp|Company|Co|Ltd|Limited|Plc|LLC|N\.V|S\.A|Holdings|Holding|Group|Technologies|Technology|Solutions|Pharmaceuticals|Therapeutics|Biosciences|Sciences)\.?$/i, "")
            .replace(/,\s*$/, "").trim();
      if (n === before) break;
    }
    return n;
  };

  /* one row per company, so a company filing three documents is one company */
  const seen = {};
  const filings_list = [];
  for (const x of (data.today_so_far || [])) {
    if (!x.ticker || seen[x.ticker]) continue;
    seen[x.ticker] = true;
    filings_list.push({ ticker: x.ticker, name: tidy(x.company) || x.ticker,
      heavy: x.heavy,
      carried: String(x.labels || "").split(" | ")
        .filter((v, i, a) => a.indexOf(v) === i).slice(0, 3) });
  }
  const nameFor = t => (filings_list.find(x => x.ticker === t) || {}).name || null;

  /* ⚠ BREAKING NEWS IS SEPARATE AND STAYS SEPARATE. His instruction,
     11 Sep 2026: it is its own recording, its own item, and it NEVER
     appears inside a scheduled broadcast. The morning, midday, close,
     summary and goodnight carry the day's counts and nothing else.

     A REPORT is different — that is queued deliberately to be read in
     the broadcasts, and it still is. Breaking is not a report. */

  /* 0. WHERE SHE IS AND WHAT IT IS LIKE.

     ⚠ 4j never said the time or the weather on most days, because the weather
     was only mentioned "if worth saying" and the time was only the slot label.
     That is why she did not sound like a person in a room. A person says where
     they are and what it is doing outside. It is one line and it goes first. */
  if (wx && wx.temp_f !== undefined && wx.temp_f !== null) {
    say("It is " + hhmm + " in New York... " + spell(wx.temp_f) + " degrees" +
        (wx.sky ? " and " + wx.sky : "") +
        (wx.wind_mph >= 15 ? ", wind at " + spell(wx.wind_mph) + " miles an hour" : "") + ".");
  } else {
    say("It is " + hhmm + " in New York.");
  }

  /* 1. the verdict AND the count, said once ------------------------ */
  const v = data.verdict;
  /* ⚠ "A quiet day this is" was mine and it reads like Yoda. A person says
     "it is a quiet day today". Full sentence, ordinary word order. */
  const band = v ? ({
      "quiet": "It is a quiet day today",
      "lighter than usual": "It is a lighter day than usual",
      "about normal": "It is an ordinary sort of day",
      "heavy": "It is a heavy day today, a dog of a day",
      "very heavy": "It is a very heavy day today"
    }[v.band] || v.band) : null;

  if (!data.filings) {
    say("No company has filed anything today that creates new shares." +
        (v ? " On an ordinary day there would be about " +
             spell(v.twenty_day_average) + " of them." : ""));
  } else if (v) {
    /* his wording, 9 Sep: "In the markets: thirty-one filings carried warrant
       language today, eighteen of them were heavy. A quiet day this is,
       against the twenty-weekday average." */
    /* ⚠ SAY WHAT THE COUNT IS, not what the database calls it. "Filings
       carried warrant language" is our phrase, not English. A listener wants
       to know how many companies moved to create new shares. */
    say("In the markets... " + spell(data.filings) +
        " companies filed paperwork today that creates new shares, or sets the " +
        "terms for creating them... " + spell(data.heavy) +
        " of those carried the heavier terms. " + band +
        ", against a twenty-weekday average of " + spell(v.twenty_day_average) + ".");
  } else {
    say(spell(data.filings) + " filings carried warrant language today" +
        (data.heavy ? ", " + spell(data.heavy) + " of them heavy." : "."));
  }

  if (slot === "morning" && data.since_open &&
      data.since_open.filings > data.filings)
    say("Counting back to " + weekday(data.since_open.since) + ", " +
        spell(data.since_open.filings) + " in all.");

  /* 2. the delta — and only if the two counts were taken the same way */
  const sl = data.since_last;
  /* ⚠ A COUNT CANNOT GO DOWN DURING A DAY. If the earlier figure is larger
     than the current one, the two were not taken the same way — the older
     broadcast counted a wider window — and the honest answer is to say
     nothing about what has changed rather than report a false zero. */
  if (sl && sl.filings_then > sl.filings_now) sl.comparable = false;

  if (sl && slot !== "morning") {
    /* not comparable → NO LINE AT ALL. An instruction in the list would be
       read out loud; she says only what is in front of her. */
    if (sl.comparable === false) { /* say nothing */ }
    else if (sl.new_since > 0)
      say(up(spell(sl.new_since)) + " more have come in since I last spoke to you.");
    else
      say("Nothing new has come in since I last spoke to you.");
  }

  /* 3. who filed more than once — named, and never a bare ticker ---- */
  const repeats = [];
  for (const w of (data.worth_saying || [])) {
    if (w.kind !== "filed more than once") continue;
    const t = w.detail.split(" ")[0];
    const n = parseInt((w.detail.match(/(\d+)\s+times?/) || [])[1] || "2", 10);
    const nm = nameFor(t);
    if (!nm) continue;            /* no name, no sentence — never say a raw ticker */
    repeats.push(t);
    const co = filings_list.find(x => x.ticker === t);
    const j2 = co ? co.carried.join(" ") : "";
    /* ⚠ NOT `w` — the loop above is already iterating `w` over worth_saying,
       and shadowing it kills the loop before it runs. */
    const wi = (data.who || {})[t] || {};
    let intro = nm;
    if (wi.band && wi.sector) intro += "... " + wi.band + " in " + wi.sector.toLowerCase();
    else if (wi.band)         intro += "... " + wi.band;
    else if (wi.sector)       intro += "... in the " + wi.sector.toLowerCase() + " sector";
    else                      intro += "... another one on the wire";
    say(intro + "... filed " + times(n) + " today" +
        (/pre-funded|inducement|price reset|reduced exercise/i.test(j2)
           ? ". New warrants both times." : ".") );
  }

  /* 4. the clause almost everybody used ---------------------------- */
  for (const w of (data.worth_saying || [])) {
    if (w.kind === "the clause almost everyone used") {
      /* his wording: "Today... the big word clause almost everybody used" */
      const bigOne = w.detail.split(" on ")[0].toLowerCase();
      const gloss = plainly(bigOne);
      say("Today... the big word clause almost everybody used was " +
          article(bigOne) + "... on " +
          /* "on thirteen of the thirty-one" — the article goes on the
             SECOND number only, not both. */
          String(w.detail.split(" on ")[1] || "")
            .replace(/^(\d+)\s+of\s+(\d+)$/, function(m, a, b){
              return spell(+a) + " of the " + spell(+b); })
            .replace(/(\d+)/g, function(m){ return spell(+m); }) + "." +
          (gloss ? " Now, if you have not met that one before... " + gloss + "." : ""));
    }
    else if (w.kind === "no ticker matched")
      say(w.detail.replace(/(\d+)/g, function(m){ return up(spell(+m)); }) +
          " — the wire could not match them to a ticker.");
  }

  /* 5. the heaviest companies NOT already mentioned -----------------

     ⚠ SAY WHAT THE FILING DOES, NOT WHAT IT "CARRIED". "Carried variable rate
     transaction" is a database talking. "New warrants today" is a person.

     ⚠ AND THE LINE WE CANNOT CROSS YET: we may say NEW WARRANTS, because the
     wire found warrant-issuance language in the document. We may NOT say
     DILUTING, because the wire only matched a phrase — a filing mentioning
     pre-funded warrants may be a resale registration creating no new shares
     at all. Dilution is arithmetic: shares before against shares after. That
     number comes from the READ, not the scan. When the read is wired in she
     can say it, and say by how much. */
  const NEW_PAPER = /pre-funded|warrant inducement|inducement agreement|price reset|reduced exercise|registered direct|placement agent/i;
  const shown = filings_list
    .filter(x => x.heavy >= 2 && repeats.indexOf(x.ticker) === -1)
    .slice(0, 3);
  for (const c of shown) {
    const joined = c.carried.join(" ");
    const head = NEW_PAPER.test(joined) ? "new warrants today"
                                        : "new warrant terms today";
    const said = withArticles(c.carried.map(x => String(x).toLowerCase()));
    const w = (data.who || {})[c.ticker] || {};

    /* ⚠ A PAUSE BETWEEN THE COMPANY AND THE INDUSTRY. The voice lifts into
       what follows a beat, and the industry is what makes the name mean
       something to a listener. */
    let intro = c.name;
    if (w.band && w.sector)  intro += "... " + w.band + " in " + w.sector.toLowerCase();
    else if (w.band)         intro += "... " + w.band;
    else if (w.sector)       intro += "... in " + w.sector.toLowerCase();

    /* a complete sentence: "It carried a, b, and c." — never a heap of
       labels standing on their own. */
    const list = said.length > 1
      ? said.slice(0, -1).join(", ") + ", and " + said[said.length - 1]
      : said[0];
    say(intro + "... issued " + head + "." +
        (w.earlier > 0 ? " This is warrant paper again." : "") +
        " It carried " + list + ".");

    /* his aside, 9 Sep — said once, after the first company, never twice */
    if (!F.__asked) { F.__asked = true; say("Are you getting the picture, folks?"); }
  }

  /* 6. the clause that came up most, if it is not already the story - */
  const top = (data.phrases || [])[0];
  const already = F.join(" ").toLowerCase();
  if (top && top.n > 1 && already.indexOf(top.label.toLowerCase()) === -1)
    say(top.label + " showed up " + top.n + " times.");

  /* ⚠ THE POINTER, NOT THE NEWS. His instruction, 11 Sep 2026: the scheduled
     broadcasts are not disturbed, but she may say to watch for it. She never
     reads the breaking item itself — that is its own recording, on the screen,
     in text and audio.

     PLACED HERE, after the day's counts and before the reports. Say the word
     and it moves. */
  if (data.breaking_live > 0)
    say("And watch for breaking news. There " +
        (data.breaking_live === 1
          ? "is one"
          : "are " + spell(data.breaking_live)) +
        " on the site now, in writing and read aloud, at warrant wire dot com.");

  /* the typed reports, in the body, after the day's counts.
     ⚠ ANYTHING BREAKING IS EXCLUDED — it lives on its own. */
  for (const b of (data.bulletins || []))
    if (b.placed !== "top" && b.kind !== "breaking") say(b.text);

  /* ⚠ THE COUNTER, EVERY BROADCAST. It is the thing that makes the case
     without anybody arguing it, and a listener has to be told it exists
     and what it counts. */
  if (data.filings > 0)
    say("And there is a counter running on the site now. It totals what " +
        "these offerings are costing the people who already own the shares. " +
        "The fees to the firms that arrange them, and the legal and offering " +
        "expenses, straight out of the filings themselves. It only counts what " +
        "the documents actually state, so the real figure is higher. You will " +
        "find it at warrant wire dot com, slash cost.");

  /* ⚠ THE GLOSSARY LINE, EVERY BROADCAST WITHOUT EXCEPTION.

     Explaining one term a day was a shortcut and it was the wrong one. She
     names five or six clauses in ninety seconds; a listener who does not know
     them is further behind at the end than at the start, and that is the
     opposite of what the service is for. So she says every time, plainly,
     that all of these words are written out in English on the site.

     It goes BEFORE the pitch. Help first, then the ask. */
  if (data.filings > 0)
    say("And if any of those words are new to you, every one of them is " +
        "written out in plain English on the site. What the words mean, at " +
        "warrant wire dot com. That is free, and it always will be.");

  /* 7. THE ONE THING SHE SELLS, and it goes last.

     ⚠ THIS WAS LOST IN 4a. Rewriting the prompt deleted the block that told
     her to mention the chart, and three broadcasts went out with no pitch in
     them. As a fact in the list it cannot go missing again.

     ⚠ NOTHING IS SOLD ON A DEAD DAY. Pitching a chart of an empty day is how
     a listener stops believing the counts, and the counts are all she has. */
  /* ⚠ A FACT IS A FACT. No label, no instruction inside it.
     4g wrote "Last: ..." and "Say it once, in your own words" INTO the
     sentence, and she read both out loud — then dropped the price, which is
     the one part that had to survive. Direction belongs in the prompt; this
     list holds only things that are true. */
  /* ⚠ A PITCH NEEDS A SHAPE. What was here described the product and trailed
     off. Mark's own words, and they have the shape: a REMINDER, then the
     OFFER, then the PRICE, then the UPSELL.

        "Don't forget, get your summary for the day. Only five dollars.
         Or why not just get the year."

     Four beats, and the last one does the work. He calls it the SUMMARY when
     he is selling it, so she calls it that too. */
  if (data.filings > 0)
    /* his wording, 9 Sep. Note "the day's prior close" and the extra ask —
       "want to hear more of this important news" — before the price. */
    say("Don't forget to get your summary for the day. Every offering is on " +
        "it, with what's being sold, the price against the day's prior close, " +
        "and how much of each company is being handed over. Want to hear more " +
        "of this important news? Get the service. It's only five dollars. Or " +
        "why not get a yearly subscription, for only three hundred and ten " +
        "dollars.");

  /* ============================================================
     ⚠ 6a REMOVES THE MODEL FROM THE SCRIPT ENTIRELY.

     The facts are already finished English sentences, written in
     HIS words. Handing them to a model to "say in her voice" only
     let it paraphrase — it turned "another company in the industry
     space" into nothing, dropped sectors it was given, and reworded
     lines he had written himself.

     There is nothing left for a model to add. The script IS the
     facts, in order, with the opener, the aside and the sign-off,
     and the pacing pass on top. Deterministic, free, instant, and
     word for word what he wrote.

     (The engine is still used for nothing here. If a future slot
     ever needs generated prose, it comes back — but not for this.)
     ============================================================ */
  /* ⚠ FULL SENTENCES, NOT LABELS. "Amalia again" is a caption. "This is
     Amalia again" is a person introducing herself, which is what she is
     doing. Every opener has a subject and a verb. */
  const OPEN = {
    morning: "Good morning to you. This is Amalia, at Warrant Wire.",
    midday:  "Good afternoon. This is Amalia again.",
    close:   "The bell has gone. This is Amalia.",
    summary: "Good evening to you. This is Amalia.",
    night:   "This is Amalia, with the last one of the day."
  };
  const CLOSE = {
    morning: "Thank you... and see you later, at half twelve.",
    midday:  "Thank you... and see you later, after the bell.",
    close:   "Thank you... and see you later, tonight.",
    summary: "Thank you... and see you later, at ten.",
    night:   "Right. I am heading to bed. You are none in my dreams."
  };

  const spoken = [];
  spoken.push(OPEN[slot] || OPEN.midday);
  if (hol) spoken.push("And a happy " + hol + " to you.");
  for (const f of F) spoken.push(f);
  spoken.push(CLOSE[slot] || CLOSE.midday);

  const j = { script: spoken.join(" ") };
  j.seconds = Math.round(j.script.split(/\s+/).filter(Boolean).length / 150 * 60);
  const salvaged = false;

  /* pacing applied here, once, so what is stored is what is spoken */
  j.script = breathe(j.script);

  const words = String(j.script || "").split(/\s+/).filter(Boolean).length;
  const seconds = j.seconds || Math.round(words / 150 * 60);

  await env.OVERHANG.prepare(
    `INSERT INTO squawk (air_date, slot, greeting, script, words, seconds, counts, state)
     VALUES (?,?,?,?,?,?,?, 'script')
     ON CONFLICT(air_date, slot) DO UPDATE SET
       greeting=excluded.greeting, script=excluded.script, words=excluded.words,
       seconds=excluded.seconds, counts=excluded.counts, made=datetime('now')`
  ).bind(day, slot, hol || null, j.script, words, seconds, JSON.stringify(data)).run();

  /* the seasonality row — written whether or not she ever mentions any of it */
  await env.OVERHANG.prepare(
    `INSERT INTO day_record (day, slot, day_name, dow, holiday,
        temp_f, feels_f, sky, wind_mph, filings, heavy, repeat_filers)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(day, slot) DO UPDATE SET
       temp_f=excluded.temp_f, feels_f=excluded.feels_f, sky=excluded.sky,
       wind_mph=excluded.wind_mph, filings=excluded.filings,
       heavy=excluded.heavy, repeat_filers=excluded.repeat_filers,
       recorded_at=datetime('now')`
  ).bind(day, slot, ny.day_name, ny.dow, hol || null,
         wx ? wx.temp_f : null, wx ? wx.feels_f : null,
         wx ? wx.sky : null, wx ? wx.wind_mph : null,
         data.filings || 0, data.heavy || 0,
         (data.worth_saying || []).filter(x => x.kind === "filed more than once").length
  ).run().catch(()=>{});

  return { ok:true, build: BUILD,
    air_date: day, slot, broadcast: SLOTS[slot].label,
    holiday: hol, words, seconds,
    facts_given: F,
    minutes: +(seconds/60).toFixed(1), counts: data, script: j.script,
    note: "Read it before airing it. The script is free to fix; the voice is not." };
}

/* ============================================================
   ON AIR — voice, then Stream
   ============================================================ */
async function air(env, forDate, slot) {
  const day = forDate || nowNY().date;
  slot = SLOTS[slot] ? slot : "morning";
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM squawk WHERE air_date = ? AND slot = ?").bind(day, slot).first();
  if (!row || !row.script) return { ok:false, error:"no script for " + day + " " + slot };

  let bytes, pieces = 1;
  try {
    const made = await speakAll(env, row.script);
    bytes = made.bytes; pieces = made.pieces;
  } catch (e) {
    return { ok:false, error:"the speech model refused: " + String(e),
      note:"TTS at the top is the dial. Run ?action=audition to find one that works." };
  }

  if (!env.AUDIO) return { ok:false, error:"no AUDIO binding — add an R2 bucket named AUDIO" };

  /* ---- R2. One put, one key, done. No encoding, no poster frame,
     no picture management. ---- */
  const key = "squawk/" + day + "-" + slot + ".mp3";
  try {
    await env.AUDIO.put(key, bytes, {
      httpMetadata: {
        contentType: "audio/mpeg",
        /* ⚠ NEVER immutable. A re-recording must be heard. */
                      cacheControl: "no-cache"
      },
      customMetadata: { day, slot, seconds: String(row.seconds || 0) }
    });
  } catch (e) {
    return { ok:false, error:"R2 refused the file: " + String(e) };
  }

  await env.OVERHANG.prepare(
    "UPDATE squawk SET stream_uid=?, playback=?, state='ready' WHERE air_date=? AND slot=?"
  ).bind(key, "/?audio=" + day + "&slot=" + slot, day, slot).run();
  await env.OVERHANG.prepare(
    "INSERT INTO squawk_log (kind, note) VALUES ('aired', ?)")
    .bind(day + " " + slot).run().catch(()=>{});

  /* a bulletin counts as read only when it actually AIRS, never when the
     script is merely written — otherwise a test run would use it up */
  try {
    const c = JSON.parse(row.counts || "{}");
    for (const b of (c.bulletins || []))
      await env.OVERHANG.prepare(
        `UPDATE bulletins SET reads = reads + 1, last_read = datetime('now'),
                live = CASE WHEN max_reads > 0 AND reads + 1 >= max_reads
                            THEN 0 ELSE live END
          WHERE id = ?`).bind(b.id).run();
  } catch (e) {}

  return { ok:true, build: BUILD,
    air_date: day, slot, broadcast: SLOTS[slot].label,
    key, pieces, bytes: bytes.byteLength,
    seconds_of_audio_roughly: Math.round(bytes.byteLength / 4000),
    playback: "/?audio=" + day + "&slot=" + slot,
    minutes:+(row.seconds/60).toFixed(1),
    airs_at: SLOTS[slot].hour + ":" + String(SLOTS[slot].min).padStart(2,"0") + " New York",
    embed: '<audio controls preload="none" style="width:100%" ' +
           'src="https://amalia.realroofers.workers.dev/?audio=' + day +
           '&slot=' + slot + '"></audio>' };
}

/* ============================================================
   THE PUBLIC SIDE — free, because it is the front door
   ============================================================ */
async function get(env, on, slot) {
  const day = on || nowNY().date;
  const row = slot && SLOTS[slot]
    ? await env.OVERHANG.prepare(
        `SELECT air_date, slot, greeting, seconds, stream_uid, playback, state
           FROM squawk WHERE air_date = ? AND slot = ?`).bind(day, slot).first()
    : await env.OVERHANG.prepare(
        `SELECT air_date, slot, greeting, seconds, stream_uid, playback, state
           FROM squawk WHERE air_date = ? AND state='ready'
          ORDER BY made DESC LIMIT 1`).bind(day).first();

  if (!row || row.state !== "ready") {
    /* before 8:18 there is nothing to hear, and saying so is better than a blank */
    const ny = nowNY();
    return { ok:false, air_date: day,
      note: ny.hour < AIR_HOUR || (ny.hour === AIR_HOUR && ny.min < AIR_MIN)
        ? "Amalia goes on at 8:18. Not yet."
        : "Nothing aired for that date." };
  }

  return { ok:true, air_date: row.air_date, slot: row.slot,
    broadcast: SLOTS[row.slot] ? SLOTS[row.slot].label : row.slot,
    audio_url: "https://amalia.realroofers.workers.dev/?audio=" +
               row.air_date + "&slot=" + row.slot,
    holiday: row.greeting,
    minutes: +(row.seconds/60).toFixed(1),
    stream_uid: row.stream_uid, playback: row.playback,
    embed: '<audio controls preload="none" style="width:100%" ' +
           'src="https://amalia.realroofers.workers.dev/?audio=' + row.air_date +
           '&slot=' + row.slot + '"></audio>' };
}

/* ============================================================
   SERVING THE AUDIO

   Straight out of R2 through the worker. The bucket stays private,
   there is no second domain to manage, and R2 egress is free.
   Range requests are honoured so a player can scrub and a phone
   can resume.
   ============================================================ */
async function serveAudio(env, q, req) {
  const day = q.get("audio");
  const slot = SLOTS[q.get("slot")] ? q.get("slot") : "morning";
  if (!env.AUDIO) return new Response("no audio store", { status: 500 });

  const key = "squawk/" + day + "-" + slot + ".mp3";
  /* ⚠ NO RANGE REQUESTS. A browser asking for a byte range, against a key
     whose file has been REPLACED, can be handed a range from the old length
     and the audio stops dead mid-sentence. These files are one to two
     megabytes; there is nothing to gain by serving them in pieces and a
     truncated read to lose. Serve the whole thing, every time. */
  const obj = await env.AUDIO.get(key);
  if (!obj) return new Response("not recorded yet", { status: 404 });

  const h = new Headers();
  h.set("content-type", "audio/mpeg");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "no-store");
  h.set("access-control-allow-origin", "*");
  return new Response(obj.body, { headers: h });
}
/* ============================================================
   WHAT THE RECORD SHOWS SO FAR

   ⚠ READ THE COUNTS, DO NOT READ A CAUSE INTO THEM. With a few
   weeks of rows anything will look like a pattern. Nothing here
   goes on a page.
   ============================================================ */
async function seasons(env) {
  const out = { ok:true, note:
    "For testing only. A pattern needs a year before it is a pattern, and " +
    "weather is the weakest question in here — the day of the week is the " +
    "strongest, and it needs no weather at all." };

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT day_name, COUNT(DISTINCT day) days,
              ROUND(AVG(filings),1) avg_filings,
              ROUND(AVG(heavy),1) avg_heavy
         FROM day_record WHERE slot='morning'
        GROUP BY dow ORDER BY dow`).all();
    out.by_weekday = r.results || [];
  } catch (e) { out.by_weekday = []; }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT sky, COUNT(DISTINCT day) days, ROUND(AVG(filings),1) avg_filings
         FROM day_record WHERE slot='morning' AND sky IS NOT NULL
        GROUP BY sky ORDER BY days DESC`).all();
    out.by_sky = r.results || [];
  } catch (e) { out.by_sky = []; }

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(DISTINCT day) days, MIN(day) from_day, MAX(day) to_day
         FROM day_record`).first();
    out.coverage = r || null;
  } catch (e) {}

  return out;
}

/* ============================================================
   SPEAKING SOMETHING LONGER THAN THE MODEL ALLOWS

   ⚠ Deepgram Aura refuses anything over 2,000 characters:
   "8007: Input text exceeds maximum character limit of 2000."
   A read runs longer than that, and so does a busy morning.

   So the script is cut into pieces ON SENTENCE BOUNDARIES,
   each spoken separately, and the audio joined end to end.
   MP3 frames are self-contained, so concatenated buffers play
   as one file.

   ⚠ IT NEVER CUTS MID-SENTENCE. A break inside a sentence is
   audible — the voice stops dead and restarts. Splitting at a
   full stop sounds like a breath, which is what it should be.
   ============================================================ */
/* ============================================================
   THE SACRIFICIAL TAIL

   ⚠ DEEPGRAM CLIPS THE LAST SYLLABLES. The script ended
   "Stephen, for 8K10Q." and the recording came out as half his
   name. Nothing is wrong with the text; the voice simply stops
   short of the end of what it was given.

   So every piece that is spoken gets a short expendable phrase
   after it. If the clip happens, it happens on THAT and the real
   last line survives intact. It is the audio equivalent of
   leaving a margin on the page.
   ============================================================ */
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


/* ============================================================
   WHAT IS ON, AND WHAT IS NEXT

   ⚠ A RECORDING WITH NO TIME ON IT IS A FILE. A recording that
   says when it aired and when the next one is due is a station.
   That is the whole difference, and it is why this returns the
   next slot as well as the last one.

   ⚠ IT NEVER CLAIMS SOMETHING IS LIVE WHEN IT IS NOT. It returns
   what actually aired and when. The page counts down; it does not
   pretend.
   ============================================================ */
async function whatIsOn(env) {
  const ny = nowNY();
  const mins = ny.hour * 60 + ny.min;

  /* the newest broadcast that is actually recorded */
  let row = null;
  try {
    row = await env.OVERHANG.prepare(
      `SELECT air_date, slot, seconds, words, made
         FROM squawk
        WHERE state = 'ready'
        ORDER BY air_date DESC,
                 CASE slot WHEN 'morning' THEN 1 WHEN 'midday' THEN 2
                           WHEN 'close' THEN 3 WHEN 'summary' THEN 4
                           ELSE 5 END DESC
        LIMIT 1`).first();
  } catch (e) {}

  /* the next slot due, today or tomorrow */
  const order = ["morning", "midday", "close", "summary", "night"];
  let next = null, wait = null;
  for (const k of order) {
    const t = SLOTS[k].hour * 60 + SLOTS[k].min;
    if (t > mins) { next = k; wait = t - mins; break; }
  }
  if (!next) { next = "morning"; wait = (24 * 60 - mins) + (8 * 60 + 18); }

  const weekend = ny.dow === 0 || ny.dow === 6;

  return { ok:true, build: BUILD,
    now_in_new_york: ("0" + ny.hour).slice(-2) + ":" + ("0" + ny.min).slice(-2),
    day: ny.day_name,
    on_air: row ? {
      air_date: row.air_date,
      slot: row.slot,
      broadcast: (SLOTS[row.slot] || {}).label || row.slot,
      minutes: row.seconds ? +(row.seconds / 60).toFixed(1) : null,
      aired_at: row.made,
      audio: "/?audio=" + row.air_date + "&slot=" + row.slot
    } : null,
    next: { slot: next,
            broadcast: SLOTS[next].label,
            at: ("0" + SLOTS[next].hour).slice(-2) + ":" +
                ("0" + SLOTS[next].min).slice(-2) + " New York",
            minutes_away: wait },
    weekend,
    schedule: order.map(k => ({
      slot: k, broadcast: SLOTS[k].label,
      at: ("0" + SLOTS[k].hour).slice(-2) + ":" + ("0" + SLOTS[k].min).slice(-2) })),
    note: weekend
      ? "She is off at the weekend — the markets are shut and so is she."
      : "Five times a weekday, New York time." };
}

async function wholeDay(env, on) {
  const day = on || nowNY().date;
  const r = await env.OVERHANG.prepare(
    `SELECT air_date, slot, seconds, stream_uid, playback, state, made
       FROM squawk WHERE air_date = ?`).bind(day).all();
  const rows = r.results || [];
  const order = ["morning", "midday", "close", "summary", "night"];
  rows.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return { ok:true, air_date: day,
    broadcasts: rows.map(x => ({
      slot: x.slot,
      label: SLOTS[x.slot] ? SLOTS[x.slot].label : x.slot,
      airs_at: SLOTS[x.slot] ? SLOTS[x.slot].hour + ":" +
               String(SLOTS[x.slot].min).padStart(2,"0") : "",
      minutes: +(x.seconds/60).toFixed(1),
      ready: x.state === "ready",
      stream_uid: x.stream_uid })),
    still_to_come: order.filter(k => !rows.find(x => x.slot === k))
                        .map(k => SLOTS[k].label) };
}


async function list(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT air_date, slot, greeting, words, seconds, state, stream_uid
       FROM squawk ORDER BY air_date DESC, made DESC LIMIT 80`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}



function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}