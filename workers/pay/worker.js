/* BUILT 2026-09-11 23:20 ET · pay-2m · COMPLETE FILE, paste over everything */
/* ⚠ THE BUILD NAME LIVES IN ONE PLACE. It was written twice — the header
   said 2g and so did the ?action=prices reply — so a deploy of a new file
   reported the old name and there was no way to tell from the outside which
   file was actually running. */
const BUILD = "pay-3c · 2026-09-12 · ?sbcheck=1 says whether the Wall St Domains database answers (no key needed, nothing revealed)";
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
     ?action=payouts                the gig ledger: owed and paid
     ?action=release                pay every reader whose money is due (the cron does this too)
     ?action=refund&id=             the founder's decision on a dispute
     ?action=paidout&id=&how=&ref=  mark a row paid by hand
   PUBLIC  ?verdict_ok=1&session=&email=&ok=1|0&why=   the buyer's say, within two days

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
  ts:    { name: "Triggered Short",suffix: "RESEARCH",home: "https://triggeredshort.com" },
  /* ⚠ WALL ST DOMAINS — 11 Sep 2026. The domain marketplace. Its seller
     checkout was a form that took a card number and charged nothing; the
     money now comes through here, same account, same webhook, same books.
     `back` is where the buyer lands afterwards — that site has no
     thanks.html, it has a seller page that reads the session id. */
  wsd:   { name: "Wall St Domains", suffix: "WALLSTDOM", home: "https://wallstdomains.com",
           back: "/list-domain?paid={CHECKOUT_SESSION_ID}", off: "/list-domain?cancelled=1" }
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
  /* ⚠ A YEAR, NOT A DAY. His ruling, 11 Sep: "a search on a company can be
     for a full year, firmly." The list, the verdict, and the going concern
     status of that one company, for 365 days. */
  wire_search:  { site:"wire", cents:  1200, mode:"payment",
                  label:"Warrant Wire — one company, for a year",
                  grants:"search", days: 365 },

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

  /* ---------- THE GOING CONCERN LIST — 11 Sep 2026 ----------
     His ruling: $80 a year, 365 days from purchase, on Warrant Wire and
     8K10Q alike (pass &on=k8 to sell it there). One company's going concern
     record stays free on its page; the LIST is what this buys. */
  concern_year: { site:"wire", cents: 8000, mode:"payment",
                  label:"Going concern — every company that said it, for a year",
                  grants:"concern", days: 365 },

  /* ---------- THE VERDICTS — 11 Sep 2026 ----------
     The automatic verdict is included in wire_search. These two are the
     human ones. The founder's is a fixed $200. A reader's is priced by the
     reader — `cents: 0` here means "look it up": buy() reads the reader's
     price from the writing database and refuses if the reader is not active
     and called. The house takes a flat $50 of every reader verdict sold,
     and the rest is owed to the reader in gig_payouts. */
  founder_verdict: { site:"wire", cents: 20000, mode:"payment",
                  label:"Warrant Wire — the founder's verdict on one company",
                  grants:"verdict", days: 3650 },

  reader_verdict: { site:"wire", cents: 0, mode:"payment", dynamic: true,
                  label:"Warrant Wire — a reader's verdict on one company",
                  grants:"verdict", days: 3650, house_cents: 5000 },

  /* ---------- THE WARRANT READ — co-branded, sold on the wire ----------
     The year buys the LIST. Reading is priced separately, every time. */
  /* ⚠ AN 8K10Q PRODUCT, SOLD ON THE WIRE. A full read of any filing — all
     filings, not only warrant paper — and it is described that way wherever
     it is offered, apart from the wire's own products. */
  wire_read:    { site:"k8", cents:  2000, mode:"payment",
                  label:"8K10Q — one filing, read in full, in plain English",
                  grants:"read", days: 365 },

  /* ⚠ BARRY-L. Not the verdict and not its rules — an AI agent with a
     personality built on a real person, who looks at the company his own way
     and at other possibilities. His rules are his own and are published. */
  wire_opinion: { site:"wire", cents:  4000, mode:"payment",
                  label:"Barry-L — his opinion on the company",
                  grants:"opinion", days: 365 },

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
                  grants:"watch", days: 30 },

  /* ---------- WALL ST DOMAINS — a seller's listing, 11 Sep 2026 ----------
     The prices the site has shown since March and never once charged:
     $15 a month on a card, or $240 for the year paid once; the Premium
     badge $99 a year and the Partnership option $60 a year as add-ons.
     `ref` on the sale is the seller's submission id on the marketplace, so
     the listing that was paid for is the one that goes live. */
  wsd_month:    { site:"wsd",  cents:  1500, mode:"subscription",
                  label:"Wall St Domains — your listing, monthly",
                  grants:"listing", days: 31 },

  wsd_year:     { site:"wsd",  cents: 24000, mode:"payment",
                  label:"Wall St Domains — your listing, one year, paid once",
                  grants:"listing", days: 365 },

  wsd_premium:  { site:"wsd",  cents:  9900, mode:"payment",
                  label:"Wall St Domains — Premium listing, one year",
                  grants:"premium", days: 365 },

  wsd_partner:  { site:"wsd",  cents:  6000, mode:"payment",
                  label:"Wall St Domains — Partnership option, one year",
                  grants:"partner", days: 365 }

  /* RETIRED, kept as history: opinion_10 ($129 for ten when one was $16),
     reader ($1,340) and pro ($3,990) — none can be sold against an $1,800
     year that includes everything. */
};

