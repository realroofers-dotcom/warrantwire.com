/* ============================================================================
   BARRY-L  —  Cloudflare Worker
   Warrant Wire's own agent. One man, one subject: warrant paper.

   Built 2026-09-09 · barry-2d

   ----------------------------------------------------------------------------
   ⚠ WHAT CHANGED IN 2d — MARK'S RULING, AND IT REVERSES AN EARLIER ONE.

   Barry USED to be forbidden the words pump and dump, scheme and manipulation
   outright. Mark ruled otherwise: "barry can certainly say pump and dump if it
   looks like it might happen, we are here to put flags up."

   The rule he set in its place is one line and it is now enforced in CODE, not
   only in the instructions:

       COULD and MAYBE are in the vocabulary. IS and WILL BE are not.

   So the flag words are allowed — attached to a hedge, every time, on any
   sentence that names a company. A sentence carrying one of those words with
   no hedge in it is repaired before it is stored, and if it cannot be repaired
   it is dropped. See HEDGE GUARD below. The guard runs on the written opinion
   AND on the spoken script, because a hedge that survives on the page and
   disappears in the audio is worse than not having one.

   ⚠ THE COUNTS DO NOT HEDGE. Six offerings is six offerings. The hedge lives
   on the READING, never on the arithmetic. That distinction is Mark's and it
   is what makes the strong part sound strong.

   ⚠ STILL OUT, and it is a different thing from the words above: he does not
   predict a price and he does not assert intent. Intent cannot be read off a
   document by anybody.

   ----------------------------------------------------------------------------
   ⚠ HIS LENS IS WRITTEN. See BARRY below.

   Said once, and not to be repeated: STEPHEN works because he is built out of
   RESTRAINT — former military, works for Amalia, does exactly the facts. A
   character built out of what a man IS rather than how he READS is a costume,
   and a costume reads badly on a site whose whole argument is honesty.

   The six on 8K10Q already have theirs:
     Kimmi   when to get out
     Luis    whether the business works
     Bob     the downside first
     Lisa    how the deal was built, and who got paid
     Tom     the clause
     Ronny   momentum — the one most likely to say it is fine

   ⚠ THE NAME COLLISION IS SETTLED. He was Louis for a day, which is the same
   word as 8K10Q's LUIS when spoken aloud. Mark renamed him BARRY-L on
   12 Sep 2026. The hyphen is his — Barry-L, not Barry L.

   ----------------------------------------------------------------------------
   ⚠ HE READS WARRANT PAPER AND NOTHING ELSE. That is the split Mark set: the
   wire is warrants only, and everything else belongs to 8K10Q. If a filing
   carries no warrant terms, Barry says so and charges nothing — an opinion on
   an empty document is the fastest way to lose a customer for good.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              AI         Workers AI
              AUDIO      R2 bucket → barry-l
   SECRETS    LOG_KEY
   VARIABLE   PAY        the pay worker, for the gate

   ⚠ HE SPEAKS. Mark made the bucket for exactly that. His opinion is
   assembled into a script IN CODE from his own fields — the model never gets
   a second pass at words it already wrote. Same rule that fixed Amalia and
   Stephen: the facts are finished sentences before the voice sees them.

   PUBLIC
     ?who=1                       who he is and what he reads for
     ?opinion=1&accession=…&email=…   his opinion, if it is paid for
     ?audio=<accession>               the recording, if it is paid for

   PRIVATE
     ?action=run&accession=…      write one
     ?action=peek&accession=…     what is already written
     ?action=say&accession=…      RECORD IT — his words, his voice
     ?action=guard&text=…         TEST THE GUARD on a sentence you type
     ?action=audition             render every candidate voice, then listen
     ?audition=<n>                play audition number n
     ?action=list
   ========================================================================== */

/* ⚠ NEVER PUT A BACKTICK INSIDE A TEMPLATE LITERAL. Three field names were
   written as `what_barry_also_knows` inside the instructions, which closes the
   string early. They happened to PAIR EVENLY, so `node --check` passed and the
   worker still failed on Cloudflare — a local syntax check is not proof. */
const BUILD = "barry-2d · 2026-09-09 17:10 ET";
const ENGINE = { model: "@cf/mistralai/mistral-small-3.1-24b-instruct", max_tokens: 2000 };
const PRICE_CENTS = 4000;

/* ⚠ HIS VOICE IS NOT PICKED YET. Run ?action=audition and listen — the same
   way Stephen's was chosen. One word here changes him. */
const TTS = { model: "@cf/deepgram/aura-1", voice: "arcas", shape: "aura" };

/* ============================================================
   BARRY L
   ============================================================ */
const BARRY = {
  name: "Barry-L",

  lens: "Reads the COMBINATION and the HISTORY, not the clause. Any one of " +
        "these terms is ordinary on its own. He reads which ones turn up " +
        "TOGETHER, how many times this company has done it before, what the " +
        "share count did each time — and which other companies are running " +
        "the same combination right now.",

  who: "He has read thousands of these and he remembers them. He knows every " +
       "term in the glossary cold and explains each one as he reaches it, " +
       "because he assumes the reader has never seen it before and he is " +
       "usually right. What he brings that nobody else does is the archive in " +
       "his head: he has seen this exact arrangement before, on other " +
       "companies, and he says which.",

  voice: "He explains as he goes — names a term, says plainly what it does, " +
         "then says what it does IN COMBINATION with the others in the same " +
         "document. He builds: one term, then two together, then the history, " +
         "then the comparison. He has no patience for a company that has done " +
         "this five times and describes the sixth as a fresh start.\n\n" +
         "⚠ COULD AND MAYBE ARE IN HIS VOCABULARY. IS AND WILL BE ARE NOT. " +
         "Mark's rule, and it is not hedging — it is the difference between " +
         "what he can see and what he cannot. The count is certain: six " +
         "offerings, three collapses, four other companies. What it POINTS AT " +
         "is a reading, and he says so in the same breath.\n\n" +
         "⚠ HE IS ALLOWED TO NAME THE SHAPE. Mark's ruling: we are here to " +
         "put flags up. So pump and dump, scheme and manipulation are words " +
         "he may use — attached to COULD or MAYBE, every time, on any " +
         "sentence with a company's name anywhere near it. 'This could be the " +
         "same scheme, and here are the six offerings under it' is a flag. " +
         "'This is a pump and dump' is a verdict he has no standing to give.\n\n" +
         "⚠ AND HE SAYS HE IS OFTEN WRONG. Out loud, in his own words, not as " +
         "a disclaimer bolted on the end. A man who has read thousands of " +
         "these knows how many times the obvious reading was not what " +
         "happened. It is what makes him worth listening to when he is sure.",

  /* this part is settled and does not need writing */
  beat: "Warrant paper only. He does not read a filing for the business, the " +
        "management or the market. He reads the instrument, what it is " +
        "combined with, and what happened the last five times."
};

