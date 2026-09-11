/* ============================================================================
   WARRANTWIRE-WRITE  —  Cloudflare Worker
   The writing side for Warrant Wire: a login, a place to write, and the
   published pages.

   ONE SITE, ONE WORKER, ONE DATABASE. Each property owns its writing
   outright — its own pieces, its own writers, its own feed — so a
   property can be sold on its own without untangling anything from
   the others. Nothing here is shared.

   Built 2026-09-05 · build 1a · 1b on 2026-09-11: the verdict desk (/write/verdict, /api/w/verdict, /api/w/verdicts) · 1c: password reset (/write/reset, /write/resets, /api/w/resetlink) and the auth check (/api/w/whoami) · 1d: the authenticator (/write/2fa, /write/code, /api/w/2fa-off) · 1e: levels, prices, enrolment (/write/enrol), the roster (/write/writers) · 1f: sign in with Google (/write/google), on when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set · 1g: investor declaration, five-star ratings with comments (/api/w/rating, /api/w/rate) · 1h: the system verifies (Google makes the account), a person verifies by telephone (/api/w/called) before anything publishes; /write/profile; sign-in pages in wire.css

   BINDINGS   DB         D1  → warrantwire_writing (this site's own)
   SECRETS    LOG_KEY        master key, admin only
   VARIABLE   SITE       https://triggeredshort.com
   OPTIONAL   EMAIL          send_email binding, for invitations

   ROUTES on warrantwire.com
     /writing              the list of published pieces
     /writing/<slug>       one piece
     /writing/feed.xml     RSS
     /writing/sitemap.xml  sitemap for search engines
     /write                the dashboard (login required)
     /write/login  /write/logout  /write/set
     /api/w/*              what the desk talks to

   NOTHING PUBLISHES WITHOUT A DISCLOSURE LINE. That rule is in the code,
   not in a habit — publish() refuses.

   The tables build themselves on first request. No SQL to paste.
   ========================================================================== */

const H = {
  html: { 'content-type': 'text/html;charset=utf-8' },
  json: { 'content-type': 'application/json' },
  xml:  { 'content-type': 'application/xml;charset=utf-8' }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H.json });
const rnd = (n = 24) => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
  crypto.getRandomValues(new Uint8Array(n)).forEach(b => s += a[b % a.length]); return s; };
const slugify = s => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70);
const today = () => new Date().toISOString().slice(0, 10);


/* ============================================================
   TWO SITES, ONE DASHBOARD
   A piece belongs to a property. The worker answers on both
   hostnames and shows each in its own clothes — the docket look
   on triggeredshort, the wire look on warrantwire. One login,
   one place to write, and a picker on the piece.
   Adding a third site is one entry in this table.
   ============================================================ */
const SITES = {
  warrantwire: {
    key: 'warrantwire', host: 'warrantwire.com',
    name: 'Warrant Wire', url: 'https://warrantwire.com',
    dark: true,
    tagline: 'Every warrant financing, as it is filed.',
    nav: [['/', 'The wire'], ['/writing', 'Writing'],
          ['https://8k10q.com', '8K10Q'], ['https://triggeredshort.com', 'Triggered Short']],
    blurb: 'What the filings show, written out. Every figure points at the document it came from.',
    contact: 'research@warrantwire.com'
  }
};
function siteOf(u) {
  const h = String(u.hostname || '').replace(/^www\./, '').toLowerCase();
  for (const k of Object.keys(SITES)) if (SITES[k].host === h) return SITES[k];
  return null;                       /* not one of ours - see the guard below */
}

