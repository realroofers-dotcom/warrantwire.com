/* ============================================================================
   OPINION  —  Cloudflare Worker
   The six. This is what the $40 buys.

   Built 2026-09-10 00:05 ET · opinion-2c
   Engine is Mistral. NO META, NO DEEPSEEK — his ruling, 8 Sep 2026.

   2a APPLIES EVERYTHING 8 SEPTEMBER TAUGHT US, so none of it is relearned:
     · a BUILD STAMP in every reply — nobody debugs a version that was pasted
       but never deployed
     · Mistral returns JSON ALREADY PARSED on `response`; take it and skip the
       parsing step that failed twice
     · SALVAGE a reply cut off mid-object rather than throwing it away
     · send a TRIMMED BRIEF, not the whole stored read — a small clean object
       is read far more reliably than a large one
     · report WHAT CAME BACK when nothing is recognised, never an empty string

   ----------------------------------------------------------------------------
   THE ARCHITECTURE, AND IT IS HIS

     8K10Q is the master engine. It reads the filings and produces THE FACTS.
     The named agents give OPINIONS on top of them.
     Machine at the bottom, personalities at the surface.

   So this worker NEVER reads a filing. It reads THE READ — the stored fields
   the `read` worker already produced — and gives one character's view of them.
   That is deliberate: six opinions on the same document cost almost nothing,
   because the expensive step happened once.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
              AI         Workers AI
   SECRETS    LOG_KEY
   VARIABLE   PAY        the pay worker, for the gate

   PUBLIC
     ?who=1                              the six, their lenses, their averages
     ?opinion=1&accession=…&agent=kimmi&email=…
     ?peek=1&accession=…                 which agents have already spoken

   PRIVATE
     ?action=run&accession=…&agent=…     produce one now
     ?action=all&accession=…             all six on one filing
     ?action=list

   ----------------------------------------------------------------------------
   THE RULES THIS IS BUILT TO

   1. DISPOSITION DECIDES EMPHASIS, NEVER FACTS. Six agents on one filing must
      not contradict each other about what the document says. They differ on
      what matters, not on what is there.

   2. EVERY DISPOSITION IS PUBLISHED. That transparency is what no analyst desk
      offers. ?who=1 prints how each one reads before anybody buys.

   3. AN OPINION, NEVER ADVICE. No buy, sell, hold, or price target. The same
      opinion goes to everyone who buys it — identical text, no personalisation.
      Those two rules are what keep this a publication.

   4. NO AGENT EVER COMMENTS ON ANYBODY'S POSITION. It has not been told one and
      must never ask.

   5. THE PERSONAS ARE INVENTED. Built from a disposition and a way of reading,
      never from a real named person.
   ========================================================================== */

/* ⚠ THE BUILD STAMP, returned in every reply. If it does not say 2a, the
   worker running is not the file you pasted. */
const BUILD = "opinion-2c · 2026-09-10 00:05 ET";

const AGENTS = {
  kimmi: {
    name: "Kimmi",
    lens: "Reads for when to get out.",
    who: "Cashed out of her own business and now trades her own money. She has been " +
         "on the other side of a sale, so she reads a financing for what it says about " +
         "the seller's hurry.",
    voice: "Direct, unsentimental, short sentences. She notices timing above everything — " +
           "what was filed on what day, and what came right before it. She has no patience " +
           "for a plan that needs three more things to go right."
  },
  luis: {
    name: "Luis",
    lens: "Reads for whether the business works.",
    who: "Runs six body shops. Cash in, cash out, every week, for twenty years. He does " +
         "not care what a company says it will become.",
    voice: "Plain, practical, slightly impatient with jargon. He converts everything into " +
           "a shop-floor question: what did it cost, what came back, who got paid first. " +
           "If a company has no revenue he says so without drama and asks what it lives on."
  },
  bob: {
    name: "Bob",
    lens: "Reads downside first.",
    who: "Ivy education, former professional athlete, conservative with an edge. He has " +
         "watched people lose everything by reading only the good half of a document.",
    voice: "Measured and dry, with an occasional hard line. He starts at what happens if " +
           "this goes wrong, then works back. He respects a well-built deal even when it " +
           "is built against the holder."
  },
  lisa: {
    name: "Lisa",
    lens: "Reads how the deal was built and who got paid.",
    who: "A laid-off broker. She sat on the desk that placed paper like this, so she reads " +
         "the mechanics from the inside. It is the lens nobody else has.",
    voice: "Precise about structure and fees. She names the moving parts — the agent, the " +
           "coverage, the reset, who is left holding what — and she is interested in the " +
           "order things happened in. Never bitter, always specific."
  },
  tom: {
    name: "Tom",
    lens: "Reads for the clause.",
    who: "An attorney who hates the work and still reads the document. He has never once " +
         "accepted a summary of a contract in place of the contract.",
    voice: "Clause by clause, weary, exact. He quotes short and points at where a term " +
           "actually sits. He is the one who says the exception matters more than the rule."
  },
  ronny: {
    name: "Ronny",
    lens: "Reads momentum.",
    who: "Likes winning. He watches what a filing does to the flow — who is now able to " +
         "sell, and when.",
    voice: "Quick, energetic, interested in what happens next week rather than next year. " +
           "He is the most optimistic of the six and the most likely to say a deal is fine, " +
           "which is exactly why he is in the set."
  }
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
      if (q.get("who"))     return json(await who(env), H);
      if (q.get("peek"))    return json(await peek(env, q.get("accession")), H);
      if (q.get("opinion")) return json(await serve(env, q), H);

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "list";
      if (a === "run") return json(await produce(env, q.get("accession"), q.get("agent"), true), H);
      if (a === "all") return json(await all(env, q.get("accession")), H);
      return json(await list(env), H);
    } catch (e) {
      return json({ ok:false, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS opinions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       accession TEXT, agent TEXT, ticker TEXT,
       body TEXT,              /* the opinion, as JSON */
       made TEXT DEFAULT (datetime('now')),
       UNIQUE(accession, agent))`).run();
  /* THE BATTING AVERAGE. An opinion is dated and scored later, in public,
     the same way a human's is. Being right has to be worth something. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS opinion_marks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       opinion_id INTEGER, marked_on TEXT, outcome TEXT, note TEXT)`).run();
}