export default {
  /* ⚠ THE CRON. Every six hours: pay every reader whose money is due. Set on
     the worker as a schedule, minute 0 of every sixth hour; nothing else runs on it. */
  async scheduled(event, env, ctx) { ctx.waitUntil(release(env)); },

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
      /* does the Wall St Domains database answer this worker? Presence of the
         secret was visible in the dashboard; whether it WORKS was not. Reports
         reachable-or-not and a row count — never the key, never a row. */
      if (q.get("sbcheck")) return json(await sbCheck(env), cors);
      if (q.get("me"))  return json(await me(env, q), cors);
      /* the seller page on Wall St Domains, back from Stripe: was this session paid? */
      if (q.get("paid")) return json(await sessionPaid(env, q), cors);
      /* the admin desk there: every payment recorded against one submission id */
      if (q.get("listing")) return json(await listingPaid(env, q), cors);
      /* the buyer's say on a reader's verdict: worth it, or not */
      if (q.get("verdict_ok")) return json(await buyerSays(env, q), cors);
      /* a reader setting up payouts: Stripe Connect Express onboarding */
      if (q.get("connect")) return connectStart(env, q, request);
      if (q.get("connected")) return connectBack(env, q);
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
        /* which Stripe account the key belongs to — its id and name, never the key */
        let acct = null;
        try {
          const a = await (await fetch("https://api.stripe.com/v1/account", { headers: { "Authorization": "Bearer " + env.STRIPE_KEY } })).json();
          if (a && a.id) acct = { id: a.id, name: (a.settings && a.settings.dashboard && a.settings.dashboard.display_name) || a.business_profile && a.business_profile.name || null };
          /* the real test: can this account list connected accounts? Stripe
             refuses the call outright until Connect is switched on. */
          const c = await (await fetch("https://api.stripe.com/v1/accounts?limit=1", { headers: { "Authorization": "Bearer " + env.STRIPE_KEY } })).json();
          if (acct) acct.connect = c && c.object === "list" ? "ON — " + (c.data ? c.data.length : 0) + " connected account(s) so far" : "OFF — " + ((c.error && c.error.message) || "refused");
        } catch (e) {}
        return json({ ok:true, build: BUILD, stripe_account: acct,
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

      /* ---- the gig ledger ---- */
      if (a === "payouts") {
        const r = await env.OVERHANG.prepare(
          "SELECT * FROM gig_payouts ORDER BY (paid_at IS NULL) DESC, id DESC LIMIT 500").all().catch(()=>({results:[]}));
        const rows = r.results || [];
        const owed = rows.filter(x => !x.paid_at).reduce((n, x) => n + (x.net || 0), 0);
        return json({ ok:true, build: BUILD, owed_cents: owed, owed: owed / 100,
          unpaid: rows.filter(x => !x.paid_at), paid: rows.filter(x => x.paid_at),
          note: "Each unpaid row is money owed to a reader. Pay it, then ?action=paidout&id=&how=&ref=." }, cors);
      }
      if (a === "release") return json(await release(env), cors);
      if (a === "refund")  return json(await refund(env, q), cors);
      if (a === "paidout") {
        const id = parseInt(q.get("id") || "0", 10);
        if (!id) return json({ ok:false, error:"which row?" }, cors, 400);
        await env.OVERHANG.prepare(
          "UPDATE gig_payouts SET paid_at=datetime('now'), paid_how=?, paid_ref=? WHERE id=? AND paid_at IS NULL")
          .bind(q.get("how") || "by hand", q.get("ref") || null, id).run();
        const row = await env.OVERHANG.prepare("SELECT * FROM gig_payouts WHERE id=?").bind(id).first();
        return json({ ok:true, row }, cors);
      }

      /* the marketplace: publish a paid listing by hand, or take one down */
      if (a === "publish") {
        const ref = q.get("ref") || "";
        const pays = await listingPaid(env, new URLSearchParams({ listing: ref }));
        if (!pays.paid && q.get("force") !== "1")
          return json({ ok:false, error:"that listing has not been paid for (add &force=1 to publish it anyway)" }, cors, 400);
        const skus = pays.rows.filter(x => x.paid).map(x => x.sku);
        return json(await publishListing(env, ref, { premium: skus.includes("wsd_premium"),
          partner: skus.includes("wsd_partner"), email: (pays.rows[0] || {}).email || "",
          session: "by hand", cents: 0, live: 1 }), cors);
      }
      if (a === "unpublish") return json(await unpublishListing(env, q.get("ref") || "", q.get("why") || "taken down by the founder"), cors);

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

  const items = names.map(n => ({ ...SKU[n] }));
  const sku = items[0];

  /* ⚠ A READER'S VERDICT IS PRICED BY THE READER, so the price is looked up
     at the moment of sale — from the writing database, where the reader set
     it — and the line says whose verdict it is. It is sold one at a time. */
  const reader = String(q.get("reader") || "").trim().toLowerCase();
  const rv = items.findIndex(x => x.dynamic);
  if (rv > -1) {
    if (items.length > 1) throw new Error("a reader's verdict is bought on its own");
    if (!reader || !env.WRITING) throw new Error("which reader?");
    const w = await env.WRITING.prepare(
      "SELECT email, name, price, status, called FROM w_writers WHERE email=?").bind(reader).first();
    if (!w || w.status !== "active") throw new Error("no such reader");
    if (!w.called) throw new Error("that reader has not been verified by the desk yet");
    const cents = Math.round(Number(w.price || 0) * 100);
    if (!(cents >= 100)) throw new Error("that reader has not set a price");
    items[rv].cents = cents;
    items[rv].label = "Warrant Wire — a verdict by " + (w.name || w.email);
    items[rv].reader = w.email;
  }

  /* ⚠ TWO SUBSCRIPTIONS CANNOT SHARE A SESSION. One subscription CAN carry
     one-off lines — Stripe puts them on the first invoice — which is how a
     monthly listing takes its add-ons (11 Sep 2026). The subscription has to
     be the first thing, because the first thing sets the session's mode. */
  const subs = items.filter(x => x.mode === "subscription").length;
  if (subs > 1) throw new Error("one subscription at a time");
  if (subs === 1 && sku.mode !== "subscription")
    throw new Error("the subscription goes first");

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

  const back = site.home + (site.back || "/thanks.html?s={CHECKOUT_SESSION_ID}");
  const off  = site.home + (site.off  || "/?cancelled=1");

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
  if (rv > -1) {                          /* whose verdict, and at what price, so the webhook can pay them */
    form.set("metadata[reader]", items[rv].reader);
    form.set("metadata[reader_cents]", String(items[rv].cents));
  }

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
    /* only the subscription lines recur; the add-ons on the same session are
       one-off and land on the first invoice */
    items.forEach((it, i) => {
      if (it.mode === "subscription")
        form.set("line_items[" + i + "][price_data][recurring][interval]", "month");
    });
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
      const one = { ...SKU[name] };
      /* a reader's verdict carries its real price in the metadata */
      if (one.dynamic) {
        one.cents = parseInt(m.reader_cents || "0", 10) || 0;
        one.reader = m.reader || null;
      }
      /* ⚠ EACH ONE GETS ITS OWN REFERENCE so a retry cannot grant it twice.
         The session id alone would collide across the lines of one session. */
      let had = null;
      try {
        had = await env.OVERHANG.prepare(
          "SELECT id FROM entitlements WHERE stripe_session = ? AND sku = ?")
          .bind(o.id + "#" + name, name).first();
      } catch (e) { had = null; }
      if (had) continue;
      await grant(env, m.email, name, one, m.ref, o.id + "#" + name, one.cents, one.reader || null);
      /* ⚠ A SUBSCRIPTION'S ID IS KEPT so that when it is cancelled the
         entitlement ends with it (see customer.subscription.deleted). Before
         this it was never written, so nothing ever ended. */
      if (one.mode === "subscription" && o.subscription) {
        await env.OVERHANG.prepare("UPDATE entitlements SET stripe_sub=? WHERE stripe_session=?")
          .bind(String(o.subscription), o.id + "#" + name).run().catch(()=>{});
      }
      await log(env, { kind:"paid", sku:name, email:m.email, ref:m.ref,
                       cents:one.cents, session:o.id + "#" + name,
                       live: o.livemode ? 1 : 0 });
      /* ⚠ THE VERDICTS HAVE TWO EXTRA CONSEQUENCES. A founder's verdict is a
         REQUEST that lands on his desk. A reader's verdict is MONEY OWED to
         the reader — gross less the house's flat $50 — written to the ledger
         the moment it is paid, and paid out from there. */
      if (name === "founder_verdict" && env.WRITING) {
        await env.WRITING.prepare(
          `CREATE TABLE IF NOT EXISTS w_requests (
             id INTEGER PRIMARY KEY AUTOINCREMENT, ticker TEXT, buyer TEXT, session TEXT,
             cents INTEGER, asked TEXT DEFAULT (datetime('now')), done TEXT)`).run().catch(()=>{});
        await env.WRITING.prepare(
          "INSERT INTO w_requests (ticker, buyer, session, cents) VALUES (?,?,?,?)")
          .bind(String(m.ref || "").toUpperCase(), m.email, o.id + "#" + name, one.cents).run().catch(()=>{});
      }
      if (name === "reader_verdict" && one.reader) {
        await owe(env, { reader: one.reader, ticker: String(m.ref || "").toUpperCase(),
          buyer: m.email, gross: one.cents, house: one.house_cents || 5000,
          session: o.id + "#" + name, on: m.on || "wire", live: o.livemode ? 1 : 0 });
      }
      await toAccountant(env, {
        business: one.site === "k8" ? "8k10q" : one.site === "wsd" ? "wallstdomains" : "wire",
        source: "stripe", gross: one.cents / 100,
        sku: name, ref: m.ref || "", who: m.email || "",
        id: o.id + "#" + name, live: o.livemode ? 1 : 0 });
    }

    /* ⚠ A PAID LISTING GOES LIVE BY ITSELF. His rule, 11 Sep 2026: "would
       rather it went live and then I could take it down if false" — so the
       moment the listing plan is paid, the domain is written to the
       marketplace and he is emailed. Nothing here throws: a failure to
       publish is logged as publish-failed and can be retried by hand with
       ?action=publish&ref=. The payment stands either way. */
    if (bought.some(n => n === "wsd_month" || n === "wsd_year") && m.ref) {
      try {
        const out = await publishListing(env, m.ref, {
          premium: bought.includes("wsd_premium"),
          partner: bought.includes("wsd_partner"),
          email: buyerEmail, session: o.id, cents: o.amount_total, live: o.livemode ? 1 : 0 });
        await log(env, { kind: out.ok ? "published" : "publish-failed", email: buyerEmail,
          ref: m.ref, session: o.id, note: out.ok ? out.name : out.error });
      } catch (e) {
        await log(env, { kind:"publish-failed", email: buyerEmail, ref: m.ref, session: o.id, note: String(e) });
      }
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

async function grant(env, email, skuName, sku, ref, session, cents, reader) {
  if (!email) return;
  try { await env.OVERHANG.prepare("ALTER TABLE entitlements ADD COLUMN reader TEXT").run(); } catch (e) {}
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
                               stripe_session, cents, reader)
     VALUES (?,?,?,?,?, date('now','+' || ? || ' days'), ?, ?, ?)`
  ).bind(email.toLowerCase(), sku.grants, skuName, ref || null,
         sku.qty || 1, sku.days, session || null, cents || sku.cents, reader || null).run();
}

/* ============================================================
   THE GIG LEDGER — what is owed to readers, and what has been paid

   ⚠ WRITTEN THE MOMENT THE SALE IS PAID, never later from memory. gross is
   what the buyer paid, house is the flat take, net is the reader's. paid_at
   is empty until the money has actually gone.

   ⚠ STRIPE CONNECT PAYS IT OUT. When a reader has a connected account
   (stripe_account on their row in the writing database, from Connect
   onboarding), the net is transferred to them here and now and the row is
   marked paid with the transfer id. Until then the row waits, and the
   founder pays it from ?action=payouts and marks it with ?action=paidout.
   ============================================================ */
async function owe(env, r) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS gig_payouts (
       id INTEGER PRIMARY KEY AUTOINCREMENT, reader TEXT NOT NULL, ticker TEXT, buyer TEXT,
       gross INTEGER, house INTEGER, net INTEGER, session TEXT UNIQUE, site TEXT, live INTEGER DEFAULT 0,
       created_at TEXT DEFAULT (datetime('now')), paid_at TEXT, paid_how TEXT, paid_ref TEXT)`).run();
  for (const col of ["approval TEXT", "why TEXT", "hold_until TEXT", "decided_at TEXT"]) {
    try { await env.OVERHANG.prepare("ALTER TABLE gig_payouts ADD COLUMN " + col).run(); } catch (e) {}
  }
  const net = Math.max(0, (r.gross || 0) - (r.house || 0));
  /* ⚠ HELD TWO DAYS. His ruling: two days maximum, and the writers must
     know it. Somebody could write garbage; the buyer has forty-eight hours to
     say "not worth it". "Worth it" ends the hold early; silence releases
     it on the second day. */
  await env.OVERHANG.prepare(
    `INSERT OR IGNORE INTO gig_payouts (reader, ticker, buyer, gross, house, net, session, site, live, hold_until)
     VALUES (?,?,?,?,?,?,?,?,?, datetime('now','+2 days'))`)
    .bind(r.reader, r.ticker || null, r.buyer || null, r.gross || 0, r.house || 0, net, r.session, r.on || "wire", r.live || 0).run();
}

/* ============================================================
   STRIPE CONNECT — a reader's payout account, set up once

   The writing desk sends the reader here with a ten-minute one-time token
   (?connect=connect-…). This worker asks the desk whose token it is, makes
   an Express account under the platform (named Nujobi on Stripe), saves
   acct_… on the writer's row, and hands the reader to Stripe's own
   onboarding — identity, bank account, tax details, all Stripe's. Stripe
   returns them to ?connected=1&acct=…, which confirms and sends them back
   to the desk. No secret is shared between the two workers.
   ============================================================ */
const WRITE_DESK = "https://warrantwire.com";

async function stripe(env, path, form) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST",
    headers: { "Authorization": "Bearer " + env.STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? form.toString() : "" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("Stripe " + r.status));
  return j;
}

