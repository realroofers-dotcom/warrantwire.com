/* ============================================================================
   STEPHEN  —  Cloudflare Worker
   The voice of a read. He reads it. He does exactly the facts and nothing else.

   Built 2026-09-10 04:55 ET · stephen-4c

   3f  the comma rule narrowed so it only fires on a real list
   4a  the row clip added — twenty seconds on a free wire row, his voice
       · and tidy() fixed: a CIK with ONE space before it was reaching the
         voice and being read out as a number in the millions
   4b  the clip's COUNT corrected — a five-mark row said three — and
       "what that does" on a one-mark row
   4c  the clips keep themselves current off page traffic. No cron.

   ----------------------------------------------------------------------------
   WRITTEN ONCE, WITH EVERYTHING AMALIA COST US. She took twenty versions to
   get right and every lesson is already in here:

     · THE FACTS ARE BUILT IN CODE as finished English sentences, already true
       and already correctly named. The model only says them in his voice. It
       cannot attach a fact to the wrong company because it never chooses one,
       and it cannot confuse two figures because it never sees two raw numbers
     · EVERY NUMBER IS WRITTEN AS WORDS in code — "two million nine hundred and
       ninety-nine thousand" — so the voice never guesses at a numeral
     · ARTICLES BY SOUND, NOT SPELLING — "an ATM programme", "an equity line"
     · PACING IN CODE — Aura holds an ellipsis longer than a full stop, and a
       beat before a company name makes the voice lift into it
     · AUDIO IN R2, NEVER STREAM. Stream is for video and carries a monthly
       minimum; R2 stores a megabyte for pennies and egress is free
     · A BUILD STAMP in every reply, so nobody debugs a version that was pasted
       but never deployed
     · MISTRAL RETURNS JSON ALREADY PARSED on `response` — take it, and skip
       the parsing step that failed twice
     · SALVAGE a reply cut off mid-object, preferring COMPLETE data over data
       force-closed mid-word
     · WHEN NOTHING IS RECOGNISED, REPORT WHAT CAME BACK, never an empty string

   ----------------------------------------------------------------------------
   WHO HE IS — Mark's, 8 Sep 2026

     Male. Australian. Former military. He works for Amalia and she is a tough
     boss. He does exactly the facts and nothing else.

   That is the specification, not decoration. The character is made out of
   RESTRAINT. He never embellishes, never speculates, never adds a view — and
   "she is a tough boss" is the reason a listener understands why in one line.
   Former military does the same work: a man who reports what he found and stops.

   AMALIA sees patterns nobody else sees. STEPHEN reads one document and does
   not decorate it. Same shop, two jobs, and neither wanders into the other's.

   ⚠ NO AUSTRALIAN VOICE IS CONFIRMED ON WORKERS AI. Deepgram's male voices are
   American, plus angus who is Irish. Run ?action=audition and pick by ear.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              AI         Workers AI
              AUDIO      R2 bucket (stephen-audio)
   SECRETS    LOG_KEY
   VARIABLE   PAY        the pay worker, for the gate
   CRON       none — he reads on demand

   PUBLIC
     ?row=<accession>                THE FREE 20-SECOND CLIP for a wire row
     ?rows=1                         which rows have a clip, so the page knows
     ?listen=1&accession=…&email=…   the audio, if it is paid for
     ?audio=<accession>              the mp3 itself
     ?audio=<accession>&dl=1         download it instead of streaming
     ?action=file&accession=…        what is actually stored, without playing
     ?audition=<n>                   a voice sample

   PRIVATE
     ?action=script&accession=…      THE WORDS ONLY. ALWAYS RUN THIS FIRST.
     ?action=say&accession=…         words → voice → R2
     ?action=audition                render every candidate voice
     ?action=rowscript&accession=…   THE CLIP'S WORDS ONLY. Look first.
     ?action=rowclips&n=5            build the missing clips for today's rows
     ?action=rowpeek                 what the wire returns for the free rows
     ?action=list

   ----------------------------------------------------------------------------
   ⚠ THE ROW CLIP — added 10 Sep 2026, and it is HIS VOICE, NOT A SECOND ONE.

   It runs through the same TTS const, the same breathe() pass and the same
   sacrificial tail as his reads, because a twenty-second clip that sounds like
   a different man undoes the reason for having a named reader at all.

   ⚠ WHAT IT MAY SAY: only what the row already prints — the company, the
   industry, and the plain-English marks. NO figure, NO price, NO share count,
   NO quote, NO accession. The moment it reads anything out of the document,
   the free clip IS the read and the twenty dollars on the same row is gone.

   ⚠ BUILT ONCE, NOT ON CLICK. If the icon called the voice when somebody
   pressed it, every visitor and every crawler would run a paid speech call on
   the same five rows.
   ========================================================================== */

/* ⚠ THE BUILD STAMP, in every reply, AND THE HEADER ABOVE MUST MATCH IT.
   The stamp said 4c while the header still said 3e, which is the exact
   confusion the stamp exists to prevent — two version numbers in one file
   and no way to tell which is the real one. Change both, every time. */
const BUILD = "stephen-4c · 2026-09-10 04:55 ET";

const ENGINE = { model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
                 max_tokens: 3000 };

/* ⚠ THE VOICE. One word changes him. Run ?action=audition and listen. */
const TTS = { model: "@cf/deepgram/aura-1", voice: "orion", shape: "aura" };

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


export default {
  /* ⚠ ctx IS NEEDED FOR waitUntil. The row clips build themselves in the
     background off an ordinary page request, so the work has to outlive the
     response — without ctx the runtime kills it the moment the answer is
     sent, and the clip is never finished. */
  async fetch(req, env, ctx) {
    const u = new URL(req.url), q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      /* the file itself — public, cached, and it needs no key */
      if (q.get("audio")) return await serveAudio(env, q, req);
      if (q.get("audition")) return await serveAudition(env, q, req);
      if (q.get("listen")) return json(await listen(env, q), H);
      /* the row clip is free and public — it is a sample, not a product */
      if (q.get("row")) return await serveRow(env, q);
      if (q.get("rows")) return json(await rowsReady(env, ctx), H);

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "list";
      if (a === "script")   return json(await script(env, q.get("accession")), H);
      if (a === "say")      return json(await say(env, q.get("accession")), H);
      if (a === "audition") return json(await audition(env), H);
      if (a === "file") return json(await fileInfo(env, q.get("accession")), H);
      if (a === "rowpeek")   return json(await rowPeek(env, +(q.get("n") || 5)), H);
      if (a === "rowscript") return json(await rowScript(env, q.get("accession")), H);
      if (a === "rowclips")  return json(await rowClips(env, +(q.get("n") || 5), q.get("force")), H);
      return json(await list(env), H);
    } catch (e) {
      return json({ ok:false, error:String(e) }, H, 500);
    }
  },

  /* ⚠ NOT NEEDED, AND HERE ANYWAY. The clips keep themselves current off page
     traffic, so no cron is required. But a trigger added later would otherwise
     fire into a worker with nothing to run it — a silent no-op that looks like
     a broken cron. If one is ever set, this is what it calls. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await setup(env);
      await rowClips(env, 5).catch(() => {});
    })());
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS audio (
       accession TEXT PRIMARY KEY,
       ticker TEXT, company TEXT, script TEXT, facts TEXT,
       words INTEGER, seconds INTEGER,
       key TEXT, state TEXT DEFAULT 'script',
       made TEXT DEFAULT (datetime('now')))`).run();
  /* ⚠ ITS OWN TABLE. A row clip is not a read and must never be mistaken for
     one — the reads table is what the paid gate checks. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS row_clips (
       accession TEXT PRIMARY KEY,
       ticker TEXT, company TEXT, script TEXT,
       seconds INTEGER, bytes INTEGER,
       made TEXT DEFAULT (datetime('now')))`).run();
}

/* ============================================================
   THE FACTS, BUILT IN CODE

   Every line below is a finished, true sentence taken straight
   from the stored read. The model does not compute, choose or
   name anything — it says these in his voice, in order.
   ============================================================ */
