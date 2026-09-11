/* BUILT 2026-09-11 23:20 ET · pay-2m · COMPLETE FILE, paste over everything */
/* ⚠ THE BUILD NAME LIVES IN ONE PLACE. It was written twice — the header
   said 2g and so did the ?action=prices reply — so a deploy of a new file
   reported the old name and there was no way to tell from the outside which
   file was actually running. */
const BUILD = "pay-2m · 2026-09-11";
/* ------------------------------------------------------------------
   WHAT CHANGED FROM 1 SEP
     wire_search   $8  → $12        opinion   $16 → $40
     wire_year     $60 → $480       NEW  wire_read     $20
     NEW  k8_year  $1,800           NEW  wire_opinion  $40
     RETIRED  opinion_10, reader, reader_year, pro, pro_year
     NEW  &on=     any product can now be sold on any site
     NEW  daily_chart        $5    the day's offerings, in plain English
     NEW  daily_chart_year   $310  the same, every day, for a year
   ------------------------------------------------------------------ */
/* ============================================================
   pay  —  Cloudflare Worker
   Taking money. Test mode until the live keys go in.
   Built 1 Sep 2026

   ------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
   SECRETS    STRIPE_KEY     sk_test_… to start, sk_live_… later
              STRIPE_WH      whsec_… the webhook signing secret
              LOG_KEY        for the private endpoints

   ------------------------------------------------------------
   PUBLIC
     ?buy=wire_year&email=          start a checkout, returns a URL
     ?buy=wire_search&email=&q=     one search, $8
     ?buy=read&email=&ticker=       one filing read, $20
     ?me=1&email=                   what has this person paid for

   STRIPE CALLS THIS
     POST /webhook                  the only thing that grants anything

   PRIVATE
     ?action=orders                 everything bought
     ?action=grant&email=&sku=      hand somebody access by hand
     ?action=prices                 the price list as the server holds it
     ?action=journal[&site=&month=] the sales journal
     ?action=books[&month=]         revenue, expenses, profit
     ?action=spend&vendor=&amount=&category=&what=&site=&invoice=
     ?action=verify&id=&how=&by=    confirm an expense with the vendor
     ?action=unverified             what nobody has checked yet
     ?action=vendors                totals by vendor

   ------------------------------------------------------------
   THE RULES THIS IS BUILT TO

   1. ONLY THE WEBHOOK GRANTS ANYTHING. Never the redirect. A
      redirect is a URL anybody can type; a webhook is signed by
      Stripe and verified here. Get this wrong and the site has a
      button on the internet marked "make me a subscriber."

   2. THE PRICE LIVES ON THE SERVER. The page says $60; the charge
      is built from the table below. Nothing about the amount is
      ever read from the request.

   3. THE STATEMENT DESCRIPTOR SAYS WHICH SITE. One Stripe account,
      three brands — a card statement reading TRIGGEREDSHORT for a
      warrantwire purchase is a chargeback waiting to happen.

   4. THE WIRE YEAR IS PAID ONCE. Not a subscription. His decision,
      1 Sep: "$60 per year is simply $5 per month by division, but
      must be paid upfront." One payment, nothing to cancel, no
      proration, no failed card mid-month.
   ============================================================ */

const SITE = {
  wire:  { name: "Warrant Wire",   suffix: "WIRE",    home: "https://warrantwire.com" },
  k8:    { name: "8K10Q",          suffix: "8K10Q",   home: "https://8k10q.com" },
  ts:    { name: "Triggered Short",suffix: "RESEARCH",home: "https://triggeredshort.com" }
};

/* THE PRICE LIST. The pages must match this; this is what charges.

   `site` is WHOSE PRODUCT IT IS — it decides who earns it in the books.
   It is NOT where it must be sold: anything here can be sold on any of
   the three by passing &on= with the request. */