async function connectStart(env, q, request) {
  const bad = m => new Response("Payout setup could not start: " + m + "\n\nGo back to the desk and try again.", { status: 400, headers: { "content-type": "text/plain" } });
  if (!env.STRIPE_KEY || !env.WRITING) return bad("the pay desk is not configured");
  const t = String(q.get("connect") || "");
  let who;
  try { who = await (await fetch(WRITE_DESK + "/api/w/connect-token?t=" + encodeURIComponent(t))).json(); } catch (e) { who = null; }
  if (!who || !who.ok || !who.email) return bad("that link has expired");

  let acct = who.stripe_account;
  try {
    if (!acct) {
      const f = new URLSearchParams({ type: "express", email: who.email });
      f.set("capabilities[transfers][requested]", "true");
      f.set("business_type", "individual");
      f.set("metadata[writer]", who.email);
      f.set("settings[payouts][schedule][interval]", "daily");
      const a = await stripe(env, "accounts", f);
      acct = a.id;
      await env.WRITING.prepare("UPDATE w_writers SET stripe_account=? WHERE email=?").bind(acct, who.email).run();
      await log(env, { kind: "connect-created", email: who.email, note: acct });
    }
    const origin = new URL(request.url).origin;
    const l = await stripe(env, "account_links", new URLSearchParams({
      account: acct, type: "account_onboarding",
      refresh_url: WRITE_DESK + "/write/verdict?payouts=again",
      return_url: origin + "/?connected=1&acct=" + encodeURIComponent(acct) }));
    return new Response(null, { status: 303, headers: { location: l.url } });
  } catch (e) {
    return bad(String(e.message || e));
  }
}

