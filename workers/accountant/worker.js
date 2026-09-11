/* ============================================================================
   THE ACCOUNTANT  —  Cloudflare Worker  ·  worker name: accountant
   One ledger. Every business, every way money arrives.

   Built 2026-09-11 · accountant-1a

   ----------------------------------------------------------------------------
   ⚠ WHY THIS EXISTS RATHER THAN THE BOOKS READING THE PAY WORKER.

   The books were reading `pay_log`, which only Stripe writes to, and only for
   the wire and 8K10Q. A bank payment through ACHplug lands somewhere else. A
   domain sale on WallStDomains lands somewhere else again. Pointing one page
   at four workers gives four sets of books that do not add up — which is worse
   than one set that is incomplete, because it LOOKS complete.

   So there is one table and everything writes to it. Stripe posts a sale here.
   ACHplug posts a sale here. A domain sale posts here. Cash gets typed in. The
   books are a view over that, and they cover everything by construction rather
   than by somebody remembering to add each new source.

   ----------------------------------------------------------------------------
   ⚠ THE SAME PAYMENT CAN NEVER BE COUNTED TWICE. `external_id` is UNIQUE.
   Stripe retries a webhook when it does not get a 200 quickly enough, and it
   is entirely normal for the same completed checkout to arrive three times.
   Without that constraint the books would show three sales and the money would
   show one — and the difference would be found weeks later, by hand.

   ⚠ EVERY FIGURE IS IN CENTS. Money in a floating point number is money that
   eventually disagrees with itself.

   ⚠ AND A FEE IS RECORDED, NEVER ESTIMATED, WHERE IT IS KNOWN. Stripe's own
   figure goes in the accounts. Where a caller does not send one, the fee is
   left NULL and the reading views show an estimate clearly labelled as one.
   A guess that looks like a fact is the thing that ends up in a tax return.

   ----------------------------------------------------------------------------
   BINDINGS   OVERHANG   D1 → overhang
   SECRETS    LOG_KEY

   POSTING — needs the key
     ?action=post        a payment arrived
     ?action=refund      money went back
     ?action=spend       an expense, typed in, starts unconfirmed
     ?action=verify&id=  somebody confirmed an expense WITH THE VENDOR

   READING — needs the key
     ?action=books       profit and loss, by month and by business
     ?action=journal     every payment, newest first
     ?action=unverified  what nobody has confirmed
     ?action=vendors
   ========================================================================== */

const BUILD = "accountant-1a · 2026-09-11";

/* ⚠ THE BUSINESSES, NAMED ONCE. A typo becomes a fifth business with one sale
   in it, and nobody notices until the totals are short. */
const BUSINESS = ["wire", "8k10q", "achplug", "wallstdomains",
                  "triggeredshort", "nujobi", "adhotbox", "other"];

/* how the money arrived */
const SOURCE = ["stripe", "ach", "paypal", "cash", "cheque", "wire", "manual"];