const SKU = {

  /* ⚠ NOTHING HERE SELLS THE DATABASE. Every year carries a cap and no
     product hands over the whole file. That is not a pricing decision, it is
     the thing the business is: the value is that somebody read it, and a bulk
     export is the one sale that ends the business it came from. */

  /* ---------- THE LIST — Warrant Wire's own product ---------- */
  wire_search:  { site:"wire", cents:  1200, mode:"payment",
                  label:"Warrant Wire — one search",
                  grants:"search", days: 1 },

  /* ---------- THE YEAR, IN TWO SIZES ----------
     ⚠ HIS MODEL, 11 Sep 2026, AND I HAD IT WRONG. The $1,200 is not a
     reads-year. It is THIS SAME PRODUCT AT A HIGHER CAP: $480 is the low cap,
     priced for a retail holder watching his own handful of companies; $1,200
     is the high cap, priced for a fund watching the whole space.

     ⚠ AND NEITHER ONE IS THE FILE. His words: "never the entire file, never."
     Nobody buys the database. A cap is what keeps a subscription a
     subscription instead of a bulk export with a receipt — and the label on
     the $480 said "UNLIMITED SEARCHES", which was a promise to hand over
     exactly that. It was live on the site. It is corrected here.

     ⚠ THE TWO CAP NUMBERS ARE MINE AND HE SETS THEM. Three hundred a year is
     about one search a working day; three thousand is about ten. Change the
     numbers, nothing else moves. */
  wire_year:    { site:"wire", cents: 48000, mode:"payment",
                  label:"Warrant Wire — one year of warrant filings, for a holder",
                  grants:"wire", days: 365,
                  cap_month: 40, cap_year: 300 },

  wire_year_pro:{ site:"wire", cents:120000, mode:"payment",
                  label:"Warrant Wire — one year of warrant filings, professional volume",
                  grants:"wire", days: 365,
                  cap_month: 400, cap_year: 3000 },

  /* ---------- THE DAILY CHART ----------
     Every offering filed that day in plain English: what is being sold, the
     price against the prior close, the warrant coverage, and THE NEW SHARES
     AS A SHARE OF THE COMPANY — the column nobody else prints.

     $310 breaks even at sixty-two days, so anyone reading it three times a
     week is better off on the year. That is the point: it is a habit. */
  daily_chart:  { site:"wire", cents:   500, mode:"payment",
                  label:"The Daily Chart — today's offerings in plain English",
                  grants:"chart", days: 1 },

  daily_chart_year: { site:"wire", cents: 31000, mode:"payment",
                  label:"The Daily Chart — every day for a year",
                  grants:"chart_year", days: 365 },

  /* ---------- THE WARRANT READ — co-branded, sold on the wire ----------
     The year buys the LIST. Reading is priced separately, every time. */
  wire_read:    { site:"wire", cents:  2000, mode:"payment",
                  label:"Warrant Wire with 8K10Q — the warrant filing, in plain English",
                  grants:"read", days: 90 },

  wire_opinion: { site:"wire", cents:  4000, mode:"payment",
                  label:"Warrant Wire with 8K10Q — an agent's opinion on the warrant",
                  grants:"opinion", days: 90 },

  /* ---------- 8K10Q — any filing ---------- */
  read:         { site:"k8",   cents:  2000, mode:"payment",
                  label:"8K10Q — one filing read, in plain English",
                  grants:"read", days: 90 },

  opinion:      { site:"k8",   cents:  4000, mode:"payment",
                  label:"8K10Q — one agent opinion",
                  grants:"opinion", days: 90 },

  /* THE YEAR. Reads of anything, all year. Opinions are NOT in it. */
  k8_year:      { site:"k8",   cents:180000, mode:"payment",
                  label:"8K10Q — one year, every filing read in plain English",
                  grants:"read_year", days: 365,
                  cap_month: 25, cap_year: 300 },

  deep_dive:    { site:"k8",   cents: 14900, mode:"payment",
                  label:"8K10Q — deep dive on one company",
                  grants:"deep", days: 365 },

  watch:        { site:"k8",   cents:  6600, mode:"subscription",
                  label:"8K10Q — watch a company",
                  grants:"watch", days: 30 }

  /* RETIRED, kept as history: opinion_10 ($129 for ten when one was $16),
     reader ($1,340) and pro ($3,990) — none can be sold against an $1,800
     year that includes everything. */
};

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

    /* ---- Stripe's own call. Signed, and the only thing that grants. ---- */
    if (url.pathname === "/webhook" && request.method === "POST") {
      return await webhook(env, request);
    }

    try {
      if (q.get("buy")) return json(await buy(env, q, request), cors);

      /* ================================================================
         ⚠ A PLAIN LINK STRAIGHT INTO CHECKOUT. ?buy= answers with JSON,
         which a page can use and an ANCHOR CANNOT — and an anchor is
         exactly what the ACHplug box wants for its card side. Without
         this the box could only ever show one option, which is not how
         it was built.

         ⚠ AND STRIPE ASKS FOR THE EMAIL ITSELF. ?buy= requires one up
         front because the page collects it; a link has nobody to ask,
         so the address is left off and Stripe's own form takes it. The
         webhook reads it back off the completed session, so the grant
         still lands on the right person.
         ================================================================ */
      if (q.get("go")) {
        const skuName = q.get("go");
        const wanted = String(skuName || "").split(",").map(x => x.trim()).filter(Boolean);
        const unknown = wanted.filter(n => !SKU[n]);
        if (!wanted.length || unknown.length)
          return json({ ok:false, error:"no such thing for sale" +
            (unknown.length ? ": " + unknown.join(", ") : "") }, cors, 404);
        const u2 = new URL(request.url);
        u2.searchParams.set("buy", skuName);
        u2.searchParams.delete("go");
        /* ⚠ NO ADDRESS IS INVENTED HERE. An earlier version passed
           "link@checkout" as a placeholder and STRIPE REJECTED IT — it
           validates the address, so the checkout never opened and the buyer
           saw an error instead of a card form. It was written without ever
           being run against the real Stripe.

           Nothing is set instead. Stripe's own page asks for the address,
           which is where a person expects to be asked, and the webhook reads
           it back off the completed session. */
        u2.searchParams.set("collect_email", "1");
        u2.searchParams.delete("email");
        const made = await buy(env, u2.searchParams, request);
        if (!made || !made.url)
          return json({ ok:false, error:"could not open a checkout" }, cors, 502);
        return new Response(null, { status: 303, headers: { location: made.url } });
      }
      if (q.get("me"))  return json(await me(env, q), cors);
    } catch (e) {
      return json({ ok:false, error:String(e) }, cors, 400);
    }

    const key = request.headers.get("X-Auth-Key") || q.get("key");
    if (!key || key !== env.LOG_KEY) return json({ ok:false, error:"unauthorized" }, cors, 401);

    try {
      const a = q.get("action") || "orders";
      if (a === "prices") return json({ ok:true, live: isLive(env), skus: SKU }, cors);

      /* ⚠ WHAT IS AND IS NOT SET, WITHOUT SHOWING ANY OF IT.

         A secret added in the dashboard is applied to the running worker
         straight away, but there was no way to ASK whether it had landed —
         so the only way to find out was to take a real payment and see if
         anything was granted. That is a terrible way to find out.

         This reports presence and shape only. No value is ever returned. */
      if (a === "health") {
        const shape = v => {
          if (!v) return "MISSING";
          const t = String(v);
          return "set, " + t.length + " chars, starts " + t.slice(0, 8) + "…";
        };
        const wh = env.STRIPE_WH ? String(env.STRIPE_WH) : "";
        return json({ ok:true, build: BUILD,
          stripe_key: env.STRIPE_KEY ? (isLive(env) ? "LIVE key set" : "test key set") : "MISSING",
          webhook_secret: shape(env.STRIPE_WH),
          webhook_secret_looks_right: wh.startsWith("whsec_"),
          log_key: env.LOG_KEY ? "set" : "MISSING",
          database: env.OVERHANG ? "bound" : "MISSING",
          ready_to_grant: !!(env.STRIPE_KEY && wh.startsWith("whsec_") && env.OVERHANG),
          note: "ready_to_grant false means a payment would be taken and " +
                "nothing would be given. Nothing here reveals a secret." }, cors);
      }
      /* ---- the bank, through ACHplug ---- */
      if (a === "achgrant")  return json(await achGrant(env, q), cors);
      if (a === "achpaid")   return json(await achPaid(env, q), cors);
      if (a === "achreturn") return json(await achReturn(env, q), cors);

      if (a === "orders") return json(await orders(env), cors);
      if (a === "grant")  return json(await handGrant(env, q), cors);
      if (a === "journal") return json(await journal(env, q), cors);
      if (a === "books")   return json(await books(env, q), cors);
      if (a === "spend")   return json(await spend(env, q), cors);
      if (a === "verify")  return json(await verifyExpense(env, q), cors);
      if (a === "unverified") {
        const r = await env.OVERHANG.prepare("SELECT * FROM v_unverified").all()
          .catch(()=>({results:[]}));
        return json({ ok:true, rows:r.results||[] }, cors);
      }
      if (a === "vendors") {
        const r = await env.OVERHANG.prepare("SELECT * FROM v_vendor_totals").all()
          .catch(()=>({results:[]}));
        return json({ ok:true, rows:r.results||[] }, cors);
      }
      return json(await orders(env), cors);
    } catch (e) {
      return json({ ok:false, error:String(e), stack:String(e.stack||"") }, cors, 500);
    }
  }
};