/* back from Stripe: is the account able to receive transfers yet? */
async function connectBack(env, q) {
  const acct = String(q.get("acct") || "");
  let ready = false;
  try {
    const r = await fetch("https://api.stripe.com/v1/accounts/" + encodeURIComponent(acct), { headers: { "Authorization": "Bearer " + env.STRIPE_KEY } });
    const a = await r.json();
    ready = !!(a && a.payouts_enabled);
    if (a && a.metadata && a.metadata.writer)
      await log(env, { kind: ready ? "connect-ready" : "connect-pending", email: a.metadata.writer, note: acct });
  } catch (e) {}
  return new Response(null, { status: 303, headers: { location: WRITE_DESK + "/write/verdict?payouts=" + (ready ? "ready" : "pending") } });
}

/* ⚠ THE BUYER'S SAY. ok=1 approves and releases; ok=0 disputes and holds it
   for the founder. Only the email that paid can say it, and only once. */
async function buyerSays(env, q) {
  const session = String(q.get("session") || "").trim();
  const email = String(q.get("email") || "").trim().toLowerCase();
  const ok = q.get("ok") === "1";
  const why = String(q.get("why") || "").slice(0, 600);
  if (!session || !email) return { ok:false, error:"the session and the email you paid with" };
  const row = await env.OVERHANG.prepare("SELECT * FROM gig_payouts WHERE session=? AND buyer=?").bind(session, email).first().catch(()=>null);
  if (!row) return { ok:false, error:"no such purchase on that address" };
  if (row.paid_at) return { ok:true, already:true, note:"That reader has already been paid; your note is kept.", approval: row.approval };
  if (row.approval) return { ok:true, already:true, approval: row.approval, note:"You have already said so." };
  await env.OVERHANG.prepare("UPDATE gig_payouts SET approval=?, why=?, decided_at=datetime('now') WHERE id=?")
    .bind(ok ? "approved" : "disputed", why || null, row.id).run();
  await log(env, { kind: ok ? "verdict-approved" : "verdict-disputed", email, ref: row.ticker, session, note: why || null });
  return { ok:true, approval: ok ? "approved" : "disputed",
    note: ok ? "Thank you. The reader is paid." : "Noted. The payment is held and the founder will look at it. You will hear back at " + email + "." };
}