export default {
  async fetch(req, env) {
    const q = new URL(req.url).searchParams;
    const H = { "Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Headers":"X-Auth-Key, Content-Type",
                "Content-Type":"application/json", "Cache-Control":"no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: H });

    try {
      await setup(env);

      const key = req.headers.get("X-Auth-Key") || q.get("key");
      if (!key || key !== env.LOG_KEY)
        return json({ ok:false, error:"unauthorized" }, H, 401);

      const a = q.get("action") || "books";
      if (a === "post")       return json(await post(env, q), H);
      if (a === "refund")     return json(await refund(env, q), H);
      if (a === "spend")      return json(await spend(env, q), H);
      if (a === "verify")     return json(await verifyOne(env, q), H);
      if (a === "journal")    return json(await journal(env, q), H);
      if (a === "unverified") return json(await unverified(env), H);
      if (a === "vendors")    return json(await vendors(env), H);
      return json(await books(env, q), H);
    } catch (e) {
      return json({ ok:false, build: BUILD, error:String(e) }, H, 500);
    }
  }
};

async function setup(env) {
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS ledger (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       at TEXT NOT NULL DEFAULT (datetime('now')),
       on_day TEXT NOT NULL DEFAULT (date('now')),
       business TEXT NOT NULL,
       source TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'sale',   /* sale | refund */
       sku TEXT, ref TEXT, who TEXT,
       gross_cents INTEGER NOT NULL,
       fee_cents INTEGER,                   /* NULL where the fee is not known */
       currency TEXT NOT NULL DEFAULT 'USD',
       /* ⚠ THE THING THAT STOPS A RETRIED WEBHOOK BECOMING THREE SALES */
       external_id TEXT UNIQUE,
       live INTEGER NOT NULL DEFAULT 1,
       note TEXT)`).run();

  await env.OVERHANG.prepare(
    "CREATE INDEX IF NOT EXISTS ix_ledger_day ON ledger (on_day)").run();
  await env.OVERHANG.prepare(
    "CREATE INDEX IF NOT EXISTS ix_ledger_biz ON ledger (business)").run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS expenses (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       spent_on TEXT NOT NULL DEFAULT (date('now')),
       vendor TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'other',
       description TEXT, cents INTEGER NOT NULL,
       site TEXT NOT NULL DEFAULT 'shared',
       paid_by TEXT, invoice_no TEXT, recurring TEXT, note TEXT,
       /* ⚠ NULL UNTIL A PERSON HAS ASKED THE VENDOR. An invoice is not proof.
          His rule, and it is the whole reason this column exists. */
       verified_on TEXT, verified_how TEXT, verified_by TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();

  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS vendors (
       name TEXT PRIMARY KEY, what_for TEXT,
       added_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
}

/* ============================================================
   MONEY ARRIVING
   ============================================================ */
async function post(env, q) {
  const business = pick(q.get("business"), BUSINESS);
  const source   = pick(q.get("source"), SOURCE);
  const gross    = cents(q.get("gross") || q.get("amount"));
  const ext      = clean(q.get("id") || q.get("external_id"));

  const missing = [];
  if (!business) missing.push("business (" + BUSINESS.join(", ") + ")");
  if (!source)   missing.push("source (" + SOURCE.join(", ") + ")");
  if (!gross)    missing.push("gross, in dollars");
  /* ⚠ NO REFERENCE, NO ROW. Without one the same payment cannot be recognised
     on a retry, and a ledger that can double-count is not a ledger. */
  if (!ext)      missing.push("id — the processor's own reference for this payment");
  if (missing.length)
    return { ok:false, build: BUILD, error:"cannot record that", missing };

  const fee = q.get("fee") != null && q.get("fee") !== "" ? cents(q.get("fee")) : null;

  try {
    await env.OVERHANG.prepare(
      `INSERT INTO ledger (on_day, business, source, kind, sku, ref, who,
         gross_cents, fee_cents, currency, external_id, live, note)
       VALUES (COALESCE(?, date('now')),?,?,'sale',?,?,?,?,?,?,?,?,?)`)
      .bind(clean(q.get("on")) || null, business, source,
            clean(q.get("sku")) || null, clean(q.get("ref")) || null,
            clean(q.get("who") || q.get("email")).toLowerCase() || null,
            gross, fee, (clean(q.get("currency")) || "USD").toUpperCase(),
            ext, /^(0|no|false|test)$/i.test(q.get("live") || "") ? 0 : 1,
            clean(q.get("note")) || null).run();
  } catch (e) {
    /* ⚠ A DUPLICATE IS A SUCCESS, NOT AN ERROR. Stripe retries until it gets a
       200; answering with a failure makes it retry harder. The right reply to
       "this already happened" is yes, it did. */
    const had = await env.OVERHANG.prepare(
      "SELECT id, at, gross_cents FROM ledger WHERE external_id = ?").bind(ext).first();
    if (had) return { ok:true, build: BUILD, already: true, id: had.id,
      note:"That payment was already on the books. Nothing was added." };
    throw e;
  }

  return { ok:true, build: BUILD, business, source,
    dollars: gross / 100,
    fee: fee == null ? null : fee / 100,
    note: fee == null
      ? "Recorded. NO FEE WAS SENT, so the books will show an estimate and " +
        "say it is one."
      : "Recorded." };
}

async function refund(env, q) {
  const gross = cents(q.get("gross") || q.get("amount"));
  const ext   = clean(q.get("id") || q.get("external_id"));
  const of    = clean(q.get("of"));   /* the payment being refunded */
  if (!gross || !ext)
    return { ok:false, build: BUILD, error:"an amount and the processor's reference" };

  /* ⚠ A REFUND IS ITS OWN ROW, NEGATIVE, NEVER A DELETION. The sale happened.
     Erasing it would make the month look like the money was never taken, and
     a set of books that can forget is not a set of books. */
  let biz = pick(q.get("business"), BUSINESS), src = pick(q.get("source"), SOURCE);
  if (of) {
    const orig = await env.OVERHANG.prepare(
      "SELECT business, source, sku, who FROM ledger WHERE external_id = ?").bind(of).first();
    if (orig) { biz = biz || orig.business; src = src || orig.source; }
  }
  if (!biz || !src)
    return { ok:false, build: BUILD, error:"business and source, or `of` naming the original payment" };

  try {
    await env.OVERHANG.prepare(
      `INSERT INTO ledger (on_day, business, source, kind, sku, ref, who,
         gross_cents, fee_cents, external_id, live, note)
       VALUES (COALESCE(?, date('now')),?,?,'refund',?,?,?,?,?,?,?,?)`)
      .bind(clean(q.get("on")) || null, biz, src,
            clean(q.get("sku")) || null, of || null,
            clean(q.get("who") || q.get("email")).toLowerCase() || null,
            -Math.abs(gross), null, ext, 1,
            clean(q.get("why")) || clean(q.get("note")) || null).run();
  } catch (e) {
    const had = await env.OVERHANG.prepare(
      "SELECT id FROM ledger WHERE external_id = ?").bind(ext).first();
    if (had) return { ok:true, build: BUILD, already:true, id: had.id };
    throw e;
  }
  return { ok:true, build: BUILD, refunded: gross / 100, of: of || null };
}

/* ============================================================
   MONEY GOING OUT
   ============================================================ */
async function spend(env, q) {
  const vendor = clean(q.get("vendor"));
  const amount = cents(q.get("amount"));
  if (!vendor || !amount)
    return { ok:false, build: BUILD, error:"vendor and amount, please" };

  await env.OVERHANG.prepare(
    `INSERT INTO expenses (spent_on, vendor, category, description, cents, site,
       paid_by, invoice_no, recurring, note)
     VALUES (COALESCE(?, date('now')),?,?,?,?,?,?,?,?,?)`)
    .bind(clean(q.get("on")) || null, vendor,
          (clean(q.get("category")) || "other").toLowerCase(),
          clean(q.get("what")).slice(0, 300) || null,
          amount, (clean(q.get("site")) || "shared").toLowerCase(),
          clean(q.get("paid")) || null, clean(q.get("invoice")) || null,
          clean(q.get("recurring")) || null, clean(q.get("note")) || null).run();

  try {
    await env.OVERHANG.prepare(
      "INSERT OR IGNORE INTO vendors (name, what_for) VALUES (?,?)")
      .bind(vendor, (clean(q.get("category")) || "other").toLowerCase()).run();
  } catch (e) {}

  return { ok:true, build: BUILD, vendor, dollars: amount / 100,
    note:"Written, and UNCONFIRMED. It stays that way until somebody checks it " +
         "against the vendor — not against the invoice." };
}

async function verifyOne(env, q) {
  const id = q.get("id");
  if (!id) return { ok:false, error:"which one?" };
  await env.OVERHANG.prepare(
    `UPDATE expenses SET verified_on = COALESCE(?, date('now')),
       verified_how = ?, verified_by = ?, note = COALESCE(?, note)
     WHERE id = ?`)
    .bind(clean(q.get("on")) || null,
          clean(q.get("how")) || "asked the vendor",
          clean(q.get("by")) || "MN",
          clean(q.get("note")) || null, id).run();
  const row = await env.OVERHANG.prepare(
    "SELECT * FROM expenses WHERE id = ?").bind(id).first();
  return { ok:true, build: BUILD, row };
}

/* ============================================================
   READING IT

   ⚠ THE SHAPE MATCHES WHAT books.html ALREADY EXPECTS, so the page
   changes by one line — its API address — and nothing else.
   ============================================================ */

/* ⚠ THE ESTIMATE IS USED ONLY WHERE NO FEE WAS RECORDED, and every reply says
   how many rows it had to guess at. 2.9% and thirty cents is Stripe's ordinary
   card rate; the real one varies, and Stripe's own figure is what belongs in a
   tax return. */
const FEE_SQL =
  "COALESCE(fee_cents, CASE WHEN kind='sale' THEN gross_cents*0.029+30 ELSE 0 END)";

async function journal(env, q) {
  const biz   = pick(q.get("business") || q.get("site"), BUSINESS);
  const month = clean(q.get("month"));

  let sql = `SELECT id, at, on_day, business, source, kind, sku, ref, who,
                    ROUND(gross_cents/100.0,2) dollars,
                    ROUND(${FEE_SQL}/100.0,2) stripe_fee,
                    ROUND((gross_cents-${FEE_SQL})/100.0,2) net,
                    fee_cents IS NULL AS fee_estimated,
                    live, external_id
               FROM ledger WHERE 1=1`;
  const b = [];
  if (biz)   { sql += " AND business = ?"; b.push(biz); }
  if (month) { sql += " AND on_day LIKE ?"; b.push(month + "%"); }
  sql += " ORDER BY at DESC LIMIT 500";

  const st = env.OVERHANG.prepare(sql);
  const r = await (b.length ? st.bind(...b) : st).all();
  const rows = r.results || [];

  return { ok:true, build: BUILD,
    business: biz || "all", month: month || "all",
    sales: rows.length,
    gross: round(rows.reduce((n,x)=> n + (x.dollars||0), 0)),
    card_fees: round(rows.reduce((n,x)=> n + (x.stripe_fee||0), 0)),
    net: round(rows.reduce((n,x)=> n + (x.net||0), 0)),
    /* the page shows `site`; the ledger calls it `business` */
    rows: rows.map(x => Object.assign({ site: x.business }, x)),
    estimated_fees: rows.filter(x => x.fee_estimated).length,
    note: rows.some(x => x.fee_estimated)
      ? "Some fees are ESTIMATED at 2.9% plus thirty cents because the " +
        "processor's own figure was not recorded. Those are for reading, not " +
        "for filing."
      : "Every fee here is the processor's own figure." };
}

async function books(env, q) {
  const pl = await env.OVERHANG.prepare(
    `WITH months AS (
       SELECT DISTINCT substr(on_day,1,7) m FROM ledger
       UNION SELECT DISTINCT substr(spent_on,1,7) FROM expenses
     ),
     s AS (SELECT substr(on_day,1,7) m,
                  SUM(gross_cents) g, SUM(${FEE_SQL}) f
             FROM ledger GROUP BY m),
     e AS (SELECT substr(spent_on,1,7) m, SUM(cents) x,
                  SUM(CASE WHEN verified_on IS NULL THEN cents ELSE 0 END) u
             FROM expenses GROUP BY m)
     SELECT months.m month,
            ROUND(COALESCE(s.g,0)/100.0,2) revenue,
            ROUND(COALESCE(s.f,0)/100.0,2) card_fees,
            ROUND(COALESCE(e.x,0)/100.0,2) expenses,
            ROUND(COALESCE(e.u,0)/100.0,2) expenses_unconfirmed,
            ROUND((COALESCE(s.g,0)-COALESCE(s.f,0)-COALESCE(e.x,0))/100.0,2) profit
       FROM months LEFT JOIN s ON s.m=months.m LEFT JOIN e ON e.m=months.m
      ORDER BY months.m DESC LIMIT 36`).all();

  const sm = await env.OVERHANG.prepare(
    `SELECT substr(on_day,1,7) month, business site, COUNT(*) sales,
            ROUND(SUM(gross_cents)/100.0,2) gross,
            ROUND(SUM(${FEE_SQL})/100.0,2) card_fees,
            ROUND(SUM(gross_cents-${FEE_SQL})/100.0,2) net
       FROM ledger GROUP BY month, business
      ORDER BY month DESC, gross DESC LIMIT 120`).all();

  const ex = await env.OVERHANG.prepare(
    `SELECT substr(spent_on,1,7) month, site, category, COUNT(*) items,
            ROUND(SUM(cents)/100.0,2) dollars,
            ROUND(SUM(CASE WHEN verified_on IS NULL THEN cents ELSE 0 END)/100.0,2) unverified
       FROM expenses GROUP BY month, site, category
      ORDER BY month DESC, dollars DESC LIMIT 200`).all();

  const un = await unverified(env);
  const vn = await vendors(env);

  return { ok:true, build: BUILD,
    profit_and_loss: pl.results || [],
    sales_by_month: sm.results || [],
    expenses_by_month: ex.results || [],
    unverified: un.rows,
    unverified_total: un.total,
    vendors: vn.rows,
    note: un.rows.length
      ? un.rows.length + " expense" + (un.rows.length===1?"":"s") +
        " nobody has confirmed with the vendor."
      : "Everything on the books has been confirmed with the vendor." };
}

async function unverified(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT id, spent_on, vendor, category, description, invoice_no, site,
            ROUND(cents/100.0,2) dollars,
            CAST(julianday('now') - julianday(spent_on) AS INTEGER) days_old
       FROM expenses WHERE verified_on IS NULL
      ORDER BY spent_on LIMIT 200`).all();
  const rows = r.results || [];
  return { ok:true, build: BUILD, rows,
    total: round(rows.reduce((n,x)=> n + (x.dollars||0), 0)) };
}

async function vendors(env) {
  const r = await env.OVERHANG.prepare(
    `SELECT vendor, COUNT(*) items, ROUND(SUM(cents)/100.0,2) dollars,
            SUM(CASE WHEN verified_on IS NOT NULL THEN 1 ELSE 0 END) verified_items,
            MIN(spent_on) first_paid, MAX(spent_on) last_paid
       FROM expenses GROUP BY vendor ORDER BY dollars DESC LIMIT 100`).all();
  return { ok:true, build: BUILD, rows: r.results || [] };
}

/* ---------- small tools ---------- */
function clean(v){ return String(v == null ? "" : v).replace(/\s+/g," ").trim(); }
function pick(v, allowed){
  const x = clean(v).toLowerCase();
  return allowed.indexOf(x) > -1 ? x : null;
}
function cents(v){
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g,""));
  if (!isFinite(n) || n === 0) return 0;
  return Math.round(n * 100);
}
function round(n){ return +(Number(n)||0).toFixed(2); }
function json(o, h, s = 200){
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: h });
}