/* ---------------- the tables, made on demand ---------------- */
let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_writers (
       email TEXT PRIMARY KEY, name TEXT, role TEXT, city TEXT, bio TEXT, photo TEXT,
       disclosure TEXT, password TEXT, kind TEXT DEFAULT 'guest', status TEXT DEFAULT 'active',
       created TEXT DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_pieces (
       id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, standfirst TEXT,
       section TEXT, keywords TEXT, subject TEXT, body TEXT, sources TEXT, links TEXT,
       disclosure TEXT, image TEXT, image_alt TEXT, author TEXT, status TEXT DEFAULT 'draft',
       created TEXT DEFAULT (datetime('now')), updated TEXT, published TEXT, words INTEGER)`).run();
  /* which property a piece belongs to - added later, so it is patched in */
  try { await env.DB.prepare(
    "ALTER TABLE w_pieces ADD COLUMN site TEXT DEFAULT 'warrantwire'").run(); } catch (e) {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_sessions (
       token TEXT PRIMARY KEY, email TEXT, expires TEXT)`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_corrections (
       id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, wrong TEXT, right_text TEXT,
       made TEXT DEFAULT (datetime('now')))`).run();

  /* ============================================================
     ⚠ THE VERDICTS — added 11 Sep 2026, build 1b.
     A human verdict on one company, under a real name, dated. One row per
     (company, author): the founder's is kind 'house', a reader's is 'guest'.
     ⚠ NEVER SILENTLY REWRITTEN. Every save of an existing verdict copies the
     old text into w_verdict_history first, with its dates, so the record of
     what a named person said, and when, is never lost.
     ⚠ WARRANTS ONLY, OPINION NOT ADVICE. `advice` is 1 only for a writer whose
     role carries the word "licensed" — set by the editor, never by the writer.
     ============================================================ */
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_verdicts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ticker TEXT NOT NULL, company TEXT,
       author TEXT NOT NULL, name TEXT, title TEXT, kind TEXT,
       level TEXT, advice INTEGER DEFAULT 0, price INTEGER,
       verdict TEXT, notes TEXT,
       status TEXT DEFAULT 'published',
       written TEXT DEFAULT (datetime('now')), revised TEXT,
       UNIQUE(ticker, author))`).run();
  /* ============================================================
     ⚠ LEVELS — build 1e, 11 Sep 2026. His ruling: permissions and levels.
       founder            Mark. Publishes at once. Sets everyone's level.
       writer             a Warrant Wire house writer. Publishes at once.
       gig_amateur        a GIG reader. Opinion only. Sets their own price.
       gig_professional   a GIG reader with a verified licence. May mark a
                          verdict as advice. Sets their own price.
     Everyone sets their own price, in whole dollars, and is paid through
     the GIG system on both 8K10Q and Warrant Wire. The house take on a
     verdict is flat ($50) and lives in the pay worker, not here.
     ============================================================ */
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN level TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN price INTEGER").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN licence TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN phone TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN validated TEXT").run(); } catch (e) {}
  /* his additions: a background separate from the bio; where they are from,
     with "nomad" as an honest answer; and where they actually are, read off
     the connection every time they sign in — never typed */
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN background TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN origin TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN nomad INTEGER DEFAULT 0").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN seen_from TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN seen_at TEXT").run(); } catch (e) {}
  /* ⚠ THIS IS ALL ABOUT INVESTMENTS, so everyone declares what they are:
     a retail investor, a professional, or a GIG reader. It is on the profile
     and beside everything they write. */
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN investor TEXT").run(); } catch (e) {}
  /* ⚠ VERIFIED BY A CALL. His ruling, 11 Sep: the system checks the email and
     the profile; a PERSON checks the person, on the telephone. Nothing is
     published until somebody from the desk has spoken to them and said so
     here, with the date and their own name on it. */
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN called TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN called_by TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN call_note TEXT").run(); } catch (e) {}
  /* ⚠ RATINGS FOR EVERYONE. Five stars and a comment, one per rater per
     writer, dated, under the rater's email. The average and the count go
     beside the name; the comments are public. The founder can remove one. */
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_ratings (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       writer TEXT NOT NULL, by_email TEXT NOT NULL, by_name TEXT,
       stars INTEGER NOT NULL, comment TEXT, ticker TEXT,
       at TEXT DEFAULT (datetime('now')), removed TEXT,
       UNIQUE(writer, by_email))`).run();
  /* anyone without a level yet: the house is the founder, guests are amateurs */
  await env.DB.prepare("UPDATE w_writers SET level = CASE WHEN kind='house' THEN 'founder' ELSE 'gig_amateur' END WHERE level IS NULL").run();
  await env.DB.prepare("UPDATE w_writers SET price = CASE WHEN level='founder' THEN 200 ELSE 50 END WHERE price IS NULL").run();
  /* the authenticator: a secret per writer, on or off */
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN totp_secret TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE w_writers ADD COLUMN totp_on INTEGER DEFAULT 0").run(); } catch (e) {}
  /* password resets: who asked, when, and the one-time link. Kept so the
     founder can see requests and hand out the link himself while the worker
     has no email binding. */
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_resets (
       id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, token TEXT, ip TEXT,
       asked TEXT DEFAULT (datetime('now')), expires TEXT, used TEXT, sent INTEGER DEFAULT 0)`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS w_verdict_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT, verdict_id INTEGER, ticker TEXT, author TEXT,
       verdict TEXT, notes TEXT, written TEXT, revised TEXT,
       replaced TEXT DEFAULT (datetime('now')))`).run();
  ready = true;
}

/* ---------------- passwords and sessions ---------------- */
async function hashPw(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)))
                       : crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, k, 256));
  const hex = a => [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex(salt) + ':' + hex(bits);
}
const checkPw = async (pw, stored) => {
  if (!stored || !stored.includes(':')) return false;
  return (await hashPw(pw, stored.split(':')[0])) === stored;
};
const cookie = req => (/(?:^|;\s*)tswrite=([a-z0-9]+)/.exec(req.headers.get('cookie') || '') || [])[1] || '';
async function who(env, req) {
  const t = cookie(req); if (!t) return null;
  /* ⚠ ONLY A FULL SESSION SIGNS YOU IN. A set-link token or a code-pending
     half-session lives in the same table and must never pass as one. */
  const s = await env.DB.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now') AND token NOT LIKE 'set-%' AND token NOT LIKE 'code-%'").bind(t).first();
  if (!s) return null;
  return env.DB.prepare(
    "SELECT * FROM w_writers WHERE email=? AND status='active'").bind(s.email).first();
}

export default {
  async fetch(req, env) {
    await setup(env);
    const u = new URL(req.url), p = u.pathname.replace(/\/+$/, '') || '/';
    let S = siteOf(u);

    /* ONE ADDRESS PER PIECE.
       This worker answers on three hostnames, and also on its own
       workers.dev address. A crawler that finds the workers.dev copy
       would read every piece twice under two names, which is what
       search engines call duplicate content and what costs the ranking.
       So: a published page asked for on any host that is not one of
       the three is REDIRECTED to its real home, permanently. The
       dashboard still works there, because it is a private screen -
       but it is told not to be indexed. */
    if (!S) {
      if (p === '/writing' || p.startsWith('/writing/'))
        return Response.redirect(SITES['warrantwire'].url + p + u.search, 301);
      S = SITES['warrantwire'];                /* the desk falls back to the house site */
    }
    const SITE = S.url;
    try {
      /* ---------- public ---------- */
      if (p.startsWith('/writing/img/')) return img(env, p.slice('/writing/img/'.length));
      if (p === '/writing')             return list(env, S);
      if (p === '/writing/feed.xml')    return feed(env, S);
      if (p === '/writing/sitemap.xml') return sitemap(env, S);
      if (p === '/writing/robots.txt')  return new Response(
        'User-agent: *\nAllow: /writing\nDisallow: /write\nSitemap: ' + S.url + '/writing/sitemap.xml\n',
        { headers: { 'content-type': 'text/plain' } });
      if (p.startsWith('/writing/'))    return piece(env, S, p.slice('/writing/'.length));

      /* ---------- the desk ---------- */
      if (p === '/write/login')  return req.method === 'POST' ? loginPost(req, env) : page('Sign in', loginForm(await googleButton(env, req)));
      if (p === '/write/logout') return new Response(null, { status: 303,
        headers: [['location', '/write/login'], ['set-cookie', 'tswrite=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
      if (p === '/write/set')    return req.method === 'POST' ? setPost(req, env) : setForm(u, env);
      if (p === '/write/reset')  return req.method === 'POST' ? resetPost(req, env, SITE) : page('Reset your password', resetForm());
      if (p === '/write/enrol')  return req.method === 'POST' ? enrolPost(req, env)
        : page('Enrol as a GIG reader', enrolForm(await googleButton(env, req), { email: u.searchParams.get('email') || '', name: u.searchParams.get('name') || '' }));
      if (p === '/write/profile') {
        const me = await who(env, req);
        if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
        const gaps = profileGaps(me);
        return page('Your profile', enrolForm(gaps.length
          ? '<p class="err">Before you can publish, the system needs: ' + esc(gaps.join('; ')) + '.</p>'
          : '<p class="quiet">Your profile is complete. <a href="/write/verdict">Write a verdict</a>.</p>', me, true));
      }
      if (p === '/write/google') return googleStart(env, req, u, SITE);
      if (p === '/write/google/back') return googleBack(env, req, u, SITE);
      if (p === '/write/writers') return rosterPage(env, req, SITE);
      if (p.startsWith('/writing/gig/')) return gigImg(env, p.slice('/writing/gig/'.length));
      if (p === '/write/2fa')    return req.method === 'POST' ? totpEnrolPost(req, env) : totpEnrolPage(env, req);
      if (p === '/write/code')   return req.method === 'POST' ? totpLoginPost(req, env) : page('Your code', codeForm());
      if (p === '/write/resets') return resetsPage(env, req, SITE);
      if (p === '/write/verdict') return verdictDesk(env, req, u);
      if (p === '/write')        return desk(env, req);

      /* ---------- api ---------- */
      if (p.startsWith('/api/w/')) return api(p.slice('/api/w/'.length), req, env, u, SITE);

      return new Response('Not here.', { status: 404 });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }
};

/* ---------------- pictures, kept in R2 ----------------
   Binding IMG -> an R2 bucket. Uploaded from the dashboard, served from
   this worker, so a picture lives with the piece and not on somebody
   else's server. Without the binding the dashboard says so plainly. */
async function img(env, key) {
  if (!env.IMG) return new Response('No picture store bound.', { status: 404 });
  const o = await env.IMG.get(decodeURIComponent(key));
  if (!o) return new Response('Not here.', { status: 404 });
  const h = new Headers();
  h.set('content-type', o.httpMetadata?.contentType || 'application/octet-stream');
  h.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(o.body, { headers: h });
}
const OK_IMG = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' };
async function upload(req, env, me) {
  if (!env.IMG) return json({ ok:false, error:'No picture store yet. Add an R2 bucket to this worker named IMG.' }, 501);
  const f = (await req.formData()).get('file');
  if (!f || typeof f === 'string') return json({ ok:false, error:'No file arrived.' }, 400);
  const ext = OK_IMG[f.type];
  if (!ext) return json({ ok:false, error:'Pictures only — jpg, png, webp or gif.' }, 400);
  if (f.size > 8 * 1024 * 1024) return json({ ok:false, error:'That picture is over 8MB. Save it smaller.' }, 400);
  const base = String(f.name || 'picture').toLowerCase().replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'picture';
  const key = new Date().toISOString().slice(0, 7) + '/' + base + '-' + rnd(6) + '.' + ext;
  await env.IMG.put(key, f.stream(), { httpMetadata: { contentType: f.type } });
  return json({ ok:true, url: '/writing/img/' + key, key });
}

/* ============================================================
   THE API — everything the desk does
   ============================================================ */
async function api(action, req, env, u, SITE) {
  const me = await who(env, req);

  /* an invitation: admin only, by master key */
  if (action === 'invite') {
    if (u.searchParams.get('key') !== env.LOG_KEY) return json({ ok: false, error: 'unauthorized' }, 401);
    const email = String(u.searchParams.get('email') || '').trim().toLowerCase();
    const name  = String(u.searchParams.get('name') || '').trim();
    const kind  = u.searchParams.get('kind') === 'house' ? 'house' : 'guest';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'a working email' }, 400);
    await env.DB.prepare(
      `INSERT INTO w_writers (email,name,kind) VALUES (?,?,?)
       ON CONFLICT(email) DO UPDATE SET name=excluded.name, kind=excluded.kind, status='active'`)
      .bind(email, name, kind).run();
    const tok = rnd(28);
    await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
      .bind('set-' + tok, email, new Date(Date.now() + 7 * 864e5).toISOString()).run();
    const link = SITE + '/write/set?t=set-' + tok;
    if (env.EMAIL && env.EMAIL.send) {
      try { await env.EMAIL.send({
        from: { email: 'contact@triggeredshort.com', name: 'Triggered Short' },
        to: email, subject: 'Your writing login',
        text: `${name},\n\nYou can write for Triggered Short.\n\nChoose your password here — the link works for seven days:\n${link}\n\nAfter that, sign in any time at ${SITE}/write\n\nMark Nejmeh` });
      } catch (e) {}
    }
    return json({ ok: true, email, link, note: 'Send them this link if the email did not arrive.' });
  }

  /* ⚠ THE VERDICTS ARE PUBLIC TO READ. The company page on the site asks for
     them, and so may a page on localhost while it is being built — hence the
     open CORS header on this one route and no other. */
  if (action === 'verdicts') return verdictsPublic(env, u);

  /* ---- ratings: public to read, public to give, one per email per writer ---- */
  const CORS = { 'content-type': 'application/json', 'access-control-allow-origin': '*',
                 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (action === 'rating' || action === 'rate') {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (action === 'rating') {
      const wr = String(u.searchParams.get('writer') || '').trim().toLowerCase();
      if (!wr) return new Response(JSON.stringify({ ok: false, error: 'writer?' }), { status: 400, headers: CORS });
      const s = await ratingOf(env, wr);
      const c = await env.DB.prepare(
        `SELECT by_name, stars, comment, ticker, at FROM w_ratings WHERE writer=? AND removed IS NULL ORDER BY at DESC LIMIT 50`).bind(wr).all();
      return new Response(JSON.stringify({ ok: true, writer: wr, ...s, comments: c.results || [] }), { headers: CORS });
    }
    if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST' }), { status: 405, headers: CORS });
    const b = await req.json().catch(() => ({}));
    const wr = String(b.writer || '').trim().toLowerCase();
    const by = String(b.email || '').trim().toLowerCase();
    const stars = Math.round(Number(b.stars));
    if (!wr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(by)) return new Response(JSON.stringify({ ok: false, error: 'a writer and your email' }), { status: 400, headers: CORS });
    if (!(stars >= 1 && stars <= 5)) return new Response(JSON.stringify({ ok: false, error: 'one to five stars' }), { status: 400, headers: CORS });
    if (by === wr) return new Response(JSON.stringify({ ok: false, error: 'not your own' }), { status: 400, headers: CORS });
    const w = await env.DB.prepare("SELECT email FROM w_writers WHERE email=? AND status='active'").bind(wr).first();
    if (!w) return new Response(JSON.stringify({ ok: false, error: 'no such writer' }), { status: 404, headers: CORS });
    await env.DB.prepare(
      `INSERT INTO w_ratings (writer, by_email, by_name, stars, comment, ticker) VALUES (?,?,?,?,?,?)
       ON CONFLICT(writer, by_email) DO UPDATE SET stars=excluded.stars, comment=excluded.comment,
         by_name=excluded.by_name, ticker=excluded.ticker, at=datetime('now'), removed=NULL`)
      .bind(wr, by, String(b.name || '').slice(0, 80) || null, stars, String(b.comment || '').slice(0, 1500) || null, tick(b.ticker) || null).run();
    const s = await ratingOf(env, wr);
    return new Response(JSON.stringify({ ok: true, writer: wr, ...s, note: 'Thank you. One rating per person per writer; rating again replaces yours.' }), { headers: CORS });
  }

  /* ⚠ THE AUTH CHECK. Answers whether this browser is signed in, and as whom.
     Same-origin only — it reflects the cookie, so no CORS header, ever. A
     page uses it to decide whether to show "write your verdict" or "sign in". */
  if (action === 'whoami') return json(me
    ? { ok: true, signed_in: true, email: me.email, name: me.name, kind: me.kind,
        founder: me.kind === 'house', role: me.role || null,
        level: levelOf(me), level_label: LEVELS[levelOf(me)].label, price: me.price || null,
        may_advise: LEVELS[levelOf(me)].advice, authenticator: !!me.totp_on, status: me.status }
    : { ok: true, signed_in: false });

  /* ⚠ THE ONE DOOR THAT IS NOT THE APP. Turns the authenticator off for a
     writer who lost the phone. The founder does it for a writer while signed
     in; the master key does it for anyone, including the founder himself. */
  if (action === '2fa-off') {
    const byKey = u.searchParams.get('key') && u.searchParams.get('key') === env.LOG_KEY;
    if (!byKey && !(me && me.kind === 'house')) return json({ ok: false, error: 'unauthorized' }, 401);
    const email = String(u.searchParams.get('email') || (req.method === 'POST' ? (await req.json().catch(() => ({}))).email : '') || '').trim().toLowerCase();
    if (!email) return json({ ok: false, error: 'whose?' }, 400);
    await env.DB.prepare('UPDATE w_writers SET totp_on=0, totp_secret=NULL WHERE email=?').bind(email).run();
    await env.DB.prepare('DELETE FROM w_sessions WHERE email=?').bind(email).run();
    return json({ ok: true, email, note: 'Authenticator off and every session ended. They sign in with the password and set it up again at /write/2fa.' });
  }

  if (!me) return json({ ok: false, error: 'sign in first' }, 401);

  /* ⚠ LEVELS ARE SET BY THE FOUNDER AND NOBODY ELSE. gig_professional means
     the founder has seen the licence; the number goes on the record. */
  if (action === 'level' && req.method === 'POST') {
    if (levelOf(me) !== 'founder') return json({ ok: false, error: 'the founder does this' }, 403);
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (!LEVELS[b.level]) return json({ ok: false, error: 'level must be one of ' + Object.keys(LEVELS).join(', ') }, 400);
    const r = await env.DB.prepare('UPDATE w_writers SET level=?, licence=COALESCE(?, licence), kind=? WHERE email=?')
      .bind(b.level, b.licence ? String(b.licence).slice(0, 120) : null, b.level === 'founder' || b.level === 'writer' ? 'house' : 'guest', email).run();
    return json({ ok: !!(r.meta && r.meta.changes), email, level: b.level, label: LEVELS[b.level].label });
  }
  /* everyone sets their own price, in whole dollars */
  if (action === 'price' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const p = Math.round(Number(b.price));
    if (!(p >= 1 && p <= 5000)) return json({ ok: false, error: 'a price in whole dollars, 1 to 5000' }, 400);
    await env.DB.prepare('UPDATE w_writers SET price=? WHERE email=?').bind(p, me.email).run();
    return json({ ok: true, price: p, note: 'Your price for a verdict is $' + p + '. The house takes a flat $50 of each one sold.' });
  }
  /* the founder's roster: every writer, level and price */
  if (action === 'writers') {
    if (levelOf(me) !== 'founder') return json({ ok: false, error: 'the founder does this' }, 403);
    const r = await env.DB.prepare('SELECT email, name, phone, city, level, price, licence, status, validated, totp_on, created FROM w_writers ORDER BY created').all();
    return json({ ok: true, levels: LEVELS, writers: (r.results || []).map(w => ({ ...w, level: levelOf(w), authenticator: !!w.totp_on, totp_on: undefined })) });
  }
  /* ⚠ VALIDATION IS THE FOUNDER'S ACT, on the record with the date. It turns
     a pending enrolment into a writer at the level he chooses, and hands back
     the one-time link for them to choose a password. */
  if (action === 'validate' && req.method === 'POST') {
    if (levelOf(me) !== 'founder') return json({ ok: false, error: 'the founder does this' }, 403);
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    const level = LEVELS[b.level] ? b.level : 'gig_amateur';
    const w = await env.DB.prepare('SELECT email FROM w_writers WHERE email=?').bind(email).first();
    if (!w) return json({ ok: false, error: 'no such enrolment' }, 404);
    await env.DB.prepare(`UPDATE w_writers SET status='active', level=?, kind=?, validated=datetime('now'),
       role=? WHERE email=?`).bind(level, level === 'founder' || level === 'writer' ? 'house' : 'guest', LEVELS[level].label, email).run();
    const link = await makeReset(env, email, SITE, req, 24 * 7);
    return json({ ok: true, email, level, label: LEVELS[level].label, link, note: 'Validated. Send them this link; it works once, for seven days.' });
  }
  /* ⚠ "I SPOKE TO THEM." The founder, or a house writer, records the call:
     the date, who made it, and a line about it. From then on the writer may
     publish. Undoing it is the same call with called=false. */
  if (action === 'called' && req.method === 'POST') {
    if (!(levelOf(me) === 'founder' || levelOf(me) === 'writer')) return json({ ok: false, error: 'the desk does this' }, 403);
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (b.called === false) {
      await env.DB.prepare('UPDATE w_writers SET called=NULL, called_by=NULL, call_note=NULL WHERE email=?').bind(email).run();
      return json({ ok: true, email, called: false });
    }
    const r = await env.DB.prepare("UPDATE w_writers SET called=datetime('now'), called_by=?, call_note=? WHERE email=? AND status='active'")
      .bind(me.name || me.email, String(b.note || '').slice(0, 500) || null, email).run();
    return json({ ok: !!(r.meta && r.meta.changes), email, called: true, by: me.name || me.email });
  }

  if (action === 'decline' && req.method === 'POST') {
    if (levelOf(me) !== 'founder') return json({ ok: false, error: 'the founder does this' }, 403);
    const b = await req.json().catch(() => ({}));
    await env.DB.prepare("UPDATE w_writers SET status='declined' WHERE email=? AND status<>'active'").bind(String(b.email || '').toLowerCase()).run();
    return json({ ok: true });
  }

  /* the founder hands out a reset link to any writer — by phone, by text,
     by whatever reaches them — without touching their password */
  if (action === 'resetlink' && req.method === 'POST') {
    if (me.kind !== 'house') return json({ ok: false, error: 'the editor does this' }, 403);
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    const w = await env.DB.prepare("SELECT email FROM w_writers WHERE email=? AND status='active'").bind(email).first();
    if (!w) return json({ ok: false, error: 'no active writer with that email' }, 404);
    const link = await makeReset(env, email, SITE, req, 24);
    return json({ ok: true, email, link, expires_in: '24 hours', note: 'One use. Give it to them yourself.' });
  }

  if (action === 'verdict') return req.method === 'POST' ? verdictSave(req, env, me) : verdictMine(env, me, u);

  if (action === 'upload' && req.method === 'POST') return upload(req, env, me);

  if (action === 'mine') {
    const r = await env.DB.prepare(
      `SELECT id,slug,title,section,status,created,updated,published,words,site FROM w_pieces
        WHERE author=? OR ?='house' ORDER BY id DESC LIMIT 200`).bind(me.email, me.kind).all();
    return json({ ok: true, me: { name: me.name, email: me.email, kind: me.kind }, pieces: r.results || [] });
  }

  if (action === 'get') {
    const row = await env.DB.prepare('SELECT * FROM w_pieces WHERE id=?')
      .bind(+(u.searchParams.get('id') || 0)).first();
    if (!row) return json({ ok: false, error: 'not found' }, 404);
    if (row.author !== me.email && me.kind !== 'house') return json({ ok: false, error: 'not yours' }, 403);
    return json({ ok: true, piece: row });
  }

  if (action === 'save' && req.method === 'POST') {
    const b = await req.json();
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) return json({ ok: false, error: 'A headline, please — it is the one thing needed to save.' }, 400);
    const body = String(b.body || '').slice(0, 400000);
    const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    let slug = slugify(b.slug || title);
    const site = 'warrantwire';
    const fields = [title, String(b.standfirst || '').slice(0, 600), String(b.section || '').slice(0, 60),
      String(b.keywords || '').slice(0, 300), String(b.subject || '').slice(0, 300), body,
      String(b.sources || '').slice(0, 20000), String(b.links || '').slice(0, 4000),
      String(b.disclosure || '').slice(0, 4000), String(b.image || '').slice(0, 400),
      String(b.image_alt || '').slice(0, 300), words];

    if (b.id) {
      const own = await env.DB.prepare('SELECT author FROM w_pieces WHERE id=?').bind(+b.id).first();
      if (!own) return json({ ok: false, error: 'not found' }, 404);
      if (own.author !== me.email && me.kind !== 'house') return json({ ok: false, error: 'not yours' }, 403);
      await env.DB.prepare(
        `UPDATE w_pieces SET title=?,standfirst=?,section=?,keywords=?,subject=?,body=?,
           sources=?,links=?,disclosure=?,image=?,image_alt=?,words=?,site=?,updated=datetime('now')
         WHERE id=?`).bind(...fields, site, +b.id).run();
      return json({ ok: true, id: +b.id, words, saved: 'Saved.' });
    }
    /* a new one — make the slug unique */
    for (let i = 0; i < 40; i++) {
      const taken = await env.DB.prepare('SELECT 1 FROM w_pieces WHERE slug=?').bind(slug).first();
      if (!taken) break;
      slug = slugify(b.slug || title) + '-' + (i + 2);
    }
    const r = await env.DB.prepare(
      `INSERT INTO w_pieces (slug,title,standfirst,section,keywords,subject,body,sources,links,
         disclosure,image,image_alt,words,site,author,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`)
      .bind(slug, ...fields, site, me.email).run();
    return json({ ok: true, id: r.meta.last_row_id, slug, words, saved: 'Saved as a draft.' });
  }

  if (action === 'publish' && req.method === 'POST') {
    const b = await req.json();
    const row = await env.DB.prepare('SELECT * FROM w_pieces WHERE id=?').bind(+b.id).first();
    if (!row) return json({ ok: false, error: 'not found' }, 404);
    if (row.author !== me.email && me.kind !== 'house') return json({ ok: false, error: 'not yours' }, 403);

    /* THE RULES, checked here rather than remembered */
    const missing = [];
    if (!row.title) missing.push('a headline');
    if (!row.standfirst) missing.push('a standfirst — the line under the headline');
    if (!(row.body || '').trim()) missing.push('the piece itself');
    if (!(row.disclosure || '').trim()) missing.push('a disclosure — what you hold and who pays you, or that it is none');
    if (!(row.sources || '').trim()) missing.push('sources');
    if (row.image && !row.image_alt) missing.push('a description of the picture, for readers who cannot see it');
    if (missing.length) return json({ ok: false, error: 'Not published. This piece still needs ' +
      missing.join('; ') + '.', missing }, 400);

    /* a guest's piece waits for the editor */
    const goLive = me.kind === 'house';
    await env.DB.prepare(
      `UPDATE w_pieces SET status=?, published=CASE WHEN ?='published' THEN datetime('now') ELSE published END,
         updated=datetime('now') WHERE id=?`)
      .bind(goLive ? 'published' : 'submitted', goLive ? 'published' : 'submitted', +b.id).run();
    const home = SITES['warrantwire'].url;
    return json({ ok: true, status: goLive ? 'published' : 'submitted',
      url: goLive ? home + '/writing/' + row.slug : null,
      note: goLive ? 'Published.' : 'Sent to the editor. You will be told when it runs.' });
  }

  if (action === 'unpublish' && req.method === 'POST') {
    if (me.kind !== 'house') return json({ ok: false, error: 'the editor does this' }, 403);
    const b = await req.json();
    await env.DB.prepare("UPDATE w_pieces SET status='draft' WHERE id=?").bind(+b.id).run();
    return json({ ok: true });
  }

  if (action === 'me' && req.method === 'POST') {
    const b = await req.json();
    await env.DB.prepare(
      `UPDATE w_writers SET name=?,role=?,city=?,bio=?,photo=?,disclosure=? WHERE email=?`)
      .bind(String(b.name || '').slice(0, 120), String(b.role || '').slice(0, 120),
            String(b.city || '').slice(0, 120), String(b.bio || '').slice(0, 1200),
            String(b.photo || '').slice(0, 400), String(b.disclosure || '').slice(0, 2000),
            me.email).run();
    return json({ ok: true, saved: 'Saved.' });
  }

  return json({ ok: false, error: 'unknown action' }, 404);
}

/* ============================================================
   THE VERDICTS — build 1b, 11 Sep 2026

   /write/verdict            the desk: type a ticker, see the automatic
                             verdict, write yours, publish. Login required.
   GET  /api/w/verdicts?ticker=TOVX   public: the founder's and the readers'
   GET  /api/w/verdict?ticker=TOVX    mine, for editing
   POST /api/w/verdict {ticker, company, verdict, notes}  save and publish
   ============================================================ */
const tick = s => String(s || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);

const LEVELS = {
  founder:          { label: 'founder',                   publishes: true,  advice: false, sets_price: true },
  writer:           { label: 'Warrant Wire writer',       publishes: true,  advice: false, sets_price: true },
  gig_amateur:      { label: 'GIG reader',                publishes: true,  advice: false, sets_price: true },
  gig_professional: { label: 'GIG reader · licensed',     publishes: true,  advice: true,  sets_price: true }
};
const levelOf = w => LEVELS[w && w.level] ? w.level : (w && w.kind === 'house' ? 'founder' : 'gig_amateur');

async function ratingOf(env, writer) {
  const s = await env.DB.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM w_ratings WHERE writer=? AND removed IS NULL').bind(writer).first();
  return { stars: s && s.n ? Math.round(s.avg * 10) / 10 : null, ratings: (s && s.n) || 0 };
}

function verdictShape(r) {
  return { name: r.name, author: r.author, title: r.title || null, kind: r.kind, level: r.level || null,
    investor: r.investor || null, stars: r.stars != null ? Math.round(r.stars * 10) / 10 : null, ratings: r.ratings || 0,
    advice: !!r.advice, price: r.price || null,
    verdict: r.verdict || '', notes: r.notes || '',
    written: r.written ? r.written.replace(' ', 'T') + 'Z' : null,
    revised: r.revised ? r.revised.replace(' ', 'T') + 'Z' : null };
}

async function verdictsPublic(env, u) {
  const t = tick(u.searchParams.get('ticker'));
  const CORS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (!t) return new Response(JSON.stringify({ ok: false, error: 'a ticker, please' }), { status: 400, headers: CORS });
  /* each verdict carries its writer's declared investor type and rating */
  const r = await env.DB.prepare(
    `SELECT v.*, w.investor,
            (SELECT AVG(stars) FROM w_ratings WHERE writer=v.author AND removed IS NULL) AS stars,
            (SELECT COUNT(*)   FROM w_ratings WHERE writer=v.author AND removed IS NULL) AS ratings
       FROM w_verdicts v LEFT JOIN w_writers w ON w.email = v.author
      WHERE v.ticker=? AND v.status='published' ORDER BY (v.kind='house') DESC, v.written ASC`)
    .bind(t).all();
  const rows = r.results || [];
  const founder = rows.find(x => x.kind === 'house');
  return new Response(JSON.stringify({ ok: true, ticker: t,
    company: rows.length ? rows[0].company : null,
    founder: founder ? verdictShape(founder) : null,
    readers: rows.filter(x => x.kind !== 'house').map(verdictShape),
    note: 'Opinions under a name, dated. Not advice unless marked by a registered licensed professional. Warrants only.'
  }), { headers: CORS });
}

async function verdictMine(env, me, u) {
  const t = tick(u.searchParams.get('ticker'));
  if (!t) return json({ ok: false, error: 'a ticker, please' }, 400);
  const row = await env.DB.prepare('SELECT * FROM w_verdicts WHERE ticker=? AND author=?').bind(t, me.email).first();
  return json({ ok: true, ticker: t, mine: row ? verdictShape(row) : null });
}

async function verdictSave(req, env, me) {
  const b = await req.json().catch(() => ({}));
  const t = tick(b.ticker);
  const text = String(b.verdict || '').trim().slice(0, 4000);
  const notes = String(b.notes || '').trim().slice(0, 12000);
  const company = String(b.company || '').trim().slice(0, 160);
  if (!t) return json({ ok: false, error: 'a ticker, please' }, 400);
  if (text.length < 20) return json({ ok: false, error: 'the verdict itself — at least a sentence' }, 400);
  /* ⚠ THE TWO GATES BEFORE ANYTHING IS PUBLISHED: a complete profile, and a
     telephone call. The founder's own account passes both by definition. */
  if (levelOf(me) !== 'founder') {
    const gaps = profileGaps(me);
    if (gaps.length) return json({ ok: false, error: 'Not published. Your profile still needs ' + gaps.join('; ') + '.', profile: '/write/profile' }, 400);
    if (!me.called) return json({ ok: false, error: 'Not published yet. The desk telephones every writer before the first verdict goes up — expect a call at ' + (me.phone || 'the number on your profile') + '. Your words are kept here as a draft.', draft: true }, 403);
  }

  /* ⚠ ADVICE IS A WORD ONLY A GIG PROFESSIONAL MAY USE — a level the founder
     sets after checking the licence. A writer cannot grant it to himself, and
     even a professional has to choose it per verdict. */
  const lv = levelOf(me);
  const advice = LEVELS[lv].advice && b.advice === true ? 1 : 0;
  const title = LEVELS[lv].label;
  const price = LEVELS[lv].sets_price ? (me.price || null) : null;

  const had = await env.DB.prepare('SELECT * FROM w_verdicts WHERE ticker=? AND author=?').bind(t, me.email).first();
  if (had) {
    /* the old words go to history before the new ones land */
    await env.DB.prepare(
      `INSERT INTO w_verdict_history (verdict_id, ticker, author, verdict, notes, written, revised)
       VALUES (?,?,?,?,?,?,?)`).bind(had.id, t, me.email, had.verdict, had.notes, had.written, had.revised).run();
    await env.DB.prepare(
      `UPDATE w_verdicts SET company=COALESCE(NULLIF(?, ''), company), name=?, title=?, level=?, price=?, advice=?,
         verdict=?, notes=?, status='published', revised=datetime('now') WHERE id=?`)
      .bind(company, me.name || me.email, title, lv, price, advice, text, notes, had.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO w_verdicts (ticker, company, author, name, title, kind, level, price, advice, verdict, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(t, company || null, me.email, me.name || me.email, title, me.kind, lv, price, advice, text, notes).run();
  }
  const row = await env.DB.prepare('SELECT * FROM w_verdicts WHERE ticker=? AND author=?').bind(t, me.email).first();
  return json({ ok: true, ticker: t, mine: verdictShape(row),
    url: SITES['warrantwire'].url + '/company.html?t=' + t,
    note: had ? 'Revised. The earlier words are kept in the record with their date.' : 'Published under your name.' });
}

/* ⚠ THE DESK IS ONE SCREEN. His instruction: it should be simple. A ticker
   box, what the machine says, a box for what he says, one button. */
async function verdictDesk(env, req, u) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  const t = tick(u.searchParams.get('t'));
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Write a verdict — Warrant Wire</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/wire.css">
<style>
main{padding:22px 0 60px}
.bar{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink2)}
.bar b{color:var(--ink)}
.bar a{color:var(--cool);text-decoration:none}
.bar .who{margin-left:auto}
.finder{max-width:420px}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;margin:18px 0 0}
@media(max-width:900px){.two{grid-template-columns:1fr}}
.box{border:1px solid var(--line);border-radius:10px;padding:18px 20px;background:var(--panel)}
.box.auto{border-color:var(--cool)} .box.me{border-color:var(--warm)}
.box .lbl{font:600 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin:0 0 10px}
.box.auto .lbl{color:var(--cool)} .box.me .lbl{color:var(--warm)}
.vlead{font:400 18px/1.45 var(--serif);color:var(--ink);margin:0 0 12px}
textarea{width:100%;min-height:150px;background:#101208;border:1px solid var(--line);color:var(--ink);
  padding:12px 13px;border-radius:4px;font:16px/1.55 var(--serif);resize:vertical}
textarea.notes{min-height:110px;font:14.5px/1.55 var(--sans)}
textarea:focus{outline:none;border-color:var(--warm)}
label{display:block;font:600 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin:12px 0 5px}
.pub{margin:14px 0 0;background:var(--gold);color:#14150f;border:0;border-radius:5px;padding:12px 20px;font:700 15px var(--sans);cursor:pointer}
.pub:hover{filter:brightness(1.08)}
.msg{margin:10px 0 0;font-size:14px;color:var(--cool);min-height:1.4em}
.msg.bad{color:var(--hot)}
.fine{font-size:12.5px;color:var(--ink3);margin:10px 0 0}
.count{font:400 11px var(--mono);color:var(--ink3);text-align:right;margin:4px 0 0}
</style></head><body>
<header class="top"><div class="wrap masthead"><div class="mast">
  <a class="logo" href="/">WARRANT<i>WIRE</i><small>Every warrant financing, as it is filed</small></a>
  <span class="live"><span class="dot" aria-hidden="true"></span>The desk</span>
</div></div></header>
<main><div class="wrap">
  <div class="bar"><b>Write a verdict</b>
    <a href="/write">Pieces</a>
    <span class="who">${esc(me.name || me.email)} · ${esc(LEVELS[levelOf(me)].label)} · $${esc(me.price || 0)} a verdict · <a href="/write/logout">sign out</a></span>
  </div>

  <div class="finder">
    <input id="q" type="text" placeholder="TICKER" maxlength="12" value="${esc(t)}" autocapitalize="characters" autocorrect="off" spellcheck="false">
    <button id="go" type="button">Open</button>
  </div>
  <p class="fine">Warrants only. What the paper adds up to &mdash; not the company&rsquo;s products. An opinion under your name, dated. Nothing here is advice${/licensed/i.test(me.role || '') ? '' : ', and the word is not available to you'}.</p>

  <div class="two" id="two" hidden>
    <section class="box auto">
      <p class="lbl">The automatic verdict &mdash; what the rules say</p>
      <p class="vlead" id="alead">&hellip;</p>
      <div id="arules" style="font-size:13.5px;color:var(--ink2)"></div>
      <div id="adeep" style="font-size:13.5px;color:var(--ink2);margin-top:10px"></div>
    </section>
    <section class="box me">
      <p class="lbl">Your verdict &mdash; <span id="mname">${esc(me.name || me.email)}</span></p>
      <label for="v">The verdict &mdash; one to three sentences</label>
      <textarea id="v" maxlength="4000" placeholder="What the warrant paper adds up to."></textarea>
      <p class="count" id="vc">0</p>
      <label for="n">Notes &mdash; optional, as long as you like</label>
      <textarea id="n" class="notes" maxlength="12000" placeholder="The reasoning, the filings you read, anything the sentence leaves out."></textarea>
      ${LEVELS[levelOf(me)].advice
        ? '<label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font:14px var(--sans);color:var(--ink2)"><input type="checkbox" id="adv"> Mark this verdict as <b>advice</b> — under my licence, ' + esc(me.licence || 'on file') + '</label>'
        : '<p class="fine">Your level is <b>' + esc(LEVELS[levelOf(me)].label) + '</b>: every verdict is an opinion, not advice.</p>'}
      <label for="pr">Your price for a verdict, in dollars</label>
      <input id="pr" type="number" min="1" max="5000" value="${esc(me.price || 50)}" style="width:120px;background:#101208;border:1px solid var(--line);color:var(--ink);padding:8px 10px;border-radius:3px;font:14px var(--mono)">
      <button type="button" id="prb" style="background:transparent;border:1px solid var(--line);color:var(--ink2);padding:8px 12px;border-radius:3px;font:13px var(--sans);cursor:pointer;margin-left:6px">Save price</button>
      <button class="pub" id="pub" type="button">Publish under my name</button>
      <p class="msg" id="msg"></p>
      <p class="fine" id="was"></p>
    </section>
  </div>
</div></main>
<script src="/wire.js"></script>
<script src="/verdict.js"></script>
<script>
(function(){
  var esc = WW.esc, q = document.getElementById('q'), two = document.getElementById('two');
  var company = '';
  function open(t){
    t = String(t||'').trim().toUpperCase(); if (!t) return;
    q.value = t; history.replaceState(null, '', '/write/verdict?t=' + encodeURIComponent(t));
    two.hidden = false;
    document.getElementById('alead').textContent = 'Reading the wire…';
    document.getElementById('arules').innerHTML = ''; document.getElementById('adeep').innerHTML = '';
    fetch(WW.API + '?wire=1&q=' + encodeURIComponent(t)).then(function(r){return r.json()}).then(function(d){
      company = (d.company && d.company.name) || (d.about && d.about.company) || '';
      var v = WWVerdict.render(d);
      document.getElementById('alead').textContent = v.none ? v.fired[0].text : (v.sentence || 'Not enough on file to reach a verdict.');
      document.getElementById('arules').innerHTML = v.fired.map(function(r){ return '<div><b style="color:var(--warm);font-family:var(--mono)">' + esc(r.id) + '</b> ' + esc(r.text) + '</div>'; }).join('')
        + '<div style="margin-top:6px;color:var(--ink3)">Rules v' + v.version + ' · <a href="/rules.html" target="_blank" style="color:var(--cool)">how it is rendered</a></div>';
    }).catch(function(){ document.getElementById('alead').textContent = 'The wire is not answering.'; });
    fetch('https://verdict.realroofers.workers.dev/?ticker=' + encodeURIComponent(t)).then(function(r){ return r.ok ? r.json() : null; }).then(function(v){
      if (!v || !v.lines) return;
      document.getElementById('adeep').innerHTML = '<b style="color:var(--ink)">From the record built by hand:</b> ' + (v.verdict ? esc(v.verdict) + ' ' : '')
        + v.lines.map(function(l){ return esc(l.label) + ' — ' + esc(l.value); }).join(' · ')
        + (v.missing && v.missing.length ? ' · not on file: ' + esc(v.missing.join(', ')) : '');
    }).catch(function(){});
    fetch('/api/w/verdict?ticker=' + encodeURIComponent(t)).then(function(r){return r.json()}).then(function(d){
      var m = d.mine;
      document.getElementById('v').value = m ? m.verdict : '';
      document.getElementById('n').value = m ? m.notes : '';
      document.getElementById('was').textContent = m ? ('On the page since ' + m.written.slice(0,16).replace('T',' ') + ' UTC' + (m.revised ? ', revised ' + m.revised.slice(0,16).replace('T',' ') + ' UTC' : '') + '. Saving again keeps the earlier words in the record.') : 'Nothing under your name on this company yet.';
      count();
    }).catch(function(){});
  }
  function count(){ document.getElementById('vc').textContent = document.getElementById('v').value.length + ' / 4000'; }
  document.getElementById('v').addEventListener('input', count);
  document.getElementById('go').addEventListener('click', function(){ open(q.value); });
  q.addEventListener('keydown', function(e){ if (e.key === 'Enter') open(q.value); });
  document.getElementById('pub').addEventListener('click', function(){
    var msg = document.getElementById('msg'); msg.className = 'msg'; msg.textContent = 'Publishing…';
    fetch('/api/w/verdict', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ ticker: q.value, company: company, verdict: document.getElementById('v').value, notes: document.getElementById('n').value,
                             advice: !!(document.getElementById('adv') && document.getElementById('adv').checked) }) })
    .then(function(r){return r.json()}).then(function(d){
      if (!d.ok) { msg.className = 'msg bad'; msg.textContent = d.error || 'Not saved.'; return; }
      msg.innerHTML = esc(d.note) + ' <a href="' + esc(d.url) + '" target="_blank" style="color:var(--cool)">See it on the company page →</a>';
      open(q.value);
    }).catch(function(){ msg.className = 'msg bad'; msg.textContent = 'Could not reach the desk.'; });
  });
  document.getElementById('prb').addEventListener('click', function(){
    var msg = document.getElementById('msg'); msg.className = 'msg';
    fetch('/api/w/price', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ price: document.getElementById('pr').value }) })
    .then(function(r){return r.json()}).then(function(d){ msg.className = d.ok ? 'msg' : 'msg bad'; msg.textContent = d.ok ? d.note : (d.error || 'Not saved.'); })
    .catch(function(){ msg.className = 'msg bad'; msg.textContent = 'Could not reach the desk.'; });
  });
  var m0 = document.getElementById('adv'); if (m0) fetch('/api/w/verdict?ticker=' + encodeURIComponent(q.value || '')).then(function(r){return r.json()}).then(function(d){ if (d.mine) m0.checked = !!d.mine.advice; }).catch(function(){});
  if (q.value) open(q.value);
})();
</script>
</body></html>`, { headers: H.html });
}