function isLive(env){ return String(env.STRIPE_KEY || "").indexOf("sk_live") === 0; }

/* ============================================================
   STARTING A CHECKOUT
   ============================================================ */

async function buy(env, q, request) {
  /* ⚠ A CHECKOUT CAN HOLD MORE THAN ONE THING. `buy` takes a comma list —
     wire_search,wire_read,wire_year — and every one of them becomes a line on
     the same Stripe session and a separate entitlement when it is paid.

     ⚠ THE FIRST ONE DECIDES THE SITE AND THE DESCRIPTOR. They have to agree on
     something, and the thing the buyer chose first is the honest answer.

     ⚠ ONE THING ON ITS OWN BEHAVES EXACTLY AS BEFORE. Every page already
     calling ?buy=wire_search is untouched by this. */
  const names = String(q.get("buy") || "").split(",")
    .map(x => x.trim()).filter(Boolean);
  if (!names.length) throw new Error("no such thing for sale");

  const missing = names.filter(n => !SKU[n]);
  if (missing.length) throw new Error("no such thing for sale: " + missing.join(", "));

  const items = names.map(n => SKU[n]);
  const sku = items[0];

  /* ⚠ A SUBSCRIPTION CANNOT SHARE A SESSION WITH A ONE-OFF PAYMENT. Stripe
     refuses it, and it would refuse it AFTER the buyer had pressed pay. Better
     to say so here. */
  if (items.length > 1 && items.some(x => x.mode === "subscription"))
    throw new Error("a subscription has to be bought on its own");

  /* ⚠ STRIPE COLLECTS THE ADDRESS ON A PLAIN LINK. Every page that has already
     asked for one still passes it and behaves exactly as before; only the link
     path leaves it to Stripe. */
  const collect = q.get("collect_email") === "1";
  const email = (q.get("email") || "").trim().toLowerCase();
  if (!collect && (!email || email.indexOf("@") < 1))
    throw new Error("an email address, please");

  if (!env.STRIPE_KEY) throw new Error("payments are not switched on yet");

  /* WHERE THE BUYER WAS STANDING decides the descriptor and the pages he
     comes back to. WHOSE PRODUCT IT IS stays on the SKU, for the books. */
  const on   = SITE[q.get("on")] ? q.get("on") : sku.site;
  const site = SITE[on];
  const ref  = (q.get("ref") || q.get("ticker") || q.get("q") || "").slice(0, 40);

  /* what somebody sees on their card statement. One account, three
     brands — this is what stops a chargeback from confusion. */
  const descriptor = ("TS " + site.suffix).slice(0, 22);

  const back = site.home + "/thanks.html?s={CHECKOUT_SESSION_ID}";
  const off  = site.home + "/?cancelled=1";

  const form = new URLSearchParams();
  form.set("mode", sku.mode);
  form.set("success_url", back);
  form.set("cancel_url", off);
  /* ⚠ AN EMPTY customer_email IS REJECTED BY STRIPE, so the field is left off
     entirely rather than sent blank. */
  if (email) form.set("customer_email", email);
  form.set("client_reference_id", (names.join(",") + "|" + email + "|" + ref).slice(0, 200));
  /* ⚠ EVERY SKU TRAVELS TO THE WEBHOOK. A session with three lines is no use
     if only the first one is ever granted. */
  form.set("metadata[sku]", names.join(","));
  form.set("metadata[email]", email);   /* empty on a link — see the webhook */
  form.set("metadata[ref]", ref);
  form.set("metadata[site]", sku.site);   /* who earns it */
  form.set("metadata[on]", on);           /* where it sold */

  /* ⚠ ONE LINE PER THING, so the buyer sees on Stripe's own page exactly what
     he saw on the checkout — not a single total he has to take on trust. */
  items.forEach((it, i) => {
    form.set("line_items[" + i + "][quantity]", "1");
    form.set("line_items[" + i + "][price_data][currency]", "usd");
    form.set("line_items[" + i + "][price_data][unit_amount]", String(it.cents));
    form.set("line_items[" + i + "][price_data][product_data][name]", it.label);
    if (ref && i === 0)
      form.set("line_items[" + i + "][price_data][product_data][description]", ref);
  });

  if (sku.mode === "subscription") {
    form.set("line_items[0][price_data][recurring][interval]", "month");
  } else {
    /* a one-off payment can carry its own descriptor */
    form.set("payment_intent_data[statement_descriptor_suffix]", site.suffix.slice(0, 10));
    form.set("payment_intent_data[description]", sku.label);
  }

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const s = await r.json();
  if (!r.ok) throw new Error((s.error && s.error.message) || "Stripe refused it");

  const total = items.reduce((n, x) => n + x.cents, 0);
  await log(env, {
    kind: "started", sku: names.join(","), email, ref,
    cents: total, session: s.id, live: isLive(env) ? 1 : 0
  });

  return { ok:true, url: s.url, session: s.id, live: isLive(env),
    things: names, cents: total, dollars: total / 100,
    note: isLive(env) ? null
      : "TEST MODE. Use card 4242 4242 4242 4242, any future date, any CVC." };
}