function factsFrom(rd, who) {
  who = who || {};
  const F = [];
  const say = t => { if (t) F.push(t); };

  let f = {};
  try { f = JSON.parse(rd.fields || "{}"); } catch (e) {}

  const company = tidy(rd.company) || rd.ticker || "the company";
  const ticker  = rd.ticker ? rd.ticker.toUpperCase() : "";

  /* 1. who, what, when */
  /* his wording, 10 Sep: "hello, this is Stephen for Warrant Wire" */
  say("Hello. This is Stephen, for Warrant Wire.");

  /* THE ANNOUNCE. Who they are, how big, and whether we have seen this
     before — each part only if it was computed. */
  let intro = "This filing is from " + company +
              (ticker ? ", ticker " + spellOut(ticker) : "");
  if (who.band && who.sector) intro += "... " + who.band + " in " + who.sector.toLowerCase();
  else if (who.band)          intro += "... " + who.band;
  else if (who.sector)        intro += "... in " + who.sector.toLowerCase();
  say(intro + ".");

  /* ⚠ SAY WHAT THE NUMBER IS. `earlier` counts FILINGS carrying warrant
     language, not warrant deals — a ten Q that mentions pre-funded warrants
     is one of them. "The seventy-first time this company has been on the
     wire" implies seventy financings, and that is not what was counted. */
  if (who.earlier > 0)
    say("This is not the first time. " + up(spell(who.earlier)) +
        " earlier filings from this company carry warrant language.");
  else if (who.earlier === 0)
    say("This is the first filing from this company to carry warrant language.");

  say(up(spokenForm(rd.form)) + ", filed " + spokenDate(rd.filed) + ".");

  /* 2. what the filing did */
  if (f.headline) say(spoken(f.headline));

  /* 3. THE MONEY — and only where the read carried the quote that proves it */
  const m = f.money || {};
  if (m.raised && m.raised_quote)
    say("The company raised " + money(m.raised) + ". The document says, quote... " +
        spoken(shorten(m.raised_quote)) + "... end quote.");
  else if (m.raised)
    say("The company raised " + money(m.raised) + ".");

  if (m.price && m.price_quote)
    say("The price is " + money(m.price) + ". The document says, quote... " +
        spoken(shorten(m.price_quote)) + "... end quote.");
  else if (m.price)
    say("The price is " + money(m.price) + ".");

  /* the read writes "Armistice bought 1,656,127 shares", so prefixing
     "Bought by" gives "Bought by Armistice bought…". Use the sentence as it
     stands when it already carries its own verb. */
  if (m.who_bought || m.who_was_paid) say("Now the names on this one.");

  if (m.who_bought) {
    const wb = spoken(strip2(m.who_bought));
    say(/\b(bought|purchased|acquired|subscribed)\b/i.test(wb)
          ? up(wb) + "." : "Bought by " + wb + ".");
  }
  if (m.who_was_paid) {
    const wp = spoken(strip2(m.who_was_paid));
    say(/\b(was paid|received|paid)\b/i.test(wp)
          ? "The agent... " + up(wp) + "." : "Paid to the agent... " + wp + ".");
  }

  /* ⚠ THE NAMES. Said together and deliberately, because the names ARE the
     pattern — the same counsel and the same agent turn up across issuers, and
     a listener cannot see that unless they are told who was involved.

     ⚠ THE READ ONLY CAPTURES THE BUYER AND THE AGENT. Counsel is not in its
     schema, so it cannot be said here. That is a gap in the READ AGENT to be
     fixed there, never guessed at here. */
  /* 4. the terms, deduplicated — the read sometimes repeats one */
  const seen = {};
  const terms = (f.the_terms || []).filter(t => {
    const k = String(t.name || "").toLowerCase().trim();
    if (!k || seen[k]) return false;
    seen[k] = 1; return true;
  }).slice(0, 5);

  for (const t of terms) {
    const what = String(t.what_it_does || "").split(/(?<=\.)\s/)[0];
    /* ⚠ DO NOT LOWERCASE THE NAME. "Series A Warrants" became "Series a
       warrants". Lowercase only the first letter, and only when the word is
       ordinary — a name that already carries capitals keeps them. */
    const nm2 = String(t.name || "").trim();
    const lower = /^[A-Z][a-z]+(\s+[a-z]+)*$/.test(nm2) ? nm2.toLowerCase() : nm2;

    /* ⚠ PRE-FUNDED WARRANTS ARE THE ONE TO SLOW DOWN FOR. They are stock
       already bought, sitting outside the ownership blocker until exercised,
       and they are the term a holder is least likely to understand. A beat on
       both sides, and he says plainly what it is. */
    /* ⚠ WHAT A TERM DOES IS A CLAUSE, NOT A SENTENCE. The read gives
       "limits the number of shares that can be exercised" — lower case, no
       full stop — so dropping it in after a stop produced "An ownership
       blocker. limits the number of shares". Capitalise it, close it, and
       make it a sentence of its own. */
    const does = what
      ? (function (t) {
          t = spoken(String(t).replace(/\s+/g, " ").trim());
          t = t.charAt(0).toUpperCase() + t.slice(1);
          if (!/[.!?]$/.test(t)) t += ".";
          return t;
        })(what)
      : "";

    if (/pre-?funded/i.test(nm2)) {
      say("Now this one matters... pre-funded warrants." +
          (does ? " " + does : "") +
          " That is stock already bought, held in another form.");
      continue;
    }

    say(up(article(lower)) + "." + (does ? " " + does : ""));
  }

  /* 5. THE SHARE COUNT — the line the whole product exists for */
  const sc = f.share_count || {};
  if (sc.before && sc.after_if_all_exercised) {
    const b = num(sc.before), aft = num(sc.after_if_all_exercised);
    say("Shares before... " + spell(b) + ". If every warrant is exercised... " +
        spell(aft) + "." +
        (b && aft && aft > b
          ? " That is an increase of " + spell(Math.round((aft - b) / b * 100)) +
            " per cent."
          : ""));
    if (sc.note) say("The company's own words on that... " + spoken(shorten(sc.note)) + ".");
  }

  /* 6. WHAT WAS NOT CHECKED — he always says this */
  const nr = (f.checks_not_run || []).slice(0, 4);
  if (nr.length)
    say("What was not checked. " + nr.map(x => up(String(x).trim())).join(". ") + ".");
  else
    say("Everything in this read was taken from the filing itself.");

  /* 7. the close */
  /* his sign-off, 9 Sep 2026 */
  say("The five questions are on the page.");

  /* ⚠ HIS NAME MUST NOT BE THE LAST THING SPOKEN. Deepgram clips the final
     syllables, so ending on "Stephen, for Warrant Wire" produced half a name.
     The sign-off comes second to last, and an ordinary closing line goes
     after it to take the clip. It reads naturally either way. */
  say("And that is the story. See you again shortly... The markets really do " +
      "not sleep. Stephen, for Warrant Wire.");
  say("Thank you for listening.");

  return F;
}

