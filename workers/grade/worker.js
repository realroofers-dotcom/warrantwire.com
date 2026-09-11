/* ============================================================================
   THE 421 GRADE  —  Cloudflare Worker  ·  worker name: grade
   Every filing marked against the SEC's own plain English rule.

   Built 2026-09-10 · grade-1l — the floor flags instead of refusing, and force works

   ----------------------------------------------------------------------------
   ⚠ EVERY PARAMETER BELOW TRACES TO A LINE IN THE RULE. Nothing here is a
   readability formula borrowed from schoolbooks and nothing is invented. If a
   company disputes a grade, the answer is the rule they were already bound by.

     17 CFR 230.421(a)  information "shall not be set forth in such fashion as
                        to OBSCURE any of the required information"
     17 CFR 230.421(b)  the prospectus must be "clear, concise and
                        understandable", and names the standards:
                        (b)(1) clear, concise sections, paragraphs and
                               sentences — short, explanatory sentences and
                               bullet lists wherever possible
                        (b)(2) descriptive headings and subheadings
                        (b)   and what to AVOID: legalese, highly technical
                              business terms, and disclosure repeated in
                              different sections that lengthens the document
                              without improving it
     17 CFR 230.421(d)  the cover page, summary and risk factors MUST be in
                        plain English, and (d)(2) names the principles: short
                        sentences, everyday words, the active voice, tabular
                        presentation of complex information, no legal jargon,
                        no multiple negatives
     Release 33-7497    the adopting release, 28 January 1998

   ⚠ THE LIMIT, AND IT IS STATED ON EVERY GRADE. 421(d)'s hard requirement
   covers the FRONT SECTIONS — cover, summary, risk factors. The warrant
   mechanics sit in the body, where 421(a) and (b) apply but (d) does not. So
   a grade is a measurement against the standard, NEVER a finding that a rule
   was broken. That is the SEC's to make and nobody else's.

   ⚠ AND THE METHOD IS PUBLISHED. ?method=1 returns every parameter, every
   threshold and every weight. A grade nobody can reproduce is an opinion
   wearing a letter.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              IMG        R2 bucket → companies-logos
   SECRETS    LOG_KEY

   ----------------------------------------------------------------------------
   ⚠ THIS WORKER OWNS THE LOGO BUCKET. `concern` has the same bucket bound and
   READS from it; only this one writes. Two workers writing the same keys is
   how two versions of the same logo end up in one place and nobody knows
   which is current.

   ⚠ NO SVG, EVER. An SVG is XML, XML can carry script, and a browser runs it.
   Every other rule here would be pointless with an SVG allowed through — it
   is the one image format that is also a program. JPEG, PNG and WebP, and the
   type is read from the file's own first bytes rather than from what the
   upload claims.

   ⚠ AND THE TRADEMARK POINT, SAID ONCE, IN THE FILE. A company's logo beside
   a report about that company identifies who is being written about. A LAW
   FIRM'S OR AUDIT FIRM'S logo beside a league table of going concern
   opinions is a different thing: a wordmark implies participation in a way
   that the firm's name in plain text does not. The name identifies them
   completely. `kind` is carried on every logo so a page can show company
   logos and firm names without the code having to be changed to find out
   which is which.

   PUBLIC
     ?method=1                     every parameter, threshold and weight
     ?grade=1&accession=…          the grade, if it has been computed
     ?worst=1[&n=25]               the worst graded so far
   PRIVATE
     ?action=grade&accession=…     fetch the document and grade it
     ?action=text                  grade text pasted in the body (POST)
     ?action=batch&n=10            grade the next few ungraded filings
   ========================================================================== */

const BUILD = "grade-1l · 2026-09-10 21:40 ET";
const UA = "JobCreation.us Warrant Wire research (research@warrantwire.com)";

/* ============================================================
   THE PARAMETERS

   ⚠ EACH ONE CARRIES THE PART OF THE RULE IT COMES FROM, and
   the thresholds are stated rather than hidden in the code, so
   the whole method can be printed on a page.

   ⚠ THE THRESHOLDS ARE JUDGEMENTS AND ARE LABELLED AS SUCH. The
   rule says "short sentences"; it does not say 25 words. What
   the rule gives is the direction, and what these give is a
   consistent line applied identically to every filer — which is
   the only thing that makes one filing comparable to another.
   ============================================================ */