/* ============================================================
   THE WEBHOOK — the only thing that grants anything
   ============================================================ */

async function webhook(env, request) {
  const body = await request.text();
  const sig  = request.headers.get("Stripe-Signature") || "";

  if (!env.STRIPE_WH) return new Response("no signing secret", { status: 500 });
  const okSig = await verify(body, sig, env.STRIPE_WH);
  if (!okSig) {
    await log(env, { kind:"bad-signature", note: sig.slice(0, 60) });
    return new Response("bad signature", { status: 400 });
  }

  let ev;
  try { ev = JSON.parse(body); } catch (e) { return new Response("bad json", { status: 400 }); }
  const o = (ev.data && ev.data.object) || {};

  if (ev.type === "checkout.session.completed") {
    const m = o.metadata || {};

    /* ⚠ WHERE THE ADDRESS COMES FROM. If a page asked for it, it is in the
       metadata. If the buyer came through a plain link, Stripe asked and the
       answer is on the session — under customer_details on a modern session,
       or customer_email on an older one. Without this the entitlement would
       be granted to nobody. */
    const buyerEmail = (m.email
      || (o.customer_details && o.customer_details.email)
      || o.customer_email || "").trim().toLowerCase();
    m.email = buyerEmail;
    /* ⚠ ONE SESSION CAN CARRY SEVERAL THINGS, AND EVERY ONE MUST BE GRANTED.
       Reading only the first would take money for three products and hand over
       one — the worst failure this worker has available to it. */
    const bought = String(m.sku || "").split(",").map(x => x.trim())
      .filter(n => SKU[n]);

    for (const name of bought) {
      const one = SKU[name];
      /* ⚠ EACH ONE GETS ITS OWN REFERENCE so a retry cannot grant it twice.
         The session id alone would collide across the lines of one session. */
      let had = null;
      try {
        had = await env.OVERHANG.prepare(
          "SELECT id FROM entitlements WHERE stripe_session = ? AND sku = ?")
          .bind(o.id + "#" + name, name).first();
      } catch (e) { had = null; }
      if (had) continue;
      await grant(env, m.email, name, one, m.ref, o.id + "#" + name, one.cents);
      await log(env, { kind:"paid", sku:name, email:m.email, ref:m.ref,
                       cents:one.cents, session:o.id + "#" + name,
                       live: o.livemode ? 1 : 0 });
      await toAccountant(env, {
        business: one.site === "k8" ? "8k10q" : "wire",
        source: "stripe", gross: one.cents / 100,
        sku: name, ref: m.ref || "", who: m.email || "",
        id: o.id + "#" + name, live: o.livemode ? 1 : 0 });
    }

    /* ⚠ A COMPLETED SESSION THAT GRANTED NOTHING IS RECORDED, NOT IGNORED.
       It means Stripe took money for a SKU this worker does not have — a
       price that was renamed or removed while somebody was at the checkout —
       and it needs finding rather than passing quietly. */
    /* ⚠ MONEY TAKEN AND NO ADDRESS TO GIVE IT TO IS RECORDED LOUDLY. It means
       Stripe collected nothing, which should not happen — and a silent failure
       here is a buyer who paid and got nothing with no trace of why. */
    if (!buyerEmail) {
      await log(env, { kind:"paid-but-nobody", sku: m.sku || null,
        cents: o.amount_total, session: o.id, live: o.livemode ? 1 : 0,
        note: "money taken and no email on the session" });
    }

    if (!bought.length) {
      await log(env, { kind:"paid-but-unknown", sku: m.sku || null,
        email: m.email || null, ref: m.ref || null,
        cents: o.amount_total, session: o.id, live: o.livemode ? 1 : 0,
        note: "money taken and nothing granted — no such sku here" });
    }
  }

  if (ev.type === "customer.subscription.deleted") {
    await env.OVERHANG.prepare(
      "UPDATE entitlements SET status='ended', ended_on=date('now') WHERE stripe_sub = ?"
    ).bind(o.id).run().catch(()=>{});
    await log(env, { kind:"cancelled", note:o.id });
  }

  if (ev.type === "invoice.payment_failed") {
    await log(env, { kind:"failed", note:(o.customer_email || o.id) });
  }

  return new Response(JSON.stringify({ received:true }), {
    headers: { "Content-Type": "application/json" }
  });
}