/* ============================================================
   ENROLLING — build 1e. A GIG reader signs up in public: name, email,
   telephone, city, a picture, and a licence number if they have one. The
   account is created PENDING — it cannot sign in or write until the founder
   validates it on the roster (status active, level set, licence checked).
   The picture goes to the gig-workers-photo bucket with its source recorded
   as "supplied by the writer at enrolment".
   ============================================================ */
/* where the connection is coming from, as Cloudflare sees it — never typed */
function whereFrom(req) {
  const c = (req && req.cf) || {};
  return [c.city, c.region, c.country].filter(Boolean).join(', ') || null;
}

function enrolForm(msg = '', pre = {}, mine = false) {
  const sel = v => pre.investor === v ? ' selected' : '';
  return `<h1>${mine ? 'Your profile' : 'Read under your own name'}</h1>${msg}
    <p class="quiet" style="margin:0 0 14px">Nobody here is anonymous. A real name, a telephone number that reaches you,
    and a picture. The system checks the profile is complete before anything is published; everything you publish carries your name.</p>
    <form method="post" action="/write/enrol" class="card" enctype="multipart/form-data">
      <label>Full legal name<input name="name" required autocomplete="name" value="${esc(pre.name || '')}"></label>
      <label>Email<input name="email" type="email" required autocomplete="email" value="${esc(pre.email || '')}"${mine ? ' readonly' : ''}></label>
      <label>Telephone — a real line that rings where you are. Not Google Voice, not an internet number; the desk calls it before your first verdict goes up.<input name="phone" type="tel" required autocomplete="tel" value="${esc(pre.phone || '')}"></label>
      <label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="realphone" value="1" required style="width:auto;margin:4px 0 0"> <span>This is not a Google Voice or internet-only number.</span></label>
      <label>Where you are from — city and state, or country<input name="origin" required autocomplete="address-level2" value="${esc(pre.origin || '')}"></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="nomad" value="1" style="width:auto;margin:0"${pre.nomad ? ' checked' : ''}> <span>Nomad — no fixed base. Your current location is read from your connection each time you sign in.</span></label>
      <label>Your picture (JPEG or PNG)${pre.photo ? ' — one is on file; choose another to replace it' : ''}<input name="photo" type="file" accept="image/jpeg,image/png"${pre.photo ? '' : ' required'}></label>
      <label>What you are — declared on your profile and beside everything you write
        <select name="investor" required style="display:block;width:100%;margin-top:4px;padding:10px 12px;border:1.5px solid var(--rule);font:inherit;background:#fff">
          <option value="">Choose one</option>
          <option value="retail"${sel('retail')}>Retail investor</option>
          <option value="professional"${sel('professional')}>Investment professional</option>
          <option value="gig_reader"${sel('gig_reader')}>GIG reader — I read filings, I do not hold</option>
        </select></label>
      <label>Licence, if you hold one — CRD, bar or CPA number and the state<input name="licence" placeholder="leave blank if none" value="${esc(pre.licence || '')}"></label>
      <label>Bio — two or three sentences a buyer reads before trusting you<textarea name="bio" rows="3" required>${esc(pre.bio || '')}</textarea></label>
      <label>Background — what you did before this, and what you have read<textarea name="background" rows="4" required>${esc(pre.background || '')}</textarea></label>
      <label>Your price for a verdict, in dollars<input name="price" type="number" min="1" max="5000" value="${esc(pre.price || 50)}" required></label>
      <label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="agree" required style="width:auto;margin:4px 0 0">
        <span>I understand that everything I write is an opinion under my own name, not advice — unless the founder has
        verified my licence and I choose to mark a verdict as advice — and that it is about warrants only.</span></label>
      <button class="primary">${mine ? 'Save my profile' : 'Enrol'}</button>
    </form>
    ${mine ? '<p class="quiet"><a href="/write/verdict">Back to the desk</a></p>'
           : '<p class="quiet">Quicker: <a href="/write/google">continue with Google</a> and the system verifies your email on the spot. <a href="/write/login">Already enrolled? Sign in.</a></p>'}`;
}
async function enrolPost(req, env) {
  const f = await req.formData();
  const g = k => String(f.get(k) || '').trim();
  /* a signed-in writer is saving their own profile: the email is theirs and
     the account stays exactly as active as it was */
  const me = await who(env, req);
  const email = me ? me.email : g('email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return page('Enrol', enrolForm('<p class="err">A working email, please.</p>'));
  if (g('name').length < 3 || g('phone').length < 7 || !g('origin') || g('bio').length < 20 || g('background').length < 20)
    return page('Enrol', enrolForm('<p class="err">Name, telephone, where you are from, a bio and a background are all needed.</p>'));
  const here = whereFrom(req);
  const had = await env.DB.prepare('SELECT status FROM w_writers WHERE email=?').bind(email).first();
  if (!me && had && had.status === 'active') return page('Enrol', enrolForm('<p class="err">That email already writes here. <a href="/write/login">Sign in</a> or <a href="/write/reset">reset your password</a>.</p>'));

  /* the picture: sniffed, not trusted; stored with its source */
  let photo = null;
  const file = f.get('photo');
  if (file && typeof file === 'object' && file.size) {
    if (file.size > 8 * 1024 * 1024) return page('Enrol', enrolForm('<p class="err">The picture is over eight megabytes.</p>'));
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const jpg = head[0] === 0xFF && head[1] === 0xD8, png = head[0] === 0x89 && head[1] === 0x50;
    if (!jpg && !png) return page('Enrol', enrolForm('<p class="err">The picture must be a JPEG or a PNG.</p>'));
    const bucket = env.GIG || env.IMG;
    if (bucket) {
      const key = 'gig/' + slugify(email.replace('@', '-at-')) + '-' + rnd(6) + (jpg ? '.jpg' : '.png');
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: jpg ? 'image/jpeg' : 'image/png' },
        customMetadata: { source: 'supplied by the writer at enrolment, ' + today(), email } });
      photo = (env.GIG ? 'gig:' : '/writing/img/') + key;
    }
  }
  const price = Math.min(5000, Math.max(1, Math.round(Number(g('price')) || 50)));
  const licence = g('licence').slice(0, 120) || null;
  await env.DB.prepare(
    `INSERT INTO w_writers (email, name, city, origin, nomad, bio, background, photo, kind, status, level, price, licence, phone, role, seen_from, seen_at, investor)
     VALUES (?,?,?,?,?,?,?,?,'guest','pending',?,?,?,?,?,?,datetime('now'),?)
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, city=excluded.city, origin=excluded.origin, nomad=excluded.nomad,
       bio=excluded.bio, background=excluded.background, investor=excluded.investor,
       photo=COALESCE(excluded.photo, photo), price=excluded.price,
       licence=excluded.licence, phone=excluded.phone,
       /* a signed-in writer keeps their status and level; a stranger's enrolment is pending */
       status=CASE WHEN status='active' THEN 'active' ELSE 'pending' END,
       level=CASE WHEN status='active' THEN level ELSE excluded.level END,
       seen_from=excluded.seen_from, seen_at=datetime('now')`)
    .bind(email, g('name').slice(0, 120), here, g('origin').slice(0, 120), g('nomad') === '1' ? 1 : 0,
          g('bio').slice(0, 1200), g('background').slice(0, 4000), photo,
          licence ? 'gig_professional' : 'gig_amateur', price, licence, g('phone').slice(0, 40),
          licence ? 'GIG reader · licence to be checked' : 'GIG reader', here,
          ['retail', 'professional', 'gig_reader'].indexOf(g('investor')) > -1 ? g('investor') : 'retail').run();
  if (me) return new Response(null, { status: 303, headers: { location: '/write/verdict' } });
  return page('Enrol', `<h1>Enrolled</h1>
    <p class="quiet">Thank you, ${esc(g('name'))}. The desk will telephone you at ${esc(g('phone'))} before your first verdict
    goes up — that call is how a person is verified here. You will get a link to choose a password${licence ? ', and your licence will be checked before the professional level is granted' : ''}.
    Quicker next time: <a href="/write/google">continue with Google</a>.</p><p class="quiet"><a href="/">Back to the wire</a></p>`);
}

