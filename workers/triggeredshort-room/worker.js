/* ============================================================================
   TRIGGERED SHORT — chat room Worker  (Cloudflare Workers + D1)

   Deploy
     wrangler d1 create triggeredshort
     wrangler d1 execute triggeredshort --file=./schema.sql --remote
     wrangler deploy

   wrangler.toml
     name = "triggeredshort-room"
     main = "worker.js"
     compatibility_date = "2026-01-01"
     [[d1_databases]]
     binding = "DB"
     database_name = "triggeredshort"
     database_id = "<id from create>"
     [vars]
     ADMIN_TOKEN = "<long random string>"

   Design rules baked in, not optional:
     - Nothing is ever DELETEd. Delete detaches identity; the post survives.
     - Nobody is anonymous. Posting requires a verified user.
     - Every post freezes its author badge at write time.
     - Ads and house items are injected by US. The network never picks
       what appears in the stream.
     - EVERY meta table is editable through /api/meta — one generic editor.
   ========================================================================== */

const DELETE_WINDOW_SECONDS = 24 * 60 * 60;

/* ---------------------------------------------------------------------------
   META TABLES — every one of these is editable from the admin console.
   To expose a new table: add it here. Nothing else to change.
   --------------------------------------------------------------------------- */
const META_TABLES = {
  ad_slots:      { pk: 'slot_key',      label: 'Ad slots',            autoId: false },
  ad_networks:   { pk: 'network_id',    label: 'Ad networks',         autoId: false },
  ad_blocklist:  { pk: 'id',            label: 'Ad blocklist',        autoId: true  },
  advertisers:   { pk: 'advertiser_id', label: 'Advertisers',         autoId: false },
  ad_campaigns:  { pk: 'campaign_id',   label: 'Ad campaigns',        autoId: false },
  house_feed:    { pk: 'item_id',       label: 'House feed (our RSS)',autoId: false },
  daily_market:  { pk: 'ticker',        label: 'Daily market data',   autoId: false,
                   compositePk: ['ticker','trade_date'] },
  filings:       { pk: 'accession',     label: 'Filings',             autoId: false },
  users:         { pk: 'internal_id',   label: 'Users',               autoId: false },
  user_positions:{ pk: 'internal_id',   label: 'Declared positions',  autoId: false,
                   compositePk: ['internal_id','ticker'] },
  calls:         { pk: 'call_id',       label: 'Calls (batting avg)', autoId: false },
  rooms:         { pk: 'room_key',      label: 'Rooms',               autoId: false },
  room_notices:  { pk: 'notice_id',     label: 'Room notices',        autoId: false },
  form_catalog:  { pk: 'form_type',     label: 'Form catalogue + fees', autoId: false },
  ticker_map:    { pk: 'ticker',        label: 'Ticker → CIK map',    autoId: false },
  venue_policy:  { pk: 'venue',         label: 'Venue policy (who gets a room)', autoId: false },
  refused_symbols:{pk: 'id',            label: 'Refused symbols',     autoId: true  },
  market_calendar:{pk: 'trade_date',    label: 'Market calendar'                    },
  status_rules:  {pk: 'id',             label: 'Status label rules'                 },
  company_sic:   {pk: 'ticker',         label: 'SIC codes (industry)'               },
  sic_codes:     {pk: 'sic',            label: 'SIC code dictionary'                },
  patents:       {pk: 'patent_id',      label: 'Patents'                            },
  patent_assignees:{pk:'id',            label: 'Patent assignee names', autoId: true},
  patent_notes:  {pk: 'ticker',         label: 'Patent method notes'                },
  status_history:{pk: 'id',             label: 'Status changes',      autoId: true  },
  morning_light: {pk: 'ticker',         label: 'This morning'                       },
  morning_light_rules:{pk:'id',         label: 'This morning — thresholds'          },
  company_profile:{pk: 'ticker',        label: 'Company profiles'                   },
  officers:      {pk: 'id',             label: 'Officers & directors', autoId: true },
  price_history: {pk: 'ticker',         label: 'Price history'                      },
  koch_figures:  {pk: 'ticker',         label: "How'm I Doin' figures"              },
  koch_receipts: {pk: 'id',             label: "How'm I Doin' receipts", autoId: true},
  option_adjustments:{pk:'id',          label: 'Option adjustments',  autoId: true  },
  crypto_market: { pk: 'trade_date',    label: 'Crypto market (sideline money)', autoId: false },
  contributors:  { pk: 'contributor_id',label: 'Newsroom contributors',autoId: false },
  articles:      { pk: 'article_id',    label: 'Articles',            autoId: false },
  assignments:   { pk: 'assignment_id', label: 'Assignments / leads', autoId: false },
  corrections:   { pk: 'correction_id', label: 'Corrections',         autoId: true  },
  account_tiers: { pk: 'tier',          label: 'Account tiers',       autoId: false },
  employee_history:{pk:'ticker',        label: 'Employee counts',     autoId: false,
                   compositePk: ['ticker','as_of'] },
  workforce_events:{pk:'event_id',      label: 'Layoffs / hiring',    autoId: false },
  premarket_session:{pk:'ticker',       label: 'Pre-market sessions', autoId: false,
                   compositePk: ['ticker','trade_date'] },
  financings:    { pk: 'financing_id',  label: 'Financings (priced)', autoId: false },
  features:      { pk: 'feature_id',    label: 'Features page',       autoId: false },
  suggestions:   { pk: 'suggestion_id', label: 'Suggestions inbox',   autoId: false },
};

/* --------------------------------------------------------------------------- */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8',
               'cache-control': 'no-store',
               'access-control-allow-origin': '*',
               'access-control-expose-headers': 'content-type' }
  });

const bad = (msg, status = 400) => json({ error: msg }, status);

function ulid() {
  const t = Date.now().toString(36).padStart(10, '0');
  const r = crypto.getRandomValues(new Uint8Array(10));
  return (t + Array.from(r, b => b.toString(36).padStart(2, '0')).join('')).toUpperCase();
}

const now = () => Math.floor(Date.now() / 1000);

/* US/Eastern trade date + session. The archive joins on this, so it must be
   the market's day, not the server's. */
function easternParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const mins = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  let session = 'closed';
  if (mins >= 240 && mins < 570) session = 'premarket';       // 04:00–09:29
  else if (mins >= 570 && mins < 960) session = 'regular';    // 09:30–15:59
  else if (mins >= 960 && mins < 1200) session = 'afterhours';// 16:00–19:59
  return { date, session };
}

const clean = s => String(s ?? '').replace(/\u0000/g, '').trim();

async function requireAdmin(req, env) {
  const t = req.headers.get('x-admin-token');
  if (!t || t !== env.ADMIN_TOKEN) return bad('unauthorized', 401);
  return null;
}

/* Session token -> user. Replace with real auth (Cloudflare Access, magic link,
   or your own signed cookie). Kept in one place so it is easy to swap. */