/* Stripe signs with HMAC-SHA256 over "timestamp.body". */
async function verify(body, header, secret) {
  const parts = {};
  header.split(",").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  if (!parts.t || !parts.v1) return false;

  /* refuse anything more than five minutes old */
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(parts.t, 10));
  if (!isFinite(age) || age > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(parts.t + "." + body));
  const b = new Uint8Array(mac);
  let hex = "";
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, "0");

  /* constant time, so the comparison itself leaks nothing */
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

/* ============================================================
   WHAT SOMEBODY HAS
   ============================================================ */

async function grant(env, email, skuName, sku, ref, session, cents) {
  if (!email) return;
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS entitlements (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL, grants TEXT NOT NULL, sku TEXT, ref TEXT,
       qty INTEGER DEFAULT 1, used INTEGER DEFAULT 0,
       started_on TEXT DEFAULT (date('now')), ends_on TEXT,
       status TEXT DEFAULT 'active', stripe_session TEXT, stripe_sub TEXT,
       cents INTEGER, created_at TEXT DEFAULT (datetime('now')))`).run();

  await env.OVERHANG.prepare(
    `INSERT INTO entitlements (email, grants, sku, ref, qty, ends_on,
                               stripe_session, cents)
     VALUES (?,?,?,?,?, date('now','+' || ? || ' days'), ?, ?)`
  ).bind(email.toLowerCase(), sku.grants, skuName, ref || null,
         sku.qty || 1, sku.days, session || null, cents || sku.cents).run();
}

async function me(env, q) {
  const email = (q.get("me") === "1" ? q.get("email") : q.get("me")) || "";
  const e = email.trim().toLowerCase();
  if (!e || e.indexOf("@") < 1) throw new Error("an email address, please");

  const r = await env.OVERHANG.prepare(
    `SELECT grants, sku, ref, qty, used, started_on, ends_on, status
       FROM entitlements
      WHERE email = ? AND status='active' AND ends_on >= date('now')
      ORDER BY ends_on DESC`).bind(e).all().catch(()=>({results:[]}));

  const rows = r.results || [];
  const has = {};
  for (const x of rows) has[x.grants] = true;

  return { ok:true, email: e, has, entitlements: rows,
    note: rows.length ? null : "Nothing on this address." };
}

async function handGrant(env, q) {
  const email = (q.get("email") || "").trim().toLowerCase();
  const name  = q.get("sku");
  const sku   = SKU[name];
  if (!email || !sku) throw new Error("email and a real sku");
  await grant(env, email, name, sku, q.get("ref") || null, "by-hand", 0);
  return { ok:true, email, sku:name, note:"Granted by hand. No money changed." };
}

async function orders(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS pay_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')),
       kind TEXT, sku TEXT, email TEXT, ref TEXT, cents INTEGER,
       session TEXT, live INTEGER DEFAULT 0, note TEXT)`).run();

  const l = await env.OVERHANG.prepare(
    "SELECT * FROM pay_log ORDER BY id DESC LIMIT 200").all();
  const e = await env.OVERHANG.prepare(
    `SELECT * FROM entitlements ORDER BY id DESC LIMIT 200`).all().catch(()=>({results:[]}));
  const t = await env.OVERHANG.prepare(
    `SELECT COUNT(*) n, SUM(cents) c FROM pay_log WHERE kind='paid'`).first();

  return { ok:true, live: isLive(env),
    paid: t ? t.n : 0, total_cents: t ? t.c : 0,
    log: l.results || [], entitlements: e.results || [] };
}