const PARAMS = [
  { key: "sentence_length", weight: 20,
    rule: "421(b)(1), 421(d)(2)",
    says: "short, explanatory sentences",
    measures: "average words per sentence",
    good: 20, bad: 45,
    note: "The SEC's own handbook uses 20 to 25 words as a working target." },

  { key: "long_sentences", weight: 15,
    rule: "421(b)(1)",
    says: "short, explanatory sentences",
    measures: "share of sentences over 45 words",
    good: 0.02, bad: 0.25,
    note: "One long sentence is a choice. A quarter of them is a style." },

  { key: "legalese", weight: 15,
    rule: "421(d)(2)",
    says: "no legal jargon or highly technical business terms",
    measures: "legalese markers per thousand words",
    good: 1, bad: 12,
    note: "Counted words are listed in ?method=1 — hereinafter, thereto, " +
          "whereof, notwithstanding, and the rest." },

  { key: "cross_references", weight: 15,
    rule: "421(a)",
    says: "must not obscure the required information",
    measures: "cross-references per thousand words",
    good: 1, bad: 10,
    note: "Every 'as described in Section 4(b) below' is a reader sent " +
          "somewhere else to find out what he just read." },

  { key: "defined_terms", weight: 10,
    rule: "421(a), 421(d)(2)",
    says: "everyday words; must not obscure",
    measures: "uses of capitalised defined terms per thousand words",
    good: 5, bad: 90,
    note: "⚠ USES, NOT DEFINITIONS. The first version counted only where a " +
          "term was DEFINED, and a warrant blocker stuffed with 'the Holder', " +
          "'Beneficial Ownership Limitation' and 'Affiliates' scored a perfect " +
          "hundred because it defined them somewhere else. What makes a " +
          "document unreadable is not the definition; it is every ordinary " +
          "word turned into a capitalised term you have to hold in your head." },

  { key: "passive_voice", weight: 10,
    rule: "421(d)(2)",
    says: "the active voice",
    measures: "share of sentences in the passive",
    good: 0.10, bad: 0.50,
    note: "⚠ AN APPROXIMATION AND SAID TO BE ONE. Counted as a form of 'to " +
          "be' followed by a past participle. It over-counts slightly and it " +
          "over-counts every filer identically." },

  { key: "multiple_negatives", weight: 10,
    rule: "421(d)(2)",
    says: "no multiple negatives",
    measures: "share of sentences carrying two or more negatives",
    good: 0.05, bad: 0.50,
    note: "⚠ A SHARE OF SENTENCES, NOT A RATE PER THOUSAND WORDS. Measured " +
          "per thousand words it punished the SHORT document — a plain " +
          "rewrite scored worse than the legalese it replaced, purely for " +
          "being concise. A double negative is a property of a sentence, so " +
          "it is counted against sentences." },

  { key: "exhibit_depth", weight: 15,
    rule: "421(a)",
    says: "must not be set forth in such fashion as to obscure the required information",
    measures: "pushes to another document, per thousand words",
    good: 0.5, bad: 8,
    note: "⚠ THE PARAMETER 421(a) WAS WRITTEN FOR, and the one nobody " +
          "measures. A sentence can be short and clear and still not tell you " +
          "anything, because what it says is that the terms are in Exhibit 4.1 " +
          "\u2014 a separate file, which itself points at the Warrant Agreement. " +
          "Counted: exhibit citations, 'incorporated by reference', 'filed " +
          "herewith', 'attached hereto', and every reference to a named " +
          "agreement the reader does not have in front of him. Sentence " +
          "length measures how hard a paragraph is to read. This measures how " +
          "many documents you must hold at once to read it at all." },

  { key: "repetition", weight: 5,
    rule: "421(b)",
    says: "avoid disclosure repeated in different sections that lengthens " +
          "the document without improving it",
    measures: "share of sentences appearing more than once",
    good: 0.01, bad: 0.20,
    note: "Measured on sentences of eight words or more, so boilerplate " +
          "headings do not count as repetition." }
];

/* ⚠ HIS BANDS, 10 Sep 2026, INCLUDING THE LAST ONE. "Word salad" is not a
   joke at the bottom of a scale — it is the honest name for a document a
   capable adult cannot read once and understand, and the rule the filer was
   bound by says it should not exist. */
/* ⚠ ONE PLAIN SENTENCE EACH, AND NOTHING ELSE. His instruction, 10 Sep 2026.
   These are the only words most people will ever read of this whole method,
   so every one of them is about WHAT THE READER CAN DO with the document —
   not about the company, not about the rule, not about us.

   ⚠ "WORD SALAD" IS HIS BAND NAME AND IT IS NOT A JOKE AT THE BOTTOM OF A
   SCALE. It is the honest name for a document a capable adult cannot read
   once and understand, written by people the rule already bound. */
const BANDS = [
  { at: 90, grade: "A", light: "GREEN",  hex: "#2E7D32",
    says: "You can read this once and know what you are buying." },
  { at: 80, grade: "B", light: "LIME",   hex: "#7CB342",
    says: "You can read this, but you will work for it." },
  /* ⚠ PURPLE, NOT ANY SHADE OF GREEN OR GOLD. His call, 10 Sep 2026. A C
     means read it twice, and a warm colour on that row reads as permission.
     Purple sits outside the go/slow/stop run entirely, which is the point —
     it does not say safe and it does not say danger. It says stop and think. */
  { at: 70, grade: "C", light: "PURPLE", hex: "#7E57C2",
    says: "You will need to read this twice." },
  { at: 60, grade: "D", light: "ORANGE", hex: "#E07B23",
    says: "You will have to dig for the parts that matter." },
  /* ⚠ HIS WORDS, 10 Sep 2026: "RED LIGHT CAUTION. This one might kill your
     day." The scale escalates in KIND rather than in adjectives — once, with
     effort, twice, dig, this will cost you, this is impossible — and F is
     where it stops being about effort and starts being about what it takes
     out of you. */
  { at: 45, grade: "F", light: "RED",    hex: "#D32F2F",
    says: "RED LIGHT CAUTION. This one might kill your day." },
  /* ⚠ BLACK, NOT A DARKER RED. Word salad is not "worse than F" on the same
     dial; it is off the end of it, and the colour should say so at a glance
     from across a room. */
  { at: 0,  grade: "WORD SALAD", light: "BLACK", hex: "#1A1A1A",
    says: "This cannot be read." }
];


/* ============================================================
   THE CAUTION  —  his ruling, 10 Sep 2026

   ⚠ IT IS ABOUT THE READER, NOT ABOUT THE SECURITY, AND THAT IS
   THE WHOLE OF WHY IT IS SAYABLE.

   "Do not buy this stock" is advice on a named company from a
   publisher who holds positions. It would make every disclosure
   on the site look like decoration.

   "Do not buy what you cannot understand" is the oldest rule in
   the business. It is a statement about the person reading, it
   names no price and no direction, and it follows from a
   measurement anyone can reproduce.

   ⚠ AND "UNCLEAR" IS MEASURED, NOT ALLEGED. Every word in the
   caution traces to a number above it. What is still never said
   is WHY a document is written this way — intent cannot be read
   off a page, and the count is the finding.
   ============================================================ */
const CAUTIONS = [
  { at: 60, level: null },              /* D and better: no caution */
  { at: 45, level: "READ IT TWICE",
    caution: "This document is hard going by the SEC's own standards. Do not " +
             "buy what you have not understood.",
    because: "It scores below the line on parameters the Commission named " +
             "itself in 17 CFR 230.421." },
  { at: 0,  level: "DO NOT BUY WHAT YOU CANNOT READ",
    caution: "By the SEC's own plain English standards this document is not " +
             "readable once through. Nobody should put money into something " +
             "he has not understood, and on this document that is a hard " +
             "thing to do.",
    because: "Every parameter the Commission named is at the wrong end. That " +
             "is unclear reporting, measured against a published method, and " +
             "it is fair to say so.",
    and_what_it_is_not:
      "⚠ This is about the DOCUMENT and about the READER. It is not a view on " +
      "the company, the business or the price, and it is not a recommendation " +
      "to buy or sell anything. Why a document is written this way is not " +
      "measured here and is never asserted." }
];