/* ⚠ RELEASE: pay everything that is due — approved, or seven days old with
   no dispute — to readers with a Stripe Connect account. Run by the cron
   every six hours, or by hand with ?action=release. Disputed rows never
   move here; the founder decides those one at a time. */
async function release(env) {
  if (!env.WRITING || !env.STRIPE_KEY) return { ok:false, error:"no WRITING binding or no Stripe key" };
  const due = await env.OVERHANG.prepare(
    `SELECT * FROM gig_payouts WHERE paid_at IS NULL AND net > 0
        AND (approval = 'approved' OR (approval IS NULL AND hold_until <= datetime('now')))   /* two days, or approved */
      ORDER BY id LIMIT 50`).all().catch(()=>({results:[]}));
  const out = [];
  for (const r of (due.results || [])) {
    let acct = null;
    try { const w = await env.WRITING.prepare("SELECT stripe_account FROM w_writers WHERE email=?").bind(r.reader).first(); acct = w && w.stripe_account; } catch (e) {}
    if (!acct || !/^acct_/.test(acct)) { out.push({ id: r.id, reader: r.reader, net: r.net, waiting: "no Stripe Connect account yet" }); continue; }
    try {
      const form = new URLSearchParams({ amount: String(r.net), currency: "usd", destination: acct,
        description: "Verdict on " + (r.ticker || "?") + " — Warrant Wire" });
      form.set("metadata[session]", r.session);
      const t = await fetch("https://api.stripe.com/v1/transfers", { method: "POST",
        headers: { "Authorization": "Bearer " + env.STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString() });
      const j = await t.json();
      if (t.ok && j.id) {
        await env.OVERHANG.prepare("UPDATE gig_payouts SET paid_at=datetime('now'), paid_how='stripe', paid_ref=? WHERE id=?").bind(j.id, r.id).run();
        out.push({ id: r.id, reader: r.reader, net: r.net, paid: j.id });
      } else {
        await log(env, { kind:"payout-failed", email: r.reader, ref: r.ticker, cents: r.net, session: r.session, note: (j.error && j.error.message) || "transfer refused" });
        out.push({ id: r.id, reader: r.reader, net: r.net, failed: (j.error && j.error.message) || "refused" });
      }
    } catch (e) { out.push({ id: r.id, reader: r.reader, net: r.net, failed: String(e).slice(0, 100) }); }
  }
  return { ok:true, build: BUILD, considered: out.length, rows: out };
}

/* ⚠ A REFUND, THE FOUNDER'S DECISION ON A DISPUTE. The money goes back to
   the buyer through Stripe, the reader's row is closed as refunded, and the
   buyer keeps nothing — the entitlement ends too. */
async function refund(env, q) {
  const id = parseInt(q.get("id") || "0", 10);
  const row = id ? await env.OVERHANG.prepare("SELECT * FROM gig_payouts WHERE id=?").bind(id).first() : null;
  if (!row) return { ok:false, error:"which row?" };
  if (row.paid_at) return { ok:false, error:"already settled: " + row.paid_how };
  const sess = String(row.session || "").split("#")[0];
  const s = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sess),
    { headers: { "Authorization": "Bearer " + env.STRIPE_KEY } }).then(r => r.json()).catch(()=>null);
  if (!s || !s.payment_intent) return { ok:false, error:"could not find the payment on Stripe" };
  const f = new URLSearchParams({ payment_intent: String(s.payment_intent) });
  const r = await fetch("https://api.stripe.com/v1/refunds", { method:"POST",
    headers: { "Authorization": "Bearer " + env.STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() });
  const j = await r.json();
  if (!r.ok || !j.id) return { ok:false, error: (j.error && j.error.message) || "Stripe refused the refund" };
  await env.OVERHANG.prepare("UPDATE gig_payouts SET paid_at=datetime('now'), paid_how='refunded', paid_ref=?, net=0 WHERE id=?").bind(j.id, id).run();
  await env.OVERHANG.prepare("UPDATE entitlements SET status='refunded' WHERE stripe_session=?").bind(row.session).run().catch(()=>{});
  await log(env, { kind:"refunded", email: row.buyer, ref: row.ticker, cents: row.gross, session: row.session, note: "verdict by " + row.reader });
  return { ok:true, refund: j.id, row };
}