/* ============================================================
   THE BOOKS

   A sales journal per site, and somewhere to put what things cost.

   THE ONE THING THIS IS BUILT AROUND, and it is his practice not a
   convention: an expense is not settled because there is an invoice.
   An invoice can be printed by anybody. **It is settled when the
   vendor confirms it** — so every row carries verified_on,
   verified_how and verified_by, and `v_unverified` is the list of
   things nobody has checked yet.

   His words, 31 Aug 2026: "I always had audits. It's the only way —
   a few calls to vendors and checking everything. Small investment
   for proof."

     ?action=journal[&site=&month=]     sales, per site, per month
     ?action=books[&month=]             revenue, expenses, profit
     ?action=spend&…                    write an expense
     ?action=verify&id=&how=&by=        mark one confirmed
     ?action=unverified                 what nobody has checked
     ?action=vendors                    totals by vendor
   ============================================================ */

async function journal(env, q) {
  const site  = (q.get("site") || "").toLowerCase();
  const month = q.get("month") || "";

  let sql = "SELECT * FROM v_sales_journal WHERE 1=1";
  const b = [];
  if (site)  { sql += " AND site = ?"; b.push(site); }
  if (month) { sql += " AND at LIKE ?"; b.push(month + "%"); }
  sql += " LIMIT 500";

  const r = await env.OVERHANG.prepare(sql).bind(...b).all().catch(()=>({results:[]}));
  const rows = r.results || [];

  const by = await env.OVERHANG.prepare(
    "SELECT * FROM v_sales_by_month LIMIT 60").all().catch(()=>({results:[]}));

  const gross = rows.reduce((n,x)=> n + (x.dollars||0), 0);
  const fees  = rows.reduce((n,x)=> n + (x.stripe_fee||0), 0);

  return { ok:true, site: site || "all", month: month || "all",
    sales: rows.length,
    gross: +gross.toFixed(2), card_fees: +fees.toFixed(2),
    net: +(gross - fees).toFixed(2),
    rows, by_month: by.results || [],
    note: "Card fees are estimated at 2.9% plus 30 cents. Stripe's own figure is " +
          "the one that goes in the accounts — this is for reading, not filing." };
}

async function spend(env, q) {
  const cents = Math.round(parseFloat(q.get("amount") || "0") * 100);
  const vendor = (q.get("vendor") || "").trim();
  const cat = (q.get("category") || "other").toLowerCase();
  if (!vendor || !cents) throw new Error("vendor and amount, please");

  await env.OVERHANG.prepare(
    `INSERT INTO expenses (spent_on, vendor, category, description, cents, site,
                           paid_by, invoice_no, recurring, note)
     VALUES (COALESCE(?, date('now')),?,?,?,?,?,?,?,?,?)`
  ).bind(q.get("on") || null, vendor, cat,
         (q.get("what") || "").slice(0,300),
         cents, (q.get("site") || "shared").toLowerCase(),
         q.get("paid") || null, q.get("invoice") || null,
         q.get("recurring") || null, q.get("note") || null).run();

  await env.OVERHANG.prepare(
    "INSERT OR IGNORE INTO vendors (name, what_for) VALUES (?,?)"
  ).bind(vendor, cat).run().catch(()=>{});

  return { ok:true, vendor, cents, dollars: cents/100,
    note: "Written, and UNVERIFIED. It shows in ?action=unverified until somebody " +
          "confirms it with the vendor." };
}