/* ============================================================
   THE MARK

   ⚠ SHIPPED FROM HERE, NOT DRAWN ON EACH PAGE. Three sites will
   show these grades. A mark redrawn in three places is a mark
   that ends up three slightly different shapes, and the one
   people remember is the one that is always identical.

   ⚠ WORD SALAD GETS THE PROHIBITION SIGN — his call, 10 Sep
   2026: a red circle with a red X through it. Everything else
   gets a filled dot in its own colour. The sign is RED even
   though the label is black, because the label is a colour on a
   word and the sign is a warning to somebody walking past.

   Inline SVG, no external file, sized to the text it sits beside.
   ============================================================ */
function markFor(band) {
  if (band.grade === "WORD SALAD")
    return '<svg viewBox="0 0 24 24" width="1em" height="1em" role="img" ' +
           'aria-label="Cannot be read" style="vertical-align:-0.125em">' +
           '<circle cx="12" cy="12" r="9.5" fill="none" stroke="#D32F2F" ' +
           'stroke-width="2.5"/>' +
           '<path d="M8 8 L16 16 M16 8 L8 16" stroke="#D32F2F" ' +
           'stroke-width="2.5" stroke-linecap="round"/></svg>';
  return '<svg viewBox="0 0 24 24" width="1em" height="1em" role="img" ' +
         'aria-label="' + band.grade + '" style="vertical-align:-0.125em">' +
         '<circle cx="12" cy="12" r="8" fill="' + band.hex + '"/></svg>';
}

/* ⚠ ONE PLACE WHERE A SCORE BECOMES WORDS AND A COLOUR. A stored grade came
   back with the number and no sentence, because the words were built only on
   the path that graded a document fresh — so the same filing read one way
   when it was graded and another way when it was looked up. */
function bandFor(score) {
  const b = BANDS.find(x => score >= x.at) || BANDS[BANDS.length - 1];
  /* ⚠ EVERY BAND CARRIES ITS OWN COLOUR NOW, so there is no rule here
     computing one from the score. Two places deciding a colour is how a page
     ends up amber while the letter beside it says F. */
  return { grade: b.grade, says: b.says, light: b.light, hex: b.hex,
           mark: markFor(b) };
}

function cautionFor(score) {
  for (const c of CAUTIONS) if (score >= c.at) return c.level ? c : null;
  return null;
}

/* the words counted, published so anyone can check the count */
const LEGALESE = ["hereinafter","hereinabove","hereinbelow","heretofore","hereunder",
  "herein","hereof","hereto","herewith","thereto","therefrom","therewith","thereof",
  "thereunder","thereafter","wherein","whereof","whereas","aforementioned","aforesaid",
  "notwithstanding","pursuant to","in accordance with the provisions of","mutatis mutandis",
  "inter alia","ipso facto","prima facie","said agreement","such holder","such shares",
  "forthwith","in no event shall","provided further that","subject to the foregoing"];

const XREF = ["as described in","as set forth in","as defined in","see section",
  "as provided in","in accordance with section","subject to section","pursuant to section",
  "as described under","as set forth under","as more fully described","as discussed in",
  "referred to in","described above","described below","set forth above","set forth below"];

/* ⚠ A PUSH IS ANYTHING THAT SENDS THE READER TO A DIFFERENT DOCUMENT.
   Distinct from a cross-reference, which sends him to another part of THIS
   one. Both obscure; leaving the building is worse. */
const PUSHES = ["incorporated by reference","incorporated herein by reference",
  "filed herewith","filed as exhibit","attached hereto as exhibit","annexed hereto",
  "exhibit 4.","exhibit 10.","exhibit 3.","exhibit 99.","exhibit 5.",
  "the warrant agreement","the securities purchase agreement",
  "the registration rights agreement","the placement agency agreement",
  "the underwriting agreement","the form of warrant","the form of prefunded warrant",
  "the form of pre-funded warrant","the indenture","the certificate of designation",
  "a copy of which","copies of which","the full text of","which is filed as",
  "see the prospectus supplement","the accompanying prospectus","the base prospectus",
  "our annual report on form 10-k","our quarterly report on form 10-q",
  "reference is made to","qualified in its entirety by reference"];

const NEGATIVES = ["not","no","never","neither","nor","without","unless","except",
  "cannot","shall not","may not","will not","fails to","absent"];