/* ============================================================
   SIGNING IN
   ============================================================ */
function loginForm(msg = '') {
  return `<h1>Sign in to write</h1>${msg}
  <form method="post" action="/write/login" class="card">
    <label>Your email<input name="email" type="email" required autofocus autocomplete="username"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="primary">Sign in</button>
  </form>
  <p class="quiet"><a href="/write/reset">Forgot your password?</a></p>
  <p class="quiet">Writing here is by invitation. If you have been invited and the link has expired,
  write to <a href="mailto:research@warrantwire.com">research@warrantwire.com</a> and another will be sent.</p>`;
}
async function loginPost(req, env) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase();
  const w = await env.DB.prepare("SELECT * FROM w_writers WHERE email=? AND status='active'").bind(email).first();
  if (!w || !w.password) return page('Sign in', loginForm('<p class="err">No login with that email, or the password has not been set yet.</p>'));
  if (!(await checkPw(String(f.get('password') || ''), w.password)))
    return page('Sign in', loginForm('<p class="err">Wrong password.</p>'));
  /* current location, off the connection, every sign-in */
  await env.DB.prepare("UPDATE w_writers SET seen_from=?, seen_at=datetime('now') WHERE email=?")
    .bind(whereFrom(req), email).run().catch(() => {});
  /* ⚠ THE AUTHENTICATOR, IF IT IS ON. The password gets a five-minute
     half-session that can do one thing: present a code. Nothing else on the
     desk accepts it. */
  if (w.totp_on) {
    const half = 'code-' + rnd(28);
    await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
      .bind(half, email, new Date(Date.now() + 5 * 60e3).toISOString()).run();
    return new Response(null, { status: 303, headers: [['location', '/write/code'],
      ['set-cookie', `tswrite=${half}; Path=/; Max-Age=300; Secure; HttpOnly; SameSite=Lax`]] });
  }
  const tok = rnd(28);
  await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
    .bind(tok, email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [['location', '/write'],
    ['set-cookie', `tswrite=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}
async function setForm(u, env, msg = '') {
  const t = u.searchParams.get('t') || '';
  const s = await env.DB.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!s) return page('Choose a password', '<h1>That link has expired.</h1><p class="quiet">Ask for another.</p>');
  return page('Choose a password', `<h1>Choose a password</h1>${msg}
    <form method="post" action="/write/set" class="card">
      <input type="hidden" name="t" value="${esc(t)}">
      <label>Your name, as it will appear on the piece<input name="name" required></label>
      <label>Password (8 characters or more)<input name="password" type="password" minlength="8" required></label>
      <label>Type it again<input name="password2" type="password" minlength="8" required></label>
      <button class="primary">Save and sign in</button>
    </form>`);
}
async function setPost(req, env) {
  const f = await req.formData();
  const t = String(f.get('t') || ''), p1 = String(f.get('password') || ''), p2 = String(f.get('password2') || '');
  const s = await env.DB.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!s) return page('Choose a password', '<h1>That link has expired.</h1>');
  if (p1.length < 8 || p1 !== p2)
    return setForm(new URL('https://x/write/set?t=' + t), env, '<p class="err">The two passwords must match, and be at least 8 characters.</p>');
  await env.DB.prepare('UPDATE w_writers SET password=?, name=COALESCE(NULLIF(?,\'\'),name) WHERE email=?')
    .bind(await hashPw(p1), String(f.get('name') || '').slice(0, 120), s.email).run();
  await env.DB.prepare('DELETE FROM w_sessions WHERE token=?').bind(t).run();
  /* ⚠ A NEW PASSWORD SIGNS OUT EVERY OTHER BROWSER. If the reason for the
     reset was that somebody else had the old one, this is the moment they
     lose it. The one-time link is marked used, never deleted — it is the
     record of who reset what, and when. */
  await env.DB.prepare("DELETE FROM w_sessions WHERE email=? AND token NOT LIKE 'set-%'").bind(s.email).run();
  await env.DB.prepare("UPDATE w_resets SET used=datetime('now') WHERE token=?").bind(t).run().catch(() => {});
  const tok = rnd(28);
  await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
    .bind(tok, s.email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [['location', '/write'],
    ['set-cookie', `tswrite=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}

/* ============================================================
   SIGN IN WITH GOOGLE — build 1f, 11 Sep 2026

   His ask: one click if you are already signed in to your email. Standard
   OpenID Connect against Google. Nothing here stores a Google password;
   Google says who the person is, and the email has to match a writer who
   has been validated. Somebody who is not enrolled is sent to enrol with
   the name and email already filled in.

   ⚠ SWITCHED ON BY TWO SECRETS on this worker, set by the founder in the
   Cloudflare dashboard, never in a file:
     GOOGLE_CLIENT_ID      from console.cloud.google.com, an OAuth client of
     GOOGLE_CLIENT_SECRET  type "Web application", with this redirect URI:
                           https://warrantwire.com/write/google/back
   Until they exist the button is simply not shown.

   ⚠ THE STATE COOKIE. A random value goes out with the request and must
   come back with the answer, so a link somebody else built cannot sign
   you in as them. It lives ten minutes.
   ⚠ THE AUTHENTICATOR STILL APPLIES. Google proves the email; if the
   writer turned on the app, the six digits are still asked for.
   ============================================================ */
async function googleButton(env, req) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return '';
  return `<p style="margin:0 0 14px"><a href="/write/google" class="primary" style="display:block;text-align:center;background:#fff;color:#15181B;border:1.5px solid var(--rule);padding:12px 18px;text-decoration:none;font-weight:600">Continue with Google</a></p>
    <p class="quiet" style="margin:0 0 14px;text-align:center">or with your password</p>`;
}
async function googleStart(env, req, u, SITE) {
  if (!env.GOOGLE_CLIENT_ID) return page('Sign in', loginForm('<p class="err">Google sign-in is not switched on yet.</p>'));
  const state = rnd(24);
  const back = SITE + '/write/google/back';
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: back, response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online' }).toString();
  return new Response(null, { status: 303, headers: [['location', url],
    ['set-cookie', `gstate=${state}; Path=/write; Max-Age=600; Secure; HttpOnly; SameSite=Lax`]] });
}
async function googleBack(env, req, u, SITE) {
  const bad = m => page('Sign in', loginForm('<p class="err">' + m + '</p>'));
  const state = (/(?:^|;\s*)gstate=([a-z0-9]+)/.exec(req.headers.get('cookie') || '') || [])[1] || '';
  if (!state || state !== u.searchParams.get('state')) return bad('That sign-in did not start here. Try again.');
  const code = u.searchParams.get('code');
  if (!code) return bad('Google did not sign you in.');
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: SITE + '/write/google/back', grant_type: 'authorization_code' }).toString() });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tok.id_token) return bad('Google did not answer. Try again.');
  /* the id_token is a signed JWT; Google's tokeninfo endpoint checks the
     signature and the audience for us, which is simpler than shipping JWKS */
  const info = await (await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok.id_token))).json().catch(() => ({}));
  if (!info.email || info.aud !== env.GOOGLE_CLIENT_ID || info.email_verified !== 'true') return bad('That Google account could not be verified.');
  const email = String(info.email).toLowerCase();
  const w = await env.DB.prepare('SELECT * FROM w_writers WHERE email=?').bind(email).first();
  const clear = ['set-cookie', 'gstate=; Path=/write; Max-Age=0; Secure; HttpOnly; SameSite=Lax'];
  /* ⚠ THE SYSTEM VERIFIES, NOT THE FOUNDER. His ruling, 11 Sep. Google has
     proved the email, so the account is made here and now — active, at the
     GIG reader level, at the default price — and the person goes straight
     to the desk. What the system still requires before anything can be
     PUBLISHED is a complete profile: telephone, picture, bio, background,
     and what they are. That is enforced at publish time, not at the door. */
  if (!w || w.status !== 'active') {
    await env.DB.prepare(
      `INSERT INTO w_writers (email, name, kind, status, level, price, role, validated, seen_from, seen_at)
       VALUES (?,?,'guest','active','gig_amateur',50,'GIG reader',?,?,datetime('now'))
       ON CONFLICT(email) DO UPDATE SET status='active', name=COALESCE(NULLIF(name,''), excluded.name),
         level=COALESCE(level,'gig_amateur'), price=COALESCE(price,50), validated=excluded.validated,
         seen_from=excluded.seen_from, seen_at=datetime('now')`)
      .bind(email, String(info.name || '').slice(0, 120), 'google ' + today(), whereFrom(req)).run();
  }
  await env.DB.prepare("UPDATE w_writers SET seen_from=?, seen_at=datetime('now') WHERE email=?").bind(whereFrom(req), email).run().catch(() => {});
  if (w.totp_on) {
    const half = 'code-' + rnd(28);
    await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)').bind(half, email, new Date(Date.now() + 5 * 60e3).toISOString()).run();
    return new Response(null, { status: 303, headers: [['location', '/write/code'],
      ['set-cookie', `tswrite=${half}; Path=/; Max-Age=300; Secure; HttpOnly; SameSite=Lax`], clear] });
  }
  const t = rnd(28);
  await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)').bind(t, email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  /* a new or incomplete profile goes to the profile page first; a complete one to the desk */
  const fresh = await env.DB.prepare('SELECT * FROM w_writers WHERE email=?').bind(email).first();
  const dest = profileGaps(fresh).length ? '/write/profile' : '/write/verdict';
  return new Response(null, { status: 303, headers: [['location', dest],
    ['set-cookie', `tswrite=${t}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`], clear] });
}