/* ---------- the small tools, all of them proven on Amalia ---------- */
function tidy(full) {
  /* ⚠ THE CIK MUST COME OFF THE NAME OR IT IS SPOKEN ALOUD. The split on two
     spaces missed "Laser Photonics Corp (CIK 1806952)", which the wire stores
     with one — and the voice then reads the CIK out as a number in the
     millions. This affects the READS as well as the row clips. */
  let n = String(full || "").split("  (")[0]
            .replace(/\s*\(\s*CIK\s*\d+\s*\)\s*$/i, "");
  for (let i = 0; i < 4; i++) {
    const before = n;
    n = n.replace(/,?\s+(Incorporated|Inc|Corporation|Corp|Company|Co|Ltd|Limited|Plc|LLC|Holdings|Holding|Group|Technologies|Technology|Solutions|Pharmaceuticals|Therapeutics|Biosciences|Sciences)\.?$/i, "")
         .replace(/,\s*$/, "").trim();
    if (n === before) break;
  }
  return n;
}
function up(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function strip2(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
/* ⚠ A QUOTE AND A HEADLINE COME STRAIGHT FROM THE FILING AND ARE FULL OF
   NUMERALS — "1,836,046 shares", "$5.02", "7%", "$0.001". Spoken, those are
   noise. Convert every figure in any text that reaches the voice. */
function spoken(text) {
  let t = String(text || "");
  /* ⚠ "five (5) years" is a legal habit — the same number twice, once in
     words and once in figures. Spoken it becomes "five (five) years". Drop
     the bracketed duplicate before anything else touches it. */
  t = t.replace(/\s*\((\d+)\)/g, "");
  t = t.replace(/\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)/g, (m, n) => money(n));
  t = t.replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s?%/g, (m, n) => spell(num(n)) + " per cent");
  t = t.replace(/\b([0-9][0-9,]{2,})\b/g, (m, n) => {
    const v = num(n);
    return (n.indexOf(",") < 0 && isYear(v)) ? spellYear(v) : spell(v);
  });
  t = t.replace(/\b([0-9]+\.[0-9]+)\b/g, (m, n) => spell(Number(n)));
  t = t.replace(/\b([0-9]{1,3})\b/g, (m, n) => spell(Number(n)));
  return t;
}