async function verifyExpense(env, q) {
  const id = q.get("id");
  if (!id) throw new Error("which one?");
  await env.OVERHANG.prepare(
    `UPDATE expenses SET verified_on = COALESCE(?, date('now')),
       verified_how = ?, verified_by = ?, note = COALESCE(?, note) WHERE id = ?`
  ).bind(q.get("on") || null,
         q.get("how") || "called the vendor",
         q.get("by") || "MN",
         q.get("note") || null, id).run();
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM expenses WHERE id = ?").bind(id).first();
  return { ok:true, row };
}

async function books(env, q) {
  const pl = await env.OVERHANG.prepare("SELECT * FROM v_pl LIMIT 36")
    .all().catch(()=>({results:[]}));
  const ex = await env.OVERHANG.prepare("SELECT * FROM v_expenses_by_month LIMIT 200")
    .all().catch(()=>({results:[]}));
  const un = await env.OVERHANG.prepare("SELECT * FROM v_unverified LIMIT 200")
    .all().catch(()=>({results:[]}));
  const vn = await env.OVERHANG.prepare("SELECT * FROM v_vendor_totals LIMIT 100")
    .all().catch(()=>({results:[]}));
  const sm = await env.OVERHANG.prepare("SELECT * FROM v_sales_by_month LIMIT 60")
    .all().catch(()=>({results:[]}));

  const u = (un.results || []);
  return { ok:true,
    profit_and_loss: pl.results || [],
    sales_by_month: sm.results || [],
    expenses_by_month: ex.results || [],
    vendors: vn.results || [],
    unverified: u,
    unverified_total: +(u.reduce((n,x)=> n + (x.dollars||0), 0)).toFixed(2),
    note: u.length
      ? u.length + " expense" + (u.length===1?"":"s") + " nobody has confirmed with the vendor."
      : "Everything on the books has been confirmed with the vendor." };
}

async function log(env, row) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS pay_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')),
       kind TEXT, sku TEXT, email TEXT, ref TEXT, cents INTEGER,
       session TEXT, live INTEGER DEFAULT 0, note TEXT)`).run();
  await env.OVERHANG.prepare(
    `INSERT INTO pay_log (kind, sku, email, ref, cents, session, live, note)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(row.kind || null, row.sku || null, row.email || null, row.ref || null,
         row.cents || null, row.session || null, row.live || 0, row.note || null)
   .run().catch(()=>{});
}

function json(o, h, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}


/* ============================================================================
   THE BANK — ACHplug

   ⚠ ACCESS IS GIVEN THE MOMENT HE AUTHORISES, AT ANY AMOUNT. His ruling,
   11 Sep 2026: most bank payments are instant, some take up to three days, and
   THE SELLER CARRIES THAT WAIT RATHER THAN THE BUYER. A man who has just
   authorised twelve dollars and is told to come back on Thursday does not come
   back on Thursday.

   ⚠ WHICH MEANS THE RISK IS REAL AND IT IS DELIBERATE. A bank payment can be
   returned days later. Where that happens the entitlement is withdrawn — see
   achreturn — and the sale is reversed in the ledger rather than deleted from
   it. Taking the risk is a decision; pretending there is none is not.

   ⚠ AND THE MONEY IS RECORDED SEPARATELY FROM THE ACCESS. Authorising grants;
   the money landing is what goes on the books. They are days apart and the
   books must not show revenue that has not arrived, which is why there are
   two calls rather than one.

     ?action=achgrant   he authorised — give him what he bought, now
     ?action=achpaid    the money landed — put it on the books
     ?action=achreturn  it came back — withdraw it and reverse the sale
   ============================================================================ */

