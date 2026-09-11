/* ============================================================================
   TRIGGEREDSHORT-WRITE  —  Cloudflare Worker
   The writing side: a login, a place to write, and the published pages.

   Built 2026-09-05 · build 1a

   BINDINGS   OVERHANG   D1  (the same database as the wire)
   SECRETS    LOG_KEY        master key, admin only
   VARIABLE   SITE       https://triggeredshort.com
   OPTIONAL   EMAIL          send_email binding, for invitations

   ROUTES on triggeredshort.com
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

/* ---------------- the tables, made on demand ---------------- */
let ready = false;
async function setup(env) {
  if (ready) return;
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS w_writers (
       email TEXT PRIMARY KEY, name TEXT, role TEXT, city TEXT, bio TEXT, photo TEXT,
       disclosure TEXT, password TEXT, kind TEXT DEFAULT 'guest', status TEXT DEFAULT 'active',
       created TEXT DEFAULT (datetime('now')))`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS w_pieces (
       id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, standfirst TEXT,
       section TEXT, keywords TEXT, subject TEXT, body TEXT, sources TEXT, links TEXT,
       disclosure TEXT, image TEXT, image_alt TEXT, author TEXT, status TEXT DEFAULT 'draft',
       created TEXT DEFAULT (datetime('now')), updated TEXT, published TEXT, words INTEGER)`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS w_sessions (
       token TEXT PRIMARY KEY, email TEXT, expires TEXT)`).run();
  await env.OVERHANG.prepare(
    `CREATE TABLE IF NOT EXISTS w_corrections (
       id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, wrong TEXT, right_text TEXT,
       made TEXT DEFAULT (datetime('now')))`).run();
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
  const s = await env.OVERHANG.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!s) return null;
  return env.OVERHANG.prepare(
    "SELECT * FROM w_writers WHERE email=? AND status='active'").bind(s.email).first();
}

export default {
  async fetch(req, env) {
    await setup(env);
    const u = new URL(req.url), p = u.pathname.replace(/\/+$/, '') || '/';
    const SITE = env.SITE || 'https://triggeredshort.com';
    try {
      /* ---------- public ---------- */
      if (p.startsWith('/writing/img/')) return img(env, p.slice('/writing/img/'.length));
      if (p === '/writing')             return list(env, SITE);
      if (p === '/writing/feed.xml')    return feed(env, SITE);
      if (p === '/writing/sitemap.xml') return sitemap(env, SITE);
      if (p.startsWith('/writing/'))    return piece(env, SITE, p.slice('/writing/'.length));

      /* ---------- the desk ---------- */
      if (p === '/write/login')  return req.method === 'POST' ? loginPost(req, env) : page('Sign in', loginForm());
      if (p === '/write/logout') return new Response(null, { status: 303,
        headers: [['location', '/write/login'], ['set-cookie', 'tswrite=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
      if (p === '/write/set')    return req.method === 'POST' ? setPost(req, env) : setForm(u, env);
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
    await env.OVERHANG.prepare(
      `INSERT INTO w_writers (email,name,kind) VALUES (?,?,?)
       ON CONFLICT(email) DO UPDATE SET name=excluded.name, kind=excluded.kind, status='active'`)
      .bind(email, name, kind).run();
    const tok = rnd(28);
    await env.OVERHANG.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
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

  if (!me) return json({ ok: false, error: 'sign in first' }, 401);

  if (action === 'upload' && req.method === 'POST') return upload(req, env, me);

  if (action === 'mine') {
    const r = await env.OVERHANG.prepare(
      `SELECT id,slug,title,section,status,created,updated,published,words FROM w_pieces
        WHERE author=? OR ?='house' ORDER BY id DESC LIMIT 200`).bind(me.email, me.kind).all();
    return json({ ok: true, me: { name: me.name, email: me.email, kind: me.kind }, pieces: r.results || [] });
  }

  if (action === 'get') {
    const row = await env.OVERHANG.prepare('SELECT * FROM w_pieces WHERE id=?')
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
    const fields = [title, String(b.standfirst || '').slice(0, 600), String(b.section || '').slice(0, 60),
      String(b.keywords || '').slice(0, 300), String(b.subject || '').slice(0, 300), body,
      String(b.sources || '').slice(0, 20000), String(b.links || '').slice(0, 4000),
      String(b.disclosure || '').slice(0, 4000), String(b.image || '').slice(0, 400),
      String(b.image_alt || '').slice(0, 300), words];

    if (b.id) {
      const own = await env.OVERHANG.prepare('SELECT author FROM w_pieces WHERE id=?').bind(+b.id).first();
      if (!own) return json({ ok: false, error: 'not found' }, 404);
      if (own.author !== me.email && me.kind !== 'house') return json({ ok: false, error: 'not yours' }, 403);
      await env.OVERHANG.prepare(
        `UPDATE w_pieces SET title=?,standfirst=?,section=?,keywords=?,subject=?,body=?,
           sources=?,links=?,disclosure=?,image=?,image_alt=?,words=?,updated=datetime('now')
         WHERE id=?`).bind(...fields, +b.id).run();
      return json({ ok: true, id: +b.id, words, saved: 'Saved.' });
    }
    /* a new one — make the slug unique */
    for (let i = 0; i < 40; i++) {
      const taken = await env.OVERHANG.prepare('SELECT 1 FROM w_pieces WHERE slug=?').bind(slug).first();
      if (!taken) break;
      slug = slugify(b.slug || title) + '-' + (i + 2);
    }
    const r = await env.OVERHANG.prepare(
      `INSERT INTO w_pieces (slug,title,standfirst,section,keywords,subject,body,sources,links,
         disclosure,image,image_alt,words,author,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`)
      .bind(slug, ...fields, me.email).run();
    return json({ ok: true, id: r.meta.last_row_id, slug, words, saved: 'Saved as a draft.' });
  }

  if (action === 'publish' && req.method === 'POST') {
    const b = await req.json();
    const row = await env.OVERHANG.prepare('SELECT * FROM w_pieces WHERE id=?').bind(+b.id).first();
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
    await env.OVERHANG.prepare(
      `UPDATE w_pieces SET status=?, published=CASE WHEN ?='published' THEN datetime('now') ELSE published END,
         updated=datetime('now') WHERE id=?`)
      .bind(goLive ? 'published' : 'submitted', goLive ? 'published' : 'submitted', +b.id).run();
    return json({ ok: true, status: goLive ? 'published' : 'submitted',
      url: goLive ? '/writing/' + row.slug : null,
      note: goLive ? 'Published.' : 'Sent to the editor. You will be told when it runs.' });
  }

  if (action === 'unpublish' && req.method === 'POST') {
    if (me.kind !== 'house') return json({ ok: false, error: 'the editor does this' }, 403);
    const b = await req.json();
    await env.OVERHANG.prepare("UPDATE w_pieces SET status='draft' WHERE id=?").bind(+b.id).run();
    return json({ ok: true });
  }

  if (action === 'me' && req.method === 'POST') {
    const b = await req.json();
    await env.OVERHANG.prepare(
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
   SIGNING IN
   ============================================================ */
function loginForm(msg = '') {
  return `<h1>Sign in to write</h1>${msg}
  <form method="post" action="/write/login" class="card">
    <label>Your email<input name="email" type="email" required autofocus autocomplete="username"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="primary">Sign in</button>
  </form>
  <p class="quiet">Writing here is by invitation. If you have been invited and the link has expired,
  write to <a href="mailto:realroofers@gmail.com">realroofers@gmail.com</a> and another will be sent.</p>`;
}
async function loginPost(req, env) {
  const f = await req.formData();
  const email = String(f.get('email') || '').trim().toLowerCase();
  const w = await env.OVERHANG.prepare("SELECT * FROM w_writers WHERE email=? AND status='active'").bind(email).first();
  if (!w || !w.password) return page('Sign in', loginForm('<p class="err">No login with that email, or the password has not been set yet.</p>'));
  if (!(await checkPw(String(f.get('password') || ''), w.password)))
    return page('Sign in', loginForm('<p class="err">Wrong password.</p>'));
  const tok = rnd(28);
  await env.OVERHANG.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
    .bind(tok, email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [['location', '/write'],
    ['set-cookie', `tswrite=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}
async function setForm(u, env, msg = '') {
  const t = u.searchParams.get('t') || '';
  const s = await env.OVERHANG.prepare(
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
  const s = await env.OVERHANG.prepare(
    "SELECT email FROM w_sessions WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!s) return page('Choose a password', '<h1>That link has expired.</h1>');
  if (p1.length < 8 || p1 !== p2)
    return setForm(new URL('https://x/write/set?t=' + t), env, '<p class="err">The two passwords must match, and be at least 8 characters.</p>');
  await env.OVERHANG.prepare('UPDATE w_writers SET password=?, name=COALESCE(NULLIF(?,\'\'),name) WHERE email=?')
    .bind(await hashPw(p1), String(f.get('name') || '').slice(0, 120), s.email).run();
  await env.OVERHANG.prepare('DELETE FROM w_sessions WHERE token=?').bind(t).run();
  const tok = rnd(28);
  await env.OVERHANG.prepare('INSERT INTO w_sessions (token,email,expires) VALUES (?,?,?)')
    .bind(tok, s.email, new Date(Date.now() + 30 * 864e5).toISOString()).run();
  return new Response(null, { status: 303, headers: [['location', '/write'],
    ['set-cookie', `tswrite=${tok}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
}

/* ============================================================
   THE DESK — served by the worker, so there is no file to upload
   ============================================================ */
async function desk(env, req) {
  const me = await who(env, req);
  if (!me) return new Response(null, { status: 303, headers: { location: '/write/login' } });
  return new Response(DESK_HTML(me), { headers: H.html });
}

/* ============================================================
   THE PUBLISHED PAGES
   ============================================================ */
async function list(env, SITE) {
  const rows = (await env.OVERHANG.prepare(
    `SELECT p.slug,p.title,p.standfirst,p.section,p.published,p.image,p.image_alt,p.words,
            w.name author_name, w.kind
       FROM w_pieces p LEFT JOIN w_writers w ON w.email = p.author
      WHERE p.status='published' ORDER BY p.published DESC LIMIT 100`).all()).results || [];
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
    title: 'Writing — Triggered Short™',
    desc: 'Pieces on dilution, warrant financings and the companies filing them.',
    canonical: SITE + '/writing', SITE,
    body: `<section><p class="eyebrow">Writing</p><h2>The written work</h2>
      <p class="lede">Every figure carries instructions for reproducing it. Positions are declared.
      Anyone named can answer, and the answer publishes in full and unedited.</p>
      <div class="posts">${items || '<p class="quiet">Nothing published yet.</p>'}</div></section>`
  }), { headers: H.html });
}

async function piece(env, SITE, slug) {
  const r = await env.OVERHANG.prepare(
    `SELECT p.*, w.name author_name, w.role, w.city, w.bio, w.photo, w.disclosure author_disclosure, w.kind
       FROM w_pieces p LEFT JOIN w_writers w ON w.email = p.author
      WHERE p.slug=? AND p.status='published'`).bind(slug).first();
  if (!r) return new Response(SHELL({ title: 'Not found', desc: '', canonical: SITE + '/writing', SITE,
    body: '<section><h2>There is nothing at this address.</h2><p class="lede"><a href="/writing">Everything published &rarr;</a></p></section>' }),
    { status: 404, headers: H.html });

  const corr = (await env.OVERHANG.prepare(
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
             <a href="mailto:realroofers@gmail.com">realroofers@gmail.com</a> · 732-995-3914</p>`}
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
      <a href="mailto:realroofers@gmail.com">realroofers@gmail.com</a> · 732-995-3914</p></div>

    ${corr.length ? `<div class="corrections"><h3>Corrections</h3><ul>${
      corr.map(c => `<li>${esc(c.made.slice(0, 10))} — ${esc(c.wrong)} ${esc(c.right_text)}</li>`).join('')}</ul></div>` : ''}
  </article>`;

  return new Response(SHELL({
    title: r.title + ' — Triggered Short™',
    desc: r.standfirst || '', canonical: SITE + '/writing/' + r.slug, SITE,
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

async function feed(env, SITE) {
  const rows = (await env.OVERHANG.prepare(
    `SELECT slug,title,standfirst,published FROM w_pieces WHERE status='published'
      ORDER BY published DESC LIMIT 50`).all()).results || [];
  const x = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Triggered Short — Writing</title>
<link>${SITE}/writing</link>
<description>Pieces on dilution, warrant financings and the companies filing them.</description>
${rows.map(r => `<item><title>${esc(r.title)}</title>
<link>${SITE}/writing/${esc(r.slug)}</link>
<guid>${SITE}/writing/${esc(r.slug)}</guid>
<pubDate>${new Date((r.published || today()) + 'T12:00:00Z').toUTCString()}</pubDate>
<description>${esc(r.standfirst || '')}</description></item>`).join('\n')}
</channel></rss>`;
  return new Response(x, { headers: H.xml });
}

async function sitemap(env, SITE) {
  const rows = (await env.OVERHANG.prepare(
    `SELECT slug, published, updated FROM w_pieces WHERE status='published'`).all()).results || [];
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
function SHELL({ title, desc, canonical, SITE, keywords, image, ld, body }) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image || SITE + '/og-card.png')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="alternate" type="application/rss+xml" title="Triggered Short — Writing" href="${SITE}/writing/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;650&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="stylesheet" href="/styles.css">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>
.piece{max-width:700px}
.piece h1{font-family:var(--display);font-weight:700;font-size:clamp(28px,4.6vw,42px);
  line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
.standfirst{font-family:var(--display);font-size:20px;line-height:1.5;color:var(--ink-2);margin:0 0 24px}
.record{margin:0 0 26px;padding:15px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
  display:grid;grid-template-columns:96px 1fr;gap:6px 18px;font-size:15px}
.record dt{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--ink-2);font-weight:600;line-height:1.9}
.record dd{margin:0;line-height:1.55}
.byline{background:var(--card);border:1px solid var(--rule);border-left:4px solid var(--stamp);
  padding:16px 18px;margin:0 0 28px;font-size:15px}
.byline.guest{display:grid;grid-template-columns:70px 1fr;gap:16px;border-left-color:var(--certified)}
.byline .mug{width:70px;height:70px;border-radius:50%;object-fit:cover;border:1px solid var(--rule)}
.byline .name{font-family:var(--display);font-weight:600;font-size:17px;margin:0 0 3px}
.byline p{margin:0 0 6px;color:var(--ink-2)}
.byline .role{font-family:var(--mono);font-size:11.5px;letter-spacing:.05em;color:var(--certified);font-weight:600}
.byline .filer{font-family:var(--mono);font-size:12px;line-height:1.7;margin-top:9px;padding-top:9px;
  border-top:1px solid var(--rule)}
.byline .edited{font-size:12.5px;margin-top:9px;padding-top:9px;border-top:1px solid var(--rule)}
.piece h2{margin:34px 0 12px}
.piece p{margin:0 0 18px;max-width:68ch}
.piece blockquote{margin:24px 0;padding-left:18px;border-left:3px solid var(--stamp);
  font-family:var(--display);font-style:italic;font-size:19px;line-height:1.5}
.media{margin:26px 0}
.media img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
.media figcaption{font-size:13px;color:var(--ink-2);margin-top:9px}
.disclose{background:var(--card);border:1px solid var(--rule);padding:18px 20px;margin:34px 0}
.disclose h3{margin:0 0 9px;font-family:var(--body);font-size:15px}
.disclose p{font-size:14.5px;color:var(--ink-2);margin:0 0 9px}
.sources,.reply,.corrections{margin:30px 0 0;font-size:14.5px}
.sources h3,.reply h3,.corrections h3{font-family:var(--body);font-size:15px;margin:0 0 8px}
.reply{border-top:2px solid var(--ink);padding-top:16px}
.sources ol{color:var(--ink-2);padding-left:20px}.sources li{margin-bottom:8px}
.posts{border-top:1px solid var(--ink);margin-top:18px}
.post{display:grid;grid-template-columns:118px 1fr 280px;gap:0 22px;padding:20px 0;
  border-bottom:1px solid var(--rule-2);align-items:start}
.p-date{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);line-height:1.7}
.p-date b{display:block;color:var(--certified);text-transform:uppercase;letter-spacing:.1em;font-size:10.5px}
.p-title{font-family:var(--display);font-size:20px;line-height:1.25;margin:0 0 6px}
.p-title a{color:var(--ink);text-decoration:none}.p-title a:hover{text-decoration:underline}
.p-stand{font-size:14.5px;color:var(--ink-2);margin:0 0 8px;max-width:60ch}
.p-by{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}
.p-by .guest{color:var(--stamp);font-weight:600}
.p-thumb img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
.post.lead{grid-template-columns:1fr 1fr;border-bottom:2px solid var(--ink)}
.post.lead .p-title{font-size:26px}
.quiet{color:var(--ink-2)}
@media(max-width:860px){.post,.post.lead{grid-template-columns:1fr}.p-thumb{margin-top:12px;max-width:420px}}
</style></head><body>
<header class="masthead"><div class="mast-inner">
  <a class="brand" href="/"><img src="/logo.png" alt="TriggeredShort.com" width="1223" height="297"></a>
  <div class="mast-meta">Research docket<br>Mark Nejmeh<br>
    <b>Foundation for Job Creation</b><br>SEC EDGAR filer · LTID <b>71743954</b></div>
</div></header>
<nav class="docket-nav"><div class="nav-inner">
  <a href="/">What it is</a><a href="/tests.html">The ten tests</a><a href="/suspects.html">Suspects</a>
  <a href="/example.html">Worked example</a><a href="/method.html">Method</a>
  <a href="/glossary.html">Glossary</a><a href="/writing" aria-current="page">Writing</a>
</div></nav>
<main>${body}</main>
<footer><div class="foot-inner"><b>Mark Nejmeh</b><br>
  <a href="https://jobcreation.us" style="color:var(--ink-2)">Foundation for Job Creation</a><br>
  P.O. Box 589, Clifton, New Jersey 07012<br>732-995-3914 · realroofers@gmail.com<br><br>
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
<link href="https://fonts.googleapis.com/css2?family=Bitter:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>:root{color-scheme:light;--ledger:#E9EAE3;--card:#F6F6F1;--ink:#15181B;--ink-2:#4C555A;--certified:#1C5D45;--rule:#C3C7BC}
body{margin:0;background:var(--ledger);color:var(--ink);font:16px/1.6 "Public Sans",sans-serif;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.box{max-width:420px;width:100%}
h1{font:600 26px/1.2 Bitter,Georgia,serif;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--rule);padding:20px}
label{display:block;font-size:13.5px;color:var(--ink-2);margin-bottom:12px}
input{display:block;width:100%;margin-top:4px;padding:10px 12px;border:1.5px solid var(--rule);
  font:inherit;background:#fff}
button{font:inherit;font-weight:600;border:0;background:var(--certified);color:var(--ledger);
  padding:12px 18px;width:100%;cursor:pointer}
.err{color:#8C2E22;font-size:14px}.quiet{color:var(--ink-2);font-size:13.5px;margin-top:16px}
a{color:var(--certified)}</style></head><body><div class="box">${body}</div></body></html>`,
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
  <span class="who">${esc(me.name || me.email)} · ${me.kind === 'house' ? 'editor' : 'contributing writer'}</span>
  <a href="/writing" target="_blank">See the site</a><a href="/write/logout">Sign out</a></div>

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
        +p.status+'</span> · '+(p.words||0)+' words · '+String(p.updated||p.created||'').slice(0,10)+'</span>';
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