export default {
  async fetch(req, env) {
    const q = new URL(req.url).searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    await setup(env);
    try {
      const a = q.get("action") || "";
      if (!a) {
        if (q.get("logo")) return await serveLogo(env, q.get("logo"));
        if (q.get("logos")) return json(await heldLogos(env), H);
        if (q.get("method")) return json(method(), H);
        if (q.get("grade"))  return json(await stored(env, q.get("grade")), H);
        if (q.get("ticker")) return json(await profile(env, q.get("ticker")), H);
        if (q.get("worst"))  return json(await worst(env, +(q.get("n") || 25)), H);
      }

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      if (a === "logo")     return json(await putLogo(env, q, req), H);
      if (a === "droplogo") return json(await dropLogo(env, q), H);
      if (a === "grade") return json(await gradeOne(env, q.get("accession")), H);
      if (a === "text")  return json(gradeText(await req.text()), H);
      if (a === "batch") return json(await batch(env, +(q.get("n") || 10)), H);
      if (a === "split") return json(await split(env), H);
      if (a === "company") return json(await company(env, q.get("ticker"),
                                    +(q.get("n") || 8), q.get("force")), H);
      return json(await stats(env), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS logos (
       id TEXT PRIMARY KEY,        /* company:0000894158  |  firm:marcum-llp */
       kind TEXT,                  /* company | auditor | counsel | agent */
       name TEXT,
       key TEXT, content_type TEXT, bytes INTEGER,
       source TEXT,                /* where it came from, in his words */
       added TEXT DEFAULT (datetime('now')))`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS filing_grades (
       accession TEXT PRIMARY KEY,
       ticker TEXT, company TEXT, form TEXT, filed_on TEXT,
       score REAL, grade TEXT, words INTEGER, sentences INTEGER,
       detail TEXT, graded TEXT DEFAULT (datetime('now')))`).run();
}

function method() {
  return { ok:true, build: BUILD,
    what_this_is:
      "Every filing measured against the SEC's own plain English rule, the " +
      "same way, and the method printed so anyone can check it.",
    the_rule: {
      "230.421(a)": "must not be set forth in such fashion as to obscure any " +
                    "of the required information",
      "230.421(b)": "clear, concise and understandable; short explanatory " +
                    "sentences, descriptive headings, no legalese, no " +
                    "disclosure repeated to no purpose",
      "230.421(d)": "the cover page, summary and risk factors MUST be in plain " +
                    "English — short sentences, everyday words, active voice, " +
                    "no legal jargon, no multiple negatives",
      release: "Securities Act Release 33-7497, 28 January 1998"
    },
    parameters: PARAMS,
    bands: BANDS.map(b => Object.assign({}, b, { mark: markFor(b) })),
    cautions: CAUTIONS,
    what_the_caution_is:
      "A statement about the READER, not about the security. 'Do not buy what " +
      "you cannot understand' names no price and no direction and follows " +
      "from a measurement anyone can reproduce. WHY a document is written " +
      "this way is not measured here and is never asserted.",
    words_counted: { legalese: LEGALESE, cross_references: XREF,
                     negatives: NEGATIVES, pushes_to_another_document: PUSHES },
    the_limit:
      "⚠ A GRADE IS A MEASUREMENT, NEVER A FINDING THAT A RULE WAS BROKEN. " +
      "421(d)'s hard requirement covers the cover page, summary and risk " +
      "factors. Warrant mechanics sit in the body, where 421(a) and (b) apply " +
      "but (d) does not. Whether any filing violates anything is the " +
      "Commission's to decide and nobody else's.",
    reproducing_it:
      "POST the text of any document to ?action=text and the same numbers come " +
      "back. Nothing depends on who filed it." };
}

/* ============================================================
   THE MEASUREMENT
   ============================================================ */
function sentencesOf(text) {
  /* ⚠ ABBREVIATIONS ARE NOT SENTENCE ENDS. "Inc." and "No." and "U.S." would
     otherwise chop one sentence into four and make every filing look shorter
     and simpler than it is — which would flatter exactly the documents this
     is meant to measure. */
  const ABBR = /\b(Inc|Ltd|Corp|Co|Plc|LLC|L\.P|LP|No|Nos|Mr|Mrs|Ms|Dr|St|vs|etc|approx|Sec|Art|Fig|U\.S|e\.g|i\.e|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.$/i;
  const out = [];
  let cur = "";
  for (const piece of String(text || "").split(/(?<=[.!?])\s+/)) {
    cur = cur ? cur + " " + piece : piece;
    const head = cur.trim().split(/\s+/).pop() || "";
    if (ABBR.test(head)) continue;         /* an abbreviation — keep going */
    if (/\b[A-Z]\.$/.test(head)) continue; /* a single initial */
    out.push(cur.trim());
    cur = "";
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(x => x.split(/\s+/).length > 2);
}

function countPhrases(lower, list) {
  let n = 0;
  for (const p of list) {
    let at = 0;
    for (;;) {
      const i = lower.indexOf(p, at);
      if (i < 0) break;
      n++; at = i + p.length;
    }
  }
  return n;
}

function gradeText(raw, about) {
  const text = String(raw || "")
    .replace(/\r/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (text.split(/\s+/).length < 120)
    return { ok:false, build: BUILD, error:"too short to grade",
      note:"Under a hundred and twenty words there is nothing to measure." };

  const lower = text.toLowerCase();
  const sents = sentencesOf(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  const per1k = n => (n / words) * 1000;

  const lengths = sents.map(s => s.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const longShare = lengths.filter(n => n > 45).length / (lengths.length || 1);

  /* ⚠ A DEFINED TERM IS A CAPITALISED PHRASE THAT IS NOT A PROPER NOUN AND
     NOT A SENTENCE START. Counting every capital would count the company's
     own name a hundred times and grade a filing on how often it says who it
     is. Counted here: the quoted definitions the document itself sets up. */
  /* ⚠ A CAPITALISED WORD IN THE MIDDLE OF A SENTENCE IS A DEFINED TERM, or
     close enough to one to measure. Sentence-initial words are skipped, and
     so is a short stoplist of things that are capitalised for ordinary
     reasons — months, the Commission, the Acts. Everything else that arrives
     capitalised mid-sentence is a word the reader has to carry. */
  const NOT_A_TERM = new Set(["I","A","The","U","S","US","USA","SEC","Commission",
    "Securities","Exchange","Act","Nasdaq","NYSE","January","February","March",
    "April","May","June","July","August","September","October","November",
    "December","Monday","Tuesday","Wednesday","Thursday","Friday","Inc","Corp",
    "LLC","Ltd","Company","Delaware","Nevada","New","York"]);
  let definedHits = 0;
  for (const s2 of sents) {
    const toks = s2.split(/\s+/);
    for (let i = 1; i < toks.length; i++) {   /* from 1: skip the sentence start */
      const w = toks[i].replace(/[^A-Za-z]/g, "");
      if (w.length < 2) continue;
      if (!/^[A-Z][a-z]+$/.test(w)) continue;
      if (NOT_A_TERM.has(w)) continue;
      definedHits++;
    }
  }

  let passive = 0, negatives = 0;
  const PASSIVE = /\b(is|are|was|were|be|been|being|shall be|may be|will be|has been|have been|had been)\s+(?:\w+ly\s+)?([a-z]+(?:ed|en|wn|ne|de|lt|pt|ung|ought))\b/;
  for (const s of sents) {
    const l = s.toLowerCase();
    if (PASSIVE.test(l)) passive++;
    let neg = 0;
    for (const n of NEGATIVES) {
      const re = new RegExp("\\b" + n.replace(/ /g, "\\s+") + "\\b", "g");
      const m = l.match(re);
      if (m) neg += m.length;
    }
    if (neg >= 2) negatives++;
  }

  /* repetition, on sentences long enough to be real disclosure */
  const seen = {}; let repeated = 0, considered = 0;
  for (const s of sents) {
    if (s.split(/\s+/).length < 8) continue;
    considered++;
    const k = s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
    if (seen[k]) repeated++; else seen[k] = 1;
  }

  const raw_values = {
    sentence_length:    +avg.toFixed(1),
    long_sentences:     +longShare.toFixed(3),
    legalese:           +per1k(countPhrases(lower, LEGALESE)).toFixed(2),
    cross_references:   +per1k(countPhrases(lower, XREF)).toFixed(2),
    defined_terms:      +per1k(definedHits).toFixed(2),
    passive_voice:      +(passive / (sents.length || 1)).toFixed(3),
    multiple_negatives: +(negatives / (sents.length || 1)).toFixed(3),
    exhibit_depth:      +per1k(
                          countPhrases(lower, PUSHES) +
                          /* every numbered exhibit citation, however written */
                          (text.match(/\bExhibit\s+\d+(?:\.\d+)?[A-Za-z]?\b/gi) || []).length
                        ).toFixed(2),
    repetition:         +(repeated / (considered || 1)).toFixed(3)
  };

  /* ⚠ EACH PARAMETER SCORES 0 TO 100 BETWEEN ITS OWN GOOD AND BAD LINE, then
     the weights are applied. One catastrophic parameter cannot be hidden by
     seven good ones, because the worst single score is reported beside the
     total and the bands below account for it. */
  const marks = {};
  let total = 0, weightSum = 0, worstOne = { key: null, score: 101 };
  for (const p of PARAMS) {
    const v = raw_values[p.key];
    let sc;
    if (p.bad > p.good) sc = 100 * (1 - (v - p.good) / (p.bad - p.good));
    else                sc = 100 * (1 - (p.good - v) / (p.good - p.bad));
    sc = Math.max(0, Math.min(100, sc));
    marks[p.key] = { value: v, score: +sc.toFixed(1), weight: p.weight,
                     rule: p.rule, measures: p.measures };
    total += sc * p.weight; weightSum += p.weight;
    if (sc < worstOne.score) worstOne = { key: p.key, score: +sc.toFixed(1) };
  }
  const score = +(total / weightSum).toFixed(1);

  const band = bandFor(score);

  const flag = cautionFor(score);

  return { ok:true, build: BUILD,
    about: about || undefined,
    grade: band.grade, score, says: band.says,
    /* ⚠ A COLOUR A PAGE CAN USE WITHOUT PARSING THE SENTENCE. Set on the
       bands themselves so the words and the colour can never disagree. */
    light: band.light, hex: band.hex, mark: band.mark,
    /* ⚠ THE CAUTION TRAVELS WITH THE GRADE, so a page cannot show one without
       the other, and cannot show either without the method behind it. */
    caution: flag ? {
      level: flag.level, says: flag.caution, because: flag.because,
      and_what_it_is_not: flag.and_what_it_is_not ||
        "About the document and the reader. Not a view on the company, the " +
        "business or the price."
    } : null,
    words, sentences: sents.length,
    worst_parameter: worstOne,
    marks,
    the_limit:
      "A measurement against 17 CFR 230.421, not a finding that any rule was " +
      "broken. Nothing here says this company or any person did anything wrong.",
    method: "/?method=1" };
}

/* ============================================================
   GRADING A REAL FILING
   ============================================================ */
async function gradeOne(env, accession) {
  if (!accession) throw new Error("an accession number, please");

  const f = await env.OVERHANG.prepare(
    "SELECT * FROM v_wire_filings WHERE accession = ? LIMIT 1").bind(accession).first();
  if (!f) return { ok:false, build: BUILD, error:"that filing is not on the wire" };

  const doc = await fetchDoc(f.cik, accession, f.form);
  if (!doc.ok) return { ok:false, build: BUILD, error: doc.error, tried: doc.tried };

  const g = gradeText(doc.text, {
    accession, ticker: f.ticker, company: f.company, form: f.form, filed_on: f.filed_on,
    /* ⚠ WHICH FILE WAS GRADED, ON THE GRADE. Without it there is no way to
       check a number afterwards, and no way to spot a stub. */
    document: doc.name, document_words: doc.words,
    /* ⚠ ON THE GRADE, NOT ONLY IN A LOG. A short prospectus supplement scores
       badly for a reason a reader is entitled to know. */
    short_for_form: doc.short_for_form || undefined,
    floor_for_form: doc.short_for_form ? doc.floor : undefined });
  if (!g.ok) return g;

  await env.OVERHANG.prepare(
    `INSERT INTO filing_grades (accession, ticker, company, form, filed_on,
       score, grade, words, sentences, detail)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(accession) DO UPDATE SET score=excluded.score,
       grade=excluded.grade, words=excluded.words, sentences=excluded.sentences,
       detail=excluded.detail, graded=datetime('now')`)
    .bind(accession, f.ticker || null, f.company || null, f.form || null,
          f.filed_on || null, g.score, g.grade, g.words, g.sentences,
          JSON.stringify(g.marks)).run();

  return g;
}

/* ⚠ THE EXHIBIT FIRST, THEN THE FILING. Same rule as the read agent: the 8-K
   is the company's description of its own document; the exhibit is the
   document. And the index page is skipped by NAME whatever its extension —
   EDGAR calls them "-index.html", and reading the table of contents and
   grading that was a real fault on the read agent. */
/* ⚠ HOW SHORT A REAL DOCUMENT CAN BE, BY FORM. A single floor cannot work
   across all of them: an 8-K really is a page, and a 10-Q never is. TOVX was
   graded four times on documents of 535, 535, 455 and 745 words — a 10-Q that
   is 535 words is not a 10-Q, it is a cover stub, and grading it produced a
   number that measured nothing. */
function floorFor(form) {
  const f = String(form || "").toUpperCase();
  if (/^(10-K|20-F|40-F)/.test(f)) return 8000;
  if (/^(10-Q)/.test(f))           return 4000;
  if (/^(S-1|S-3|F-1|424B|POS AM|DEF 14A)/.test(f)) return 3000;
  return 400;                       /* an 8-K, an exhibit, a press release */
}

async function fetchDoc(cik, accession, form) {
  const bare = String(accession).replace(/-/g, "");
  const c = String(cik || "").replace(/\D/g, "");
  const base = "https://www.sec.gov/Archives/edgar/data/" + c + "/" + bare;
  const tried = [];
  const floor = floorFor(form);
  try {
    const idx = await fetch(base + "/index.json", { headers: { "User-Agent": UA } });
    tried.push(base + "/index.json");
    if (!idx.ok) return { ok:false, error:"EDGAR " + idx.status, tried };
    const j = await idx.json();

    /* ⚠ THE LARGEST DOCUMENT, NOT THE FIRST ONE OVER A LINE. The old picker
       put exhibits first and took whichever cleared 400 words — so a cover
       page won over the filing sitting next to it in the same directory.
       index.json carries the byte size of every file, so the real document
       can be chosen before a single one is fetched. */
    const items = ((j.directory && j.directory.item) || [])
      .filter(x => /\.(htm|html|txt)$/i.test(x.name || ""))
      .filter(x => !/-index|index\.|R\d+\.htm|FilingSummary|\.xsd$/i.test(x.name || ""))
      .map(x => ({ name: x.name, size: Number(x.size) || 0 }))
      .sort((a, b) => b.size - a.size);

    if (!items.length) return { ok:false, error:"no readable document in that filing", tried };

    let best = null;
    for (const it of items.slice(0, 4)) {
      const r = await fetch(base + "/" + it.name, { headers: { "User-Agent": UA } });
      tried.push(base + "/" + it.name);
      if (!r.ok) continue;
      const text = strip(await r.text());
      const words = text.split(/\s+/).filter(Boolean).length;
      if (!best || words > best.words) best = { text, name: it.name, words };
      if (words >= floor) return { ok:true, text, name: it.name, words, floor };
    }

    /* ⚠ THE FLOOR FLAGS. IT DOES NOT REFUSE. Four TOVX prospectus supplements
       were refused at 924 and 1,671 words — and a 424B5 CAN be that short. It
       is a pricing supplement that pushes the whole of the offering into the
       base prospectus by reference.

       Refusing it loses the data AND HIDES THE FINDING: a 924-word prospectus
       supplement is the purest case of exhibit depth there is, and that is a
       parameter built to catch exactly this. So it is graded, and the grade
       carries `short_for_form` so a table can footnote it and a reader can
       see why the number is what it is. */
    if (best && best.words >= 150)
      return { ok:true, text: best.text, name: best.name, words: best.words,
               floor, short_for_form: true };

    /* under a hundred and fifty words there is genuinely nothing to measure */
    return { ok:false, tried,
      error: "nothing in that filing is long enough to measure — longest was " +
             (best ? best.words : 0) + " words",
      longest: best ? best.name : null, words: best ? best.words : 0, floor };
  } catch (e) {
    return { ok:false, error:String(e).slice(0, 160), tried };
  }
}

/* ⚠ THE TAGS COME OUT BEFORE ANYTHING IS COUNTED. Left in, every attribute
   would be counted as words and every filing would grade as unreadable —
   which would be a true statement about HTML and a false one about the
   document. */
function strip(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ").replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

async function batch(env, n) {
  n = Math.max(1, Math.min(25, n || 10));
  const r = await env.OVERHANG.prepare(
    `SELECT f.accession FROM v_wire_filings f
       LEFT JOIN filing_grades g ON g.accession = f.accession
      WHERE g.accession IS NULL AND f.heavy > 0
      ORDER BY f.filed_on DESC LIMIT ?`).bind(n).all();
  const out = [];
  for (const x of (r.results || [])) {
    const g = await gradeOne(env, x.accession);
    out.push({ accession: x.accession, grade: g.grade || null,
               score: g.score || null, error: g.error || undefined });
    await sleep(250);   /* the SEC's ten-a-second ceiling */
  }
  return { ok:true, build: BUILD, graded: out };
}

async function stored(env, accession) {
  const r = await env.OVERHANG.prepare(
    "SELECT * FROM filing_grades WHERE accession = ?").bind(accession).first();
  if (!r) return { ok:false, build: BUILD, error:"not graded yet" };
  const flag = cautionFor(r.score);
  const band = bandFor(r.score);
  return { ok:true, build: BUILD, accession: r.accession, ticker: r.ticker,
    company: r.company, form: r.form, filed_on: r.filed_on,
    grade: r.grade, score: r.score,
    says: band.says, light: band.light, hex: band.hex, mark: band.mark,
    caution: flag ? { level: flag.level, says: flag.caution, because: flag.because,
      and_what_it_is_not: flag.and_what_it_is_not ||
        "About the document and the reader. Not a view on the company, the " +
        "business or the price." } : null,
    words: r.words, sentences: r.sentences,
    marks: JSON.parse(r.detail || "{}"), graded: r.graded, method: "/?method=1" };
}

async function worst(env, n) {
  const r = await env.OVERHANG.prepare(
    `SELECT accession, ticker, company, form, filed_on, grade, score, words
       FROM filing_grades ORDER BY score ASC LIMIT ?`).bind(Math.min(200, n)).all();
  return { ok:true, build: BUILD, rows: r.results || [],
    note:"A measurement against 17 CFR 230.421. Nothing here says any company " +
         "or any person did anything wrong." };
}

/* ⚠ WHICH FORMS 421(d) ACTUALLY REACHES. Declared here because both the
   company profile and the split use it, and two copies of this list is how
   the two of them end up disagreeing. */
const COVERED = /^(424B|S-1|S-3|F-1|POS AM|10-K|20-F)/i;

/* ============================================================
   A WHOLE COMPANY

   ⚠ THE GRADE HAS TO SHOW ON EVERY COMPANY SEARCHED ON THE WIRE,
   so it has to be askable by ticker rather than by accession.
   Nobody searching a company has an accession number.

   ⚠ AND THE COMPANY'S GRADE IS NOT ONE NUMBER. A filer whose
   prospectus reads plainly and whose exhibits do not has TWO
   grades, and flattening them into an average hides the finding.
   So a profile carries both sides and the worst single document.
   ============================================================ */
async function company(env, ticker, n, force) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };
  n = Math.max(1, Math.min(25, n || 8));

  /* ⚠ FORCE WAS BEING IGNORED HERE AND IT MATTERED. This only ever selected
     filings with NO grade, so `&force=1` added new ones and left every old
     number exactly as it was — including four graded off a cover stub before
     the picker was fixed. A re-run that silently changes nothing is worse
     than one that refuses. */
  const r = await env.OVERHANG.prepare(
    force
      ? `SELECT f.accession FROM v_wire_filings f
          WHERE UPPER(f.ticker) = ? ORDER BY f.filed_on DESC LIMIT ?`
      : `SELECT f.accession FROM v_wire_filings f
           LEFT JOIN filing_grades g ON g.accession = f.accession
          WHERE UPPER(f.ticker) = ? AND g.accession IS NULL
          ORDER BY f.filed_on DESC LIMIT ?`).bind(tk, n).all();

  const did = [];
  for (const x of (r.results || [])) {
    const g = await gradeOne(env, x.accession, force);
    did.push({ accession: x.accession, grade: g.grade || null,
               score: g.score || null, error: g.error || undefined });
    await sleep(250);
  }
  const p = await profile(env, tk);
  return { ok:true, build: BUILD, ticker: tk, newly_graded: did, profile: p };
}

/* what is already known about a company — free, and what the wire shows */
async function profile(env, ticker) {
  const tk = String(ticker || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!tk) return { ok:false, build: BUILD, error:"a ticker, please" };

  const rows = ((await env.OVERHANG.prepare(
    `SELECT accession, form, filed_on, grade, score, words
       FROM filing_grades WHERE UPPER(ticker) = ?
      ORDER BY filed_on DESC, score`).bind(tk).all()).results || [])
    .map(x => Object.assign({}, x, { light: bandFor(x.score).light,
                                    hex: bandFor(x.score).hex }));

  if (!rows.length) return { ok:true, build: BUILD, ticker: tk, graded: 0,
    note:"Nothing graded for that company yet." };

  const covered = rows.filter(x => COVERED.test(String(x.form || "")));
  const other   = rows.filter(x => !COVERED.test(String(x.form || "")));
  const avg = a => a.length ? +(a.reduce((n, x) => n + x.score, 0) / a.length).toFixed(1) : null;

  const worst = rows.slice().sort((a, b) => a.score - b.score)[0];
  const wf = cautionFor(worst.score);

  /* ⚠ THE HEADLINE IS THE WORST DOCUMENT, NOT THE AVERAGE. A holder is not
     exposed to the average of what a company filed. He is exposed to the one
     that decides what happens to his shares, and that is usually the worst
     one on the list. */
  return { ok:true, build: BUILD, ticker: tk,
    graded: rows.length,
    worst_document: { accession: worst.accession, form: worst.form,
      filed_on: worst.filed_on, grade: worst.grade, score: worst.score,
      says: bandFor(worst.score).says, light: bandFor(worst.score).light,
      hex: bandFor(worst.score).hex, mark: bandFor(worst.score).mark },
    caution: wf ? { level: wf.level, says: wf.caution, because: wf.because,
      and_what_it_is_not: wf.and_what_it_is_not ||
        "About the document and the reader. Not a view on the company, the " +
        "business or the price." } : null,
    where_the_rule_reaches: {
      prospectuses_and_reports: { filings: covered.length, average: avg(covered) },
      exhibits_and_agreements:  { filings: other.length,   average: avg(other) }
    },
    filings: rows,
    what_this_is:
      "Every filing of this company we have graded against 17 CFR 230.421, " +
      "the SEC's own plain English rule.",
    not_an_accusation:
      "A measurement of how a document is written. Not a finding that any rule " +
      "was broken, and not a view on the company or its price.",
    method: "/?method=1" };
}

/* ============================================================
   THE SPLIT BY FORM

   ⚠ THE ONE THAT TURNS A LIST OF GRADES INTO A FINDING. Grading
   prospectuses and exhibits in one pool mixes documents the rule
   COVERS with documents it does not, and "twenty-one of
   twenty-five failed" then means two different things at once.

   421(d) is mandatory on the prospectus. It does not reach an
   exhibit. So the question worth answering is whether the same
   filers write differently depending on which side of that line
   they are on — and that is a comparison, not an accusation.
   ============================================================ */
async function split(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT form, COUNT(*) filings, ROUND(AVG(score),1) average,
            MIN(score) worst, MAX(score) best,
            SUM(CASE WHEN grade = 'WORD SALAD' THEN 1 ELSE 0 END) word_salad
       FROM filing_grades WHERE form IS NOT NULL
      GROUP BY form ORDER BY average`).all();
  const rows = r.results || [];

  const side = { covered: [], not_covered: [] };
  for (const x of rows) (COVERED.test(x.form) ? side.covered : side.not_covered).push(x);

  const mean = a => a.length
    ? +(a.reduce((n, x) => n + x.average * x.filings, 0) /
        a.reduce((n, x) => n + x.filings, 0)).toFixed(1) : null;

  return { ok:true, build: BUILD,
    by_form: rows,
    where_the_rule_reaches: {
      prospectuses_and_reports: {
        forms: side.covered.map(x => x.form),
        filings: side.covered.reduce((n, x) => n + x.filings, 0),
        average: mean(side.covered),
        note: "421(d) is MANDATORY here — cover page, summary, risk factors." },
      exhibits_and_agreements: {
        forms: side.not_covered.map(x => x.form),
        filings: side.not_covered.reduce((n, x) => n + x.filings, 0),
        average: mean(side.not_covered),
        note: "421(d) does not reach here. 421(a) and (b) still do." }
    },
    the_question_this_answers:
      "Whether the same filers write differently depending on which side of " +
      "the rule a document falls on. It is a comparison of measurements. It " +
      "is not a statement about anyone's intention.",
    caveat:
      "Sample is whatever has been graded, which is drawn from filings " +
      "carrying heavy warrant language. It is not a sample of filings " +
      "generally and must not be described as one.",
    method: "/?method=1" };
}

async function stats(env) {
  const a = await env.OVERHANG.prepare(
    "SELECT COUNT(*) graded, ROUND(AVG(score),1) average FROM filing_grades").first();
  const b = await env.OVERHANG.prepare(
    "SELECT grade, COUNT(*) n FROM filing_grades GROUP BY grade").all();
  return { ok:true, build: BUILD, graded: a, by_grade: b.results || [] };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}


/* ============================================================================
   THE LOGOS
   ============================================================================ */

const LOGO_MAX = 512 * 1024;   /* half a megabyte — a logo, not a photograph */
const KINDS = ["company", "auditor", "counsel", "agent"];

/* ⚠ THE TYPE COMES FROM THE FILE, NOT THE UPLOAD. A caller controls the
   Content-Type header completely; he does not control the first bytes of what
   he sends. And SVG is refused outright — see the header. */
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

/* ⚠ THE ID IS BUILT HERE AND NEVER TAKEN FROM A FILENAME. A name like
   "../../x" or one carrying a second extension must not be able to decide
   where anything lands. */
function logoId(kind, id) {
  const k = String(kind || "").toLowerCase().trim();
  if (KINDS.indexOf(k) < 0) return null;
  const raw = String(id || "").toLowerCase().trim();
  if (!raw) return null;
  const slug = (k === "company")
    ? raw.replace(/\D/g, "").padStart(10, "0")          /* a CIK is digits */
    : raw.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  if (!slug || slug === "0000000000") return null;
  return k + ":" + slug;
}

async function putLogo(env, q, req) {
  if (!env.IMG) return { ok:false, build: BUILD,
    error:"no IMG binding — bind the R2 bucket companies-logos as IMG" };
  if (req.method !== "POST" && req.method !== "PUT")
    return { ok:false, build: BUILD, error:"send the image as the body of a POST" };

  const id = logoId(q.get("kind"), q.get("id"));
  if (!id) return { ok:false, build: BUILD,
    error:"kind must be company, auditor, counsel or agent, and id must be a " +
          "CIK for a company or a firm name for the rest" };

  const bytes = await req.arrayBuffer();
  if (!bytes || !bytes.byteLength)
    return { ok:false, build: BUILD, error:"nothing was sent" };
  if (bytes.byteLength > LOGO_MAX)
    return { ok:false, build: BUILD, error:"too large",
      sent: bytes.byteLength, limit: LOGO_MAX,
      note:"Half a megabyte. A logo does not need more." };

  const kind = sniffImage(bytes);
  if (!kind) return { ok:false, build: BUILD,
    error:"that is not a JPEG, a PNG or a WebP",
    note:"SVG is refused on purpose: it is XML, XML can carry script, and a " +
         "browser runs it. Send a PNG." };

  const key = id.replace(":", "/") + "." + kind.ext;

  /* an earlier logo in another format would otherwise be orphaned */
  const had = await env.OVERHANG.prepare(
    "SELECT key FROM logos WHERE id = ?").bind(id).first();
  if (had && had.key && had.key !== key) {
    try { await env.IMG.delete(had.key); } catch (e) {}
  }

  await env.IMG.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=86400" },
    customMetadata: { id } });

  await env.OVERHANG.prepare(
    `INSERT INTO logos (id, kind, name, key, content_type, bytes, source)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name,
       key=excluded.key, content_type=excluded.content_type,
       bytes=excluded.bytes, source=excluded.source, added=datetime('now')`)
    .bind(id, id.split(":")[0], (q.get("name") || "").trim() || null,
          key, kind.type, bytes.byteLength, (q.get("source") || "").trim() || null).run();

  return { ok:true, build: BUILD, id, key,
    type: kind.type, bytes: bytes.byteLength,
    shows_at: "/?logo=" + encodeURIComponent(id),
    /* ⚠ SAID ON EVERY FIRM UPLOAD, ONCE, AND NOT REPEATED ELSEWHERE. */
    note: id.startsWith("company:")
      ? "A company's logo beside a report about that company identifies who is " +
        "being written about."
      : "⚠ THIS IS A FIRM, NOT AN ISSUER. A wordmark beside a league table " +
        "implies participation in a way the firm's name in plain text does " +
        "not. The name identifies them completely. Your call, and it is " +
        "recorded here rather than argued each time." };
}

async function serveLogo(env, id) {
  const H = { "Access-Control-Allow-Origin":"*" };
  if (!env.IMG) return new Response("no image store", { status:500, headers:H });

  const want = String(id || "").trim().toLowerCase();
  const row = await env.OVERHANG.prepare(
    "SELECT key FROM logos WHERE id = ?").bind(want).first();
  if (!row || !row.key) return new Response("no logo", { status:404, headers:H });

  const obj = await env.IMG.get(row.key);
  if (!obj) return new Response("no logo", { status:404, headers:H });

  const h = new Headers(H);
  /* ⚠ THE TYPE IS SET FROM THE KEY WE CHOSE, and nosniff stops a browser
     deciding for itself that a file is something else. Between the two, a
     logo can only ever be rendered as a logo. */
  h.set("content-type", row.key.endsWith(".png") ? "image/png"
                       : row.key.endsWith(".webp") ? "image/webp" : "image/jpeg");
  h.set("x-content-type-options", "nosniff");
  h.set("content-length", String(obj.size));
  h.set("cache-control", "public, max-age=86400");
  h.set("content-disposition", "inline");
  return new Response(obj.body, { headers: h });
}

async function dropLogo(env, q) {
  const id = String(q.get("id") || "").trim().toLowerCase();
  if (!id) return { ok:false, error:"which one?" };
  const row = await env.OVERHANG.prepare(
    "SELECT key FROM logos WHERE id = ?").bind(id).first();
  if (!row) return { ok:false, error:"no such logo" };
  try { if (env.IMG) await env.IMG.delete(row.key); } catch (e) {}
  await env.OVERHANG.prepare("DELETE FROM logos WHERE id = ?").bind(id).run();
  return { ok:true, build: BUILD, removed: id };
}

/* what is held, so a page can ask once instead of per row */
async function heldLogos(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id, kind, name, bytes, added FROM logos ORDER BY kind, id").all();
  return { ok:true, build: BUILD, logos: r.results || [],
    shows_at: "/?logo=<id>",
    note:"Company logos are keyed on the CIK, padded to ten digits. Firms are " +
         "keyed on a slug of the name." };
}