/* what the system still needs before this person may publish */
function profileGaps(w) {
  const gaps = [];
  if (!w) return ['an account'];
  if (!(w.name || '').trim() || w.name.indexOf(' ') < 0) gaps.push('your full name');
  if (!(w.phone || '').trim()) gaps.push('a telephone number');
  if (!w.photo) gaps.push('a picture');
  if ((w.bio || '').length < 20) gaps.push('a bio');
  if ((w.background || '').length < 20) gaps.push('a background');
  if (!w.investor) gaps.push('what you are — retail investor, professional, or GIG reader');
  if (!(w.origin || '').trim()) gaps.push('where you are from');
  return gaps;
}

/* a GIG reader's picture, out of the gig bucket, with a fixed type */
async function gigImg(env, key) {
  if (!env.GIG || !/^gig\/[a-z0-9.-]+\.(jpg|png)$/.test(key)) return new Response('no', { status: 404 });
  const o = await env.GIG.get(key);
  if (!o) return new Response('no', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': key.endsWith('.png') ? 'image/png' : 'image/jpeg',
    'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
}

/* ============================================================
   THE ROSTER — the founder validates enrolments and sets levels
   ============================================================ */
async function rosterPage(env, req, SITE) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  if (levelOf(me) !== 'founder') return page('Writers', '<h1>The founder does this.</h1>');
  const r = await env.DB.prepare(
    `SELECT email, name, phone, city, origin, nomad, bio, background, photo, level, price, licence, status, validated, totp_on, created, seen_from, seen_at, investor, called, called_by, call_note
       FROM w_writers ORDER BY CASE WHEN status='active' AND called IS NULL THEN 0 WHEN status='pending' THEN 1 WHEN status='active' THEN 2 ELSE 3 END, created DESC`).all();
  const opts = lv => Object.keys(LEVELS).map(k => `<option value="${k}"${k === lv ? ' selected' : ''}>${esc(LEVELS[k].label)}</option>`).join('');
  const rows = (r.results || []).map(w => {
    const lv = levelOf(w);
    const pic = w.photo ? (w.photo.startsWith('gig:') ? '/writing/gig/' + w.photo.slice(4) : w.photo) : null;
    return `<tr data-email="${esc(w.email)}">
      <td>${pic ? `<img src="${esc(pic)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:50%">` : '<span style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#2a2c22"></span>'}</td>
      <td><b>${esc(w.name || '')}</b><br><span class="quiet">${esc(w.email)}<br>${esc(w.phone || '')}<br>from ${esc(w.origin || w.city || '?')}${w.nomad ? ' · nomad' : ''}<br>seen ${esc(w.seen_from || 'unknown')}${w.seen_at ? ' · ' + esc(String(w.seen_at).slice(0, 16)) : ''}</span>
        ${w.bio ? `<div class="quiet" style="margin-top:4px;max-width:44ch"><b>Bio</b> ${esc(w.bio)}</div>` : ''}
        ${w.background ? `<div class="quiet" style="margin-top:4px;max-width:44ch"><b>Background</b> ${esc(w.background)}</div>` : ''}</td>
      <td>${w.licence ? '<b>' + esc(w.licence) + '</b>' : '<span class="quiet">none</span>'}</td>
      <td><select class="lv">${opts(lv)}</select><br><span class="quiet">$${esc(w.price || 0)} a verdict</span></td>
      <td>${w.status === 'pending' ? '<b style="color:var(--warm)">PENDING</b>' : w.status === 'active' ? 'active' + (w.validated ? '<br><span class="quiet">' + esc(String(w.validated).slice(0, 17)) + '</span>' : '') : esc(w.status)}
        ${w.investor ? '<br><span class="quiet">' + esc({ retail: 'retail investor', professional: 'investment professional', gig_reader: 'GIG reader' }[w.investor] || w.investor) + '</span>' : ''}
        ${w.totp_on ? '<br><span class="quiet">authenticator on</span>' : ''}
        <br>${w.called ? '<span style="color:var(--cool)">✔ called ' + esc(String(w.called).slice(0, 10)) + ' by ' + esc(w.called_by || '') + '</span>' + (w.call_note ? '<br><span class="quiet">' + esc(w.call_note) + '</span>' : '')
                       : (w.status === 'active' ? '<b style="color:var(--hot)">CALL NEEDED</b> <span class="quiet">' + esc(w.phone || 'no number') + '</span>' : '')}</td>
      <td>${w.status === 'active'
        ? (w.called ? '<button class="b no uncall">Undo call</button> ' : '<input class="cnote" placeholder="a line about the call" style="width:100%;margin:0 0 4px;background:#101208;border:1px solid var(--line);color:var(--ink);padding:6px 8px;border-radius:3px;font:12.5px var(--sans)"><button class="b call">I spoke to them</button> ') + '<button class="b no setlv">Set level</button>'
        : '<button class="b ok">Validate</button> <button class="b no">Decline</button>'}
        <div class="out quiet"></div></td></tr>`;
  }).join('');
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Writers</title>
<meta name="robots" content="noindex"><link rel="stylesheet" href="/wire.css">
<style>main{padding:22px 0 60px}table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font:600 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink3)}
.quiet{color:var(--ink3);font-size:12.5px}.bar{padding:14px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink2)}
.bar a{color:var(--cool);text-decoration:none;margin-right:16px}
select{background:#101208;border:1px solid var(--line);color:var(--ink);padding:6px 8px;border-radius:3px;font:13px var(--sans)}
.b{background:var(--cool);border:0;color:#0f1a14;padding:7px 12px;border-radius:3px;font:600 13px var(--sans);cursor:pointer;margin:0 4px 4px 0}
.b.no{background:transparent;border:1px solid var(--line);color:var(--ink2)}
.out{font:12px var(--mono);word-break:break-all;margin-top:6px;color:var(--cool)}
@media(max-width:800px){table,thead,tbody,tr,th,td{display:block}th{display:none}td{padding:4px 0;border:0}tr{padding:12px 0;border-bottom:1px solid var(--line)}}</style></head><body>
<header class="top"><div class="wrap masthead"><div class="mast">
  <a class="logo" href="/">WARRANT<i>WIRE</i><small>Every warrant financing, as it is filed</small></a>
  <span class="live"><span class="dot" aria-hidden="true"></span>Writers</span></div></div></header>
<main><div class="wrap">
  <div class="bar"><a href="/write">Dashboard</a><a href="/write/verdict">Write a verdict</a><a href="/write/resets">Password resets</a><b style="color:var(--ink)">Writers</b></div>
  <p class="quiet">Enrolments arrive pending. Check the name, the telephone, the picture — and the licence, if one is claimed —
  then choose the level and validate. That gives you a one-time link to send them for their password. Levels:
  ${Object.keys(LEVELS).map(k => '<b>' + esc(LEVELS[k].label) + '</b>' + (LEVELS[k].advice ? ' (may mark a verdict as advice)' : '')).join(' · ')}.
  Enrol page for readers: <a href="${esc(SITE)}/write/enrol" style="color:var(--cool)">${esc(SITE)}/write/enrol</a></p>
  <table><thead><tr><th></th><th>Who</th><th>Licence</th><th>Level · price</th><th>Status</th><th></th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" class="quiet">Nobody yet.</td></tr>'}</tbody></table>
</div></main>
<script>
document.querySelectorAll('tr[data-email]').forEach(function(tr){
  var email = tr.getAttribute('data-email'), out = tr.querySelector('.out'), lv = tr.querySelector('.lv');
  function post(a, body){ out.textContent = '…'; return fetch('/api/w/' + a, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) }).then(function(r){ return r.json(); }); }
  var ok = tr.querySelector('.ok'); if (ok) ok.onclick = function(){ post('validate', { email: email, level: lv.value }).then(function(d){ out.textContent = d.ok ? 'Validated as ' + d.label + '. Send them: ' + d.link : (d.error || 'no'); }); };
  var no = tr.querySelector('.no'); if (no) no.onclick = function(){ if (confirm('Decline ' + email + '?')) post('decline', { email: email }).then(function(){ tr.remove(); }); };
  var st = tr.querySelector('.setlv'); if (st) st.onclick = function(){ post('level', { email: email, level: lv.value }).then(function(d){ out.textContent = d.ok ? 'Now ' + d.label + '.' : (d.error || 'no'); }); };
  var cl = tr.querySelector('.call'); if (cl) cl.onclick = function(){ var n = tr.querySelector('.cnote'); post('called', { email: email, note: n ? n.value : '' }).then(function(d){ out.textContent = d.ok ? 'Recorded. They may publish now.' : (d.error || 'no'); if (d.ok) setTimeout(function(){ location.reload(); }, 900); }); };
  var un = tr.querySelector('.uncall'); if (un) un.onclick = function(){ if (confirm('Undo the call record for ' + email + '?')) post('called', { email: email, called: false }).then(function(){ location.reload(); }); };
});
</script></body></html>`, { headers: H.html });
}

/* ============================================================
   THE AUTHENTICATOR — build 1d, 11 Sep 2026

   His call: an authenticator app, the way Stripe does it. Standard TOTP
   (RFC 6238): a secret per writer, a six-digit code every thirty seconds,
   HMAC-SHA1 in WebCrypto — no library, nothing leaves this worker.

   /write/2fa     signed in: scan the QR (or type the key) into Google
                  Authenticator, Authy, 1Password, whatever — enter the code
                  it shows, and it is on. Enter a code again to turn it off.
   /write/code    after the password, when it is on: the six digits.

   ⚠ THE PASSWORD ALONE GETS A FIVE-MINUTE HALF-SESSION that can present a
   code and nothing else. who() refuses it everywhere.
   ⚠ A CODE IS ACCEPTED FROM THE STEP BEFORE OR AFTER, for clock drift, and
   the same code cannot be replayed within its window.
   ⚠ LOSING THE PHONE: the founder turns it off for a writer at
   /api/w/2fa-off (house). For the founder himself, the master key does it:
   /api/w/2fa-off?key=LOG_KEY&email=... — the one door that is not the app.
   ============================================================ */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) { val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32dec(s) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out = []; let bits = 0, val = 0;
  for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function hotp(secretB32, counter) {
  const key = await crypto.subtle.importKey('raw', b32dec(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 255; counter = Math.floor(counter / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
/* returns the step that matched, or -1 */
async function totpMatch(secret, code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return -1;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) if ((await hotp(secret, step + d)) === c) return step + d;
  return -1;
}
const lastStep = new Map();   /* email -> last step accepted; stops a replay in the same window */

function codeForm(msg = '') {
  return `<h1>Your code</h1>${msg}
    <form method="post" action="/write/code" class="card">
      <label>The six digits from your authenticator app
        <input name="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="one-time-code" required autofocus></label>
      <button class="primary">Sign in</button>
    </form>
    <p class="quiet">Lost the phone? Write to <a href="mailto:research@warrantwire.com">research@warrantwire.com</a>.</p>`;
}
const halfCookie = req => (/(?:^|;\s*)tswrite=(code-[a-z0-9]+)/.exec(req.headers.get('cookie') || '') || [])[1] || '';

async function totpLoginPost(req, env) {
  const half = halfCookie(req);
  const s = half ? await env.DB.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now')").bind(half).first() : null;
  if (!s) return page('Your code', codeForm('<p class="err">That took too long. Sign in again.</p><p class="quiet"><a href="/write/login">Sign in</a></p>'));
  const w = await env.DB.prepare('SELECT email, totp_secret, totp_on FROM w_writers WHERE email=?').bind(s.email).first();
  const f = await req.formData();
  const step = w && w.totp_on ? await totpMatch(w.totp_secret, f.get('code')) : -1;
  if (step < 0 || lastStep.get(s.email) === step)
    return page('Your code', codeForm('<p class="err">That code is not right, or it was already used.</p>'));
  lastStep.set(s.email, step);
  await env.DB.prepare('DELETE FROM w_sessions WHERE token=?').bind(half).run();
  const tok = rnd(28);
  await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
    .bind(tok, s.email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [['location', '/write'],
    ['set-cookie', `tswrite=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}

async function totpEnrolPage(env, req, msg = '') {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  const w = await env.DB.prepare('SELECT totp_secret, totp_on FROM w_writers WHERE email=?').bind(me.email).first();
  if (w && w.totp_on) {
    return page('Authenticator', `<h1>Authenticator is on</h1>${msg}
      <p class="quiet">Every sign-in asks for the six digits after the password.</p>
      <form method="post" action="/write/2fa" class="card">
        <input type="hidden" name="off" value="1">
        <label>To turn it off, enter the current code<input name="code" inputmode="numeric" maxlength="7" required></label>
        <button class="primary">Turn it off</button>
      </form><p class="quiet"><a href="/write">Back to the desk</a></p>`);
  }
  /* a fresh secret each time this page is opened before it is confirmed */
  let secret = w && w.totp_secret;
  if (!secret) {
    secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
    await env.DB.prepare('UPDATE w_writers SET totp_secret=?, totp_on=0 WHERE email=?').bind(secret, me.email).run();
  }
  const uri = 'otpauth://totp/' + encodeURIComponent('Warrant Wire:' + me.email)
    + '?secret=' + secret + '&issuer=' + encodeURIComponent('Warrant Wire') + '&digits=6&period=30&algorithm=SHA1';
  return page('Authenticator', `<h1>Set up your authenticator</h1>${msg}
    <div class="card">
      <p style="margin:0 0 10px;font-size:14px">Open your authenticator app — the one you use for Stripe works — and scan this:</p>
      <div id="qr" style="background:#fff;padding:10px;display:inline-block"></div>
      <p class="quiet" style="margin-top:10px">Or type the key by hand:<br><code style="font-size:13px;word-break:break-all">${esc(secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
      <form method="post" action="/write/2fa">
        <label>Then enter the six digits it shows<input name="code" inputmode="numeric" maxlength="7" autocomplete="one-time-code" required></label>
        <button class="primary">Turn it on</button>
      </form>
    </div>
    <p class="quiet"><a href="/write">Back to the desk</a></p>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(uri)}, width: 180, height: 180 });</script>`);
}