/* ⚠ WHAT ONE CHECKOUT SESSION BOUGHT — asked by the Wall St Domains seller
   page when Stripe sends the buyer back with the session id in the address.
   The session id is Stripe's own unguessable token; nothing is granted here,
   the webhook did that. If the webhook has not landed yet (it is usually a
   second or two behind the redirect), `paid` is false and the page asks
   again. Returns the submission id (`ref`) so the page can mark the right
   listing paid, and the email so the seller's record and the receipt agree. */
async function sessionPaid(env, q) {
  const s = String(q.get("paid") || "").trim();
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(s)) throw new Error("that is not a checkout session");
  const r = await env.OVERHANG.prepare(
    `SELECT email, sku, grants, ref, ends_on, cents, stripe_sub
       FROM entitlements WHERE stripe_session LIKE ? AND status='active'`)
    .bind(s + "#%").all().catch(()=>({results:[]}));
  const rows = r.results || [];
  if (!rows.length) return { ok:true, paid:false, session:s,
    note:"not recorded yet — Stripe's confirmation may still be on its way; ask again in a moment" };
  return { ok:true, paid:true, session:s, email: rows[0].email, ref: rows[0].ref || null,
    skus: rows.map(x => x.sku), grants: rows.map(x => x.grants),
    ends_on: rows[0].ends_on, cents: rows.reduce((n, x) => n + (x.cents || 0), 0),
    subscription: rows.some(x => x.stripe_sub) };
}

/* ⚠ THE PAYMENT RECORD FOR ONE LISTING, by the marketplace's submission id
   (a UUID it made itself — not guessable, and it names nothing but that one
   seller's own listing). The marketplace database cannot be told "paid" from
   a browser, and should not be; this is where the truth of a listing's
   payment lives, and its admin desk reads it from here. */