function shorten(s) {
  const w = String(s || "").replace(/\s+/g, " ").trim().split(" ");
  return w.length <= 15 ? w.join(" ") : w.slice(0, 15).join(" ");
}
function num(v) {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

/* a numeral is a numeral the voice has to guess at. Write them as words. */
const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function spell(n) {
  n = Number(n);
  if (!isFinite(n)) return String(n);
  if (n < 0) return "minus " + spell(-n);
  if (!Number.isInteger(n)) {
    const p = String(n).split(".");
    return spell(+p[0]) + " point " + p[1].split("").map(d => ONES[+d]).join(" ");
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

/* money read aloud: "$2,999,405" -> "two million nine hundred and ninety-nine
   thousand four hundred and five dollars" */
function money(v) {
  const s = String(v || "").trim();
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return s;

  /* ⚠ SUB-CENT AMOUNTS MUST SURVIVE. A pre-funded warrant exercises at
     $0.001 — a tenth of a cent — and that IS the point of the instrument:
     the buyer has already paid, so exercise costs almost nothing. Rounding
     it to "zero dollars" destroys the most important number in the clause. */
  if (n > 0 && n < 0.01) {
    const c = n * 100;                       /* in cents */
    const named = { 0.5:"half a cent", 0.25:"a quarter of a cent",
                    0.1:"a tenth of a cent", 0.01:"a hundredth of a cent" };
    const key = Object.keys(named).find(k => Math.abs(c - Number(k)) < 1e-9);
    if (key) return named[key];
    return spell(Number(c.toFixed(4))) + " of a cent";
  }

  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);

  /* under a dollar is cents, full stop. Nobody says "zero dollars and ten". */
  if (!whole) return cents
    ? spell(cents) + (cents === 1 ? " cent" : " cents")
    : "nothing";

  let out = spell(whole) + (whole === 1 ? " dollar" : " dollars");
  if (cents) out += " and " + spell(cents) + (cents === 1 ? " cent" : " cents");
  return out;
}

/* ⚠ A YEAR IS NOT A QUANTITY. "August 2026" is not "August two thousand
   twenty-six" — it is "August twenty twenty-six". */
function isYear(n) { return n >= 1900 && n <= 2100; }
function spellYear(n) {
  n = Number(n);
  if (n >= 2000 && n < 2010) return "two thousand" + (n % 10 ? " " + spell(n % 10) : "");
  return spell(Math.floor(n / 100)) + " " + (n % 100 === 0 ? "hundred" : spell(n % 100));
}

/* a ticker is letters, not a word — "T N O N W" */
function spellOut(t) { return String(t).toUpperCase().split("").join(" "); }

function spokenDate(iso) {
  try {
    const d = new Date(String(iso) + "T12:00:00Z");
    const M = ["January","February","March","April","May","June","July","August",
               "September","October","November","December"];
    return "the " + ordinal(d.getUTCDate()) + " of " + M[d.getUTCMonth()];
  } catch (e) { return String(iso || ""); }
}

/* "the eight of September" is wrong. A date is an ordinal. */
const ORD = { one:"first", two:"second", three:"third", five:"fifth",
              eight:"eighth", nine:"ninth", twelve:"twelfth" };
function ordinal(n) {
  const w = spell(n);
  const parts = w.split("-");
  const last = parts[parts.length - 1];
  let end = ORD[last];
  if (!end) end = last.replace(/y$/, "ie") + "th";
  parts[parts.length - 1] = end;
  return parts.join("-");
}

/* ⚠ A FORM CODE IS NOT A WORD. "424B3" comes out as noise; a person says
   "a four twenty-four B three". "10-K" is "a ten K". */
function spokenForm(form) {
  const f = String(form || "").toUpperCase().trim();
  if (!f) return "A filing";
  const named = {
    "8-K": "an eight K", "10-K": "a ten K", "10-Q": "a ten Q",
    "S-1": "an S one", "S-3": "an S three", "S-1/A": "an S one A",
    "424B3": "a four twenty-four B three", "424B5": "a four twenty-four B five",
    "DEF 14A": "a def fourteen A"
  };
  if (named[f]) return named[f];
  if (/^EX-/.test(f)) return "an exhibit, " + f.replace("EX-", "").split("").join(" ");
  return "a " + f.split("").join(" ");
}

/* articles by SOUND, not spelling — "an ATM programme" */
const NO_ARTICLE = /warrants$|shares$|rights$|s$/i;
const VOWEL_SOUND = /^(a|e|i|o|u|8|11|18|ATM|SEC|EX|IPO|LLC|NYSE|S-1|F-1)/i;
const CONSONANT_SOUND = /^(u[bcdefgklmnprstv]|eu|one|once)/i;
const FINISH = {
  "most favored nation": "most favoured nation clause",
  "most favoured nation": "most favoured nation clause",
  "registered direct": "registered direct offering",
  "atm programme": "ATM programme", "atm program": "ATM programme",
  "cashless exercise": "cashless exercise clause"
};
function article(label) {
  let w = String(label || "").trim();
  w = FINISH[w.toLowerCase()] || w;
  if (!w) return w;
  if (NO_ARTICLE.test(w)) return w;
  if (CONSONANT_SOUND.test(w)) return "a " + w;
  if (VOWEL_SOUND.test(w)) return "an " + w;
  return "a " + w;
}

/* ============================================================
   HOW HE SPEAKS
   ============================================================ */
const HIS_RULES = `You are writing what STEPHEN says out loud.

STEPHEN: Australian, former military, reads filings for 8K10Q. He works for
Amalia and she is a tough boss. HE DOES EXACTLY THE FACTS AND NOTHING ELSE.

Flat, clear, unhurried. Short sentences. No warmth, no salesmanship, no drama.
He states what the document says and stops. He never says what it means for
you, never says what will happen, never uses a word like shocking or brutal.
He never says "I think", "it seems" or "arguably". If a thing was not
established, he says it was not checked.

Return ONLY a JSON object, no markdown, no backticks:
{ "seconds": 0, "script": "the words he says, start to finish" }

⚠ YOU ARE GIVEN A NUMBERED LIST OF FACTS. THAT IS THE READ.
Say each one, in that order, in his voice.

- ADD NO FACT THAT IS NOT ON THE LIST. No figure, no company, no comparison of
  your own. If it is not in the list it is not in the document.
- THE NUMBERS ARE ALREADY WRITTEN AS WORDS. Do not convert them back to
  numerals and do not round them.
- SAY EACH FACT ONCE. Never restate one in different words.
- A quotation is announced and read slowly: "the document says, quote... "
- SHORT SENTENCES. A full stop is a breath. Never run a list on commas.
- NO BUY, SELL, HOLD, no price target, no saying anyone broke a law, no
  opinion. The opinions belong to the six named agents. Stephen has none.
- Length follows the list. Never pad.
`;

/* ============================================================
   THE SCRIPT — always run this first. It is free to fix.
   ============================================================ */
/* ============================================================
   WHO IS THIS COMPANY, AND IS THIS THE FIRST TIME?

   "Theriva Biologics, a small cap in biotech, issued warrants
   again" — three claims, and every one has to be computed rather
   than assumed:

     the sector   from cik_sic
     the size     from shares times last close, where we hold both
     AGAIN        counted: how many earlier warrant filings this
                  company already has on the wire

   ⚠ ANYTHING THAT CANNOT BE COMPUTED IS NOT SAID. No sector, no
   sector line. No market value, no "small cap". Silence costs
   nothing; a wrong size on a named company costs everything.
   ============================================================ */
async function whoIs(env, rd) {
  const out = {};
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT sector, sic_desc FROM cik_sic WHERE cik = ? LIMIT 1`)
      .bind(rd.cik).first();
    if (r && r.sector && !/unknown|unclassified/i.test(r.sector)) out.sector = r.sector;
    else if (r && r.sic_desc) out.sector = r.sic_desc;
  } catch (e) {}

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT shares, last_close FROM v_overhang WHERE ticker = ? LIMIT 1`)
      .bind(rd.ticker).first();
    if (r && r.shares && r.last_close) {
      const mcap = Number(r.shares) * Number(r.last_close);
      if (isFinite(mcap) && mcap > 0) {
        out.mcap = mcap;
        out.band = mcap < 50e6   ? "a nano cap"
                 : mcap < 300e6  ? "a micro cap"
                 : mcap < 2e9    ? "a small cap"
                 : mcap < 10e9   ? "a mid cap" : "a large cap";
      }
    }
  } catch (e) {}

  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(DISTINCT accession) n FROM wire_hits
        WHERE ticker = ? AND accession <> ? AND filed_on < ?`)
      .bind(rd.ticker, rd.accession, rd.filed).first();
    out.earlier = (r && r.n) || 0;
  } catch (e) {}

  return out;
}

async function script(env, accession) {
  if (!accession) throw new Error("an accession number, please");

  const rd = await env.OVERHANG.prepare(
    "SELECT * FROM reads WHERE accession = ?").bind(accession).first();
  if (!rd) return { ok:false, build: BUILD,
    error:"that filing has not been read yet — buy the read first" };

  const who = await whoIs(env, rd);
  const F = factsFrom(rd, who);

  /* ============================================================
     ⚠ THE MODEL WAS REMOVED FROM HIS SCRIPT at 3a, as Amalia's had been.

     The facts are finished English sentences built in code. Sending
     them to a model to "say in his voice" only let it drift: it broke
     the announce into fragments — "Tenon Medical. Ticker T N O N W.
     Instruments and medical devices." — and invented a line, "The
     document says, quote", that was in no fact at all.

     There is nothing for a model to add. The script IS the facts, in
     order, with the pacing pass on top. Deterministic, free, instant.
     ============================================================ */
  const j = { script: F.join(" ") };
  j.seconds = Math.round(j.script.split(/\s+/).filter(Boolean).length / 150 * 60);
  const salvaged = false;

  /* pacing applied here, once, so what is stored is what is spoken */
  j.script = breathe(j.script);

  const words = String(j.script || "").split(/\s+/).filter(Boolean).length;
  const seconds = j.seconds || Math.round(words / 150 * 60);

  await env.OVERHANG.prepare(
    `INSERT INTO audio (accession, ticker, company, script, facts, words, seconds, state)
     VALUES (?,?,?,?,?,?,?, 'script')
     ON CONFLICT(accession) DO UPDATE SET
       script=excluded.script, facts=excluded.facts, words=excluded.words,
       seconds=excluded.seconds, made=datetime('now')`
  ).bind(accession, rd.ticker || null, rd.company || null,
         j.script, JSON.stringify(F), words, seconds).run();

  return { ok:true, build: BUILD, accession, salvaged,
    ticker: rd.ticker, company: rd.company,
    words, seconds, minutes: +(seconds/60).toFixed(1),
    facts_given: F, script: j.script,
    note: "Read it before recording it. The script is free to fix; the voice is not." };
}

/* ============================================================
   THE VOICE — speech, then R2. NEVER Stream.
   ============================================================ */
async function say(env, accession) {
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM audio WHERE accession = ?").bind(accession).first();
  if (!row || !row.script)
    return { ok:false, build: BUILD, error:"no script yet — run ?action=script first" };

  let bytes, pieces = 1;
  try {
    const made = await speakAll(env, row.script);
    bytes = made.bytes; pieces = made.pieces;
  } catch (e) {
    return { ok:false, build: BUILD, error:"the speech model refused: " + String(e),
      note:"TTS at the top is the dial. Run ?action=audition to find one that works." };
  }

  if (!env.AUDIO)
    return { ok:false, build: BUILD, error:"no AUDIO binding — add an R2 bucket named AUDIO" };

  const key = "read/" + accession + ".mp3";
  try {
    await env.AUDIO.put(key, bytes, {
      httpMetadata: { contentType: "audio/mpeg",
                      /* ⚠ NEVER immutable. A re-recording must be heard. */
                      cacheControl: "no-cache" },
      customMetadata: { accession, ticker: row.ticker || "" }
    });
  } catch (e) { return { ok:false, build: BUILD, error:"R2 refused the file: " + String(e) }; }

  await env.OVERHANG.prepare(
    "UPDATE audio SET key=?, state='ready' WHERE accession=?").bind(key, accession).run();

  return { ok:true, build: BUILD, accession, key, pieces,
    bytes: bytes.byteLength,
    seconds_of_audio_roughly: Math.round(bytes.byteLength / 4000),
    minutes: +(row.seconds/60).toFixed(1),
    playback: "/?audio=" + accession,
    embed: '<audio controls preload="none" style="width:100%" ' +
           'src="https://stephen.realroofers.workers.dev/?audio=' + accession + '"></audio>' };
}

/* ============================================================
   SERVING — straight out of R2, range requests honoured
   ============================================================ */
async function serveAudio(env, q, req) {
  const accession = q.get("audio");
  if (!env.AUDIO) return new Response("no audio store", { status: 500 });
  const key = "read/" + accession + ".mp3";
  /* ⚠ NO RANGE REQUESTS. A browser asking for a byte range, against a key
     whose file has been REPLACED, can be handed a range from the old length
     and the audio stops dead mid-sentence. These files are one to two
     megabytes; there is nothing to gain by serving them in pieces and a
     truncated read to lose. Serve the whole thing, every time. */
  const obj = await env.AUDIO.get(key);
  if (!obj) return new Response("not recorded yet", { status: 404 });

  /* ⚠ &dl=1 FORCES A DOWNLOAD instead of streaming in the tab.

     A file that plays for one second in a browser but is four hundred
     kilobytes on disk is not a bad recording — it is the browser or its
     cache. Downloading it and playing it locally tells the two apart in
     one try, instead of another round of guessing. */
  const h = new Headers();
  h.set("content-type", "audio/mpeg");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "no-store");
  h.set("access-control-allow-origin", "*");
  if (q.get("dl"))
    h.set("content-disposition",
          'attachment; filename="stephen-' + accession + '.mp3"');
  return new Response(obj.body, { headers: h });
}

/* what is actually in the bucket, without playing anything */
async function fileInfo(env, accession) {
  if (!env.AUDIO) return { ok:false, build: BUILD, error:"no AUDIO binding" };
  const key = "read/" + accession + ".mp3";
  const obj = await env.AUDIO.head(key);
  if (!obj) return { ok:false, build: BUILD, error:"nothing stored at " + key };
  return { ok:true, build: BUILD, key,
    bytes: obj.size,
    minutes_roughly: +(obj.size / 4000 / 60).toFixed(2),
    uploaded: obj.uploaded,
    content_type: (obj.httpMetadata || {}).contentType,
    cache_control: (obj.httpMetadata || {}).cacheControl,
    note: "If bytes look right but it plays for a second, the file is fine " +
          "and the browser is not. Try ?dl=1 and play it from disk." };
}

async function serveAudition(env, q, req) {
  const n = String(q.get("audition") || "").replace(/\D/g, "");
  if (!n || !env.AUDIO) return new Response("not found", { status: 404 });
  const obj = await env.AUDIO.get("audition/" + n + ".mp3");
  if (!obj) return new Response("not rendered yet — run ?action=audition first",
                                { status: 404 });
  const h = new Headers();
  h.set("content-type", "audio/mpeg");
  h.set("cache-control", "no-store");
  h.set("access-control-allow-origin", "*");
  return new Response(obj.body, { headers: h });
}

/* the audio is the read in another form, so it is gated the same way */
async function listen(env, q) {
  const accession = q.get("accession");
  const email = (q.get("email") || "").trim().toLowerCase();
  const row = await env.OVERHANG.prepare(
    "SELECT accession, ticker, seconds, key, state FROM audio WHERE accession=?")
    .bind(accession).first();
  if (!row || row.state !== "ready")
    return { ok:false, build: BUILD, error:"no audio for that filing yet" };

  if (env.PAY && email) {
    try {
      const r = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
      const j = await r.json();
      const has = (j && j.has) || {};
      if (!(has.read || has.read_year))
        return { ok:false, build: BUILD, paid:false, price_cents: 2000 };
    } catch (e) {
      return { ok:false, build: BUILD, error:"could not reach the payment desk" };
    }
  }

  return { ok:true, build: BUILD, accession: row.accession, ticker: row.ticker,
    minutes: +(row.seconds/60).toFixed(1), playback: "/?audio=" + row.accession };
}

async function list(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT accession, ticker, company, words, seconds, state, made
       FROM audio ORDER BY made DESC LIMIT 100`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

/* ============================================================
   SALVAGE — rescue a reply cut off mid-object.
   Prefers COMPLETE data over data force-closed mid-word.
   ============================================================ */
function salvage(txt) {
  let s = String(txt || "").trim();
  const i = s.indexOf("{");
  if (i < 0) return null;
  s = s.slice(i);

  let lastGood = -1, inStr = false, esc = false;
  const stack = [];
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
    else if (c === "," && stack.length) lastGood = k;
  }
  const close = str => {
    const st = []; let q = false, e2 = false;
    for (const c of str) {
      if (q) { if (e2) e2 = false; else if (c === "\\") e2 = true; else if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === "{" || c === "[") st.push(c);
      else if (c === "}" || c === "]") st.pop();
    }
    let tail = q ? '"' : "";
    for (let k = st.length - 1; k >= 0; k--) tail += (st[k] === "{" ? "}" : "]");
    return str + tail;
  };
  const tries = [];
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace > 0) tries.push(s.slice(0, lastBrace + 1));
  if (lastGood > 0) tries.push(close(s.slice(0, lastGood)));
  tries.push(close(s));
  for (const t of tries) {
    try { const o = JSON.parse(t); if (o && typeof o === "object") return o; }
    catch (e) {}
  }
  return null;
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
const TAIL = " ... This report ends here.";

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
  const r = await env.AI.run(TTS.model, speechBody(TTS.shape, text, TTS.voice));
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

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}
function breathe(text) {
  let t = String(text || "");

  /* ⚠ A COMPANY NAME IS THE THING A LISTENER IS WAITING FOR. Give it a beat
     before it so the voice lifts into it, and one after so it lands. Aura
     holds an ellipsis longer than a full stop, which is the whole trick. */
  const NOT_A_NAME = /^(It|The|This|That|A|An|And|But|He|She|They|We|There|Today|Every|What|Shares|Stephen|Amalia|First|Warrant|Pre|Series)$/;
  t = t.replace(/\. ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?) (filed|carried|bought) /g,
                (m, name, verb) =>
                  NOT_A_NAME.test(name.split(" ")[0]) ? m
                    : ". ... " + name + "... " + verb + " ");

  /* ⚠ A BEAT BEFORE A BIG NUMBER. The voice lifts into what follows a pause,
     and the numbers are the whole point of a read. Applies to the spelled-out
     figures, which are the only ones that reach the voice. */
  t = t.replace(/\b(raised|is|of|to|were|was|at)\s+((?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)[a-z\- ]*?(?:million|thousand|hundred|cent|cents|dollar|dollars|per cent))/gi,
                (m, v, n) => v + "... " + n);
  t = t.replace(/\. ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?), (new |twice|once|three)/g,
                ". ... $1... $2");

  /* an em-dash mid-sentence is a place to stop — and what follows a full
     stop starts with a capital, or it reads as a stumble */
  t = t.replace(/\s+—\s+([a-z])/g, (m, c) => ". " + c.toUpperCase());
  t = t.replace(/\s+—\s+/g, ". ");

  /* ⚠ HE SPEAKS IN COMPLETE SENTENCES. This rule used to chop "a, b, and c."
     into three fragments to slow him down, and it bought pauses at the cost
     of grammar. An ellipsis gives the same pause INSIDE a sentence.

     ⚠ AND IT ONLY FIRES ON A REAL LIST. It was matching any sentence with two
     commas in it and inserting "and" before whatever followed the second one —
     so "First, the words, because most people have never seen them" came out
     as "First... the words... AND because most people have never seen them",
     and "the fees, the expenses, straight out of the filings" gained an "and"
     it never had. A clause that opens with because, which, so, since, while,
     unless, before, after or though is NOT the third item in a list. */
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
  t = t.replace(/Thank you\.{2,3}\s*and see you after the bell/gi, "\u0002");
  t = t.replace(/Thank you\.{2,3}\s*and see you at half twelve/gi, "\u0003");
  t = t.replace(/And that's that\.{2,3}\s*See you back after the bell/gi, "\u0002");
  t = t.replace(/And that's that\.{2,3}\s*See you at half twelve/gi, "\u0003");

  t = t.replace(/\bBack after the bell\b/gi, "\u0002");
  t = t.replace(/\bBack at half twelve\b/gi, "\u0003");

  t = t.replace(/\u0002/g, "Thank you... and see you after the bell");
  t = t.replace(/\u0003/g, "Thank you... and see you at half twelve");

  /* collapse one that arrived already doubled, however many times */
  let guard = 0;
  while (/Thank you\.{2,3}\s*and see you\s+Thank you\.{2,3}\s*and see you/i.test(t)
         && guard++ < 8)
    t = t.replace(/(Thank you\.{2,3}\s*and see you)\s+Thank you\.{2,3}\s*and see you/i, "$1");

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
  /* ⚠ NOT AFTER AN ABBREVIATION. "Tenon Medical, Inc. is selling" became
     "Inc. Is selling" because the full stop in Inc. looked like an ending. */
  const ABBR = /(?:Inc|Ltd|Corp|Co|Plc|LLC|LP|No|Mr|Mrs|Ms|Dr|St|vs|etc|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/;
  t = t.replace(/([^\s]*[.!?])\s+([a-z])/g, (m, head, c) =>
        ABBR.test(head) ? m : head + " " + c.toUpperCase());
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
    [/\bI have\b/g, "I've"], [/\bwill not\b/g, "won't"]
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




/* ============================================================
   AUDITION — hear the voices, do not read about them

   ⚠ NO AUSTRALIAN VOICE IS CONFIRMED ON WORKERS AI. Deepgram's
   male voices are American, plus angus who is Irish. Render them
   all and pick by ear.
   ============================================================ */
const AUDITION = [
  { model: "@cf/deepgram/aura-1", speaker: "orion",   shape: "aura", note: "American male, steady" },
  { model: "@cf/deepgram/aura-1", speaker: "arcas",   shape: "aura", note: "American male, lower" },
  { model: "@cf/deepgram/aura-1", speaker: "perseus", shape: "aura", note: "American male" },
  { model: "@cf/deepgram/aura-1", speaker: "angus",   shape: "aura", note: "IRISH male — the only non-American" },
  { model: "@cf/deepgram/aura-1", speaker: "helios",  shape: "aura", note: "American male, brighter" },
  { model: "@cf/deepgram/aura-1", speaker: "zeus",    shape: "aura", note: "American male, deepest" },
  { model: "@cf/deepgram/aura-2-en", speaker: "orion", shape: "aura", note: "the more expressive model" },
  { model: "@cf/myshell-ai/melotts", speaker: "EN-BR", shape: "melo", note: "British English" }
];

const AUDITION_LINE =
  "This is Stephen, for 8K10Q. Tenon Medical, ticker T N O N W. " +
  "A four twenty-four B three, filed the eighth of September. " +
  "The company raised two million nine hundred and ninety-nine thousand, " +
  "four hundred and five dollars. Shares before... one million thirty-two " +
  "thousand five hundred and seventy-eight. If every warrant is exercised... " +
  "two million seven hundred and sixty-eight thousand nine hundred and " +
  "seventy-five. What was not checked. No precedent was supplied. " +
  "That is the document. Stephen, for 8K10Q.";

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
      await env.AUDIO.put("audition/" + (i + 1) + ".mp3", bytes, {
        httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-store" } });
      row.bytes = bytes.byteLength;
      row.listen = "/?audition=" + (i + 1);
    } catch (e) { row.error = String(e).slice(0, 200); }
    out.push(row);
  }
  return { ok:true, build: BUILD, voices: out,
    note: "Open each ?audition=N and listen. Tell Claude the number." };
}


/* ============================================================================
   THE ROW CLIP  —  twenty seconds, free, on the wire's free rows
   Added 10 Sep 2026. Everything below is additive; nothing above it changed.
   ============================================================================ */

/* ⚠ THE SAME WORDS THE ROW PRINTS. Taken from PLAIN_TAG on the index rather
   than written again — a listener hearing different words from the ones on the
   screen in front of him thinks he is looking at a different filing. If the
   index map changes, change this one with it. */
const PLAIN_TAG = {
  "variable rate transaction": "the price moves with the market",
  "ownership blocker":         "the buyer's stake is capped",
  "pre-funded warrants":       "stock already paid for",
  "pre-funded warrant":        "stock already paid for",
  "price reset":               "the price can be lowered",
  "reduced exercise price":    "the price was cut",
  "warrant inducement":        "paid to convert early",
  "inducement agreement":      "paid to convert early",
  "cashless exercise":         "converts without cash",
  "equity line":               "shares sold off over time",
  "floor price":               "a floor on the price",
  "most favored nation":       "gets any better terms later",
  "most favoured nation":      "gets any better terms later",
  "participation right":       "can join the next raise",
  "registered direct":         "sold to chosen buyers",
  "atm programme":             "sold into the open market",
  "atm program":               "sold into the open market"
};
function plainTag(l) {
  const k = String(l || "").toLowerCase().trim();
  return PLAIN_TAG[k] || k;
}

/* ⚠ THE SAME FIVE ROWS THE PAGE SHOWS, newest first. If this and the page ever
   disagree, the speaker appears on a row whose clip is about a different
   company — worse than no speaker at all. */
async function wireRows(env, n) {
  n = Math.max(1, Math.min(20, n || 5));
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT accession, ticker, company, labels, filed_on
         FROM v_wire_filings ORDER BY filed_on DESC, accession DESC LIMIT ?`)
      .bind(n).all();
    return r.results || [];
  } catch (e) {
    return [{ failed: "v_wire_filings", why: String(e).slice(0, 180) }];
  }
}

async function rowPeek(env, n) {
  return { ok:true, build: BUILD, rows: await wireRows(env, n),
    note:"These are the rows a clip is built for. No marks on a row means no " +
         "clip, because there would be nothing to say." };
}

/* ⚠ THE SECTOR IS SAID ONLY IF IT WAS COMPUTED. Same rule as his reads:
   silence costs nothing, a wrong industry on a named company costs everything. */
async function rowSector(env, accession) {
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT c.sector, c.sic_desc FROM cik_sic c
         JOIN wire_hits h ON h.cik = c.cik
        WHERE h.accession = ? LIMIT 1`).bind(accession).first();
    if (r && r.sector && !/unknown|unclassified/i.test(r.sector)) return r.sector;
    if (r && r.sic_desc) return r.sic_desc;
  } catch (e) {}
  return "";
}