async function totpEnrolPost(req, env) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  const f = await req.formData();
  const w = await env.DB.prepare('SELECT totp_secret, totp_on FROM w_writers WHERE email=?').bind(me.email).first();
  const step = w && w.totp_secret ? await totpMatch(w.totp_secret, f.get('code')) : -1;
  if (step < 0) return totpEnrolPage(env, req, '<p class="err">That code did not match. Check the phone\'s clock is set automatically, and try the next code.</p>');
  if (f.get('off') === '1') {
    await env.DB.prepare('UPDATE w_writers SET totp_on=0, totp_secret=NULL WHERE email=?').bind(me.email).run();
    return page('Authenticator', '<h1>Authenticator is off</h1><p class="quiet">The password alone signs you in again. <a href="/write/2fa">Turn it back on</a> · <a href="/write">Back to the desk</a></p>');
  }
  await env.DB.prepare('UPDATE w_writers SET totp_on=1 WHERE email=?').bind(me.email).run();
  /* every other browser signs out: from here on they need the code too */
  const t = cookie(req);
  await env.DB.prepare("DELETE FROM w_sessions WHERE email=? AND token<>? AND token NOT LIKE 'set-%'").bind(me.email, t).run();
  return page('Authenticator', '<h1>Authenticator is on</h1><p class="quiet">From now on: password, then the six digits. Other browsers have been signed out. <a href="/write">Back to the desk</a></p>');
}

/* ============================================================
   RESETTING A PASSWORD — build 1c, 11 Sep 2026

   /write/reset      anyone: type your email. The answer is the same whether
                     or not the address has a login — so the page cannot be
                     used to find out who writes here.
   /write/resets     the founder: every request, with its one-time link, so
                     he can hand it over himself while there is no email
                     binding on this worker. The moment EMAIL is bound, the
                     link goes out by email as well and nothing else changes.

   A link lasts ONE HOUR when asked for by the writer, 24 when issued by the
   founder, works ONCE, and is the same /write/set flow an invitation uses.
   One request per address every ten minutes; the rest are ignored quietly.
   ============================================================ */
async function makeReset(env, email, SITE, req, hours) {
  const tok = 'set-' + rnd(28);
  const exp = new Date(Date.now() + hours * 3600e3).toISOString();
  await env.DB.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)').bind(tok, email, exp).run();
  const ip = (req && req.headers.get('cf-connecting-ip')) || '';
  let sent = 0;
  const link = SITE + '/write/set?t=' + tok;
  if (env.EMAIL && env.EMAIL.send) {
    try {
      await env.EMAIL.send({
        from: { email: 'research@warrantwire.com', name: 'Warrant Wire' },
        to: email, subject: 'Reset your Warrant Wire password',
        text: `Somebody — we hope you — asked to reset the password for this address.\n\nChoose a new one here. The link works once and for ${hours} hour${hours === 1 ? '' : 's'}:\n${link}\n\nIf it was not you, ignore this and nothing changes.` });
      sent = 1;
    } catch (e) {}
  }
  await env.DB.prepare('INSERT INTO w_resets (email, token, ip, expires, sent) VALUES (?,?,?,?,?)')
    .bind(email, tok, ip, exp, sent).run();
  return link;
}

function resetForm(msg = '') {
  return `<h1>Reset your password</h1>${msg}
    <form method="post" action="/write/reset" class="card">
      <label>The email you write under<input name="email" type="email" required autocomplete="email"></label>
      <button class="primary">Send me a link</button>
    </form>
    <p class="quiet">The link works once, for an hour. If nothing arrives, the research desk can hand
    you one: <a href="mailto:research@warrantwire.com">research@warrantwire.com</a>.
    <br><a href="/write/login">Back to sign in</a></p>`;
}

async function resetPost(req, env, SITE) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase();
  const same = page('Reset your password', `<h1>Check your email</h1>
    <p class="quiet">If <b>${esc(email)}</b> has a login here, a one-time link is on its way. It works for an hour.
    If nothing arrives, write to <a href="mailto:research@warrantwire.com">research@warrantwire.com</a> and the
    desk will hand you one.</p><p class="quiet"><a href="/write/login">Back to sign in</a></p>`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return same;
  const w = await env.DB.prepare("SELECT email FROM w_writers WHERE email=? AND status='active'").bind(email).first();
  if (!w) return same;                                   /* same answer: no enumeration */
  const recent = await env.DB.prepare(
    "SELECT id FROM w_resets WHERE email=? AND asked > datetime('now','-10 minutes')").bind(email).first();
  if (recent) return same;                               /* one every ten minutes, quietly */
  await makeReset(env, email, SITE, req, 1);
  return same;
}

/* the founder's list: who asked, when, and the link to give them */
async function resetsPage(env, req, SITE) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  if (me.kind !== 'house') return page('Resets', '<h1>The editor does this.</h1>');
  const r = await env.DB.prepare(
    `SELECT r.email, r.asked, r.expires, r.used, r.sent, r.token, w.name
       FROM w_resets r LEFT JOIN w_writers w ON w.email = r.email
      ORDER BY r.id DESC LIMIT 100`).all();
  const rows = (r.results || []).map(x => {
    const live = !x.used && x.expires > new Date().toISOString();
    return `<tr><td>${esc(x.name || '')}<br><span class="quiet">${esc(x.email)}</span></td>
      <td>${esc(x.asked)}</td>
      <td>${x.used ? 'used ' + esc(x.used) : live ? (x.sent ? 'emailed · ' : '') + 'open until ' + esc(x.expires.slice(0, 16).replace('T', ' ')) : 'expired'}</td>
      <td>${live ? `<input readonly value="${esc(SITE + '/write/set?t=' + x.token)}" onclick="this.select()" style="width:100%;font:12px monospace">` : ''}</td></tr>`;
  }).join('');
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Password resets</title>
<meta name="robots" content="noindex"><link rel="stylesheet" href="/wire.css">
<style>main{padding:22px 0 60px}table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font:600 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink3)}
.quiet{color:var(--ink3);font-size:12.5px}.bar{padding:14px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--ink2)}
.bar a{color:var(--cool);text-decoration:none;margin-right:16px}.mk{margin:18px 0;display:flex;gap:8px;flex-wrap:wrap}
.mk input{flex:1 1 240px;background:#101208;border:1px solid var(--line);color:var(--ink);padding:10px 12px;border-radius:3px;font:14px var(--sans)}
.mk button{background:var(--cool);border:0;color:#0f1a14;padding:10px 16px;border-radius:3px;font:600 14px var(--sans);cursor:pointer}
#out{font:12.5px var(--mono);color:var(--cool);word-break:break-all}
@media(max-width:700px){table,thead,tbody,tr,th,td{display:block}th{display:none}td{padding:4px 0}tr{padding:10px 0;border-bottom:1px solid var(--line)}td{border:0}}</style></head><body>
<header class="top"><div class="wrap masthead"><div class="mast">
  <a class="logo" href="/">WARRANT<i>WIRE</i><small>Every warrant financing, as it is filed</small></a>
  <span class="live"><span class="dot" aria-hidden="true"></span>Password resets</span></div></div></header>
<main><div class="wrap">
  <div class="bar"><a href="/write">Dashboard</a><a href="/write/verdict">Write a verdict</a><b style="color:var(--ink)">Password resets</b></div>
  <p class="quiet">Anyone who asks at /write/reset appears here. Until this worker has an email binding, you hand them the link
  yourself — by text, by phone, however reaches them. A link works once; a new password signs out every other browser.</p>
  <div class="mk"><input id="em" type="email" placeholder="Issue a link for this writer's email"><button id="mkb" type="button">Make a 24-hour link</button></div>
  <p id="out"></p>
  <table><thead><tr><th>Who</th><th>Asked</th><th>State</th><th>The link</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="quiet">Nobody has asked yet.</td></tr>'}</tbody></table>
</div></main>
<script>
document.getElementById('mkb').onclick=function(){var em=document.getElementById('em').value.trim();var o=document.getElementById('out');o.textContent='…';
fetch('/api/w/resetlink',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em})}).then(function(r){return r.json()}).then(function(d){o.textContent=d.ok?d.link:(d.error||'no');if(d.ok)setTimeout(function(){location.reload()},1500)}).catch(function(){o.textContent='could not reach the desk'})};
</script></body></html>`, { headers: H.html });
}

/* ============================================================
   THE DESK — served by the worker, so there is no file to upload
   ============================================================ */
async function desk(env, req) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  return new Response(DESK_HTML(me), { headers: {
    ...H.html, 'x-robots-tag': 'noindex, nofollow' } });
}

/* ============================================================
   THE PUBLISHED PAGES
   ============================================================ */
async function list(env, S) {
  const rows = (await env.DB.prepare(
    `SELECT p.slug,p.title,p.standfirst,p.section,p.published,p.image,p.image_alt,p.words,
            w.name author_name, w.kind
       FROM w_pieces p LEFT JOIN w_writers w ON w.email = p.author
      WHERE p.status='published' AND COALESCE(p.site,'warrantwire')=?
      ORDER BY p.published DESC LIMIT 100`).bind(S.key).all()).results || [];
  const items = rows.map((r, i) => `
    <article class="post${i === 0 ? ' lead' : ''}">
      <p class="p-date"><b>${esc(r.section || 'Writing')}</b>${esc((r.published || '').slice(0, 10))}</p>
      <div>
        <h3 class="p-title"><a href="/writing/${esc(r.slug)}">${esc(r.title)}</a></h3>
        <p class="p-stand">${esc(r.standfirst || '')}</p>
        <p class="p-by">By ${esc(r.author_name || 'Mark Nejmeh')}${r.kind === 'guest'
          ? '<span class="guest"> · Contributing writer</span>' : ''} · ${Math.max(1, Math.round((r.words || 200) / 220))} min</p>
      </div>
      ${r.image ? `<div class="p-thumb"><img src="${esc(r.image)}" alt="${esc(r.image_alt || '')}" loading="lazy"></div>` : ''}
    </article>`).join('');
  return new Response(SHELL({
    S, title: 'Writing — ' + S.name,
    desc: S.blurb,
    canonical: S.url + '/writing',
    body: `<section><p class="eyebrow">Writing</p><h2>The written work</h2>
      <p class="lede">${esc(S.blurb)}</p>
      <div class="posts">${items || '<p class="quiet">Nothing published yet.</p>'}</div></section>`
  }), { headers: H.html });
}

async function piece(env, S, slug) {
  const SITE = S.url;
  const r = await env.DB.prepare(
    `SELECT p.*, w.name author_name, w.role, w.city, w.bio, w.photo, w.disclosure author_disclosure, w.kind
       FROM w_pieces p LEFT JOIN w_writers w ON w.email = p.author
      WHERE p.slug=? AND p.status='published'
        AND COALESCE(p.site,'warrantwire')=?`).bind(slug, S.key).first();
  if (!r) return new Response(SHELL({ S, title: 'Not found', desc: '', canonical: SITE + '/writing',
    body: '<section><h2>There is nothing at this address.</h2><p class="lede"><a href="/writing">Everything published &rarr;</a></p></section>' }),
    { status: 404, headers: H.html });

  const corr = (await env.DB.prepare(
    'SELECT wrong, right_text, made FROM w_corrections WHERE slug=? ORDER BY id DESC').bind(slug).all()).results || [];
  const guest = r.kind === 'guest';
  const date = (r.published || '').slice(0, 10);

  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: r.title, description: r.standfirst,
    datePublished: date, dateModified: (r.updated || r.published || '').slice(0, 10),
    author: { '@type': 'Person', name: r.author_name || 'Mark Nejmeh' },
    editor: { '@type': 'Person', name: 'Mark Nejmeh' },
    publisher: { '@type': 'Organization', name: 'Foundation for Job Creation', url: 'https://jobcreation.us' },
    url: SITE + '/writing/' + r.slug,
    ...(r.image ? { image: r.image } : {}),
    ...(r.keywords ? { keywords: r.keywords } : {})
  };

  const body = `
  <article class="piece">
    <p class="eyebrow">${esc(r.section || 'Writing')}</p>
    <h1>${esc(r.title)}</h1>
    <p class="standfirst">${esc(r.standfirst || '')}</p>

    <dl class="record">
      <dt>Author</dt><dd>${esc(r.author_name || 'Mark Nejmeh')}${guest ? ', contributing writer' : ''}</dd>
      ${guest ? '<dt>Editor</dt><dd>Mark Nejmeh</dd>' : ''}
      <dt>Date</dt><dd><time datetime="${esc(date)}">${esc(date)}</time></dd>
      ${r.subject ? `<dt>Subject</dt><dd>${esc(r.subject)}</dd>` : ''}
      ${r.keywords ? `<dt>Keywords</dt><dd>${esc(r.keywords)}</dd>` : ''}
      ${r.links ? `<dt>Links</dt><dd>${linkify(r.links)}</dd>` : ''}
    </dl>

    <div class="byline${guest ? ' guest' : ''}">
      ${guest && r.photo ? `<img class="mug" src="${esc(r.photo)}" alt="${esc(r.author_name || '')}">` : ''}
      <div>
        <p class="name">${esc(r.author_name || 'Mark Nejmeh')}</p>
        ${guest ? `<p class="role">${esc(r.role || 'Contributing writer')}${r.city ? ' · ' + esc(r.city) : ''}</p>
          <p>${esc(r.bio || '')}</p>
          ${r.author_disclosure ? `<p class="filer"><b>Their disclosure.</b> ${esc(r.author_disclosure)}</p>` : ''}
          <p class="edited">Edited and published by Mark Nejmeh. The views are the author's own.</p>`
        : `<p>Founder, JobCreation.us. Bachelor's degree in finance and economics, Upsala College.
             Roofing contractor since 1978.</p>
           <p class="filer">SEC EDGAR filer — CIK 0001860507 · File No. 150-11431 · Large Trader ID 71743954<br>
             <a href="mailto:${esc(S.contact)}">${esc(S.contact)}</a> · 732-995-3914</p>`}
      </div>
    </div>

    ${r.image ? `<figure class="media"><img src="${esc(r.image)}" alt="${esc(r.image_alt || '')}">
      ${r.image_alt ? `<figcaption>${esc(r.image_alt)}</figcaption>` : ''}</figure>` : ''}

    ${r.body}

    <div class="disclose"><h3>Disclosure</h3><p>${esc(r.disclosure).replace(/\n/g, '<br>')}</p>
      <p>Nothing here is investment advice or a recommendation to buy or sell any security.
      No payment was received from any company named.</p></div>

    <div class="sources"><h3>Sources</h3><ol>${
      String(r.sources || '').split(/\n+/).filter(Boolean)
        .map(l => `<li>${linkify(l)}</li>`).join('')}</ol></div>

    <div class="reply"><h3>Right of reply</h3><p>Every person and company named here can answer.
      Any response received is published on this page in full and unedited.
      <a href="mailto:${esc(S.contact)}">${esc(S.contact)}</a> · 732-995-3914</p></div>

    ${corr.length ? `<div class="corrections"><h3>Corrections</h3><ul>${
      corr.map(c => `<li>${esc(c.made.slice(0, 10))} — ${esc(c.wrong)} ${esc(c.right_text)}</li>`).join('')}</ul></div>` : ''}
  </article>`;

  return new Response(SHELL({
    S, title: r.title + ' — ' + S.name,
    desc: r.standfirst || '', canonical: SITE + '/writing/' + r.slug,
    keywords: r.keywords, image: r.image, ld, body
  }), { headers: H.html });
}

/* turn "text | https://url" lines into links, and bare urls into links */
function linkify(s) {
  return String(s || '').split(/\n+/).filter(Boolean).map(line => {
    const parts = line.split('|').map(x => x.trim());
    if (parts.length > 1 && /^https?:\/\//.test(parts[1]))
      return `<a href="${esc(parts[1])}" rel="noopener">${esc(parts[0])}</a>`;
    return esc(line).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" rel="noopener">$1</a>');
  }).join(' · ');
}

async function feed(env, S) {
  const SITE = S.url;
  const rows = (await env.DB.prepare(
    `SELECT slug,title,standfirst,published FROM w_pieces WHERE status='published'
       AND COALESCE(site,'warrantwire')=? ORDER BY published DESC LIMIT 50`)
    .bind(S.key).all()).results || [];
  const x = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(S.name)} — Writing</title>
<link>${SITE}/writing</link>
<description>${esc(S.blurb)}</description>
${rows.map(r => `<item><title>${esc(r.title)}</title>
<link>${SITE}/writing/${esc(r.slug)}</link>
<guid>${SITE}/writing/${esc(r.slug)}</guid>
<pubDate>${new Date((r.published || today()) + 'T12:00:00Z').toUTCString()}</pubDate>
<description>${esc(r.standfirst || '')}</description></item>`).join('\n')}
</channel></rss>`;
  return new Response(x, { headers: H.xml });
}