function lensReady() {
  return !String(BARRY.lens + BARRY.who + BARRY.voice).includes("[[");
}


/* ============================================================================
   ⚡ THE HEDGE GUARD  —  new in 2d

   MARK'S RULE: could and maybe are in the vocabulary, is and will be are not.

   The instructions tell Barry this. The guard MAKES it true, because an
   instruction is a request and a regex is not. Every string he returns is
   walked sentence by sentence:

     · no flag word in the sentence          → left exactly alone
     · flag word AND a hedge already in it   → left exactly alone
     · flag word, no hedge                   → repaired, and the repair recorded
     · flag word, no hedge, unrepairable     → the sentence is dropped

   ⚠ IT ONLY TOUCHES SENTENCES CARRYING A FLAG WORD. A count never meets this
   code. "Six earlier filings carried warrant language" has no flag word in it
   and comes out the far side untouched, which is the point — the arithmetic
   must not sound unsure.

   ⚠ WHAT IS RECORDED IS AS IMPORTANT AS WHAT IS FIXED. Every change comes back
   on `guarded` so it can be read. A guard that silently rewrites a man's
   opinion is its own problem.
   ============================================================================ */

/* the words that make a sentence an accusation rather than a description */
const FLAG_RE = new RegExp(
  "\\b(" +
  "pump[\\s-]?(?:and|&)[\\s-]?dump" +
  "|schem(?:e|es|ing)" +
  "|manipulat(?:ion|e|es|ed|ing|ive)" +
  "|fraud(?:ulent|ulently)?" +
  "|defraud(?:s|ed|ing)?" +
  "|scam(?:s|med|ming)?" +
  "|rig(?:ged|ging)" +
  "|swindl(?:e|ed|ing)" +
  "|looting|looted" +
  ")\\b", "i");

/* anything that makes the sentence a reading rather than a finding */
const HEDGE_RE = new RegExp(
  "\\b(" +
  "could|maybe|might|may|possibly|perhaps" +
  "|appears?|appeared|seems?|seemed" +
  "|looks? like|looked like|reads? like|the shape of|shaped like" +
  "|in my view|in my opinion|I think|I would say|I'd say|I suspect" +
  "|not certain|often wrong|been wrong|can be wrong" +
  ")\\b", "i");