async function currentUser(req, env) {
  const token = req.headers.get('x-session') || '';
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT internal_id, handle, verified, account_type, tier, firm_name, firm_role,
            promo_allowed, standing_disclosure, disabled_at,
            posts_today, posts_today_on, total_posts
       FROM users WHERE internal_id = ?`).bind(token).first();
  if (!row || row.disabled_at) return null;
  return row;
}

/* ===========================================================================
   STREAM ASSEMBLY — posts, with ads and house items injected by us
   =========================================================================== */
async function buildStream(env, { roomKey, ticker, limit, before, viewer }) {
  const params = [];
  let where = `p.status <> 'frozen' AND p.held_for_review = 0`;
  if (roomKey) { where += ` AND p.room_key = ?`; params.push(roomKey); }
  else if (ticker) { where += ` AND p.ticker = ?`; params.push(ticker); }
  if (before)  { where += ` AND p.post_id < ?`; params.push(before); }

  const posts = (await env.DB.prepare(
    `SELECT p.post_id, p.ticker, p.room_key, p.body, p.redacted_body, p.created_at, p.trade_date,
            p.session, p.status, p.sentiment, p.author_type, p.author_firm,
            p.author_disclosure, p.is_promotional, p.declared_position,
            u.handle
       FROM posts p LEFT JOIN users u ON u.internal_id = p.internal_id
      WHERE ${where}
      ORDER BY p.post_id DESC LIMIT ?`).bind(...params, limit).all()).results || [];

  // Detached posts keep their content and lose their name.
  const items = posts.reverse().map(p => ({
    kind: 'post',
    id: p.post_id,
    ticker: p.ticker,
    room_key: p.room_key,
    body: p.redacted_body || p.body,
    redacted: !!p.redacted_body,
    at: p.created_at,
    timestamp_utc: new Date(p.created_at * 1000).toISOString(),
    trade_date: p.trade_date,
    session: p.session,
    sentiment: p.sentiment,
    author: p.status === 'detached'
      ? { display: 'A verified user', detached: true, type: p.author_type }
      : { display: p.handle, detached: false, type: p.author_type,
          firm: p.author_firm, disclosure: p.author_disclosure },
    promotional: !!p.is_promotional,
    position: p.declared_position
  }));

  // --- slot rules for the in-stream surface -------------------------------
  const slot = await env.DB.prepare(
    `SELECT * FROM ad_slots WHERE slot_key = 'stream_inline' AND enabled = 1`).first();
  if (!slot || !items.length) return items;

  const { date } = easternParts();
  const every = slot.every_n_posts || 12;

  // Direct campaigns only. allow_network is 0 on this slot by design.
  const ads = slot.allow_direct ? (await env.DB.prepare(
    `SELECT campaign_id, headline, body, cta_text, cta_url, image_url, disclosure,
            advertiser_id, target_tickers
       FROM ad_campaigns
      WHERE status = 'live' AND channel = 'direct' AND slot_key = 'stream_inline'
        AND approved_by IS NOT NULL
        AND starts_on <= ? AND ends_on >= ?
        AND (target_tickers IS NULL OR target_tickers = '' OR instr(target_tickers, ?) > 0)
      ORDER BY random() LIMIT 5`).bind(date, date, ticker || '~none~').all()).results || [] : [];

  const house = (await env.DB.prepare(
    `SELECT item_id, kind, headline, summary, url, ticker, published_at
       FROM house_feed
      WHERE (expires_at IS NULL OR expires_at > ?)
        AND (ticker IS NULL OR ticker = ?)
      ORDER BY priority DESC, published_at DESC LIMIT 5`)
    .bind(now(), ticker || '~none~').all()).results || [];

  if (!ads.length && !house.length) return items;

  // Interleave: house first (it is ours and free), then a direct ad.
  const out = [];
  let a = 0, h = 0, sinceSlot = 0, useHouse = true;
  for (const it of items) {
    out.push(it);
    sinceSlot++;
    if (sinceSlot >= every) {
      let injected = null;
      if (useHouse && house[h]) {
        const x = house[h++];
        injected = { kind: 'house', id: x.item_id, itemKind: x.kind, headline: x.headline,
                     summary: x.summary, url: x.url, at: x.published_at };
      } else if (ads[a]) {
        const x = ads[a++];
        injected = { kind: 'ad', channel: 'direct', id: x.campaign_id, headline: x.headline,
                     body: x.body, cta_text: x.cta_text, cta_url: x.cta_url,
                     image_url: x.image_url, disclosure: x.disclosure };
      }
      if (injected) {
        out.push(injected);
        sinceSlot = 0;
        useHouse = !useHouse;
      }
    }
  }
  return out;
}

/* ===========================================================================
   ROUTES
   =========================================================================== */

/* ============================================================================
   MARKET CLOSED NOTICE
   Posts one item to the house feed and one notice into the general market room
   on any day the market is shut, or shuts early. Runs from a cron trigger and
   can also be fired by hand from the admin console.
   Written because a closed market is easy to forget and expensive to forget.
   ========================================================================== */
async function postMarketNotice(env, forDate) {
  const day = forDate || new Date().toISOString().slice(0, 10);

  const cal = await env.DB.prepare(
    `SELECT trade_date, is_open, session, reason, early_close
       FROM market_calendar WHERE trade_date = ?`).bind(day).first();

  if (!cal) return { day, posted: false, why: 'no calendar row — ordinary session assumed' };
  if (cal.is_open === 1 && cal.session !== 'early')
    return { day, posted: false, why: 'market open, normal hours' };

  const closed = cal.is_open === 0;
  const id = 'MKT-' + day;

  const headline = closed
    ? `The market is closed today — ${cal.reason || 'holiday'}`
    : `Short session today — ${cal.reason || 'the market closes early'}`;

  const summary = closed
    ? `US equity markets are closed for ${cal.reason || 'a holiday'}. No regular trading, no pre-market, no closing price for ${day}. Orders you place today will not fill until the next session.`
    : `US equity markets close early today${cal.early_close ? ' at ' + cal.early_close : ''}. ${cal.reason || ''} Volume is usually thin and the closing price is set hours earlier than normal.`.trim();

  await env.DB.prepare(
    `INSERT OR REPLACE INTO house_feed
       (item_id, kind, headline, summary, url, ticker, published_at, priority, guid)
     VALUES (?, 'market', ?, ?, '', NULL, ?, 100, ?)`)
    .bind(id, headline, summary, now(), id).run();

  await env.DB.prepare(
    `INSERT OR REPLACE INTO room_notices
       (notice_id, room_key, ticker, source, form_type, headline, plain_english,
        url, filed_at, trade_date, is_material, created_at)
     VALUES (?, 'general:market', NULL, 'house', NULL, ?, ?, '', ?, ?, 0, ?)`)
    .bind(id, headline, summary, now(), day, now()).run();

  return { day, posted: true, closed, headline };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(postMarketNotice(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type,x-session,x-admin-token',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' } });
    }

    try {
      /* ---------- READ THE STREAM ------------------------------------- */
      if (path === '/api/stream' && method === 'GET') {
        const roomKey = url.searchParams.get('room') || null;
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase() || null;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
        const before = url.searchParams.get('before') || null;
        const viewer = await currentUser(req, env);
        const items = await buildStream(env, { roomKey, ticker, limit, before, viewer });

        // Log impressions for whatever we injected.
        const { date } = easternParts();
        for (const it of items) {
          if (it.kind === 'ad') {
            await env.DB.prepare(
              `INSERT INTO ad_events (campaign_id, event, ticker, trade_date, created_at, internal_id)
               VALUES (?,?,?,?,?,?)`)
              .bind(it.id, 'impression', ticker, date, now(),
                    viewer ? viewer.internal_id : null).run();
          }
        }
        return json({ ticker, items });
      }

      /* ---------- POST ------------------------------------------------- */
      if (path === '/api/post' && method === 'POST') {
        const user = await currentUser(req, env);
        if (!user) return bad('you must be signed in and verified to post', 401);
        if (!user.verified) return bad('account not yet verified', 403);

        const b = await req.json();
        const body = clean(b.body);
        if (!body) return bad('empty message');
        if (body.length > 4000) return bad('message too long');

        // ---- tier limits -------------------------------------------------
        const tier = await env.DB.prepare(
          `SELECT * FROM account_tiers WHERE tier = ?`).bind(user.tier || 'guest').first();
        if (!tier) return bad('unknown account tier', 403);

        const today = easternParts().date;
        const usedToday = (user.posts_today_on === today) ? user.posts_today : 0;
        if (tier.posts_per_day !== null && usedToday >= tier.posts_per_day)
          return bad(`Guests can post ${tier.posts_per_day} times a day. Verify your account to post more.`, 429);

        if (!tier.can_link && /https?:\/\//i.test(body))
          return bad('Links are not allowed on guest accounts.', 403);

        const needsReview =
          tier.requires_review && (user.total_posts || 0) < tier.review_first_n ? 1 : 0;

        let room_key = clean(b.room_key) || null;
        let ticker = clean(b.ticker).toUpperCase() || null;
        if (room_key && !ticker) {
          const r = await env.DB.prepare(
            `SELECT ticker, locked FROM rooms WHERE room_key = ?`).bind(room_key).first();
          if (!r) return bad('no such room', 404);
          if (r.locked) return bad('this room is locked', 403);
          ticker = r.ticker;
        }
        if (!room_key && ticker) room_key = ticker;
        if (!room_key) room_key = 'general:market';
        const sentiment = ['bullish','bearish','neutral'].includes(b.sentiment) ? b.sentiment : null;
        const isPromo = b.promotional ? 1 : 0;
        if (isPromo && (!user.promo_allowed || !tier.can_promote))
          return bad('this account is not approved to post promotional content', 403);

        const { date, session } = easternParts();
        const id = ulid();
        const ip = req.headers.get('cf-connecting-ip') || 'unknown';

        let declared = null;
        if (ticker) {
          const pos = await env.DB.prepare(
            `SELECT direction FROM user_positions WHERE internal_id = ? AND ticker = ?`)
            .bind(user.internal_id, ticker).first();
          declared = pos ? pos.direction : null;
        }

        await env.DB.prepare(
          `INSERT INTO posts (post_id, internal_id, ticker, room_key, body, created_at, trade_date,
                              session, ip, user_agent, status, sentiment,
                              author_type, author_firm, author_disclosure,
                              is_promotional, declared_position, author_tier, held_for_review)
           VALUES (?,?,?,?,?,?,?,?,?,?,'live',?,?,?,?,?,?,?,?)`)
          .bind(id, user.internal_id, ticker, room_key, body, now(), date, session, ip,
                req.headers.get('user-agent') || null, sentiment,
                user.account_type, user.firm_name, user.standing_disclosure,
                isPromo, declared, user.tier || 'guest', needsReview).run();

        await env.DB.prepare(
          `UPDATE users SET posts_today = ?, posts_today_on = ?, total_posts = total_posts + 1
            WHERE internal_id = ?`)
          .bind(usedToday + 1, date, user.internal_id).run();

        await env.DB.prepare(
          `UPDATE rooms SET last_post_at = ?, post_count = post_count + 1 WHERE room_key = ?`)
          .bind(now(), room_key).run();

        return json({ ok: true, post_id: id, room_key, ticker,
                      trade_date: date, session,
                      held_for_review: !!needsReview,
                      note: needsReview
                        ? 'Held for review. Your first few posts are read before they appear.'
                        : null,
                      remaining_today: tier.posts_per_day === null
                        ? null : tier.posts_per_day - (usedToday + 1),
                      timestamp_utc: new Date(now()*1000).toISOString() });
      }

      /* ---------- DELETE = DETACH, within 24h -------------------------- */
      if (path === '/api/post/delete' && method === 'POST') {
        const user = await currentUser(req, env);
        if (!user) return bad('not signed in', 401);
        const { post_id } = await req.json();
        const p = await env.DB.prepare(
          `SELECT post_id, internal_id, created_at, status FROM posts WHERE post_id = ?`)
          .bind(post_id).first();
        if (!p) return bad('not found', 404);
        if (p.internal_id !== user.internal_id) return bad('not your post', 403);
        if (p.status !== 'live') return bad('already removed');
        if (now() - p.created_at > DELETE_WINDOW_SECONDS)
          return bad('the 24 hour window has passed — this post is permanent', 409);

        await env.DB.prepare(
          `UPDATE posts SET status='detached', detached_at=? WHERE post_id=?`)
          .bind(now(), post_id).run();
        await env.DB.prepare(
          `INSERT INTO moderation_log (post_id, internal_id, action, reason, actor, created_at)
           VALUES (?,?,'detach','user request','user',?)`)
          .bind(post_id, user.internal_id, now()).run();

        return json({ ok: true, note: 'Your name is removed. The post remains in the record.' });
      }

      /* ---------- AD CLICK --------------------------------------------- */
      if (path === '/api/ad/click' && method === 'POST') {
        const { campaign_id, ticker } = await req.json();
        const viewer = await currentUser(req, env);
        const { date } = easternParts();
        await env.DB.prepare(
          `INSERT INTO ad_events (campaign_id, event, ticker, trade_date, created_at, internal_id)
           VALUES (?,'click',?,?,?,?)`)
          .bind(campaign_id, ticker || null, date, now(),
                viewer ? viewer.internal_id : null).run();
        return json({ ok: true });
      }

      /* ---------- THE DAY VIEW — the killer feature --------------------- */
      if (path === '/api/day' && method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase();
        const date = url.searchParams.get('date');
        if (!ticker || !date) return bad('ticker and date required');
        const ctx = await env.DB.prepare(
          `SELECT * FROM v_day_context WHERE ticker=? AND trade_date=?`)
          .bind(ticker, date).first();
        const posts = (await env.DB.prepare(
          `SELECT p.post_id, p.body, p.redacted_body, p.created_at, p.session, p.sentiment,
                  p.status, p.author_type, p.author_firm, u.handle
             FROM posts p LEFT JOIN users u ON u.internal_id = p.internal_id
            WHERE p.ticker=? AND p.trade_date=? AND p.status <> 'frozen'
            ORDER BY p.post_id ASC`).bind(ticker, date).all()).results || [];
        const filings = (await env.DB.prepare(
          `SELECT accession, form_type, items, url FROM filings
            WHERE ticker=? AND trade_date=?`).bind(ticker, date).all()).results || [];
        return json({ ticker, date, market: ctx || null, filings, posts });
      }

      /* ---------- SEARCH ------------------------------------------------ */
      if (path === '/api/search' && method === 'GET') {
        const q = clean(url.searchParams.get('q'));
        if (!q) return bad('q required');
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase() || null;
        const rows = (await env.DB.prepare(
          `SELECT p.post_id, p.ticker, p.body, p.trade_date, p.created_at, p.status, u.handle
             FROM posts_fts f
             JOIN posts p ON p.rowid = f.rowid
             LEFT JOIN users u ON u.internal_id = p.internal_id
            WHERE posts_fts MATCH ? AND p.status <> 'frozen'
              AND (? IS NULL OR p.ticker = ?)
            ORDER BY p.post_id DESC LIMIT 100`).bind(q, ticker, ticker).all()).results || [];
        return json({ q, ticker, results: rows });
      }

      /* =====================================================================
         META — one generic editor for every configuration table
         GET    /api/meta                     list editable tables
         GET    /api/meta/:table              rows
         POST   /api/meta/:table              insert
         PATCH  /api/meta/:table/:id          update
         DELETE /api/meta/:table/:id          remove  (config only — never posts)
         ===================================================================== */
      if (path === '/api/meta' && method === 'GET') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const out = {};
        for (const [t, cfg] of Object.entries(META_TABLES)) {
          const cols = (await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results || [];
          out[t] = { label: cfg.label, pk: cfg.compositePk || [cfg.pk], autoId: cfg.autoId,
                     columns: cols.map(c => ({ name: c.name, type: c.type,
                                               notnull: !!c.notnull, dflt: c.dflt_value })) };
        }
        return json({ tables: out });
      }

      if (path.startsWith('/api/meta/')) {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const parts = path.split('/').filter(Boolean);   // api, meta, table, id?
        const table = parts[2];
        const cfg = META_TABLES[table];
        if (!cfg) return bad('unknown table', 404);
        const pkCols = cfg.compositePk || [cfg.pk];

        if (method === 'GET') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 1000);
          const rows = (await env.DB.prepare(
            `SELECT * FROM ${table} LIMIT ?`).bind(limit).all()).results || [];
          return json({ table, rows });
        }

        if (method === 'POST') {
          const body = await req.json();
          if (!cfg.autoId && pkCols.length === 1 && !body[pkCols[0]]) body[pkCols[0]] = ulid();
          const keys = Object.keys(body);
          if (!keys.length) return bad('no fields');
          const sql = `INSERT INTO ${table} (${keys.join(',')})
                       VALUES (${keys.map(() => '?').join(',')})`;
          await env.DB.prepare(sql).bind(...keys.map(k => body[k])).run();
          return json({ ok: true, row: body });
        }

        if (method === 'PATCH') {
          const idPart = decodeURIComponent(parts[3] || '');
          const idVals = idPart.split('~');
          if (idVals.length !== pkCols.length) return bad('bad key');
          const body = await req.json();
          const keys = Object.keys(body).filter(k => !pkCols.includes(k));
          if (!keys.length) return bad('no fields to update');
          const sql = `UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')}
                        WHERE ${pkCols.map(c => `${c}=?`).join(' AND ')}`;
          await env.DB.prepare(sql).bind(...keys.map(k => body[k]), ...idVals).run();
          return json({ ok: true });
        }

        if (method === 'DELETE') {
          const idPart = decodeURIComponent(parts[3] || '');
          const idVals = idPart.split('~');
          if (idVals.length !== pkCols.length) return bad('bad key');
          const sql = `DELETE FROM ${table}
                        WHERE ${pkCols.map(c => `${c}=?`).join(' AND ')}`;
          await env.DB.prepare(sql).bind(...idVals).run();
          return json({ ok: true });
        }
      }

      /* ---------- MODERATION: freeze (threat escalation) ---------------- */
      if (path === '/api/mod/freeze' && method === 'POST') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const { post_id, reason, notified } = await req.json();
        await env.DB.prepare(
          `UPDATE posts SET status='frozen', frozen_at=?, frozen_reason=? WHERE post_id=?`)
          .bind(now(), reason || null, post_id).run();
        await env.DB.prepare(
          `INSERT INTO moderation_log (post_id, action, reason, actor, created_at, notified)
           VALUES (?,'freeze',?,'admin',?,?)`)
          .bind(post_id, reason || null, now(), notified || null).run();
        return json({ ok: true, note: 'Hidden from the room. Full record preserved.' });
      }

      /* ---------- REVENUE ---------------------------------------------- */
      if (path === '/api/revenue' && method === 'GET') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const rows = (await env.DB.prepare(
          `SELECT * FROM v_revenue_daily ORDER BY trade_date DESC LIMIT 120`).all()).results || [];
        return json({ rows });
      }


      /* =====================================================================
         ROOMS
         GET  /api/rooms                  list, most active first
         GET  /api/room?key=TOVX          one room + its notices
         POST /api/room/search            {q} -> resolves, AUTO-CREATES, returns room
         POST /api/room/join              {room_key}
         ===================================================================== */
      if (path === '/api/rooms' && method === 'GET') {
        const kind = url.searchParams.get('kind');
        const rows = (await env.DB.prepare(
          `SELECT r.room_key, r.kind, r.ticker, r.company_name, r.title, r.description,
                  r.post_count, r.member_count, r.last_post_at, r.pinned, r.locked,
                  j.verdict, j.net_change, j.pct_change, j.latest_employees
             FROM rooms r LEFT JOIN v_jobs j ON j.ticker = r.ticker
            WHERE r.archived = 0 AND (? IS NULL OR r.kind = ?)
            ORDER BY r.pinned DESC, r.last_post_at DESC NULLS LAST, r.post_count DESC
            LIMIT 200`).bind(kind, kind).all()).results || [];
        return json({ rooms: rows });
      }

      if (path === '/api/room' && method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) return bad('key required');
        const room = await env.DB.prepare(
          `SELECT * FROM rooms WHERE room_key = ?`).bind(key).first();
        if (!room) return bad('no such room', 404);
        const notices = (await env.DB.prepare(
          `SELECT notice_id, source, form_type, items, headline, plain_english, url,
                  filed_at, trade_date, is_material
             FROM room_notices WHERE room_key = ?
            ORDER BY filed_at DESC LIMIT 20`).bind(key).all()).results || [];
        const forms = (await env.DB.prepare(
          `SELECT form_type, label, plain_english, why_it_matters,
                  read_fee_cents, agent_fee_cents
             FROM form_catalog WHERE enabled = 1 ORDER BY weight DESC`).all()).results || [];
        const jobs = room.ticker
          ? await env.DB.prepare(`SELECT * FROM v_jobs WHERE ticker = ?`).bind(room.ticker).first()
          : null;
        return json({ room, notices, forms, jobs: jobs || null });
      }

      /* Searching a symbol CREATES the room if it does not exist. */
      if (path === '/api/room/search' && method === 'POST') {
        const { q } = await req.json();
        const raw = clean(q);
        if (!raw) return bad('q required');
        const ticker = raw.toUpperCase().replace(/[^A-Z.\-]/g, '').slice(0, 8);
        if (!ticker) return bad('not a symbol');

        const viewer = await currentUser(req, env);
        const { date } = easternParts();
        let created = 0;

        let room = await env.DB.prepare(
          `SELECT * FROM rooms WHERE room_key = ?`).bind(ticker).first();

        if (!room) {
          const map = await env.DB.prepare(
            `SELECT cik, company_name, listing_status, ever_national, current_venue
               FROM ticker_map WHERE ticker = ?`).bind(ticker).first();

          // Eligibility: was it ever on a national exchange?
          const venue = (map && map.current_venue) ? map.current_venue : 'UNKNOWN';
          const policy = await env.DB.prepare(
            `SELECT * FROM venue_policy WHERE venue = ?`).bind(venue).first();
          const everNational = map ? !!map.ever_national : false;
          const allowed = everNational || (policy && policy.allow_room === 1);

          if (!allowed) {
            await env.DB.prepare(
              `INSERT INTO refused_symbols (ticker, reason, venue, internal_id, created_at, trade_date)
               VALUES (?,?,?,?,?,?)`)
              .bind(ticker, 'not listed on a national exchange', venue,
                    viewer ? viewer.internal_id : null, now(), date).run();
            await env.DB.prepare(
              `INSERT INTO symbol_searches (query, ticker, internal_id, created_at, trade_date, created_room)
               VALUES (?,?,?,?,?,0)`)
              .bind(raw, ticker, viewer ? viewer.internal_id : null, now(), date).run();

            return json({
              room: null,
              created: false,
              refused: true,
              venue,
              danger_zone: true,
              headline: 'DANGER ZONE',
              message: (policy && policy.warn_label)
                || 'This symbol is not listed on the New York Stock Exchange, NYSE American or Nasdaq.',
              detail: 'We open rooms for companies that are, or once were, listed on a national '
                    + 'exchange — including companies now delisted or trading with a Q suffix in '
                    + 'bankruptcy. Those companies have a filing history you can read. Over-the-counter '
                    + 'symbols often do not, and there is nothing here to check a claim against. '
                    + 'That is why we stay out.',
              what_you_can_do: 'If you believe this symbol is or was listed on a national exchange, '
                    + 'tell us and we will check the record and open the room.'
            }, 200);
          }

          await env.DB.prepare(
            `INSERT INTO rooms (room_key, kind, ticker, cik, company_name, title,
                                description, created_at, created_by,
                                listing_status, current_venue, danger_zone)
             VALUES (?,'ticker',?,?,?,?,?,?,?,?,?,0)`)
            .bind(ticker, ticker, map ? map.cik : null, map ? map.company_name : null,
                  ticker, map && map.company_name ? map.company_name : 'Room opened by search',
                  now(), viewer ? viewer.internal_id : 'auto:search',
                  map ? map.listing_status : null, venue).run();
          room = await env.DB.prepare(
            `SELECT * FROM rooms WHERE room_key = ?`).bind(ticker).first();
          created = 1;

          // Companion options room, only where options are actually listed.
          if (map && map.has_options) {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO rooms
                 (room_key, kind, ticker, cik, company_name, title, description,
                  created_at, created_by, listing_status, current_venue,
                  instrument, parent_room_key, risk_banner)
               VALUES (?,'ticker',?,?,?,?,?,?,?,?,?,'options',?,?)`)
              .bind(ticker + ':OPTIONS', ticker, map.cik || null, map.company_name || null,
                    ticker + ' Options', 'Options talk for ' + ticker,
                    now(), 'auto:search', map.listing_status || null, venue, ticker,
                    'Options can expire worthless. A reverse split does not change the strike — '
                  + 'it changes what the contract delivers. Check the OCC adjustment memo before '
                  + 'you trade a name that has split.').run();
          }
        }

        await env.DB.prepare(
          `INSERT INTO symbol_searches (query, ticker, internal_id, created_at, trade_date, created_room)
           VALUES (?,?,?,?,?,?)`)
          .bind(raw, ticker, viewer ? viewer.internal_id : null, now(), date, created).run();

        return json({ room, created: !!created });
      }

      if (path === '/api/room/join' && method === 'POST') {
        const user = await currentUser(req, env);
        if (!user) return bad('not signed in', 401);
        const { room_key } = await req.json();
        await env.DB.prepare(
          `INSERT OR IGNORE INTO room_members (room_key, internal_id, joined_at, notify)
           VALUES (?,?,?,1)`).bind(room_key, user.internal_id, now()).run();
        await env.DB.prepare(
          `UPDATE rooms SET member_count = (SELECT COUNT(*) FROM room_members WHERE room_key = ?)
            WHERE room_key = ?`).bind(room_key, room_key).run();
        return json({ ok: true });
      }

      /* ---------- NOTICES: ingest one filing / press release ------------ */
      if (path === '/api/notice' && method === 'POST') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const b = await req.json();
        const ticker = clean(b.ticker).toUpperCase();
        if (!ticker) return bad('ticker required');

        // Auto-open the room if news arrives for a symbol nobody has searched.
        let room = await env.DB.prepare(
          `SELECT room_key FROM rooms WHERE room_key = ?`).bind(ticker).first();
        if (!room) {
          await env.DB.prepare(
            `INSERT INTO rooms (room_key, kind, ticker, cik, company_name, title,
                                description, created_at, created_by)
             VALUES (?,'ticker',?,?,?,?,'Room opened by a filing',?, 'auto:filing')`)
            .bind(ticker, ticker, b.cik || null, b.company_name || null, ticker, now()).run();
        }

        const id = ulid();
        const { date } = easternParts(b.filed_at ? new Date(b.filed_at * 1000) : new Date());
        await env.DB.prepare(
          `INSERT OR IGNORE INTO room_notices
             (notice_id, room_key, ticker, source, form_type, items, headline,
              plain_english, url, accession, filed_at, trade_date, is_material, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, ticker, ticker, b.source || 'edgar', b.form_type || null,
                b.items || null, clean(b.headline) || (b.form_type || 'Filing'),
                b.plain_english || null, b.url, b.accession || null,
                b.filed_at || now(), date, b.is_material ? 1 : 0, now()).run();

        if (b.accession) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO filings (accession, cik, ticker, form_type, items, filed_at, trade_date, url)
             VALUES (?,?,?,?,?,?,?,?)`)
            .bind(b.accession, b.cik || '', ticker, b.form_type || '', b.items || null,
                  b.filed_at || now(), date, b.url).run();
        }
        return json({ ok: true, notice_id: id, trade_date: date });
      }

      /* ---------- THE FORMS LIST + fee to read -------------------------- */
      if (path === '/api/options/adjustments' && method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase();
        if (!ticker) return bad('ticker required');
        const rows = (await env.DB.prepare(
          `SELECT effective_on, action, old_symbol, new_symbol, ratio,
                  new_deliverable, plain_english, occ_memo, url
             FROM option_adjustments WHERE ticker = ?
            ORDER BY effective_on DESC`).bind(ticker).all()).results || [];
        return json({ ticker, adjustments: rows });
      }

      /* ---------- SPECULATIVE FLOWS — the sideline-money indicator ------ */
      /* ---------- NEWSROOM --------------------------------------------- */
      if (path === '/api/articles' && method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase() || null;
        const rows = (await env.DB.prepare(
          `SELECT a.article_id, a.slug, a.headline, a.standfirst, a.kind, a.ticker,
                  a.published_at, a.disclosure, c.byline, c.role, c.location,
                  c.standing_disclosure AS byline_disclosure
             FROM articles a JOIN contributors c ON c.contributor_id = a.contributor_id
            WHERE a.status = 'published' AND (? IS NULL OR a.ticker = ?)
            ORDER BY a.published_at DESC LIMIT 50`).bind(ticker, ticker).all()).results || [];
        return json({ articles: rows });
      }

      if (path === '/api/article' && method === 'GET') {
        const slug = url.searchParams.get('slug');
        if (!slug) return bad('slug required');
        const a = await env.DB.prepare(
          `SELECT a.*, c.byline, c.role, c.bio, c.location, c.photo_url,
                  c.standing_disclosure AS byline_disclosure
             FROM articles a JOIN contributors c ON c.contributor_id = a.contributor_id
            WHERE a.slug = ? AND a.status = 'published'`).bind(slug).first();
        if (!a) return bad('not found', 404);
        const corr = (await env.DB.prepare(
          `SELECT what_was_wrong, what_is_right, corrected_at
             FROM corrections WHERE article_id = ? ORDER BY corrected_at DESC`)
          .bind(a.article_id).all()).results || [];
        await env.DB.prepare(
          `UPDATE articles SET view_count = view_count + 1 WHERE article_id = ?`)
          .bind(a.article_id).run();
        return json({ article: a, corrections: corr });
      }

      /* Publishing pushes the piece into the stream as a house item. */
      if (path === '/api/article/publish' && method === 'POST') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const { article_id } = await req.json();
        const a = await env.DB.prepare(
          `SELECT * FROM articles WHERE article_id = ?`).bind(article_id).first();
        if (!a) return bad('not found', 404);
        if (!a.disclosure) return bad('an article cannot publish without a disclosure line', 400);

        const t = now();
        await env.DB.prepare(
          `UPDATE articles SET status='published', published_at=?, updated_at=? WHERE article_id=?`)
          .bind(t, t, article_id).run();
        await env.DB.prepare(
          `INSERT OR IGNORE INTO house_feed
             (item_id, kind, headline, summary, url, ticker, published_at, priority, guid)
           VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(ulid(), a.kind, a.headline, a.standfirst, '/news/' + a.slug,
                a.ticker, t, 10, 'article:' + article_id).run();
        return json({ ok: true, published_at: t });
      }

      /* ---------- PRE-MARKET / THE BAG HOLDER TRAP ---------------------- */
      if (path === '/api/premarket' && method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase();
        const date = url.searchParams.get('date');
        if (!ticker) return bad('ticker required');
        if (date) {
          const row = await env.DB.prepare(
            `SELECT * FROM v_bagholder WHERE ticker = ? AND trade_date = ?`)
            .bind(ticker, date).first();
          const prints = (await env.DB.prepare(
            `SELECT ts_utc, price, size, venue FROM premarket_prints
              WHERE ticker = ? AND trade_date = ? ORDER BY ts_utc ASC LIMIT 5000`)
            .bind(ticker, date).all()).results || [];
          // Label it plainly. This is the Bag Holder Trap measurement.
          const trap = row && row.deal_price && row.vol_above_deal > 0 ? {
            name: 'Bag Holder Trap',
            shares_above_deal: row.vol_above_deal,
            dollars_above_deal: row.dollars_above_deal,
            deal_price: row.deal_price,
            deal_kind: row.deal_kind,
            premarket_vwap: row.premarket_vwap,
            regular_close: row.regular_close,
            close_vs_pm_vwap_pct: row.close_vs_pm_vwap_pct,
            heavy: !!row.heavy,
            thin: !!row.thin,
            plain: row.vol_above_deal.toLocaleString() + ' shares traded before the open above $'
                 + row.deal_price + ', the price the company sold stock at that day. The stock closed at $'
                 + row.regular_close + '.'
          } : null;
          return json({ ticker, date, session: row || null, bag_holder_trap: trap, prints });
        }
        const rows = (await env.DB.prepare(
          `SELECT * FROM v_bagholder WHERE ticker = ? ORDER BY trade_date DESC LIMIT 120`)
          .bind(ticker).all()).results || [];
        return json({ ticker, sessions: rows });
      }

      /* Ingest prints from the feed, then recompute the session. */
      if (path === '/api/premarket/ingest' && method === 'POST') {
        const guard = await requireAdmin(req, env); if (guard) return guard;
        const b = await req.json();
        const ticker = clean(b.ticker).toUpperCase();
        const date = clean(b.trade_date);
        const prints = Array.isArray(b.prints) ? b.prints : [];
        if (!ticker || !date || !prints.length) return bad('ticker, trade_date and prints required');

        const stmt = env.DB.prepare(
          `INSERT OR IGNORE INTO premarket_prints
             (ticker, trade_date, ts_utc, ts_ms, price, size, venue, conditions, source, captured_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`);
        const batch = [];
        for (const p of prints) {
          if (p.size == null || p.price == null) continue;   // never store a price without a size
          batch.push(stmt.bind(ticker, date, Math.floor((p.ts_ms||p.t||0)/1000),
                    p.ts_ms || p.t || null, p.price, p.size, p.venue || null,
                    p.conditions || null, b.source || 'polygon', now()));
        }
        if (batch.length) await env.DB.batch(batch);

        // recompute the session summary from the prints themselves
        const agg = await env.DB.prepare(
          `SELECT MIN(price) AS low, MAX(price) AS high, SUM(size) AS vol, COUNT(*) AS n,
                  ROUND(SUM(price*size)/NULLIF(SUM(size),0),4) AS vwap,
                  MAX(size) AS largest
             FROM premarket_prints WHERE ticker = ? AND trade_date = ?`)
          .bind(ticker, date).first();
        const hi = await env.DB.prepare(
          `SELECT price, size, ts_utc FROM premarket_prints
            WHERE ticker=? AND trade_date=? ORDER BY price DESC, size DESC LIMIT 1`)
          .bind(ticker, date).first();
        const first = await env.DB.prepare(
          `SELECT price, ts_utc FROM premarket_prints
            WHERE ticker=? AND trade_date=? ORDER BY ts_utc ASC LIMIT 1`).bind(ticker, date).first();
        const last = await env.DB.prepare(
          `SELECT price, ts_utc FROM premarket_prints
            WHERE ticker=? AND trade_date=? ORDER BY ts_utc DESC LIMIT 1`).bind(ticker, date).first();

        // thin = the high was set on a small print. heavy = real size traded.
        const thin  = hi && hi.size < 1000 ? 1 : 0;
        const heavy = agg && agg.vol >= 100000 ? 1 : 0;

        await env.DB.prepare(
          `INSERT INTO premarket_session
             (ticker, trade_date, first_price, first_ts, high, high_ts, high_size, low,
              last_price, last_ts, total_volume, print_count, vwap, largest_print,
              thin, heavy, source, computed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(ticker, trade_date) DO UPDATE SET
             first_price=excluded.first_price, high=excluded.high, high_ts=excluded.high_ts,
             high_size=excluded.high_size, low=excluded.low, last_price=excluded.last_price,
             total_volume=excluded.total_volume, print_count=excluded.print_count,
             vwap=excluded.vwap, largest_print=excluded.largest_print,
             thin=excluded.thin, heavy=excluded.heavy, computed_at=excluded.computed_at`)
          .bind(ticker, date, first?first.price:null, first?first.ts_utc:null,
                hi?hi.price:null, hi?hi.ts_utc:null, hi?hi.size:null, agg.low,
                last?last.price:null, last?last.ts_utc:null, agg.vol, agg.n, agg.vwap,
                agg.largest, thin, heavy, b.source || 'polygon', now()).run();

        return json({ ok: true, ticker, trade_date: date, stored: batch.length,
                      high: hi?hi.price:null, high_size: hi?hi.size:null,
                      volume: agg.vol, vwap: agg.vwap, thin: !!thin, heavy: !!heavy });
      }

      /* ---------- FEATURES + SUGGESTIONS -------------------------------- */
      if (path === '/api/features' && method === 'GET') {
        const feats = (await env.DB.prepare(
          `SELECT feature_id, category, title, description, status, why, added_on
             FROM features WHERE status <> 'shelved'
            ORDER BY weight DESC, title ASC`).all()).results || [];
        const sugg = (await env.DB.prepare(
          `SELECT suggestion_id, body, handle, show_name, created_at, status, response, votes
             FROM suggestions WHERE status IN ('published','building','done')
            ORDER BY votes DESC, created_at DESC LIMIT 60`).all()).results || [];
        // Publish the tally, so the filter is visible rather than the queue.
        const counts = (await env.DB.prepare(
          `SELECT status, COUNT(*) AS n FROM suggestions GROUP BY status`).all()).results || [];
        const tally = { received: 0, published: 0, building: 0, done: 0,
                        unread: 0, declined: 0, removed: 0 };
        for (const c of counts){
          tally.received += c.n;
          if (c.status === 'published') tally.published += c.n;
          else if (c.status === 'building') tally.building += c.n;
          else if (c.status === 'done') tally.done += c.n;
          else if (c.status === 'new') tally.unread += c.n;
          else if (c.status === 'declined') tally.declined += c.n;
          else if (c.status === 'removed') tally.removed += c.n;
        }
        return json({ features: feats, suggestions: sugg, tally });
      }

      if (path === '/api/suggest' && method === 'POST') {
        const b = await req.json();
        const body = clean(b.body);
        if (!body) return bad('say something');
        if (body.length > 2000) return bad('too long — keep it under 2000 characters');
        const viewer = await currentUser(req, env);
        const { date } = easternParts();
        const id = ulid();
        await env.DB.prepare(
          `INSERT INTO suggestions (suggestion_id, body, contact, internal_id, handle,
                                    show_name, ip, created_at, trade_date, status)
           VALUES (?,?,?,?,?,?,?,?,?, 'new')`)
          .bind(id, body, clean(b.contact) || null,
                viewer ? viewer.internal_id : null,
                viewer ? viewer.handle : (clean(b.name) || null),
                b.show_name ? 1 : 0,
                req.headers.get('cf-connecting-ip') || 'unknown', now(), date).run();
        return json({ ok: true, suggestion_id: id,
          note: 'Thank you. Every suggestion is read. The ones we act on get published here with an answer.' });
      }

      if (path === '/api/suggest/vote' && method === 'POST') {
        const { suggestion_id } = await req.json();
        const viewer = await currentUser(req, env);
        const voter = viewer ? viewer.internal_id
                             : 'ip:' + (req.headers.get('cf-connecting-ip') || 'unknown');
        const r = await env.DB.prepare(
          `INSERT OR IGNORE INTO suggestion_votes (suggestion_id, voter, created_at)
           VALUES (?,?,?)`).bind(suggestion_id, voter, now()).run();
        await env.DB.prepare(
          `UPDATE suggestions SET votes =
             (SELECT COUNT(*) FROM suggestion_votes WHERE suggestion_id = ?)
            WHERE suggestion_id = ?`).bind(suggestion_id, suggestion_id).run();
        return json({ ok: true });
      }

      /* ---------- JOB CREATORS / JOB DESTROYERS ------------------------ */
      if (path === '/api/jobs' && method === 'GET') {
        const ticker = (url.searchParams.get('ticker') || '').toUpperCase() || null;
        if (ticker) {
          const v = await env.DB.prepare(
            `SELECT * FROM v_jobs WHERE ticker = ?`).bind(ticker).first();
          const hist = (await env.DB.prepare(
            `SELECT as_of, employees, form_type, accession, quote, url
               FROM employee_history WHERE ticker = ? ORDER BY as_of ASC`)
            .bind(ticker).all()).results || [];
          const events = (await env.DB.prepare(
            `SELECT announced_on, action, headcount_delta, pct_of_workforce, location, url, quote
               FROM workforce_events WHERE ticker = ? ORDER BY announced_on DESC`)
            .bind(ticker).all()).results || [];
          return json({ ticker, summary: v || null, history: hist, events });
        }
        const sort = url.searchParams.get('sort') === 'creators' ? 'DESC' : 'ASC';
        const rows = (await env.DB.prepare(
          `SELECT * FROM v_jobs WHERE observations >= 2 ORDER BY net_change ${sort} LIMIT 100`).all()).results || [];
        return json({ rows });
      }

      if (path === '/api/flows' && method === 'GET') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '90', 10), 730);
        const flows = (await env.DB.prepare(
          `SELECT * FROM v_crypto_flows ORDER BY trade_date DESC LIMIT ?`).bind(days).all()).results || [];
        const spec = (await env.DB.prepare(
          `SELECT * FROM v_speculative_flows ORDER BY trade_date DESC LIMIT ?`).bind(days).all()).results || [];
        return json({ flows, speculative: spec });
      }

      /* ---------- IMPORT THE SEC TICKER LIST --------------------------
         Pulls the SEC's official company_tickers_exchange.json and fills
         ticker_map. That file is the authority on which symbols are on a
         national exchange, and it is free. Run once, then monthly.
         Admin only. ------------------------------------------------------ */
      if (path === '/api/admin/import-tickers' && method === 'POST') {
        if (req.headers.get('x-admin-token') !== env.ADMIN_TOKEN)
          return bad('unauthorised', 401);

        const res = await fetch(
          'https://www.sec.gov/files/company_tickers_exchange.json',
          { headers: { 'user-agent': 'TriggeredShort research contact@triggeredshort.com' } });
        if (!res.ok) return bad('SEC fetch failed: ' + res.status, 502);
        const payload = await res.json();

        const idx = {};
        payload.fields.forEach((f, i) => { idx[f] = i; });
        const rows = payload.data;

        const NATIONAL = { 'NYSE':'NYSE', 'Nasdaq':'NASDAQ', 'NYSE American':'NYSE American',
                           'NYSEAmerican':'NYSE American', 'NYSE Arca':'NYSE Arca',
                           'Cboe':'Cboe', 'CBOE':'Cboe' };

        let imported = 0, skipped = 0;
        const ts = now();
        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH);
          const stmts = [];
          for (const r of slice) {
            const ticker = String(r[idx.ticker] || '').toUpperCase().trim();
            const name   = r[idx.name] || null;
            const cikNum = r[idx.cik];
            const exRaw  = r[idx.exchange] || '';
            if (!ticker) { skipped++; continue; }
            const venue = NATIONAL[exRaw] || null;
            if (!venue) { skipped++; continue; }
            const cik = String(cikNum).padStart(10, '0');
            stmts.push(env.DB.prepare(
              `INSERT INTO ticker_map
                 (ticker, cik, company_name, exchange, updated_at,
                  listing_status, ever_national, current_venue)
               VALUES (?,?,?,?,?,'listed',1,?)
               ON CONFLICT(ticker) DO UPDATE SET
                 cik=excluded.cik, company_name=excluded.company_name,
                 exchange=excluded.exchange, updated_at=excluded.updated_at,
                 listing_status=excluded.listing_status,
                 ever_national=excluded.ever_national,
                 current_venue=excluded.current_venue`)
              .bind(ticker, cik, name, venue, ts, venue));
            imported++;
          }
          if (stmts.length) await env.DB.batch(stmts);
        }
        return json({ imported, skipped, total: rows.length });
      }

      /* ---------- THE COMPANY PANEL ------------------------------------
         Everything that sits above the chat in a ticker room: the profile,
         the officers, the How'm I Doin' figures with their receipts, and
         the price series for the range buttons.
         One call, so the room paints in one go. --------------------------- */
      if (path.startsWith('/api/company/') && method === 'GET') {
        const ticker = decodeURIComponent(path.split('/')[3] || '').toUpperCase();
        if (!ticker) return bad('no ticker', 400);

        const profile = await env.DB.prepare(
          `SELECT p.*, t.exchange, t.current_venue, t.listing_status
             FROM company_profile p
             LEFT JOIN ticker_map t ON t.ticker = p.ticker
            WHERE p.ticker = ?`).bind(ticker).first();

        const fallback = profile ? null : await env.DB.prepare(
          `SELECT ticker, cik, company_name AS legal_name, exchange,
                  current_venue, listing_status
             FROM ticker_map WHERE ticker = ?`).bind(ticker).first();

        const officers = (await env.DB.prepare(
          `SELECT person_name, title, is_officer, is_director, since_year,
                  also_serves, comp_last_year, comp_year, source_form, source_url, note
             FROM officers WHERE ticker = ?
            ORDER BY weight DESC, is_officer DESC, person_name`)
          .bind(ticker).all()).results || [];

        const koch = await env.DB.prepare(
          `SELECT * FROM v_koch WHERE ticker = ?`).bind(ticker).first();

        const receipts = koch ? ((await env.DB.prepare(
          `SELECT when_label, what, amount_label, source_url
             FROM koch_receipts WHERE ticker = ? ORDER BY seq`)
          .bind(ticker).all()).results || []) : [];

        const jobs = await env.DB.prepare(
          `SELECT verdict, net_change, pct_change, latest_employees
             FROM v_jobs WHERE ticker = ?`).bind(ticker).first();

        return json({
          ticker,
          profile: profile || fallback || null,
          profile_is_stub: !profile,
          officers, koch: koch || null, receipts, jobs: jobs || null
        });
      }

      /* ---------- PRICE SERIES for the range buttons -------------------- */
      if (path.startsWith('/api/prices/') && method === 'GET') {
        const ticker = decodeURIComponent(path.split('/')[3] || '').toUpperCase();
        const range  = (url.searchParams.get('range') || '1M').toUpperCase();
        const DAYS = { '5D':5, '1M':31, '6M':186, '1Y':366, '5Y':1830, 'ALL':100000 };
        const days = DAYS[range] || 31;

        const rows = (await env.DB.prepare(
          `SELECT trade_date, close, volume FROM price_history
            WHERE ticker = ? AND trade_date >= date('now', ?)
            ORDER BY trade_date`)
          .bind(ticker, '-' + days + ' days').all()).results || [];

        let series = rows;
        if (!series.length) {
          series = (await env.DB.prepare(
            `SELECT trade_date, close, volume FROM daily_market
              WHERE ticker = ? ORDER BY trade_date`).bind(ticker).all()).results || [];
        }

        const closes = series.map(r => r.close).filter(v => v != null);
        const first = closes[0], last = closes[closes.length - 1];
        return json({
          ticker, range, points: series.length, series,
          first, last,
          change: (first != null && last != null) ? +(last - first).toFixed(4) : null,
          change_pct: (first) ? +(((last - first) / first) * 100).toFixed(2) : null,
          low: closes.length ? Math.min(...closes) : null,
          high: closes.length ? Math.max(...closes) : null
        });
      }

      if (path === '/api/admin/market-notice' && method === 'POST') {
        if (req.headers.get('x-admin-token') !== env.ADMIN_TOKEN)
          return bad('unauthorised', 401);
        const forDate = url.searchParams.get('date') || null;
        return json(await postMarketNotice(env, forDate));
      }

      /* today's market status, for the banner */
      if (path === '/api/market-status' && method === 'GET') {
        const day = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
        const cal = await env.DB.prepare(
          `SELECT trade_date, is_open, session, reason, early_close
             FROM market_calendar WHERE trade_date = ?`).bind(day).first();
        if (!cal) return json({ date: day, is_open: 1, session: 'full', reason: null, known: false });
        return json({ date: day, is_open: cal.is_open, session: cal.session,
                      reason: cal.reason, early_close: cal.early_close, known: true });
      }

      if (path.startsWith('/api/morning/') && method === 'GET') {
        const ticker = decodeURIComponent(path.split('/')[3] || '').toUpperCase();
        const day = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
        const row = await env.DB.prepare(
          `SELECT * FROM v_morning_light WHERE trade_date = ? AND (ticker = ? OR ticker IS NULL)
            ORDER BY ticker IS NULL LIMIT 1`).bind(day, ticker).first();
        if (!row) return json({ ticker, trade_date: day, light: null });
        return json({ ticker, ...row });
      }

      /* ---------- STATUS LABELS -----------------------------------------
         Job creator / destroyer, wealth creator / destroyer.
         Computed from filings. Nobody here assigns them; a company
         changes its own label by what it files. ------------------------- */
      if (path.startsWith('/api/status/') && method === 'GET') {
        const ticker = decodeURIComponent(path.split('/')[3] || '').toUpperCase();
        const row = await env.DB.prepare(
          `SELECT * FROM v_status WHERE ticker = ?`).bind(ticker).first();
        if (!row) return json({ ticker, labels: [] });
        const labels = [];
        if (row.jobs_verdict === 'creator')
          labels.push({ kind:'jobs', key:'job_creator', text:'Job creator', tone:'good',
            detail:`${row.first_employees} employees to ${row.latest_employees}`,
            rule: row.rule_jobs });
        if (row.jobs_verdict === 'destroyer')
          labels.push({ kind:'jobs', key:'job_destroyer', text:'Job destroyer', tone:'bad',
            detail:`${row.first_employees} employees to ${row.latest_employees}`,
            rule: row.rule_jobs });
        if (row.wealth_verdict === 'wealth_creator')
          labels.push({ kind:'wealth', key:'wealth_creator', text:'Wealth creator', tone:'good',
            detail: row.direction === 'returned'
              ? 'Returned money to shareholders and raised none'
              : `Worth more than investors put in`,
            rule: row.rule_wealth });
        if (row.wealth_verdict === 'wealth_destroyer')
          labels.push({ kind:'wealth', key:'wealth_destroyer', text:'Wealth destroyer', tone:'bad',
            detail:`${row.cents_on_the_dollar} cents left of every dollar raised`,
            rule: row.rule_wealth });
        if (row.wealth_verdict === 'wealth_holding')
          labels.push({ kind:'wealth', key:'wealth_holding', text:'Holding', tone:'flat',
            detail:`${row.cents_on_the_dollar} cents of every dollar raised`,
            rule: row.rule_wealth });
        const history = (await env.DB.prepare(
          `SELECT changed_on, label_kind, from_label, to_label, because, source_url
             FROM status_history WHERE ticker = ? ORDER BY changed_on DESC LIMIT 10`)
          .bind(ticker).all()).results || [];
        return json({ ticker, labels, history, authority: row.rule_authority });
      }

      /* ---------- INDUSTRY AND PATENTS ---------------------------------
         What business it is in, per the SEC's own classification, and how
         many patents are actually alive. A count is always a floor. -------- */
      if (path.startsWith('/api/industry/') && method === 'GET') {
        const ticker = decodeURIComponent(path.split('/')[3] || '').toUpperCase();
        const ind = await env.DB.prepare(
          `SELECT * FROM v_industry WHERE ticker = ?`).bind(ticker).first();
        const pat = await env.DB.prepare(
          `SELECT * FROM v_patents WHERE ticker = ?`).bind(ticker).first();
        const note = await env.DB.prepare(
          `SELECT * FROM patent_notes WHERE ticker = ?`).bind(ticker).first();
        const names = (await env.DB.prepare(
          `SELECT assignee_name, relationship, note FROM patent_assignees
            WHERE ticker = ? ORDER BY id`).bind(ticker).all()).results || [];
        const soon = (await env.DB.prepare(
          `SELECT patent_id, title, expires_on, jurisdiction FROM patents
            WHERE ticker = ? AND is_live = 1 AND expires_on IS NOT NULL
            ORDER BY expires_on LIMIT 5`).bind(ticker).all()).results || [];
        return json({ ticker, industry: ind || null, patents: pat || null,
                      note: note || null, assignees: names, expiring_soonest: soon });
      }

      if (path === '/api/forms' && method === 'GET') {
        const rows = (await env.DB.prepare(
          `SELECT form_type, label, plain_english, why_it_matters,
                  read_fee_cents, agent_fee_cents
             FROM form_catalog WHERE enabled = 1 ORDER BY weight DESC`).all()).results || [];
        return json({ forms: rows });
      }

      return bad('not found', 404);

    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  }
};