async function sitemap(env, S) {
  const SITE = S.url;
  const rows = (await env.DB.prepare(
    `SELECT slug, published, updated FROM w_pieces WHERE status='published'
       AND COALESCE(site,'warrantwire')=?`).bind(S.key).all()).results || [];
  const x = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/writing</loc></url>
${rows.map(r => `<url><loc>${SITE}/writing/${esc(r.slug)}</loc>
<lastmod>${esc((r.updated || r.published || '').slice(0, 10))}</lastmod></url>`).join('\n')}
</urlset>`;
  return new Response(x, { headers: H.xml });
}

/* ============================================================
   THE SHELL — the site's own look, so a piece is not a stranger
   ============================================================ */
function SHELL({ S, title, desc, canonical, keywords, image, ld, body }) {
  const SITE = S.url;
  /* Two skins from one template. The docket look is paper and ink; the wire
     look is the black screen. Only the six values change. */
  const skin = S.key === '8k10q' ? `
:root{--paper:#0F1113;--card:#171A1D;--ink:#E8EAE6;--ink-2:#9BA5A0;
  --accent:#E1573A;--mark:#6EA8FF;--rule:#2A2F33;--rule-2:#22262A}`
  : S.dark ? `
:root{--paper:#0F1113;--card:#171A1D;--ink:#E8EAE6;--ink-2:#9BA5A0;
  --accent:#E1573A;--mark:#7FD8A6;--rule:#2A2F33;--rule-2:#22262A}`
  : `
:root{--paper:#E9EAE3;--card:#F6F6F1;--ink:#15181B;--ink-2:#4C555A;
  --accent:#8C2E22;--mark:#1C5D45;--rule:#C3C7BC;--rule-2:#DEE0D8}`;

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image || SITE + '/og-card.png')}">
<meta property="og:site_name" content="${esc(S.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="alternate" type="application/rss+xml" title="${esc(S.name)} — Writing" href="${SITE}/writing/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;650&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="/favicon.png">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>
${skin}
:root{color-scheme:${S.dark ? 'dark' : 'light'};
  --mono:"IBM Plex Mono",ui-monospace,monospace;
  --body:"Public Sans",system-ui,sans-serif;--display:Bitter,Georgia,serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.62 var(--body);
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
a{color:var(--mark)}
.masthead{border-bottom:2px solid var(--ink);background:var(--paper)}
.mast-inner{max-width:1080px;margin:0 auto;padding:22px 20px 16px;display:flex;flex-wrap:wrap;
  gap:14px;align-items:flex-end;justify-content:space-between}
.brand{text-decoration:none;color:var(--ink)}
.brand b{font:700 27px/1 var(--display);letter-spacing:-.02em;display:block}
.brand b i{font-style:normal;color:var(--accent)}
.brand small{display:block;font:400 12px/1.6 var(--mono);color:var(--ink-2);margin-top:6px;
  letter-spacing:.04em}
.mast-meta{font:500 11px/1.7 var(--mono);color:var(--ink-2);text-align:right;
  text-transform:uppercase;letter-spacing:.07em}
.mast-meta b{color:var(--ink);font-weight:600}
nav.docket-nav{border-bottom:1px solid var(--rule);background:var(--card)}
.nav-inner{max-width:1080px;margin:0 auto;padding:0 20px;display:flex;overflow-x:auto}
.nav-inner a{font:500 11.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.09em;
  color:var(--ink-2);text-decoration:none;padding:13px 16px 12px;
  border-bottom:2px solid transparent;white-space:nowrap}
.nav-inner a:hover{color:var(--ink)}
.nav-inner a[aria-current]{color:var(--ink);border-bottom-color:var(--mark)}
main{max-width:1080px;margin:0 auto;padding:0 20px 90px}
section{padding-top:40px}
.eyebrow{font:600 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.13em;
  color:var(--mark);margin:0 0 8px}
h2{font:600 clamp(21px,3.4vw,27px)/1.2 var(--display);letter-spacing:-.012em;margin:0 0 6px}
h3{font:600 18px/1.3 var(--display);margin:26px 0 8px}
.lede{max-width:66ch;color:var(--ink-2);margin:0 0 22px}
.quiet{color:var(--ink-2)}
.piece{max-width:700px}
.piece h1{font:700 clamp(28px,4.6vw,42px)/1.12 var(--display);letter-spacing:-.02em;margin:0 0 14px}
.standfirst{font:400 20px/1.5 var(--display);color:var(--ink-2);margin:0 0 24px}
.record{margin:0 0 26px;padding:15px 0;border-top:1px solid var(--rule);
  border-bottom:1px solid var(--rule);display:grid;grid-template-columns:96px 1fr;
  gap:6px 18px;font-size:15px}
.record dt{font:600 11px/1.9 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}
.record dd{margin:0;line-height:1.55}
.byline{background:var(--card);border:1px solid var(--rule);border-left:4px solid var(--accent);
  padding:16px 18px;margin:0 0 28px;font-size:15px}
.byline.guest{display:grid;grid-template-columns:70px 1fr;gap:16px;border-left-color:var(--mark)}
.byline .mug{width:70px;height:70px;border-radius:50%;object-fit:cover;border:1px solid var(--rule)}
.byline .name{font:600 17px/1.3 var(--display);margin:0 0 3px}
.byline p{margin:0 0 6px;color:var(--ink-2)}
.byline .role{font:600 11.5px/1.5 var(--mono);letter-spacing:.05em;color:var(--mark)}
.byline .filer{font:400 12px/1.7 var(--mono);margin-top:9px;padding-top:9px;border-top:1px solid var(--rule)}
.byline .edited{font-size:12.5px;margin-top:9px;padding-top:9px;border-top:1px solid var(--rule)}
.piece h2{margin:34px 0 12px}
.piece p{margin:0 0 18px;max-width:68ch}
.piece blockquote{margin:24px 0;padding-left:18px;border-left:3px solid var(--accent);
  font:italic 19px/1.5 var(--display)}
.media{margin:26px 0}
.media img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
.media figcaption{font-size:13px;color:var(--ink-2);margin-top:9px}
.disclose{background:var(--card);border:1px solid var(--rule);padding:18px 20px;margin:34px 0}
.disclose h3{margin:0 0 9px;font:600 15px var(--body)}
.disclose p{font-size:14.5px;color:var(--ink-2);margin:0 0 9px}
.sources,.reply,.corrections{margin:30px 0 0;font-size:14.5px}
.sources h3,.reply h3,.corrections h3{font:600 15px var(--body);margin:0 0 8px}
.reply{border-top:2px solid var(--ink);padding-top:16px}
.sources ol{color:var(--ink-2);padding-left:20px}.sources li{margin-bottom:8px}
.posts{border-top:1px solid var(--ink);margin-top:18px}
.post{display:grid;grid-template-columns:118px 1fr 280px;gap:0 22px;padding:20px 0;
  border-bottom:1px solid var(--rule-2);align-items:start}
.p-date{font:400 11.5px/1.7 var(--mono);color:var(--ink-2)}
.p-date b{display:block;color:var(--mark);text-transform:uppercase;letter-spacing:.1em;font-size:10.5px}
.p-title{font:600 20px/1.25 var(--display);margin:0 0 6px}
.p-title a{color:var(--ink);text-decoration:none}.p-title a:hover{text-decoration:underline}
.p-stand{font-size:14.5px;color:var(--ink-2);margin:0 0 8px;max-width:60ch}
.p-by{font:400 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}
.p-by .guest{color:var(--accent);font-weight:600}
.p-thumb img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
.post.lead{grid-template-columns:1fr 1fr;border-bottom:2px solid var(--ink)}
.post.lead .p-title{font-size:26px}
footer{border-top:2px solid var(--ink);margin-top:60px;background:var(--card)}
.foot-inner{max-width:1080px;margin:0 auto;padding:26px 20px 40px;
  font:400 11.5px/1.85 var(--mono);color:var(--ink-2)}
.foot-inner b{color:var(--ink)}
.disclaimer{font:400 12.5px/1.6 var(--body);max-width:78ch;margin:16px 0 0}
@media(max-width:860px){.post,.post.lead{grid-template-columns:1fr}
  .p-thumb{margin-top:12px;max-width:420px}.mast-inner{flex-direction:column;align-items:flex-start}
  .mast-meta{text-align:left}}
</style></head><body>
<header class="masthead"><div class="mast-inner">
  <a class="brand" href="/"><b>${esc(S.name).replace(' ', '<i>&nbsp;</i>')}</b>
    <small>${esc(S.tagline)}</small></a>
  <div class="mast-meta">Mark Nejmeh<br><b>Foundation for Job Creation</b><br>
    SEC EDGAR filer · LTID <b>71743954</b></div>
</div></header>
<nav class="docket-nav"><div class="nav-inner">
  ${S.nav.map(([h, t]) => `<a href="${esc(h)}"${h === '/writing' ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}
</div></nav>
<main>${body}</main>
<footer><div class="foot-inner"><b>Mark Nejmeh</b><br>
  <a href="https://jobcreation.us">Foundation for Job Creation</a><br>
  P.O. Box 589, Clifton, New Jersey 07012<br>
  732-995-3914 · <a href="mailto:${esc(S.contact)}">${esc(S.contact)}</a><br><br>
  SEC EDGAR filer information — CIK 0001860507 · SEC File No. 150-11431 · LTID 71743954
  <p class="disclaimer">Nothing on this site is investment advice or a recommendation to buy or
  sell any security.</p></div></footer>
<script src="https://adhotbox.com/box.js" data-auto
  data-not=".record, .byline, .disclose, .sources, .reply, .corrections, figure, .posts"></script>
</body></html>`;
}

/* a plain page for the login screens */
function page(title, body) {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/wire.css">
<style>
/* ⚠ THE SAME CSS AS THE SITE. His note, 11 Sep: the sign-in pages were in a
   different skin. They load wire.css now and add only the form. */
.box{max-width:520px;margin:0 auto;padding:30px 22px 60px}
h1{font-family:var(--serif);font-size:30px;font-weight:400;margin:0 0 14px;max-width:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px 22px}
label{display:block;font-size:13.5px;color:var(--ink2);margin-bottom:12px;line-height:1.5}
input,select,textarea{display:block;width:100%;margin-top:5px;padding:10px 12px;border:1px solid var(--line);
  border-radius:4px;font:15px var(--sans);background:#101208;color:var(--ink)}
input[type=file]{padding:8px;font-size:13px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--cool)}
textarea{min-height:90px;resize:vertical;line-height:1.5}
button.primary,.primary{display:block;width:100%;font:700 15px var(--sans);border:0;background:var(--gold);color:#14150f;
  padding:12px 18px;border-radius:5px;cursor:pointer;margin-top:4px;text-align:center;text-decoration:none}
button.primary:hover,.primary:hover{filter:brightness(1.08)}
.err{color:var(--hot);font-size:14px;margin:0 0 12px}
.quiet{color:var(--ink3);font-size:13.5px;margin-top:14px;line-height:1.55}
a{color:var(--cool)}
code{color:var(--ink);font-family:var(--mono)}
.box .rule{color:var(--line)}
</style></head><body>
<header class="top"><div class="wrap masthead"><div class="mast">
  <a class="logo" href="/">WARRANT<i>WIRE</i><small>Every warrant financing, as it is filed</small></a>
  <span class="live"><span class="dot" aria-hidden="true"></span>${esc(title)}</span>
</div></div></header>
<div class="box">${body}</div></body></html>`,
    { headers: H.html });
}

function DESK_HTML(me) {
  const M = JSON.stringify({ name: me.name || '', email: me.email, kind: me.kind,
    role: me.role || '', city: me.city || '', bio: me.bio || '',
    photo: me.photo || '', disclosure: me.disclosure || '' });
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard — Triggered Short</title><meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;--ledger:#E9EAE3;--card:#F6F6F1;--ink:#15181B;--ink-2:#4C555A;--certified:#1C5D45;
  --stamp:#8C2E22;--rule:#C3C7BC;--rule-2:#DEE0D8;
  --mono:"IBM Plex Mono",monospace;--body:"Public Sans",system-ui,sans-serif;--display:Bitter,Georgia,serif}
*{box-sizing:border-box}
body{margin:0;background:var(--ledger);color:var(--ink);font:16px/1.6 var(--body)}
.bar{background:var(--ink);color:var(--ledger);padding:12px 20px;display:flex;
  align-items:center;gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:5}
.bar b{font:600 17px var(--display)}
.bar .who{font:400 12px var(--mono);color:#AEB6B1;margin-left:auto}
.bar a{color:#9FD3BE;font-size:13.5px;text-decoration:none;margin-left:14px}
.wrap{max-width:1180px;margin:0 auto;padding:20px;display:grid;
  grid-template-columns:270px 1fr;gap:22px;align-items:start}
.side{background:var(--card);border:1px solid var(--rule);padding:14px}
.side h3{font:600 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-2);margin:0 0 10px}
.newbtn{display:block;width:100%;background:var(--certified);color:var(--ledger);border:0;
  font:600 14px var(--body);padding:12px;cursor:pointer;margin-bottom:14px}
.plist{list-style:none;margin:0;padding:0}
.plist li{border-top:1px solid var(--rule-2);padding:9px 0;cursor:pointer}
.plist li:hover{background:rgba(28,93,69,.06)}
.plist b{display:block;font:600 14.5px var(--body);line-height:1.3}
.plist span{font:400 11px var(--mono);color:var(--ink-2)}
.st{display:inline-block;font:600 9.5px var(--mono);letter-spacing:.08em;padding:1px 6px;
  text-transform:uppercase;border:1px solid var(--rule)}
.st.published{background:var(--certified);color:#fff;border-color:var(--certified)}
.st.submitted{background:var(--stamp);color:#fff;border-color:var(--stamp)}
.main{background:var(--card);border:1px solid var(--rule);padding:22px}
.step{font:600 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--certified);margin:0 0 4px}
h2{font:600 22px var(--display);margin:0 0 4px}
.hint{font-size:13.5px;color:var(--ink-2);margin:0 0 16px;max-width:74ch}
label{display:block;font:600 12px var(--mono);letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink-2);margin:16px 0 4px}
label span{display:block;font:400 12.5px var(--body);text-transform:none;letter-spacing:0;
  color:var(--ink-2);margin-top:2px}
input,textarea,select{width:100%;font:inherit;padding:10px 12px;border:1.5px solid var(--rule);
  background:#fff;color:var(--ink);caret-color:var(--ink);font-size:15px}
input::placeholder,textarea::placeholder{color:#9AA3A0}
textarea{min-height:90px;resize:vertical;line-height:1.55}
.drop{border:2px dashed var(--rule);background:#fff;padding:26px 20px;text-align:center;
  cursor:pointer;margin:6px 0 0}
.drop.over{border-color:var(--certified);background:#F0F6F3}
.drop b{display:block;font:600 16px var(--body);margin-bottom:5px}
.drop small{color:var(--ink-2);font-size:12.5px;display:block;line-height:1.6}
.tools{display:flex;gap:6px;flex-wrap:wrap;background:#fff;border:1.5px solid var(--rule);
  border-bottom:0;padding:7px}
.tools button{font:600 12px var(--body);background:var(--ledger);border:1px solid var(--rule);
  padding:5px 10px;cursor:pointer}
.tools button:hover{background:var(--rule-2)}
#body{border:1.5px solid var(--rule);background:#fff;color:var(--ink);caret-color:var(--ink);
  min-height:340px;padding:18px 20px;font-size:16.5px;line-height:1.65;outline:0;
  overflow-wrap:break-word;-webkit-text-fill-color:var(--ink)}
#body *{color:var(--ink);-webkit-text-fill-color:var(--ink)}
#body a{color:var(--certified);-webkit-text-fill-color:var(--certified)}
#body:focus{border-color:var(--certified)}
#body h2{font:600 22px var(--display);margin:22px 0 8px}
#body h3{font:600 18px var(--display);margin:18px 0 6px}
#body blockquote{border-left:3px solid var(--stamp);margin:16px 0;padding-left:14px;
  font-style:italic;color:var(--ink-2)}
#body img{max-width:100%;height:auto}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.acts{position:sticky;bottom:0;background:var(--card);border-top:1px solid var(--rule);
  margin:22px -22px -22px;padding:14px 22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.acts button{font:600 15px var(--body);padding:12px 20px;border:1px solid var(--rule);
  background:#fff;cursor:pointer}
.acts .pub{background:var(--certified);color:#fff;border-color:var(--certified)}
.acts .msg{font-size:13.5px;color:var(--ink-2);margin-left:auto}
.acts .msg.bad{color:var(--stamp);font-weight:600}
.acts .msg.good{color:var(--certified);font-weight:600}
.count{font:400 12px var(--mono);color:var(--ink-2);margin-top:6px}
.tabs{display:flex;gap:0;margin:0 0 18px;border-bottom:1px solid var(--rule)}
.tabs button{font:600 13px var(--body);background:none;border:0;border-bottom:2px solid transparent;
  padding:9px 14px;cursor:pointer;color:var(--ink-2)}
.tabs button.on{color:var(--ink);border-bottom-color:var(--certified)}
.hidden{display:none}
.upl{margin-top:7px;font:600 13px var(--body);background:var(--ledger);
  border:1px solid var(--rule);padding:8px 14px;cursor:pointer}
.upl:hover{background:var(--rule-2)}
@media(max-width:900px){.wrap{grid-template-columns:1fr}.row2{grid-template-columns:1fr}}
</style></head><body>

<div class="bar"><b>Dashboard</b>
  <a href="/write/verdict"><b>Write a verdict</b></a>
  ${me.kind === 'house' ? '<a href="/write/writers">Writers</a> <a href="/write/resets">Password resets</a>' : ''}
  <a href="/write/2fa">${me.totp_on ? 'Authenticator: on' : 'Set up authenticator'}</a>
  <span class="who">${esc(me.name || me.email)} · ${me.kind === 'house' ? 'editor' : 'contributing writer'}</span>
  <a href="/writing" target="_blank">See the site</a>

<div class="wrap">
  <div class="side">
    <button class="newbtn" onclick="fresh()">Start a new piece</button>
    <h3>Your pieces</h3>
    <ul class="plist" id="plist"><li><span>Loading…</span></li></ul>
  </div>

  <div class="main">
    <div class="tabs">
      <button id="tab-w" class="on" onclick="tab('w')">The piece</button>
      <button id="tab-m" onclick="tab('m')">About you</button>
    </div>

    <!-- ============ THE PIECE ============ -->
    <div id="pane-w">
      <p class="step">Step 1 — bring the words in</p>
      <h2>Upload what you wrote, or just type</h2>
      <p class="hint">A Word file keeps your headings, bold and links. Plain text and Markdown work
        too. A PDF works but you will have to tidy the paragraphs afterwards — a PDF stores placed
        text, not paragraphs. The old <b>.doc</b> format cannot be read: open it in Word and Save As
        .docx first.</p>

      <div class="drop" id="drop">
        <b>Drop a file here, or press to choose one</b>
        <small>.docx · .txt · .md · .pdf — nothing is uploaded anywhere until you press Save</small>
        <input type="file" id="file" class="hidden" accept=".docx,.txt,.md,.pdf">
      </div>
      <div class="hidden">
        <input type="file" id="pic" accept="image/*">
      </div>

      <p class="step" style="margin-top:26px">Step 2 — the headline and the record</p>
      <p class="hint" style="margin:0 0 16px"><b>Publishing to Warrant Wire</b> &mdash; https://warrantwire.com/writing</p>
      <label>Headline<span>Say what was found, not what it might mean.</span>
        <input id="title"></label>
      <label>Standfirst<span>One or two sentences. What a reader gets if they read nothing else.</span>
        <textarea id="standfirst" style="min-height:64px"></textarea></label>
      <div class="row2">
        <label>Section<span>e.g. The wire, Dilution, Reading a filing</span><input id="section"></label>
        <label>Keywords<span>Comma separated. What somebody would search.</span><input id="keywords"></label>
      </div>
      <label>Subject<span>The company, exchange, ticker and CIK, and a half line on what this covers.</span>
        <input id="subject"></label>
      <label>Links<span>One a line, as <b>What it is | https://the-url</b></span>
        <textarea id="links" style="min-height:64px"></textarea></label>

      <p class="step" style="margin-top:26px">Step 3 — the piece</p>
      <div class="tools">
        <button type="button" onclick="fmt('formatBlock','<h2>')">Heading</button>
        <button type="button" onclick="fmt('formatBlock','<h3>')">Small heading</button>
        <button type="button" onclick="fmt('formatBlock','<p>')">Paragraph</button>
        <button type="button" onclick="fmt('bold')"><b>B</b></button>
        <button type="button" onclick="fmt('italic')"><i>I</i></button>
        <button type="button" onclick="fmt('insertUnorderedList')">List</button>
        <button type="button" onclick="fmt('formatBlock','<blockquote>')">Quote</button>
        <button type="button" onclick="addLink()">Link</button>
        <button type="button" onclick="pickInline()">Picture</button>
        <button type="button" onclick="clean()">Clean up</button>
      </div>
      <div id="body" contenteditable="true"></div>
      <p class="count" id="count">0 words</p>

      <p class="step" style="margin-top:26px">Step 4 — what every piece here carries</p>
      <p class="hint">These are not optional. Publish will refuse without them, and say which is
        missing.</p>
      <label>Disclosure<span>What you hold in the companies named, who pays you, any connection.
        If there is none, say there is none.</span>
        <textarea id="disclosure"></textarea></label>
      <label>Sources<span>One a line. Every filing with its accession number, as
        <b>Company, Form 10-Q, filed June 1 2026, accession 0000000000-00-000000 | https://…</b></span>
        <textarea id="sources" style="min-height:110px"></textarea></label>
      <div class="row2">
        <label>Picture at the top<span>Choose a file and it is stored with the piece.</span>
          <input id="image" placeholder="none yet">
          <button type="button" class="upl" onclick="pickTop()">Choose a picture</button></label>
        <label>What the picture shows<span>For readers who cannot see it. Required if there is a picture.</span>
          <input id="image_alt"></label>
      </div>

      <div class="acts">
        <button onclick="save()">Save</button>
        <button class="pub" onclick="publish()">${me.kind === 'house' ? 'Publish' : 'Send to the editor'}</button>
        <span class="msg" id="msg"></span>
      </div>
    </div>

    <!-- ============ ABOUT YOU ============ -->
    <div id="pane-m" class="hidden">
      <p class="step">Your byline</p>
      <h2>How you appear on a piece</h2>
      <p class="hint">This shows under the headline of everything you write here.</p>
      <label>Name<input id="m_name"></label>
      <div class="row2">
        <label>Role<input id="m_role"></label>
        <label>City<input id="m_city"></label>
      </div>
      <label>Two lines on who you are<textarea id="m_bio"></textarea></label>
      <label>Photograph<span>A web address. Square works best.</span><input id="m_photo"></label>
      <label>Your standing disclosure<span>Carried on every piece unless the piece says otherwise.</span>
        <textarea id="m_disclosure"></textarea></label>
      <div class="acts"><button onclick="saveMe()">Save</button>
        <span class="msg" id="msg2"></span></div>
    </div>

  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
var ME = ${M}, ID = null;
var $ = function(x){ return document.getElementById(x); };
function tab(t){ $('pane-w').classList.toggle('hidden', t!=='w'); $('pane-m').classList.toggle('hidden', t!=='m');
  $('tab-w').classList.toggle('on', t==='w'); $('tab-m').classList.toggle('on', t==='m'); }
function say(el, text, kind){ var m=$(el); m.textContent=text; m.className='msg '+(kind||''); }
function fmt(cmd, val){ document.execCommand(cmd, false, val||null); $('body').focus(); words(); }
function addLink(){ var u=prompt('Address of the link'); if(u) document.execCommand('createLink',false,u); }

/* pictures are uploaded and kept with the piece, never hot-linked */
var picFor = 'top';
function pickTop(){ picFor='top'; $('pic').value=''; $('pic').click(); }
function pickInline(){ picFor='body'; $('pic').value=''; $('pic').click(); }
$('pic').onchange=function(){
  var f=$('pic').files[0]; if(!f) return;
  say('msg','Sending the picture…');
  var fd=new FormData(); fd.append('file', f);
  fetch('/api/w/upload',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){
    if(!j.ok) return say('msg', j.error, 'bad');
    if(picFor==='top'){ $('image').value=j.url;
      if(!$('image_alt').value) $('image_alt').focus();
      say('msg','Picture stored. Now say what it shows.','good'); }
    else { $('body').focus(); document.execCommand('insertImage',false,j.url); words();
      say('msg','Picture put in the piece.','good'); }
  }).catch(function(){ say('msg','That picture did not go up.','bad'); });
};
function words(){ var t=$('body').innerText.trim(); $('count').textContent =
  (t? t.split(/\\s+/).length : 0) + ' words'; }
$('body').addEventListener('input', words);

/* strip the junk Word leaves behind */
function clean(){
  var d=$('body');
  d.querySelectorAll('[style],[class],[lang],font,span').forEach(function(n){
    n.removeAttribute&&n.removeAttribute('style'); n.removeAttribute&&n.removeAttribute('class');
    if(n.tagName==='SPAN'||n.tagName==='FONT'){ var p=n.parentNode;
      while(n.firstChild) p.insertBefore(n.firstChild,n); p.removeChild(n); }
  });
  d.innerHTML = d.innerHTML.replace(/<p>\\s*(&nbsp;)?\\s*<\\/p>/g,'');
  words(); say('msg','Tidied.','good');
}

/* ---------- bringing a file in ---------- */
var drop=$('drop'), file=$('file');
drop.onclick=function(){ file.click(); };
drop.ondragover=function(e){ e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave=function(){ drop.classList.remove('over'); };
drop.ondrop=function(e){ e.preventDefault(); drop.classList.remove('over');
  if(e.dataTransfer.files[0]) take(e.dataTransfer.files[0]); };
file.onchange=function(){ if(file.files[0]) take(file.files[0]); };

function take(f){
  var n=f.name.toLowerCase();
  say('msg','Reading '+f.name+'…');
  if(n.endsWith('.docx')) return readDocx(f);
  if(n.endsWith('.pdf'))  return readPdf(f);
  if(n.endsWith('.doc'))  return say('msg','The old .doc format cannot be read. Open it in Word and Save As .docx.','bad');
  var r=new FileReader();
  r.onload=function(){ put(mdish(r.result), f.name); };
  r.readAsText(f);
}
function readDocx(f){
  var r=new FileReader();
  r.onload=function(){
    mammoth.convertToHtml({arrayBuffer:r.result}).then(function(res){
      put(res.value, f.name);
      if(res.messages && res.messages.length)
        say('msg','Brought in. Some formatting was simplified — read it through.','good');
    }).catch(function(){ say('msg','That file could not be read. Save it again as .docx.','bad'); });
  };
  r.readAsArrayBuffer(f);
}
function readPdf(f){
  var r=new FileReader();
  r.onload=function(){
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib.getDocument({data:r.result}).promise.then(function(doc){
      var jobs=[]; for(var i=1;i<=doc.numPages;i++) jobs.push(doc.getPage(i).then(function(p){return p.getTextContent();}));
      return Promise.all(jobs);
    }).then(function(pages){
      var text=pages.map(function(p){ return p.items.map(function(i){return i.str;}).join(' '); }).join('\\n\\n');
      if(!text.trim()) return say('msg','That PDF has no text in it — it is a picture of words. It would need scanning software.','bad');
      put(mdish(text), f.name);
      say('msg','Brought in. A PDF loses its paragraphs — check the breaks before you publish.','good');
    }).catch(function(){ say('msg','That PDF could not be read.','bad'); });
  };
  r.readAsArrayBuffer(f);
}
function mdish(t){
  return t.split(/\\n{2,}/).map(function(p){
    p=p.trim(); if(!p) return '';
    var m=p.match(/^(#{1,3})\\s+(.*)$/);
    if(m) return '<h'+(m[1].length+1)+'>'+esc(m[2])+'</h'+(m[1].length+1)+'>';
    return '<p>'+esc(p).replace(/\\n/g,'<br>')
      .replace(/\\*\\*(.+?)\\*\\*/g,'<b>$1</b>').replace(/\\*(.+?)\\*/g,'<i>$1</i>')+'</p>';
  }).join('');
}
function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
function put(html, name){
  $('body').innerHTML = html; words(); clean();
  if(!$('title').value){
    var h=$('body').querySelector('h1,h2');
    if(h){ $('title').value=h.textContent.trim(); h.remove(); }
    else $('title').value = name.replace(/\\.[a-z]+$/i,'').replace(/[-_]/g,' ');
  }
  say('msg','Brought in. Now the headline and the record.','good');
}

/* ---------- talking to the worker ---------- */
function grab(){ return { id:ID, title:$('title').value, standfirst:$('standfirst').value,
  section:$('section').value, keywords:$('keywords').value, subject:$('subject').value,
  links:$('links').value, body:$('body').innerHTML, sources:$('sources').value,
  disclosure:$('disclosure').value, image:$('image').value, image_alt:$('image_alt').value }; }
function post(action, data){ return fetch('/api/w/'+action,{method:'POST',
  headers:{'content-type':'application/json'}, body:JSON.stringify(data)}).then(function(r){return r.json();}); }

function save(cb){
  if(!$('title').value.trim()) return say('msg','A headline first — it is the one thing needed to save.','bad');
  say('msg','Saving…');
  post('save', grab()).then(function(j){
    if(!j.ok) return say('msg', j.error||'Not saved.', 'bad');
    ID=j.id; say('msg', j.saved||'Saved.', 'good'); load(); if(cb) cb();
  });
}
function publish(){
  save(function(){
    post('publish',{id:ID}).then(function(j){
      if(!j.ok) return say('msg', j.error, 'bad');
      say('msg', j.note, 'good'); load();
      if(j.url && confirm('Published. Open it?')) window.open(j.url,'_blank');
    });
  });
}
function saveMe(){
  post('me',{ name:$('m_name').value, role:$('m_role').value, city:$('m_city').value,
    bio:$('m_bio').value, photo:$('m_photo').value, disclosure:$('m_disclosure').value })
    .then(function(j){ say('msg2', j.ok? 'Saved.' : (j.error||'Not saved.'), j.ok?'good':'bad'); });
}
function fresh(){
  ID=null; ['title','standfirst','section','keywords','subject','links','sources','disclosure','image','image_alt']
    .forEach(function(k){ $(k).value=''; });
  $('body').innerHTML=''; words(); say('msg','New piece. Nothing saved yet.'); tab('w');
  window.scrollTo(0,0);
}
function open_(id){
  fetch('/api/w/get?id='+id).then(function(r){return r.json();}).then(function(j){
    if(!j.ok) return say('msg', j.error, 'bad');
    var p=j.piece; ID=p.id;
    ['title','standfirst','section','keywords','subject','links','sources','disclosure','image','image_alt']
      .forEach(function(k){ $(k).value = p[k]||''; });
    $('body').innerHTML = p.body||''; words(); tab('w');
    say('msg','Opened. Status: '+p.status+'.'); window.scrollTo(0,0);
  });
}
function load(){
  fetch('/api/w/mine').then(function(r){return r.json();}).then(function(j){
    if(!j.ok) return;
    var ul=$('plist'); ul.innerHTML='';
    if(!j.pieces.length){ ul.innerHTML='<li><span>Nothing yet.</span></li>'; return; }
    j.pieces.forEach(function(p){
      var li=document.createElement('li');
      li.innerHTML='<b>'+esc(p.title||'(no headline)')+'</b><span><span class="st '+p.status+'">'
        +p.status+'</span> · '+(p.words||0)+' words · '
        +String(p.updated||p.created||'').slice(0,10)+'</span>';
      li.onclick=function(){ open_(p.id); };
      ul.appendChild(li);
    });
  });
}
['name','role','city','bio','photo','disclosure'].forEach(function(k){
  var el=$('m_'+k); if(el) el.value = ME[k]||''; });
load(); words();
</script>
</body></html>`;
}