/* first pass: turn the verb. Order matters — the specific before the general */
const HEDGE_FIXES = [
  [/\bthis is (a|an|the)\b/gi,        "this could be $1"],
  [/\bthat is (a|an|the)\b/gi,        "that could be $1"],
  [/\bit is (a|an|the)\b/gi,          "it could be $1"],
  [/\bthis['\u2019]s (a|an|the)\b/gi, "this could be $1"],
  [/\bthat['\u2019]s (a|an|the)\b/gi, "that could be $1"],
  [/\bit['\u2019]s (a|an|the)\b/gi,   "it could be $1"],
  [/\bis running (a|an|the)\b/gi,     "could be running $1"],
  [/\bare running (a|an|the)\b/gi,    "could be running $1"],
  [/\bis being\b/gi,                  "could be being"],
  [/\bare being\b/gi,                 "could be being"],
  [/\bwill be\b/gi,                   "could be"],
  [/\bwill\b/gi,                      "could"],
  [/\bwas (a|an|the)\b/gi,            "could have been $1"],
  [/\bwere (a|an|the)\b/gi,           "could have been $1"],
  [/\bis (a|an)\b/gi,                 "could be $1"],
  [/\bare (a|an)\b/gi,                "could be $1"],
  [/\bamounts to\b/gi,                "could amount to"],
  [/\bconstitutes\b/gi,               "could constitute"],
  /* ⚠ LAST RESORT, AND ONLY EVER INSIDE A SENTENCE ALREADY CARRYING A FLAG
     WORD. "This is fraud" has no article in it, so every rule above misses it
     and the sentence used to be dropped whole. Turning a bare is/are into
     could be is exactly Mark's rule applied to exactly the sentence it was
     written for. It cannot reach a count, because a count has no flag word. */
  [/\bis\b/gi,                        "could be"],
  [/\bare\b/gi,                       "could be"]
];

/* ⚠ AND THE PREDICTION, which is a different fault from the flag words.
   "IS and WILL BE are not in the vocabulary" — so a sentence that says what
   the PRICE is going to do gets the same treatment. Narrow on purpose: it
   only fires when the sentence is about price or value, so "the share count
   will rise as the reset fills" is mechanical and is left alone. */
const PREDICT_RE =
  /\b(price|prices|value|valuation|market cap|collapse|collapses|crash|tank|zero|worthless)\b/i;

/* second pass: if the verb would not turn, wrap the noun instead.
   "running a scheme" -> "running what could be a scheme" */
const HEDGE_WRAP =
  /\b(a|an|the) (pump[\s-]?(?:and|&)[\s-]?dump|scheme|manipulation|fraud|scam)\b/i;

function hedgeGuard(text) {
  const src = String(text == null ? "" : text);
  const changes = [];
  /* ⚠ THE EARLY RETURN MUST KNOW ABOUT BOTH FAULTS. It used to check only for
     a flag word, so "the price will go to zero" — an accusation of nothing but
     a prediction of everything — walked straight past the guard untouched. */
  const worthWalking = FLAG_RE.test(src) ||
                       (PREDICT_RE.test(src) && /\bwill\b/i.test(src));
  if (!src.trim() || !worthWalking) return { text: src, changes };

  const parts = src.split(/(?<=[.!?])\s+/);
  const kept = [];

  for (const raw of parts) {
    const before = raw;

    /* a prediction about the price is its own fault, flag word or not */
    const predicts = PREDICT_RE.test(raw) && /\bwill\b/i.test(raw) && !HEDGE_RE.test(raw);
    const accuses  = FLAG_RE.test(raw) && !HEDGE_RE.test(raw);

    if (!predicts && !accuses) { kept.push(raw); continue; }

    let s = raw;

    if (predicts) {
      s = s.replace(/\bwill be\b/gi, "could be").replace(/\bwill\b/gi, "could");
    }

    if (accuses) {
      /* ⚠ EVERY FIX RUNS, NOT JUST THE FIRST ONE THAT LANDS. Stopping at the
         first hedge left the second claim in the same sentence bare:
         "The stock will collapse and this is manipulation" came out with the
         verb turned on the first half and "is manipulation" still standing. */
      for (const [re, to] of HEDGE_FIXES) s = s.replace(re, to);
      if (!HEDGE_RE.test(s))
        s = s.replace(HEDGE_WRAP, (m, art, word) => "what could be " + art + " " + word);
      if (!HEDGE_RE.test(s)) { changes.push({ dropped: before }); continue; }
    }

    /* ⚠ KEEP THE CAPITAL. "This is a pump and dump" was coming back as
       "this could be a pump and dump" — a lower-case sentence start in a
       paid opinion reads as a typo, and the voice stumbles on it too. */
    if (/^[A-Z]/.test(before) && /^[a-z]/.test(s))
      s = s.charAt(0).toUpperCase() + s.slice(1);

    if (s === before) { kept.push(raw); continue; }
    changes.push({ was: before, now: s });
    kept.push(s);
  }

  return { text: kept.join(" ").replace(/[ \t]{2,}/g, " ").trim(), changes };
}

/* walk anything — string, array, object — and guard every string in it */
function guardAll(node, changes) {
  if (typeof node === "string") {
    const r = hedgeGuard(node);
    for (const c of r.changes) changes.push(c);
    return r.text;
  }
  if (Array.isArray(node)) return node.map(x => guardAll(x, changes));
  if (node && typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node)) out[k] = guardAll(node[k], changes);
    return out;
  }
  return node;
}

export { hedgeGuard, guardAll };


export default {
  async fetch(req, env) {
    const u = new URL(req.url), q = u.searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      if (q.get("who")) return json(whoIs(), H);
      if (q.get("opinion")) return json(await serve(env, q, req), H);
      if (q.get("audio")) return await serveAudio(env, q, req);
      if (q.get("audition")) return await serveAudition(env, q, req);

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "list";
      if (a === "run")  return json(await produce(env, q.get("accession"), q.get("force")), H);
      if (a === "peek") return json(await peek(env, q.get("accession")), H);
      if (a === "say")  return json(await say(env, q.get("accession")), H);
      /* ⚠ TYPE A SENTENCE AND SEE WHAT THE GUARD DOES TO IT. Cheaper than
         running a whole opinion to find out. */
      if (a === "guard") {
        const r = hedgeGuard(q.get("text") || "");
        return json({ ok:true, build: BUILD, given: q.get("text") || "",
                      returned: r.text, changes: r.changes }, H);
      }
      if (a === "audition") return json(await audition(env), H);
      return json(await list(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

function whoIs() {
  return { ok:true, build: BUILD,
    agent: BARRY.name,
    lens: BARRY.lens,
    who: BARRY.who,
    reads: BARRY.beat,
    price_cents: PRICE_CENTS,
    ready: lensReady(),
    note: lensReady()
      ? "One opinion, on the warrant paper in one filing."
      : "⚠ NOT READY. His lens is still unwritten — see BARRY at the top of " +
        "the worker. He will refuse to write an opinion until it is filled in." };
}

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS barry (
       accession TEXT PRIMARY KEY,
       ticker TEXT, company TEXT,
       fields TEXT, words INTEGER,
       script TEXT, audio_key TEXT, seconds INTEGER,
       made TEXT DEFAULT (datetime('now')))`).run();
  for (const col of ["script TEXT", "audio_key TEXT", "seconds INTEGER"]) {
    try { await env.OVERHANG.prepare(
      "ALTER TABLE barry ADD COLUMN " + col).run(); } catch (e) {}
  }
}

const GLOSSARY = `WHAT THESE CLAUSES ACTUALLY DO. Get these right — an opinion
built on a misread clause is worthless, and confident and wrong is the worst
thing you can be.

OWNERSHIP BLOCKER (a 4.99% or 9.99% limit): CAPS how much of the company the
holder may own at any moment. IT DOES NOT GIVE CONTROL — it prevents a large
visible stake. It commonly keeps a holder below the reporting thresholds that
would make the position public, and it lets them keep exercising and selling in
tranches without ever crossing the line. NEVER describe a blocker as control,
influence, or a big stake. It is the opposite.

THE 61-DAY NOTICE to move a blocker from 4.99% to 9.99%: the holder can raise
their own ceiling, but must say so two months ahead.

PRE-FUNDED WARRANT: exercisable at a nominal price — often a tenth of a cent —
because the buyer already paid nearly all of it up front. It is a share in
everything but name, held in a form that does not count toward the blocker until
exercised. It is not a bet on the future; it is stock already bought.

WARRANT INDUCEMENT: existing warrant holders are offered a lower exercise price
to exercise early, usually receiving new warrants in exchange. It brings cash in
now and issues more paper in the process.

PLACEMENT AGENT FEE: a cash percentage of gross proceeds, sometimes with
warrants on top. Seven per cent is at the higher end of ordinary for a small
raise. It says what the placement cost. IT DOES NOT SAY the deal was hard to do
— do not read motive into a fee.

VARIABLE RATE TRANSACTION: the price at which shares are issued moves with the
market rather than being fixed. When the price falls, more shares are issued.

FLOOR PRICE: a level the reset cannot go below. It limits the issuer's exposure,
not the holder's.

EQUITY LINE: a standing arrangement to sell shares to one buyer over time, at
the issuer's option.

PARTICIPATION RIGHT: the holder may join future financings on the same terms.

MOST FAVOURED NATION: if better terms are given to anyone later, this holder
gets them too.

⚠ AND THE HARD LIMIT ON MOTIVE. The read contains what a document says. It does
not contain why anyone did anything. Never assert that a buyer "wanted control",
"paid a premium", "was motivated", or that a deal "was hard to do". You may say
what a term does and what it costs. You may not say what anyone intended.
A PREMIUM CANNOT BE CLAIMED WITHOUT A MARKET PRICE, and the read rarely has one.`;

/* ============================================================
   WHAT HE IS TOLD BEFORE HE READS
   ============================================================ */
function system() {
  return `You are ${BARRY.name}. ${BARRY.who}

HOW YOU READ: ${BARRY.lens}
YOUR VOICE: ${BARRY.voice}

${GLOSSARY}

⚠⚠ BARRY EXPLAINS EVERY TERM AS HE REACHES IT.

He assumes the reader has never seen these words before and he is usually right.
So the first time a term appears he names it and says in one plain sentence what
it does to somebody holding the stock. Not a definition read out of a book — what
it DOES. Then he carries on.

⚠⚠ HIS LENS IS THE COMBINATION, NOT THE CLAUSE.

Any one of these terms is ordinary and lawful and thousands of honest companies
use them. THE SET IS THE STORY. Say which ones turn up together in THIS document
and what they do to each other:
  · pre-funded warrants beside a fresh offering means stock already paid for is
    landing at the same time as new stock
  · a variable rate reset beside a floor price means the price can fall to a
    known level and no further, and the share count rises to fill the gap
  · an ownership blocker beside a large position means the holder can sell in
    tranches without the stake ever becoming visible
Say the ones you actually see. Do not reach for one that is not there.

⚠⚠ HE COUNTS THE HISTORY BEFORE HE SAYS ANYTHING ABOUT IT.

"what_barry_also_knows" carries this company's earlier filings, its share count
year by year, the reverse splits, the ceiling being raised, what it has raised in
total, and how many years it had no revenue. USE THE NUMBERS. "The sixth time" is
only sayable if six is in the data. If a figure is not there, say it is not there.

⚠⚠ HE SAYS WHO ELSE IS RUNNING IT.

"elsewhere" lists companies with the same combination in the last four months,
and "firms_that_recur" the firms appearing across several issuers. Name them. That
is the part nobody else can do, because nobody else is holding the whole wire.

⚠⚠ COULD AND MAYBE ARE IN YOUR VOCABULARY. IS AND WILL BE ARE NOT.

This is the rule the whole opinion runs on. Two different things live in it and
they are not equally certain:
  · THE COUNT IS CERTAIN. Six earlier filings. Three collapses of the share
    count. Four other companies running this now. Say those flat — no "could",
    no "appears to", no "may have". They are counts and they are either right or
    they are a bug. Hedging a count makes the strongest part of the opinion
    sound unsure, and it is the part nobody can argue with.
  · WHAT THE COMBINATION POINTS AT IS A READING. "Pre-funded warrants landing
    beside a fresh offering COULD MEAN stock already paid for is being sold into
    whatever the offering brings in." That is a reading of a structure, not a
    fact about anybody's intention, and it is said that way every time.
Never "this means", "this shows", "clearly", "obviously". You have been doing
this long enough to know how often the obvious reading was not what happened.

⚠⚠ YOU MAY NAME THE SHAPE. THAT IS THE JOB.

This publication exists to put flags up. So the words PUMP AND DUMP, SCHEME and
MANIPULATION are yours to use when the structure looks like one — and you use
them with COULD or MAYBE on them, every single time, because a company's name is
attached.

  YES: "I have seen this shape before, and it could mean a pump and dump is
        being set up here. Six offerings in twenty-two months. Two reverse
        splits. The same placement agent on four of them. I could be wrong
        about this one — I have been wrong before — but that is what the
        combination looks like to me."
  NO:  "This is a pump and dump."
  NO:  "The stock will collapse."

The first one is louder than the second, not softer. It puts the shape in front
of the reader by name and then shows the work under it. The second is a verdict
you have no standing to give.

⚠⚠ AND HE SAYS HE IS OFTEN WRONG.

In his own words, inside the opinion — not as a disclaimer stuck on the end. He
has read thousands of these and he remembers the ones he called wrong. Say what
would have to be true for this reading to be the wrong one, and say plainly that
it often is. That is not weakness. A man who admits the misses is the only one
worth listening to when he is sure.

⚠⚠ THE TWO THINGS THAT ARE STILL OUT, and they are different from the words above.

  · NEVER SAY WHAT THE SHARE PRICE WILL DO. Not a target, not a direction, not
    "will fall". You do not know and neither does anybody else.
  · NEVER ASSERT INTENT. Not "they wanted", "they planned", "this is designed
    to". Intent cannot be read off a document. Say what the structure DOES and
    how many times it has been done. The reader draws the rest.

You are given a READ of an SEC filing — the facts, already established by the engine.
You give YOUR VIEW of those facts. Return ONLY a JSON object, no markdown, no backticks.

{
 "agent": "${BARRY.name}",
 "lens": "${BARRY.lens}",
 "headline": "one sentence in your own voice",
 "what_i_look_at_first": "the one thing in this read you went to before anything else, and why",
 "the_words_explained": [
   {"term":"exactly as it appears in the document",
    "what_it_does":"one plain sentence — what it does to somebody holding the stock"}
 ],
 "what_is_combined": "the terms that turn up TOGETHER in this document and what they
   COULD MEAN together. Not a list — the sentence that only makes sense once you
   see them side by side. Say 'could mean', never 'means'.",
 "this_company_before": "what the count shows. How many earlier filings carried this
   language, how many times the share count collapsed and by how much, whether the
   ceiling was raised afterwards, what it has raised in total and how many years it
   had no revenue. NUMBERS, from the data given, or say the data is not held.",
 "who_else_is_running_it": ["companies from "elsewhere" with the same combination
   right now, named, with how many terms they share"],
 "what_matters_here": ["two to four points, in your voice, each tied to something in the read"],
 "the_shape_of_it": "OPTIONAL, and only when the combination and the history warrant
   it. What this could be, named — a pump and dump, a scheme, manipulation — with
   COULD or MAYBE on it and the counts set out underneath. Leave it out entirely if
   the structure does not support it. An empty flag costs more than no flag.",
 "what_i_would_ask": "one question you would put to the company",
 "where_i_could_be_wrong": "what would have to be true for this reading to be the
   wrong one — AND say plainly that you are often wrong. In your own words. You
   have read thousands of these and you remember the ones you called wrong.",
 "closing": "two or three sentences. What you saw and what it could mean. Structure
   and history — never a prediction, never a statement of intent. End on what would
   make you wrong."
}

HARD RULES — these are not style, they decide whether this is lawful:
- NEVER say buy, sell, hold, accumulate, avoid, or anything equivalent.
- NEVER give a price target or say what the price will do.
- ⚠ THE FLAG WORDS ARE ALLOWED, HEDGED, ALWAYS. Pump and dump, scheme,
  manipulation may be used — with COULD or MAYBE on the sentence, every time.
  Without the hedge they become a statement that a named company committed a
  crime, which is the single thing that could end this publication. The hedged
  version is stronger anyway, because the counts sit underneath it.
- NEVER state as fact that the company or any person broke a law or committed a
  crime. "Could be" is a reading. "Is" is a charge.
- NEVER comment on the reader's position. You have not been told one and must not ask.
- DISPOSITION DECIDES EMPHASIS, NEVER FACTS. Do not contradict the read about what
  the document says. You may disagree about what matters.
- If the read says something was NOT checked, you may say that limits your view. Do
  not fill the gap with a guess.
- ⚠ NEVER STATE A MOTIVE. Not "they wanted control", not "they paid a premium",
  not "the deal was hard to do". What a term DOES is in the document; why anyone
  did it is not.
- ⚠ NEVER SAY A BLOCKER GIVES CONTROL OR A LARGE STAKE. It caps the position.
  Getting this backwards is the single fastest way to be dismissed by anyone who
  knows the subject.
- You are one of six and you know it. You are not the last word and you should not
  sound like it.`;
}

/* ============================================================
   SALVAGE — rescue a reply cut off mid-object

   The model writes JSON top to bottom, so a truncated reply is
   valid up to the cut. Close what is open and keep what survived.
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

  /* ⚠ ORDER MATTERS. Prefer data that was COMPLETE over data force-closed
     mid-word: closing a cut string keeps a fragment like "The na" as though
     it were an item, and a half-word in a published opinion is worse than a
     shorter list. So: trailing rubbish first, then trim to the last complete
     member, and only then force everything shut. */
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
   WHAT BARRY BRINGS THAT THE READ DOES NOT

   ⚠ HIS LENS IS THE COMBINATION AND THE HISTORY, so a read of one
   document is not enough for him. Three lookups, all from data
   already held:

     1. THIS COMPANY'S OWN ARC — every earlier filing carrying
        warrant language, and the share count year by year with
        the reverse splits marked. He cannot say "the sixth time"
        without counting the first five.

     2. WHAT IS COMBINED IN THIS DOCUMENT — the terms together,
        because any one of them is ordinary and the set is not.

     3. WHO ELSE IS RUNNING THE SAME COMBINATION, right now, and
        the firms that keep turning up on them.

   ⚠ EVERYTHING HERE IS COUNTED, NOT CONCLUDED. He is handed
   numbers and he says what he sees in them. He is never handed a
   verdict to repeat.
   ============================================================ */
async function whatElseHeKnows(env, rd) {
  const out = { history: {}, combination: [], elsewhere: [] };

  /* ---- 1. how many times has this company done this ---- */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT COUNT(DISTINCT accession) filings,
              MIN(filed_on) first_seen, MAX(filed_on) latest
         FROM wire_hits WHERE cik = ? AND accession <> ?`)
      .bind(rd.cik, rd.accession).first();
    if (r) out.history.earlier_filings_with_warrant_language = r.filings || 0;
    if (r) out.history.first_seen = r.first_seen;
  } catch (e) {}

  /* the share count year by year, and where it collapsed */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT fy, shares_outstanding, shares_authorized, cash_from_financing,
              revenue, accumulated_deficit
         FROM company_facts WHERE cik = ? ORDER BY fy`).bind(rd.cik).all();
    const rows = r.results || [];
    if (rows.length) {
      out.history.years_on_file = rows.length;
      const splits = [];
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i-1], b = rows[i];
        if (a.shares_outstanding && b.shares_outstanding &&
            a.shares_outstanding / b.shares_outstanding >= 1.8)
          splits.push({ year: b.fy,
            from: a.shares_outstanding, to: b.shares_outstanding,
            in_effect: "1-for-" + Math.round(a.shares_outstanding / b.shares_outstanding) });
        if (a.shares_authorized && b.shares_authorized &&
            b.shares_authorized >= a.shares_authorized * 1.5)
          (out.history.ceiling_raised = out.history.ceiling_raised || []).push({
            year: b.fy, from: a.shares_authorized, to: b.shares_authorized });
      }
      out.history.share_count_collapses = splits;
      const last = rows[rows.length - 1];
      out.history.latest = { year: last.fy,
        outstanding: last.shares_outstanding,
        authorized: last.shares_authorized,
        revenue: last.revenue,
        accumulated_deficit: last.accumulated_deficit };
      out.history.financing_raised_total =
        rows.reduce((n, x) => n + (x.cash_from_financing || 0), 0);
      out.history.years_with_no_revenue = rows.filter(x => !(x.revenue > 0)).length;
    }
  } catch (e) { out.history.note = "no tagged company facts held for this one"; }

  /* ---- 2. what is combined in THIS document ---- */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT DISTINCT p.label
         FROM wire_hits h JOIN wire_phrases p ON p.id = h.phrase_id
        WHERE h.accession = ?`).bind(rd.accession).all();
    out.combination = (r.results || []).map(x => x.label);
  } catch (e) {}

  /* ---- 3. who else is running the same combination ---- */
  if (out.combination.length >= 2) {
    try {
      const marks = out.combination.slice(0, 6);
      const qs = marks.map(() => "?").join(",");
      const r = await env.OVERHANG.prepare(
        `SELECT h.ticker, h.company, COUNT(DISTINCT p.label) shared,
                MAX(h.filed_on) latest
           FROM wire_hits h JOIN wire_phrases p ON p.id = h.phrase_id
          WHERE p.label IN (${qs}) AND h.cik <> ?
            AND h.filed_on >= date('now','-120 days')
          GROUP BY h.ticker
         HAVING shared >= ?
          ORDER BY shared DESC, latest DESC LIMIT 8`)
        .bind(...marks, rd.cik, Math.min(3, marks.length)).all();
      out.elsewhere = (r.results || []).map(x => ({
        ticker: x.ticker,
        company: String(x.company || "").split("  (")[0],
        terms_in_common: x.shared,
        latest: x.latest }));
    } catch (e) {}
  }

  /* the firms that keep turning up */
  try {
    const r = await env.OVERHANG.prepare(
      `SELECT p.name, p.kind, COUNT(DISTINCT r.issuer_id) issuers,
              SUM(COALESCE(r.filing_count,1)) appearances
         FROM roles r JOIN parties p ON p.id = r.party_id
        GROUP BY p.id HAVING issuers > 1
        ORDER BY issuers DESC LIMIT 8`).all();
    out.firms_that_recur = (r.results || []);
  } catch (e) {}

  return out;
}

/* ============================================================
   WRITING ONE

   ⚠ HE REFUSES IF THERE IS NO WARRANT PAPER. The wire is warrants
   and nothing else, so an opinion on a filing that carries none is
   an opinion about nothing — and the fastest way to lose a customer
   for good is to charge them for it.

   ⚠ HE REFUSES IF HIS LENS IS NOT WRITTEN. A worker that quietly
   produces generic opinions under a name is worse than one that
   says it is not finished.
   ============================================================ */
async function produce(env, accession, force) {
  if (!accession) throw new Error("an accession number, please");

  if (!lensReady())
    return { ok:false, build: BUILD,
      error:"Barry has no lens yet",
      note:"Fill in `lens`, `who` and `voice` at the top of the worker. Until " +
           "then he would be a name on a generic opinion, which is worth " +
           "nothing and damages the six that do work." };

  if (!force) {
    const had = await env.OVERHANG.prepare(
      "SELECT * FROM barry WHERE accession = ?").bind(accession).first();
    if (had) return { ok:true, build: BUILD, cached:true, accession,
      opinion: JSON.parse(had.fields || "{}") };
  }

  const rd = await env.OVERHANG.prepare(
    "SELECT * FROM reads WHERE accession = ?").bind(accession).first();
  if (!rd) return { ok:false, build: BUILD,
    error:"that filing has not been read yet",
    note:"An opinion is written on a read, never on the raw document — so the " +
         "facts underneath it are the same facts anybody else can check." };

  let f = {};
  try { f = JSON.parse(rd.fields || "{}"); } catch (e) {}

  const terms = (f.the_terms || []);
  if (!terms.length)
    return { ok:false, build: BUILD, accession,
      error:"no warrant terms in this filing",
      charged: false,
      note:"Barry reads warrant paper and this filing carries none. Nothing is " +
           "charged. 8K10Q reads any filing, and one of the six there will " +
           "have something to say about it." };

  /* ⚠ SEND A TRIMMED BRIEF, NOT THE WHOLE READ. A large messy object is read
     unreliably; the terms, the money and the share count are what he needs. */
  const brief = {
    company: String(rd.company || "").split("  (")[0],
    ticker: rd.ticker, form: rd.form, filed: rd.filed,
    headline: f.headline || "",
    the_terms: terms.slice(0, 8).map(t => ({
      name: t.name, what_it_does: t.what_it_does, quote: t.quote, where: t.where })),
    money: f.money || {},
    cost_of_the_money: f.cost_of_the_money || {},
    share_count: f.share_count || {},
    who_is_not_named: f.who_is_not_named || [],
    parties: (f.parties || []).map(p => ({ name: p.name, role: p.role })),
    checks_not_run: f.checks_not_run || []
  };

  /* ⚠ THE THREE LOOKUPS. Without them he is just another agent reading one
     document, and the combination and the history ARE his lens. */
  brief.what_barry_also_knows = await whatElseHeKnows(env, rd);

  const r = await env.AI.run(ENGINE.model, {
    max_tokens: ENGINE.max_tokens,
    messages: [ { role:"system", content: system() },
                { role:"user", content: JSON.stringify(brief) } ] });

  /* Mistral hands back the JSON already parsed on `response` */
  let parsed = null;
  if (r && r.response && typeof r.response === "object" && !Array.isArray(r.response))
    parsed = r.response;

  let out = "";
  if (typeof r === "string") out = r;
  else if (r && typeof r.response === "string") out = r.response;
  else if (r && r.result && typeof r.result.response === "string") out = r.result.response;

  let j, salvaged = false;
  if (parsed) j = parsed;
  else {
    out = String(out).replace(/```json|```/g, "").trim();
    const fi = out.indexOf("{"), la = out.lastIndexOf("}");
    if (fi > 0 || la < out.length - 1) out = out.slice(fi, la + 1);
    try { j = JSON.parse(out); }
    catch (e) {
      j = salvage(out);
      if (!j) throw new Error("the engine did not return clean JSON: " + out.slice(0, 300));
      salvaged = true;
    }
  }

  /* ⚡ THE HEDGE GUARD, before anything is stored. The instructions ask; this
     enforces. Sentences with no flag word in them are not touched, so no count
     is ever softened. */
  const guarded = [];
  j = guardAll(j, guarded);

  j.agent = BARRY.name;
  j.lens = BARRY.lens;

  await env.OVERHANG.prepare(
    `INSERT INTO barry (accession, ticker, company, fields, words)
     VALUES (?,?,?,?,?)
     ON CONFLICT(accession) DO UPDATE SET fields=excluded.fields,
       words=excluded.words, made=datetime('now')`)
    .bind(accession, rd.ticker || null,
          String(rd.company || "").split("  (")[0],
          JSON.stringify(j), JSON.stringify(j).length).run();

  return { ok:true, build: BUILD, cached:false, salvaged, accession,
    guarded_count: guarded.length,
    guarded,
    opinion: j };
}

async function peek(env, accession) {
  const r = await env.OVERHANG.prepare(
    "SELECT * FROM barry WHERE accession = ?").bind(accession).first();
  if (!r) return { ok:false, build: BUILD, error:"nothing written on that one" };
  return { ok:true, build: BUILD, accession, made: r.made,
    opinion: JSON.parse(r.fields || "{}") };
}

async function list(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT accession, ticker, company, made FROM barry
      ORDER BY made DESC LIMIT 100`).all();
  return { ok:true, build: BUILD, ready: lensReady(), rows: r.results || [] };
}

/* ============================================================
   THE GATE

   ⚠ A REDIRECT IS NOT A RECEIPT. Only what the pay worker says an
   address holds counts. This asks it every time and never caches
   a yes.
   ============================================================ */
async function serve(env, q, req) {
  const accession = q.get("accession");
  const email = String(q.get("email") || "").trim().toLowerCase();
  const owner = (q.get("key") || "") === env.LOG_KEY;
  if (!accession) return { ok:false, build: BUILD, error:"which filing?" };

  const r = await env.OVERHANG.prepare(
    "SELECT * FROM barry WHERE accession = ?").bind(accession).first();
  if (!r) return { ok:false, build: BUILD,
    error:"no opinion on that filing yet", price_cents: PRICE_CENTS };

  if (!email) return { ok:false, build: BUILD, paid:false,
    price_cents: PRICE_CENTS,
    agent: BARRY.name, lens: BARRY.lens,
    note:"An opinion from Barry-L on this filing. Forty dollars." };

  if (env.PAY && !owner) {
    try {
      const p = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
      const j = await p.json();
      const has = (j && j.has) || {};
      if (!(has.opinion || has.read_year)) {
        return { ok:false, build: BUILD, paid:false,
          price_cents: PRICE_CENTS,
          agent: BARRY.name, lens: BARRY.lens,
          note:"Not paid for on that address yet." };
      }
    } catch (e) {
      /* ⚠ IF THE PAY DESK CANNOT BE REACHED, REFUSE. Failing open would give
         the product away to anybody who could break the connection. But SAY
         WHY — an address set without https:// throws exactly like a desk that
         is down, and the two need different fixes. */
      return { ok:false, build: BUILD,
        error:"could not reach the payment desk",
        why: String(e).slice(0, 150),
        pay_is_set_to: env.PAY || "NOTHING",
        note: env.PAY && !/^https?:\/\//.test(env.PAY)
          ? "⚠ PAY has no https:// in front of it. That is the fault."
          : "The desk itself may be down. Try again in a moment." };
    }
  }

  return { ok:true, build: BUILD, paid:true, accession,
    opinion: JSON.parse(r.fields || "{}") };
}


/* ============================================================
   HIS SCRIPT, BUILT IN CODE

   ⚠ THE MODEL NEVER GETS A SECOND PASS AT HIS OWN WORDS. He has
   already written the opinion; this only puts it in the order he
   says it and adds the joins between. Same rule that fixed Amalia
   and Stephen — hand a model finished sentences to "say in his
   voice" and it paraphrases them.

   The order is the order he thinks in: the terms, then what they
   are together, then the history, then who else, then the shape,
   then what he would ask, then what would make him wrong.
   ============================================================ */
function scriptFrom(row) {
  let o = {};
  try { o = JSON.parse(row.fields || "{}"); } catch (e) {}
  const S = [];
  const say = t => { if (t && String(t).trim()) S.push(String(t).trim()); };
  const stop = t => { t = String(t || "").trim(); return /[.!?]$/.test(t) ? t : t + "."; };

  say("This is Barry-L, for Warrant Wire.");
  say(stop(o.headline));

  /* the words, explained as he reaches them */
  const words = (o.the_words_explained || []).slice(0, 6);
  if (words.length) {
    say("First, the words, because most people have never seen them.");
    for (const w of words)
      say(up(String(w.term || "").trim()) + "... " + stop(w.what_it_does));
  }

  if (o.what_is_combined) {
    say("Now, what they are TOGETHER.");
    say(stop(o.what_is_combined));
  }

  if (o.this_company_before) {
    say("And this company has form.");
    say(stop(o.this_company_before));
  }

  const others = (o.who_else_is_running_it || []).slice(0, 6);
  if (others.length) {
    say("It is not only them.");
    say("Right now, the same combination is running at... " +
        listOf(others.map(x => typeof x === "string" ? x
              : (x.company || x.ticker || ""))) + ".");
  }

  for (const m of (o.what_matters_here || []).slice(0, 4)) say(stop(m));

  /* ⚡ THE FLAG, WHEN HE PUT ONE UP. It sits after the counts, never before —
     the shape is only worth naming once the numbers under it have been said. */
  if (o.the_shape_of_it) {
    say("So let me say what this looks like to me.");
    say(stop(o.the_shape_of_it));
  }

  if (o.what_i_would_ask) {
    say("If I had them on the phone, I would ask this.");
    say(stop(o.what_i_would_ask));
  }

  /* ⚠ HE SAYS HE IS OFTEN WRONG, AND IT IS NOT A DISCLAIMER ON THE END.
     It sits before the closing, in his own words, where it belongs. */
  if (o.where_i_could_be_wrong) say(stop(o.where_i_could_be_wrong));

  if (o.closing) say(stop(o.closing));

  say("That is what I saw. Barry-L, for Warrant Wire.");
  say("Thank you for listening.");

  return S;
}

function up(x) { return String(x).charAt(0).toUpperCase() + String(x).slice(1); }
function listOf(a) {
  const c = a.filter(Boolean);
  if (!c.length) return "";
  if (c.length === 1) return c[0];
  return c.slice(0, -1).join(", ") + ", and " + c[c.length - 1];
}

/* ============================================================
   RECORDING IT
   ============================================================ */
async function say(env, accession) {
  if (!accession) return { ok:false, build: BUILD, error:"which filing?" };
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM barry WHERE accession = ?").bind(accession).first();
  if (!row) return { ok:false, build: BUILD,
    error:"no opinion on that filing yet — run ?action=run first" };
  if (!env.AUDIO) return { ok:false, build: BUILD,
    error:"no AUDIO binding — add the R2 bucket barry-l as AUDIO" };

  const facts = scriptFrom(row);

  /* ⚡ THE GUARD RUNS ON THE SPOKEN SCRIPT TOO. Rows written before 2d were
     stored without it, and a hedge that survives on the page and disappears
     in the audio is worse than not having one. */
  const spoken = hedgeGuard(facts.join(" "));
  const script = breathe(spoken.text);

  let bytes, pieces = 1;
  try {
    const made = await speakAll(env, script);
    bytes = made.bytes; pieces = made.pieces;
  } catch (e) {
    return { ok:false, build: BUILD, script,
      error:"the voice refused: " + String(e),
      note:"TTS at the top is the dial. Run ?action=audition to find one that works." };
  }

  const key = "opinion/" + accession + ".mp3";
  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "no-cache" },
    customMetadata: { accession, agent: BARRY.name } });

  const words = script.split(/\s+/).filter(Boolean).length;
  await env.OVERHANG.prepare(
    "UPDATE barry SET script = ?, audio_key = ?, seconds = ? WHERE accession = ?")
    .bind(script, key, Math.round(words / 150 * 60), accession).run();

  return { ok:true, build: BUILD, accession, key, pieces,
    bytes: bytes.byteLength,
    minutes: +(words / 150).toFixed(1),
    guarded: spoken.changes,
    facts_given: facts,
    script,
    playback: "/?audio=" + accession,
    note: "Read it before anybody hears it. The script is free to fix; the " +
          "voice is not." };
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




/* ⚠ HIS RECORDING IS THE SAME PRODUCT AS HIS TEXT, so it is behind the same
   gate. An opinion nobody paid for is not free because it happens to be audio. */
async function serveAudio(env, q, req) {
  const accession = q.get("audio");
  const email = String(q.get("email") || "").trim().toLowerCase();

  /* ⚠ THE OWNER HEARS HIS OWN AGENT. Nobody should have to buy from himself to
     find out whether the voice is right. The key opens it for him and changes
     nothing for anybody else. */
  const owner = (req.headers.get("X-Auth-Key") || q.get("key") || "") === env.LOG_KEY;

  if (env.PAY && !owner) {
    if (!email) return new Response("not paid for", { status: 402 });
    try {
      const p = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
      const j = await p.json();
      const has = (j && j.has) || {};
      if (!(has.opinion || has.read_year))
        return new Response("not paid for", { status: 402 });
    } catch (e) {
      /* ⚠ SAY WHY. "Could not reach the payment desk" with no reason cost an
         afternoon on another worker — the address was set without https:// and
         the fetch threw, which looks identical to the desk being down. */
      return new Response(
        "could not reach the payment desk — " + String(e).slice(0, 120) +
        " (PAY is set to: " + (env.PAY || "NOTHING") + ")",
        { status: 503 });
    }
  }
  if (!env.AUDIO) return new Response("no audio store", { status: 500 });
  const key = "opinion/" + accession + ".mp3";
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
          'attachment; filename="barry-' + accession + '.mp3"');
  return new Response(obj.body, { headers: h });
}

/* what is actually in the bucket, without playing anything */
async function fileInfo(env, accession) {
  if (!env.AUDIO) return { ok:false, build: BUILD, error:"no AUDIO binding" };
  const key = "opinion/" + accession + ".mp3";
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

/* ⚠ THE AUDITION LINE IS BARRY'S NOW, NOT STEPHEN'S. He was auditioning in
   another man's words, which tells you nothing about how HE sounds. This is
   his shape: the terms, the count, the flag, and the admission. */
const AUDITION_LINE =
  "This is Barry-L, for Warrant Wire. Pre-funded warrants... " +
  "that is stock already bought and paid for, waiting in another form. " +
  "Beside a fresh offering, that could mean paper already paid for is landing " +
  "at the same time as new stock. This company has done this six times in " +
  "twenty-two months. The share count collapsed twice. The same placement " +
  "agent is on four of them. I have seen this shape before, and it could mean " +
  "a pump and dump is being set up here. I could be wrong about this one. " +
  "I have been wrong before. That is what I saw. Barry-L, for Warrant Wire.";

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


function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}