/* ============================================================
   WHAT HE SAYS ON A ROW — built in code, no model.

   Four sentences from fields that are already correct. There is
   nothing here for a model to add and one thing it could do:
   get a name wrong.
   ============================================================ */
function rowFacts(row, sector) {
  const company = tidy(row.company);
  const ticker  = row.ticker ? String(row.ticker).toUpperCase() : "";

  /* ⚠ FOLD DUPLICATES AFTER TRANSLATION, NOT BEFORE. Warrant inducement and
     inducement agreement are two phrases with one plain meaning, and saying
     "paid to convert early, and paid to convert early" is how a listener
     stops believing the count. */
  const all = String(row.labels || "").split(" | ")
    .map(x => String(x || "").trim()).filter(Boolean)
    .map(plainTag)
    .filter((x, i, a) => a.indexOf(x) === i);
  /* ⚠ THE COUNT IS THE TOTAL, THE NAMING IS A SAMPLE, AND THEY MUST NOT BE
     CONFLATED. Lexaria carries five marks; the first version named three and
     called that the count. The row on screen showed five. A spoken count that
     disagrees with the printed one is the single thing on this site that
     cannot be wrong — everything else is a judgement, a count is arithmetic. */
  const marks = all.slice(0, 3);

  const F = [];
  F.push("Hello. This is Stephen, for Warrant Wire.");

  let who = company || ticker || "This company";
  if (ticker && company) who += ", ticker " + spellOut(ticker);
  F.push(who + (sector ? "... " + sector.toLowerCase() + "." : "."));

  if (all.length === 1)
    F.push("This filing carries one of the terms we watch for... " + marks[0] + ".");
  else if (all.length > 1) {
    const named = marks.slice(0, -1).join("... ") + "... and " + marks[marks.length - 1];
    F.push("This filing carries " + spell(all.length) + " of the terms we watch for... " +
           /* ⚠ SAY "AMONG THEM" WHEN NOT ALL OF THEM ARE NAMED, so the count
              and the list cannot be mistaken for each other. */
           (all.length > marks.length ? "among them... " + named : named) + ".");
  }

  /* ⚠ ONE TERM IS SINGULAR. Three of the first five rows said "one of the
     terms" and then "what THOSE do" — wrong in the same breath as the count. */
  const those = all.length === 1 ? "What that does" : "What those do";

  /* ⚠ ONE SELLING LINE, AT THE END, AND IT NAMES WHERE THE ANSWER IS RATHER
     THAN WHAT IT IS. That is what keeps the clip free and the read paid. */
  F.push(those + " to somebody holding the stock is in the read... " +
         "twenty dollars, on this page.");

  return F;
}