async function listingPaid(env, q) {
  const ref = String(q.get("listing") || "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(ref)) throw new Error("that is not a submission id");
  const r = await env.OVERHANG.prepare(
    `SELECT email, sku, grants, started_on, ends_on, cents, status, stripe_sub, stripe_session
       FROM entitlements WHERE ref = ? AND sku LIKE 'wsd_%' ORDER BY id`)
    .bind(ref).all().catch(()=>({results:[]}));
  const rows = (r.results || []).map(x => ({ paid: x.status === "active", email: x.email, sku: x.sku,
    grants: x.grants, started_on: x.started_on, ends_on: x.ends_on, cents: x.cents, status: x.status,
    subscription: !!x.stripe_sub, session: String(x.stripe_session || "").split("#")[0] }));
  return { ok:true, ref, paid: rows.some(x => x.paid), rows };
}

/* ============================================================
   PUBLISHING A PAID LISTING ON WALL ST DOMAINS — 11 Sep 2026

   The marketplace keeps its data in Supabase. The browser may add a seller's
   submission but may not read it back or write the domains table; only the
   service key may, and it lives here as a secret (SUPABASE_SERVICE_KEY,
   pasted by the founder — never in code). SUPABASE_URL is a plain variable.

   publishListing: read the submission by id, write one row to `domains`
   (the name, category, prices, the seller's story and video, the Premium
   badge and the Partnership option as paid), mark the submission approved
   and paid, and email the founder. Written so a second call does not make a
   second row.
   ============================================================ */
const WSD_HOME = "https://wallstdomains.com";

function sb(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) return null;
  return {
    url,
    headers: { "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json" }
  };
}

async function sbGet(s, path) {
  const r = await fetch(s.url + "/rest/v1/" + path, { headers: s.headers });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + ((j && (j.message || j.error)) || "refused"));
  return j;
}
async function sbWrite(s, method, path, body, prefer) {
  const r = await fetch(s.url + "/rest/v1/" + path, {
    method, headers: { ...s.headers, "Prefer": prefer || "return=representation" },
    body: body == null ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + ((j && (j.message || j.error)) || t.slice(0, 200)));
  return j;
}

async function sbCheck(env) {
  const s = sb(env);
  if (!s) return { ok:false, build: BUILD, supabase: "NOT CONFIGURED",
    url_set: !!env.SUPABASE_URL, key_set: !!env.SUPABASE_SERVICE_KEY };
  try {
    /* count=exact with limit=0: the header carries the total, no rows come back */
    const r = await fetch(s.url + "/rest/v1/domains?select=id&limit=0",
      { headers: { ...s.headers, "Prefer": "count=exact" } });
    const range = r.headers.get("content-range") || "";
    const total = Number((range.split("/")[1] || "").trim());
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok:false, build: BUILD, supabase: "REFUSED " + r.status, detail: t.slice(0, 200),
        key_shape: String(env.SUPABASE_SERVICE_KEY).slice(0, 10) + "…" };
    }
    return { ok:true, build: BUILD, supabase: "reachable", domains_in_table: isNaN(total) ? null : total };
  } catch (e) {
    return { ok:false, build: BUILD, supabase: "UNREACHABLE", error: String(e) };
  }
}