/* ============================================================
   EVERY DISPOSITION IS PUBLISHED — before anyone buys
   ============================================================ */
async function who(env) {
  const out = [];
  for (const k of Object.keys(AGENTS)) {
    const a = AGENTS[k];
    let n = 0, scored = 0;
    try {
      const r = await env.OVERHANG.prepare(
        "SELECT COUNT(*) n FROM opinions WHERE agent = ?").bind(k).first();
      n = r ? r.n : 0;
      const s = await env.OVERHANG.prepare(
        `SELECT COUNT(*) n FROM opinion_marks m
           JOIN opinions o ON o.id = m.opinion_id WHERE o.agent = ?`).bind(k).first();
      scored = s ? s.n : 0;
    } catch (e) {}
    out.push({ key:k, name:a.name, lens:a.lens, who:a.who,
               opinions_given:n, opinions_scored:scored });
  }
  return { ok:true, build: BUILD, agents: out, price_cents: 4000,
    note: "One agent, $40. Every disposition is published before you buy. " +
          "An opinion is not advice and no agent comments on anybody's position." };
}

/* ============================================================
   THE OPINION
   ============================================================ */
/* ============================================================
   WHAT THE CLAUSES ACTUALLY DO

   ⚠ ADDED AFTER LISA'S FIRST REAL OPINION, in which she wrote
   that a 4.99% ownership blocker was "a lot of control for one
   investor" and that the buyer was "taking a big stake". A
   blocker does the OPPOSITE — it CAPS the holder's position.
   She had the mechanism backwards while sounding certain, which
   is the worst thing an opinion can be.

   An agent with a view and no vocabulary is worse than no agent.
   These are what the terms do, and every agent gets them.
   ============================================================ */
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