async function rowScript(env, accession) {
  if (!accession) throw new Error("an accession number, please");
  const all = await wireRows(env, 20);
  if (all.length && all[0].failed)
    return { ok:false, build: BUILD, error:"could not read the wire", detail: all[0] };
  const row = all.find(x => x.accession === accession);
  if (!row) return { ok:false, build: BUILD,
    error:"that filing is not in the current free rows" };
  if (!String(row.labels || "").trim())
    return { ok:false, build: BUILD, error:"no marks on that row — nothing to say" };

  const F = rowFacts(row, await rowSector(env, accession));
  /* ⚠ THE SAME PACING PASS AS HIS READS. This is the line that keeps one man
     on the site instead of two who happen to share a name. */
  const script = breathe(F.join(" "));
  const words = script.split(/\s+/).filter(Boolean).length;
  return { ok:true, build: BUILD, accession, ticker: row.ticker,
    facts_given: F, script, words,
    seconds_roughly: Math.round(words / 150 * 60),
    note:"Read it before recording it. The script is free to fix; the voice is not." };
}

async function rowClips(env, n, force) {
  const all = await wireRows(env, n);
  if (all.length && all[0].failed)
    return { ok:false, build: BUILD, error:"could not read the wire", detail: all[0] };
  if (!env.AUDIO) return { ok:false, build: BUILD,
    error:"no AUDIO binding — bind the R2 bucket stephen-audio as AUDIO" };

  const out = [];
  for (const row of all) {
    const r = { accession: row.accession, ticker: row.ticker };

    if (!String(row.labels || "").trim()) {
      r.skipped = "no marks on this row"; out.push(r); continue;
    }
    if (!force) {
      const had = await env.OVERHANG.prepare(
        "SELECT accession FROM row_clips WHERE accession = ?").bind(row.accession).first();
      if (had) { r.already = true; out.push(r); continue; }
    }

    const F = rowFacts(row, await rowSector(env, row.accession));
    const script = breathe(F.join(" "));
    r.script = script;

    let bytes;
    try {
      /* ⚠ speakAll, NOT a separate call — it carries the sacrificial tail that
         stops Deepgram clipping the last syllables of his name. */
      const made = await speakAll(env, script);
      bytes = made.bytes;
    } catch (e) {
      r.error = "the voice refused: " + String(e).slice(0, 160); out.push(r); continue;
    }

    /* ⚠ A DIFFERENT PREFIX FROM HIS READS. read/ is the paid product; row/ is
       the free sample. One must never overwrite the other. */
    const key = "row/" + row.accession + ".mp3";
    await env.AUDIO.put(key, bytes, {
      httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-cache" },
      customMetadata: { accession: row.accession, ticker: row.ticker || "" } });

    const words = script.split(/\s+/).filter(Boolean).length;
    await env.OVERHANG.prepare(
      `INSERT INTO row_clips (accession, ticker, company, script, seconds, bytes)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(accession) DO UPDATE SET script=excluded.script,
         seconds=excluded.seconds, bytes=excluded.bytes, made=datetime('now')`)
      .bind(row.accession, row.ticker || null, row.company || null,
            script, Math.round(words / 150 * 60), bytes.byteLength).run();

    r.bytes = bytes.byteLength;
    r.seconds = Math.round(words / 150 * 60);
    out.push(r);
  }
  return { ok:true, build: BUILD, built: out };
}