/* the number in "asking $12,000" and its kin, when the old form put prices in the notes */
function notesNumber(notes, label) {
  const m = new RegExp(label + "\\s*\\$\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)", "i").exec(String(notes || ""));
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

async function publishListing(env, ref, opts) {
  const s = sb(env);
  if (!s) return { ok:false, error:"SUPABASE_URL / SUPABASE_SERVICE_KEY not set on the pay worker — the listing is paid and waiting; set the secret and run ?action=publish&ref=" + ref };
  if (!/^[0-9a-fA-F-]{36}$/.test(String(ref))) return { ok:false, error:"that is not a submission id" };

  const rows = await sbGet(s, "domain_sell_submissions?id=eq." + ref + "&select=*");
  const sub = Array.isArray(rows) ? rows[0] : null;
  if (!sub) return { ok:false, error:"no submission " + ref };

  const name = String(sub.domains || "").trim().split(/[\s,]+/)[0];
  if (!name) return { ok:false, error:"the submission names no domain" };

  const buy   = Number(sub.sell_price)    || notesNumber(sub.notes, "asking");
  const m1    = Number(sub.rent_price_1m) || notesNumber(sub.notes, "rent") ;
  const m6    = Number(sub.rent_price_6m) || 0;
  const m12   = Number(sub.rent_price_12m)|| 0;
  const story = sub.domain_story || ("Listed by " + (sub.seller_name || sub.name || "its owner") + ".");
  const premium = !!(opts.premium || sub.is_premium_listing);
  const partner = !!(opts.partner || sub.partnership_offered);

  /* one row per name: a re-run updates instead of duplicating */
  const had = await sbGet(s, "domains?name=ilike." + encodeURIComponent(name) + "&select=id,name");
  const row = {
    name, category: sub.category || "unique",
    buy_price: buy, rent_price: m6, monthly_rent_price: m1, yearly_rent_price: m12,
    is_sold: false, is_premium: premium, section: premium ? "premium" : "portfolio",
    origin_story: story, video_url: sub.video_url || null,
    meta_title: name + " — for sale on Wall St Domains",
    meta_description: story.slice(0, 155), keywords: [name, sub.category].filter(Boolean).join(", "),
    partnership_available: partner,
    partnership_terms: partner ? "The owner will consider equity in the business built on this name." : null,
    seller_email: sub.email || opts.email || null, seller_name: sub.seller_name || sub.name || null
  };
  let dom;
  if (Array.isArray(had) && had.length) {
    dom = await sbWrite(s, "PATCH", "domains?id=eq." + had[0].id, row);
    dom = Array.isArray(dom) ? dom[0] : dom;
  } else {
    dom = await sbWrite(s, "POST", "domains", row);
    dom = Array.isArray(dom) ? dom[0] : dom;
  }

  await sbWrite(s, "PATCH", "domain_sell_submissions?id=eq." + ref, {
    status: "approved", approved: true, approved_at: new Date().toISOString(), approved_by: "paid — published automatically",
    payment_status: "paid", partnership_fee_paid: partner, domain_pointed: false
  }, "return=minimal").catch(() => {});

  const page = WSD_HOME + "/domain/" + encodeURIComponent(name);
  await mailFounder(env, "New paid listing: " + name + (premium ? " (Premium)" : ""),
    [ name + " is live: " + page,
      "",
      "Seller: " + (sub.seller_name || sub.name || "?") + " · " + (sub.email || "?") + " · " + (sub.phone || sub.tel_number || "?") + (sub.whatsapp_number ? " · WhatsApp " + sub.whatsapp_number : ""),
      "Plan paid: " + (opts.cents ? "$" + (opts.cents / 100) : "(by hand)") + (premium ? " + Premium" : "") + (partner ? " + Partnership" : "") + " · Stripe " + (opts.session || ""),
      "Asking $" + buy + (m1 ? " · rent $" + m1 + "/mo" : "") + (m6 ? " · $" + m6 + "/6mo" : "") + (m12 ? " · $" + m12 + "/yr" : ""),
      "",
      "Story: " + story,
      sub.video_url ? "Video: " + sub.video_url : "",
      "",
      "Call the seller. If it is false, take it down:",
      "  https://pay.realroofers.workers.dev/?action=unpublish&ref=" + ref + "&key=YOUR-KEY",
      "(the listing comes off the site; the submission stays in the queue as rejected)"
    ].filter(x => x !== null).join("\n"));

  return { ok:true, name, page, domain_id: dom && dom.id, premium, partner, submission: ref };
}

async function unpublishListing(env, ref, why) {
  const s = sb(env);
  if (!s) return { ok:false, error:"SUPABASE_URL / SUPABASE_SERVICE_KEY not set on the pay worker" };
  if (!/^[0-9a-fA-F-]{36}$/.test(String(ref))) return { ok:false, error:"that is not a submission id" };
  const rows = await sbGet(s, "domain_sell_submissions?id=eq." + ref + "&select=id,domains,name,email");
  const sub = Array.isArray(rows) ? rows[0] : null;
  if (!sub) return { ok:false, error:"no submission " + ref };
  const name = String(sub.domains || "").trim().split(/[\s,]+/)[0];
  /* off the site — the row in domains goes; the submission stays, marked */
  const gone = await sbWrite(s, "DELETE", "domains?name=ilike." + encodeURIComponent(name), null);
  await sbWrite(s, "PATCH", "domain_sell_submissions?id=eq." + ref, {
    status: "rejected", approved: false, approved_at: null, approved_by: why
  }, "return=minimal").catch(() => {});
  await log(env, { kind:"unpublished", ref, email: sub.email || null, note: name + " — " + why });
  return { ok:true, name, removed: Array.isArray(gone) ? gone.length : null, submission: ref, why };
}

/* Cloudflare Email Service: the EMAIL send_email binding, from warrantwire.com,
   the same way the wire worker writes to readers. To the founder only. */
async function mailFounder(env, subject, text) {
  const to = env.FOUNDER_EMAIL || "realroofers@gmail.com";
  if (!(env.EMAIL && env.EMAIL.send)) { await log(env, { kind:"mail-skipped", note: subject }); return false; }
  try {
    await env.EMAIL.send({ from: { email: "desk@warrantwire.com", name: "Wall St Domains desk" }, to, subject, text });
    return true;
  } catch (e) { await log(env, { kind:"mail-failed", note: subject + " — " + String(e) }); return false; }
}

async function me(env, q) {
  const email = (q.get("me") === "1" ? q.get("email") : q.get("me")) || "";
  const e = email.trim().toLowerCase();
  if (!e || e.indexOf("@") < 1) throw new Error("an email address, please");

  try { await env.OVERHANG.prepare("ALTER TABLE entitlements ADD COLUMN reader TEXT").run(); } catch (e) {}
  const r = await env.OVERHANG.prepare(
    `SELECT grants, sku, ref, reader, qty, used, started_on, ends_on, status, stripe_session
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