async function achGrant(env, q) {
  /* ⚠ THE TABLE MAY NOT EXIST YET. grant() creates it, but this reads it first
     to check for a duplicate — and on a fresh database that read is the very
     first thing to touch it. */
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS entitlements (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL, grants TEXT NOT NULL, sku TEXT, ref TEXT,
       qty INTEGER DEFAULT 1, used INTEGER DEFAULT 0,
       started_on TEXT DEFAULT (date('now')), ends_on TEXT,
       status TEXT DEFAULT 'active', stripe_session TEXT, stripe_sub TEXT,
       cents INTEGER, created_at TEXT DEFAULT (datetime('now')))`).run();

  const skuName = (q.get("sku") || "").trim();
  const email   = (q.get("email") || "").trim().toLowerCase();
  const ref     = (q.get("ref") || "").trim();
  const sku     = SKU[skuName];

  if (!sku)   return { ok:false, build: BUILD, error:"unknown sku: " + skuName };
  if (!email || email.indexOf("@") < 1) return { ok:false, build: BUILD, error:"an email address" };
  if (!ref)   return { ok:false, build: BUILD, error:"the ACHplug reference" };

  /* ⚠ THE REFERENCE IS THE GUARD AGAINST GRANTING TWICE. ACHplug can call this
     again on a retry, and two grants for one payment is two years of access
     sold once. */
  /* ⚠ try/catch, NOT .catch() ON .first(). A driver that returns a value
     rather than a promise makes that line throw on the word catch, and the
     payment dies with it. Written three times in this codebase now; this is
     the last one. */
  let had = null;
  try {
    had = await env.OVERHANG.prepare(
      "SELECT id FROM entitlements WHERE ref = ? AND sku = ?")
      .bind(ref, skuName).first();
  } catch (e) { had = null; }
  if (had) return { ok:true, build: BUILD, already:true, id: had.id,
    note:"That reference already has access. Nothing was granted twice." };

  await grant(env, email, skuName, sku, ref, "ach:" + ref, sku.cents);
  await log(env, { kind:"ach-granted", sku: skuName, email, ref,
                   cents: sku.cents, session: "ach:" + ref, live: 1 });

  return { ok:true, build: BUILD, granted: sku.grants, sku: skuName, email, ref,
    days: sku.days,
    note:"Access given on authorisation. The money is recorded separately when " +
         "it lands." };
}

/* ⚠ THIS IS THE ONE THAT TOUCHES THE BOOKS. Authorising is not revenue. */
async function achPaid(env, q) {
  const ref   = (q.get("ref") || "").trim();
  const cents = Math.round(Number(q.get("amount") || 0) * 100);
  if (!ref || !cents) return { ok:false, build: BUILD, error:"a reference and an amount" };

  await log(env, { kind:"paid", sku: q.get("sku") || null,
                   email: (q.get("email") || "").toLowerCase() || null,
                   ref, cents, session: "ach:" + ref, live: 1,
                   note: "bank" });

  const posted = await toAccountant(env, {
    business: (q.get("business") || "wire"), source: "ach", gross: cents / 100,
    fee: q.get("fee") || "", sku: q.get("sku") || "", ref,
    who: q.get("email") || "", id: "ach:" + ref });

  return { ok:true, build: BUILD, ref, dollars: cents / 100,
    on_the_books: posted, note:"Recorded as money received." };
}

async function achReturn(env, q) {
  const ref = (q.get("ref") || "").trim();
  if (!ref) return { ok:false, build: BUILD, error:"the ACHplug reference" };

  /* ⚠ WITHDRAWN, NOT DELETED. What he had and when he lost it is part of the
     record, and a row that disappears is a row nobody can explain later. */
  let r = null;
  try {
    r = await env.OVERHANG.prepare(
      "UPDATE entitlements SET status='returned' WHERE ref = ? AND status='active'")
      .bind(ref).run();
  } catch (e) { r = null; }

  await log(env, { kind:"ach-returned", ref, session:"ach:" + ref, live: 1,
                   note: (q.get("why") || "the bank returned it") });

  /* and reverse it on the books, if it ever reached them */
  const reversed = await toAccountant(env, {
    action: "refund", gross: q.get("amount") || "", of: "ach:" + ref,
    id: "achret:" + ref, business: q.get("business") || "wire",
    source: "ach", why: q.get("why") || "returned by the bank" });

  return { ok:true, build: BUILD, ref,
    withdrawn: (r && r.meta && r.meta.changes) || 0,
    reversed_on_the_books: reversed,
    note:"Access withdrawn and the sale reversed. Nothing was deleted." };
}

/* ⚠ THE BOOKS ARE NEVER ALLOWED TO BREAK A PAYMENT. If the accountant is down
   or not deployed yet, the buyer still gets what he bought and the failure is
   reported rather than thrown. */
async function toAccountant(env, fields) {
  if (!env.ACCOUNTANT) return "no ACCOUNTANT address set";
  try {
    const p = new URLSearchParams();
    p.set("action", fields.action || "post");
    p.set("key", env.LOG_KEY || "");
    for (const k of Object.keys(fields))
      if (k !== "action" && fields[k] !== "" && fields[k] != null) p.set(k, fields[k]);
    const r = await fetch(env.ACCOUNTANT + "/?" + p.toString());
    const j = await r.json();
    return j && j.ok ? (j.already ? "already on the books" : "posted") :
                       ("refused: " + (j && j.error));
  } catch (e) { return "could not reach the accountant: " + String(e).slice(0, 80); }
}