/* ============================================================
   THE PAGE ASKS THIS BEFORE DRAWING ANY SPEAKER — AND ASKING
   IS WHAT KEEPS THE CLIPS CURRENT.

   ⚠ NO CRON AND NO EDIT TO THE WIRE WORKER. The five free rows
   change whenever a scan lands, which is eight times through the
   day, so a clock is either early or late. This runs off the
   thing that actually matters: somebody looking at the page.
   The first visitor after a scan has the missing clips built for
   everybody behind him, and he does not wait for it.

   THREE THINGS STOP IT RUNNING AWAY:

     1. IT ANSWERS FIRST. The build goes to waitUntil, so the
        reply is already on its way before any speech is made.
     2. IT ONLY BUILDS WHAT IS MISSING. Five rows with five clips
        costs one query and stops.
     3. A COOLING-OFF PERIOD. Ten visitors landing at once would
        otherwise each start the same build. One attempt every
        ten minutes, and the rest see it is already in hand.
   ============================================================ */
/* ⚠ TEN MINUTES, AND IT LIVES IN THE SQL BELOW, not here — the claim has to
   be one statement, so the interval has to be inside it. This constant is
   kept only so the number is findable by reading the top of the section. */
const HEAL_EVERY = "10 minutes";

async function rowsReady(env, ctx) {
  const r = await env.OVERHANG.prepare(
    "SELECT accession, ticker, seconds FROM row_clips ORDER BY made DESC LIMIT 60").all();
  const clips = r.results || [];

  let healing = false;
  try { healing = await maybeHeal(env, ctx, clips); } catch (e) {}

  return { ok:true, build: BUILD, clips,
    building: healing || undefined,
    note:"Draw the speaker only on a row whose accession is in this list." +
         (healing ? " A row on the wire has no clip yet; one is being made now." : "") };
}