function system(a) {
  return `You are ${a.name}. ${a.who}

HOW YOU READ: ${a.lens}
YOUR VOICE: ${a.voice}

${GLOSSARY}

You are given a READ of an SEC filing — the facts, already established by the engine.
You give YOUR VIEW of those facts. Return ONLY a JSON object, no markdown, no backticks.

{
 "agent": "${a.name}",
 "lens": "${a.lens}",
 "headline": "one sentence in your own voice",
 "what_i_look_at_first": "the one thing in this read you went to before anything else, and why",
 "what_matters_here": ["two to four points, in your voice, each tied to something in the read"],
 "what_i_would_ask": "one question you would put to the company",
 "where_i_could_be_wrong": "one honest sentence — what would change your view",
 "closing": "two or three sentences. Your take. Plain words."
}

HARD RULES — these are not style, they decide whether this is lawful:
- NEVER say buy, sell, hold, accumulate, avoid, or anything equivalent.
- NEVER give a price target or say what the price will do.
- NEVER say the company or any person broke a law, committed fraud, or is a shell,
  a front or a scam. Describe what the document says and what you make of it.
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

async function produce(env, accession, agentKey, force) {
  if (!accession) throw new Error("an accession number, please");
  const a = AGENTS[String(agentKey || "").toLowerCase()];
  if (!a) throw new Error("no such agent — try " + Object.keys(AGENTS).join(", "));
  const key = String(agentKey).toLowerCase();

  if (!force) {
    const had = await env.OVERHANG.prepare(
      "SELECT * FROM opinions WHERE accession=? AND agent=?").bind(accession, key).first();
    if (had) return { ok:true, build: BUILD, cached:true, opinion: JSON.parse(had.body) };
  }

  /* THE READ MUST EXIST FIRST. An opinion on a filing nobody read is
     exactly the thing this business exists to argue against. */
  const rd = await env.OVERHANG.prepare(
    "SELECT * FROM reads WHERE accession = ?").bind(accession).first();
  if (!rd) return { ok:false, error:"that filing has not been read yet",
                    note:"The opinion sits on top of the read. Buy the read first." };

  /* ⚠ SEND A BRIEF, NOT THE DUMP. The stored read holds long quotes, source
     filenames and empty fields, and none of it helps an agent form a view.
     A small clean object is read far more reliably than a large messy one. */
  let f = {};
  try { f = JSON.parse(rd.fields || "{}"); } catch (e) {}

  const brief = {
    company: rd.company, ticker: rd.ticker, form: rd.form, filed: rd.filed,
    headline: f.headline || "",
    money: f.money || {},
    terms: (f.the_terms || []).slice(0, 6).map(t => ({
      name: t.name, does: t.what_it_does, heavy: !!t.heavy })),
    share_count: f.share_count || {},
    checks_not_run: (f.checks_not_run || []).slice(0, 5)
  };

  const r = await env.AI.run("@cf/mistralai/mistral-small-3.1-24b-instruct", {
    max_tokens: 2000,
    messages: [
      { role:"system", content: system(a) },
      { role:"user", content:
        "THE READ. This is everything established about the filing. Form your " +
        "view of it and add no fact that is not here.\n\n" +
        JSON.stringify(brief, null, 1) }
    ]
  });

  /* Mistral on Workers AI returns the JSON already parsed on `response`.
     Confirmed by ping. Take it and skip the step that failed twice. */
  let parsed = null;
  if (r && r.response && typeof r.response === "object" && !Array.isArray(r.response))
    parsed = r.response;

  let out = "";
  if (typeof r === "string") out = r;
  else if (r && typeof r.response === "string") out = r.response;
  else if (r && typeof r.result === "string") out = r.result;
  else if (r && r.result && typeof r.result.response === "string") out = r.result.response;
  else if (r && r.choices && r.choices[0] && r.choices[0].message)
    out = r.choices[0].message.content || "";

  if (!out && !parsed)
    throw new Error("the engine returned nothing this worker recognises. Shape: " +
      JSON.stringify(r && typeof r === "object" ? Object.keys(r) : typeof r) +
      " | Raw: " + JSON.stringify(r).slice(0, 300));

  out = String(out).replace(/```json|```/g, "").trim();
  const fi = out.indexOf("{"), la = out.lastIndexOf("}");
  if (fi > 0 || la < out.length - 1) out = out.slice(fi, la + 1);

  let body, salvaged = false;
  if (parsed) body = parsed;
  else {
    try { body = JSON.parse(out); }
    catch (e) {
      body = salvage(out);
      if (!body) throw new Error("the engine did not return clean JSON: " +
                                 out.slice(0, 300));
      salvaged = true;
    }
  }

  await env.OVERHANG.prepare(
    `INSERT INTO opinions (accession, agent, ticker, body) VALUES (?,?,?,?)
     ON CONFLICT(accession, agent) DO UPDATE SET body=excluded.body, made=datetime('now')`
  ).bind(accession, key, rd.ticker || null, JSON.stringify(body)).run();

  return { ok:true, build: BUILD, cached:false, salvaged, opinion: body };
}

/* all six on one filing — the panel. Cheap, because the read happened once. */
async function all(env, accession) {
  const out = {};
  for (const k of Object.keys(AGENTS)) {
    try { out[k] = (await produce(env, accession, k, false)).opinion; }
    catch (e) { out[k] = { error: String(e) }; }
  }
  return { ok:true, build: BUILD, accession, panel: out,
    note: "Six views of the same facts. They differ on what matters, never on what the document says." };
}

async function serve(env, q) {
  const accession = q.get("accession");
  const agent = q.get("agent");
  const email = (q.get("email") || "").trim().toLowerCase();

  const paid = await entitled(env, email);
  if (!paid.ok) return { ok:false, paid:false, reason: paid.why, price_cents: 4000 };
  return await produce(env, accession, agent, false);
}

async function entitled(env, email) {
  if (!email) return { ok:false, why:"no email" };
  if (!env.PAY) return { ok:false, why:"the gate is not connected yet" };
  try {
    const r = await fetch(env.PAY + "/?me=1&email=" + encodeURIComponent(email));
    const j = await r.json();
    const has = (j && j.has) || {};
    if (has.opinion) return { ok:true };
    return { ok:false, why:"no opinion on this address" };
  } catch (e) { return { ok:false, why:"could not reach the payment desk" }; }
}

/* free, and it sells the opinion without giving it away:
   WHO has spoken, never WHAT they said */
async function peek(env, accession) {
  const r = await env.OVERHANG.prepare(
    "SELECT agent, made FROM opinions WHERE accession = ?").bind(accession).all();
  const rows = r.results || [];
  return { ok:true, build: BUILD, accession,
    spoken: rows.map(x => ({ agent: AGENTS[x.agent] ? AGENTS[x.agent].name : x.agent,
                             lens: AGENTS[x.agent] ? AGENTS[x.agent].lens : "", on: x.made })),
    not_yet: Object.keys(AGENTS).filter(k => !rows.find(x => x.agent === k))
             .map(k => ({ agent: AGENTS[k].name, lens: AGENTS[k].lens })),
    price_cents: 4000 };
}

async function list(env) {
  const r = await env.OVERHANG.prepare(
    "SELECT id, accession, agent, ticker, made FROM opinions ORDER BY id DESC LIMIT 200").all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}