async function maybeHeal(env, ctx, clips) {
  if (!ctx || !ctx.waitUntil || !env.AUDIO || !env.AI) return false;

  const now = await wireRows(env, 5);
  if (!now.length || now[0].failed) return false;

  const have = {};
  for (const c of clips) have[c.accession] = 1;
  const missing = now.filter(x => String(x.labels || "").trim() && !have[x.accession]);
  if (!missing.length) return false;

  /* ⚠ CLAIMING THE JOB MUST BE ONE STATEMENT, NOT A READ THEN A WRITE.

     The first version read the timestamp, decided it was stale, and then
     wrote a new one. Ten visitors arriving together all read the old value
     before any of them wrote — so all ten started the same five recordings.
     Tested with ten at once and it did exactly that: ten builds, ten sets of
     paid speech calls, every one overwriting the last.

     So the claim is a conditional UPDATE. The database decides who wins, and
     the loser is told by `changes` coming back zero. Whoever changed the row
     does the work; everybody else answers and moves on. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS row_clip_heal (id INTEGER PRIMARY KEY, at TEXT)`).run();
  await env.OVERHANG.prepare(
    `INSERT OR IGNORE INTO row_clip_heal (id, at) VALUES (1, datetime('now','-1 day'))`).run();

  const claim = await env.OVERHANG.prepare(
    `UPDATE row_clip_heal SET at = datetime('now')
      WHERE id = 1 AND (at IS NULL OR at <= datetime('now','-10 minutes'))`).run();

  /* D1 reports it as meta.changes; the plain driver as changes. Take either. */
  const won = Number(
    (claim && claim.meta && claim.meta.changes) !== undefined
      ? claim.meta.changes
      : (claim && claim.changes) || 0);

  if (!won) return true;   /* somebody else has it — say so, start nothing */

  ctx.waitUntil(rowClips(env, 5).catch(() => {}));
  return true;
}

async function serveRow(env, q) {
  const accession = q.get("row");
  if (!env.AUDIO) return new Response("no audio store", { status: 500 });
  const obj = await env.AUDIO.get("row/" + accession + ".mp3");
  if (!obj) return new Response("no clip for that filing", { status: 404 });
  const h = new Headers();
  h.set("content-type", "audio/mpeg");
  h.set("content-length", String(obj.size));
  /* ⚠ THESE MAY BE CACHED. His paid reads are no-store because a re-recording
     must be heard; a row clip is only remade if forced. */
  h.set("cache-control", "public, max-age=3600");
  h.set("access-control-allow-origin", "*");
  if (q.get("dl"))
    h.set("content-disposition", 'attachment; filename="wire-' + accession + '.mp3"');
  return new Response(obj.body, { headers: h });
}