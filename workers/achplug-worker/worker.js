// ACHplug worker — build 3b, 4 Sep 2026 — Your code section explains data-repeat="off" per product. 3a — a box with data-repeat="off" hides the repeat panel even when the seller allows repeats. 2z — fix: the code box on the ACH form (missed in 2x/2y). 2y: Settings codes box. 2x — promo codes on the ACH form: seller sets codes in Settings (CODE=amount, one per line); buyer types it; journal shows it. Previous: 2w, 4 Sep 2026 — roles are Owner / Bookkeeper / Auditor (read-only, every site, every file, CSVs). 2v: TEAM; they set their own password; actions are signed by the user. Previous: 2u, 4 Sep 2026 — password re-entry to mark a file sent and to mark a payment received/returned; the login that signed is recorded. Previous: 2t, 4 Sep 2026 — who did it: downloaded_by / sent_by on files (typed-name signature on 'I uploaded it'), received_by on payments. Previous: 2s, 4 Sep 2026 — bank files on record: every download is a numbered batch (date, count, total, refs, sent/cleared); re-download; 'not yet in any file' count. Previous: 2r, 4 Sep 2026 — admin 'Run the daily job now' (/admin/run-daily) to test reminders + collection email on demand; cron logs a line. Previous: 2q, 3 Sep 2026 — logo gap fixed for real. Previous: 2p, 3 Sep 2026 — close/reopen a site (never delete once it has payments); remove only if empty. Previous: 2o, 3 Sep 2026 — All-sites journal with a Site column and combined totals. Previous: 2n, 3 Sep 2026 — one login, many sites: Your sites list, header switcher, Add a site. Previous: 2m, 3 Sep 2026 — fix: dashboard pages now accept the login cookie. Previous: 2l, 3 Sep 2026 — logo spacing. Previous: 2k, 3 Sep 2026 — fix: signup form string broken in 2i. Previous: 2j, 3 Sep 2026 — pitch to the buyer: box on their payments page, one line in buyer emails. Previous: 2i, 3 Sep 2026 — signup after purchase says 'Payment received. Create your login.' Previous: 2h, 3 Sep 2026 — LOGIN with email + password (PBKDF2); emailed link only for Forgot/set password; cookie 30 days; /logout. Previous: 2f, 3 Sep 2026 — /dashboard is the address (old /desk addresses still work). Previous: 2e, 3 Sep 2026 — tree mark in the dashboard header and the box footer; tables scroll on phones. Previous: 2d, 3 Sep 2026 — Automatic tile links to achplug.com/automatic.html. Previous: 2c, 3 Sep 2026 — plain wording on the Automatic tile. Previous: 2b, 3 Sep 2026 — 'desk' is 'dashboard' everywhere a person reads it (URLs unchanged). Previous: 2a, 2 Sep 2026 — daily collection email (file + links) to every seller with approvals; collect_mode setting file|api with an adapter slot; Help → help-collect; section-7 wording. Previous: 1z, 2 Sep 2026 — thank-you screen: push-only line hidden in pull mode. 1y: fix: box hid itself in pull mode (account is withheld from the page on purpose). PULL MODE: buyer enters their routing + account and approves; seller's bank collects from a file ACHplug builds. Account numbers encrypted; desk shows last 4 only. Recurring authorizations. Push mode kept as an owner setting.
// Serves: /plug.js  /plan (payer pause/resume/stop)  + scheduled() daily for reminders
// Serves: /plug.js  /api/config  /api/order  /signup  /desk  /desk/register  /desk/settings  /desk/mark  /admin

const H = { html: { 'content-type': 'text/html;charset=utf-8' }, js: { 'content-type': 'application/javascript', 'cache-control': 'public,max-age=300' }, json: { 'content-type': 'application/json' } };
const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n = 12) => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; crypto.getRandomValues(new Uint8Array(n)).forEach(b => s += a[b % a.length]); return s; };
const DEF_ACK = `Thank you, {name}.

We are watching for your transfer of {amount}.
Reference: {ref}   (put this in the memo)
Pay to: {entity}
Routing: {routing}   Account: {account}

When it lands — {days} — you will get a {receipt_word} from us at this address.

{site}`;
const DEF_RECEIPT = `Thank you from {entity}.

Received {amount} on {date}.
Reference: {ref}
For: {product}
{link}

{site}`;
const DEF_RECEIPT_DONATION = `Thank you from {entity}.

Your donation of {amount} was received on {date}. Reference: {ref}.
Our tax ID (EIN) is {ein}. No goods or services were provided in exchange for this contribution. Please keep this email as your donation receipt.

{site}`;
const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const abaOk = r => { if (!/^\d{9}$/.test(r) || /^(\d)\1{8}$/.test(r)) return false; const p = Number(r.slice(0, 2)); if (!((p >= 0 && p <= 12) || (p >= 21 && p <= 32) || (p >= 61 && p <= 72) || p === 80)) return false;
  const d = r.split('').map(Number); return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0; };
async function bankLookup(env, rn) {
  // Returns {ok, name, city, state, reason}. Order: ABA checksum → your D1 copy of the Fed ACH directory → live API if ROUTING_API_KEY is set → checksum only.
  if (!abaOk(rn)) return { ok: false, reason: 'fails the bank check digit or is outside the Federal Reserve ranges' };
  let haveDir = false;
  try {
    const row = await env.DB.prepare('SELECT name,city,state FROM banks WHERE routing=?').bind(rn).first();
    if (row) return { ok: true, name: row.name, city: row.city, state: row.state };
    haveDir = !!(await env.DB.prepare('SELECT 1 FROM banks LIMIT 1').first());
  } catch (e) { haveDir = false; }
  if (env.ROUTING_API_KEY) {
    try {
      const r = await fetch('https://api.api-ninjas.com/v1/routingnumber?routing_number=' + rn, { headers: { 'X-Api-Key': env.ROUTING_API_KEY } });
      if (r.ok) { const j = await r.json(); const b = Array.isArray(j) ? j[0] : j;
        const good = b && typeof b.bank_name === 'string' && b.bank_name.length > 1 && b.bank_name.length < 80 && !/premium|subscriber|upgrade|api key/i.test(b.bank_name);
        if (good) { if (b.fedach === false) return { ok: false, reason: `belongs to ${b.bank_name} but that bank does not accept ACH transfers on this number` }; return { ok: true, name: b.bank_name, city: b.city || '', state: b.state || '' }; } }
    } catch (e) {}
  }
  if (haveDir) return { ok: false, reason: 'is not in the Federal Reserve ACH directory we hold. Check it against the bottom of a check; if you are certain it is right, email us the number and the bank name and we will add it' };
  return { ok: true, name: '', reason: 'directory not loaded' };
}
async function encKey(env) { const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('achplug-enc:' + (env.ENC_KEY || ''))); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encKey(env), new TextEncoder().encode(text))); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return btoa(String.fromCharCode(...out)); }
async function decrypt(env, b64) { const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await encKey(env), buf.slice(12)); return new TextDecoder().decode(pt); }
const cors = r => { r.headers.set('access-control-allow-origin', '*'); r.headers.set('access-control-allow-headers', 'content-type'); return r; };

export default {
  async scheduled(ev, env) { console.log('achplug cron', new Date().toISOString()); const r = await remind(env); console.log('achplug cron done:', r); },
  async fetch(req, env) {
    const u = new URL(req.url); let p = u.pathname;
    OAUTH.google = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    if (p === '/dashboard' || p.startsWith('/dashboard/')) p = '/desk' + p.slice('/dashboard'.length);
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    try {
      if (p === '/plug.js') return cors(new Response(PLUG_JS(env.SITE), { headers: H.js }));
      if (p === '/api/config') return cors(await config(u, env));
      if (p === '/api/order' && req.method === 'POST') return cors(await order(req, env));
      if (p === '/api/bank') return cors(await bankApi(u, env));
      if (p === '/api/code') {
        const key = u.searchParams.get('key') || '', code = (u.searchParams.get('code') || '').trim().toUpperCase();
        const o = await env.DB.prepare('SELECT codes FROM owners WHERE key=?').bind(key).first(); if (!o) return cors(jerr('Unknown site key.', 404));
        const m = (o.codes || '').split(/\n/).map(l => l.trim().split('=')).find(x => x[0] && x[0].trim().toUpperCase() === code);
        return cors(new Response(JSON.stringify(m ? { ok: true, off: Math.max(0, Number(m[1]) || 0) } : { ok: false }), { headers: H.json }));
      }
      if (p === '/api/authorize' && req.method === 'POST') return cors(await authorize(req, env));
      if (p === '/desk/collect') return req.method === 'POST' ? collectPost(req, env) : collect(u, env, undefined, req);
      if (p === '/desk/file') return bankFile(u, env, req);
      if (p === '/signup') return req.method === 'POST' ? signupPost(req, env) : page(u.searchParams.get('paid') ? 'Create your login' : 'Sign up', signupForm('', !!u.searchParams.get('paid')), 200, pubNav);
      if (p === '/login') return req.method === 'POST' ? loginPost(req, env) : page('Log in', loginForm(), 200, pubNav);
      if (p === '/login/google') return googleStart(env);
      if (p === '/login/google/cb') return googleBack(u, env, req);
      if (p === '/login/go') return loginGo(u, env);
      if (p === '/login/forgot') return req.method === 'POST' ? forgotPost(req, env) : page('Reset your password', forgotForm(), 200, pubNav);
      if (p === '/login/set') return req.method === 'POST' ? setPwPost(req, env) : setPwForm(u, env);
      if (p === '/logout') return new Response(null, { status: 303, headers: [['location', env.SITE + '/login'], ['set-cookie', 'achplug_s=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax'], ['set-cookie', 'achplug_u=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
      if (p === '/desk/team') return req.method === 'POST' ? teamPost(req, env) : team(u, env, req);
      if (p === '/signup/recover' && req.method === 'POST') return recover(req, env);
      if (p === '/desk/sites') return req.method === 'POST' ? sitesPost(req, env) : sites(u, env, req);
      if (p === '/desk/all') return allJournal(u, env, req);
      if (p === '/desk/close' && req.method === 'POST') return closeSite(req, env);
      if (p === '/desk/switch') return switchSite(u, env, req);
      if (p === '/desk') return desk(u, env, req);
      if (p === '/desk/register') return register(u, env, req);
      if (p === '/desk/settings' && req.method === 'POST') return settingsPost(req, env);
      if (p === '/desk/mark' && req.method === 'POST') return mark(req, env);
      if (p === '/plan') return req.method === 'POST' ? planPost(req, env) : planPage(u, env);
      if (p === '/me') return req.method === 'POST' ? mePost(req, env) : mePage(u, env);
      if (p === '/me/find') return req.method === 'POST' ? meFind(req, env) : page('Find my payments', meFindForm(), 200, pubNav);
      if (p === '/desk/plan' && req.method === 'POST') return planOwner(req, env);
      if (p === '/admin') return admin(u, env);
      if (p === '/admin/import-banks') return importBanks(u, env);
      if (p === '/admin/run-daily') { if (!env.ADMIN_TOKEN || u.searchParams.get('t') !== env.ADMIN_TOKEN) return new Response('No.', { status: 403 }); const r = await remind(env); return page('Daily job', `<h1>Daily job ran</h1><p class="lead">${esc(r)}</p><p><a href="/admin?t=${esc(u.searchParams.get('t'))}">Back to admin</a></p>`); }
      return passThrough(req, env);
    } catch (e) { return new Response('Error: ' + e.message, { status: 500 }); }
  }
};

/* ---------------- anything this worker does not own goes to the Pages site ----------------
   Set PAGES_ORIGIN (e.g. https://achplug-abc.pages.dev) and the route can become achplug.com/*
   — one route, so a Pages deploy can never shadow /login again. Unset, this behaves as before. */
async function passThrough(req, env) {
  if (!env.PAGES_ORIGIN) return new Response('Not here.', { status: 404 });
  const u = new URL(req.url);
  const target = new URL(u.pathname + u.search, env.PAGES_ORIGIN);
  const r = await fetch(new Request(target.toString(), req));
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
}

/* ---------------- the box: config + order ---------------- */
async function config(u, env) {
  const o = await env.DB.prepare('SELECT entity,bank,routing,account,discount,days,card_url,contact,mode,amounts,recurring,collect,address,closed,codes FROM owners WHERE key=?').bind(u.searchParams.get('key') || '').first();
  if (!o) return new Response(JSON.stringify({ error: 'unknown key' }), { status: 404, headers: H.json });
  if (o.closed) return new Response(JSON.stringify({ error: 'closed' }), { status: 404, headers: H.json });
  o.has_codes = !!(o.codes && o.codes.trim()); delete o.codes;
  if ((o.collect || 'pull') === 'pull') { o.ready = !!(o.routing && o.account && o.entity); delete o.account; o.routing_last = ''; }
  return new Response(JSON.stringify(o), { headers: H.json });
}
async function order(req, env) {
  const b = await req.json().catch(() => ({}));
  const o = await env.DB.prepare('SELECT * FROM owners WHERE key=?').bind(b.key || '').first();
  if (!o) return jerr('Unknown site key.', 404);
  const name = String(b.name || '').trim().slice(0, 120), email = String(b.email || '').trim().slice(0, 200);
  const product = String(b.product || '').trim().slice(0, 200), sku = String(b.sku || '').trim().slice(0, 40);
  const amount = Math.round(Number(b.amount) * 100) / 100;
  const repeat = ['weekly', 'monthly', 'yearly'].includes(b.repeat) && o.recurring ? b.repeat : '';
  const endCount = repeat && Number(b.end_count) > 0 ? Math.min(999, Math.floor(Number(b.end_count))) : null;
  const endDate = repeat && /^\d{4}-\d{2}-\d{2}$/.test(String(b.end_date || '')) ? String(b.end_date) : null;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !product || !(amount > 0)) return jerr('Please give your name and a working email address.', 400);
  const ip = req.headers.get('cf-connecting-ip') || '';
  const n = await env.DB.prepare("SELECT COUNT(*) c FROM orders WHERE ip=? AND created > datetime('now','-1 hour')").bind(ip).first();
  if (n && n.c >= 5) return jerr('Too many orders from this connection. Try again in an hour.', 429);
  let ref;
  for (let i = 0; i < 5; i++) {
    ref = (o.prefix || 'AP') + '-' + String(Math.floor(100000 + Math.random() * 900000));
    const r = await env.DB.prepare('INSERT OR IGNORE INTO orders (key,ref,name,email,product,sku,amount,ip) VALUES (?,?,?,?,?,?,?,?)').bind(o.key, ref, name, email, product, sku, amount, ip).run();
    if (r.meta.changes) break;
  }
  if (repeat) {
    const tok = rnd(20);
    await env.DB.prepare('INSERT INTO plans (key,ref,token,name,email,product,sku,amount,interval,next_due,status,end_count,end_date,done) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)')
      .bind(o.key, ref, tok, name, email, product, sku, amount, repeat, nextDue(new Date(), repeat), 'active', endCount, endDate).run();
  }
  const don = o.mode === 'donation', word = don ? 'donation' : 'order';
  await sendMail(env, o.email, `ACH ${word} ${ref} — ${money(amount)}`, `${name} <${email}> says a transfer of ${money(amount)} is on its way.\n${don ? 'Fund' : 'Product'}: ${product}\nReference: ${ref}\n\nMark it received when it lands: ${env.SITE}/desk`);
  await sendMail(env, email, `${don ? 'Your donation to' : 'Your order from'} ${o.entity || o.site} — ${ref}`, fill(o.ack_tpl || DEF_ACK, tplVars(o, { name, product, ref, amount, link: '' }, env)) + await meLine(env, email), o.email);
  return new Response(JSON.stringify({ ref, repeat }), { headers: H.json });
}
function nextDue(from, interval) { const d = new Date(from); if (interval === 'weekly') d.setDate(d.getDate() + 7); else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }
async function meToken(env, email) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('achplug-me:' + (env.ADMIN_TOKEN || 'x')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase().trim()));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c])).slice(0, 24);
}
const meLine = async (env, email) => `\nManage your payments (repeating ones, pending ones, receipts): ${env.SITE}/me?e=${encodeURIComponent(email)}&t=${await meToken(env, email)}\n\nHave a website? Take bank payments on it like this — ACHplug, $25 once: https://achplug.com/?from=buyer\n`;
const jerr = (m, s) => new Response(JSON.stringify({ message: m }), { status: s, headers: H.json });
const tplVars = (o, r, env) => ({ name: r.name, product: r.product, ref: r.ref, amount: money(r.amount), date: (r.paid_at || new Date().toISOString()).slice(0, 10),
  entity: o.entity, ein: o.ein || '', routing: o.routing, account: o.account, days: o.days || 'often within minutes, up to 3 business days', link: r.link || '', site: o.site || env.SITE,
  receipt_word: o.mode === 'donation' ? 'donation receipt' : 'receipt' });

async function bankApi(u, env) {
  const rn = (u.searchParams.get('rn') || '').replace(/\D/g, '');
  const lk = await bankLookup(env, rn);
  return new Response(JSON.stringify(lk.ok && lk.name ? { ok: true, name: lk.name, city: lk.city || '', state: lk.state || '' } : { ok: lk.ok, name: '', reason: lk.reason || '' }), { headers: H.json });
}

/* ---------------- PULL: buyer authorizes, seller's bank collects ---------------- */
async function authorize(req, env) {
  const b = await req.json().catch(() => ({}));
  const o = await env.DB.prepare('SELECT * FROM owners WHERE key=?').bind(b.key || '').first();
  if (!o) return jerr('Unknown site key.', 404);
  if (o.closed) return jerr('This seller is not taking payments right now.', 410);
  const name = String(b.name || '').trim().slice(0, 120), email = String(b.email || '').trim().slice(0, 200);
  const product = String(b.product || '').trim().slice(0, 200), sku = String(b.sku || '').trim().slice(0, 40);
  let amount = Math.round(Number(b.amount) * 100) / 100; let code = '';
  if (b.code) { const c = String(b.code).trim().toUpperCase(); const m = (o.codes || '').split(/\n/).map(l => l.trim().split('=')).find(x => x[0] && x[0].trim().toUpperCase() === c); if (m) { amount = Math.max(0.5, Math.round((amount - (Number(m[1]) || 0)) * 100) / 100); code = c; } }
  const routing = String(b.routing || '').replace(/\D/g, ''), account = String(b.account || '').replace(/[^0-9A-Za-z-]/g, '');
  const acctType = b.acct_type === 'savings' ? 'savings' : 'checking';
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !product || !(amount > 0)) return jerr('Please give your name and a working email address.', 400);
  if (!b.agree) return jerr('Please check the box to authorize the payment.', 400);
  const lk = await bankLookup(env, routing); if (!lk.ok) return jerr('That routing number ' + lk.reason + '.', 400);
  if (account.length < 4 || account.length > 17 || /^(\d)\1+$/.test(account)) return jerr('That account number does not look right.', 400);
  if (!env.ENC_KEY) return jerr('This site is not set up to collect yet.', 503);
  const repeat = ['weekly', 'monthly', 'yearly'].includes(b.repeat) && o.recurring ? b.repeat : '';
  const endCount = repeat && Number(b.end_count) > 0 ? Math.min(999, Math.floor(Number(b.end_count))) : null;
  const endDate = repeat && /^\d{4}-\d{2}-\d{2}$/.test(String(b.end_date || '')) ? String(b.end_date) : null;
  const ip = req.headers.get('cf-connecting-ip') || '';
  const n = await env.DB.prepare("SELECT COUNT(*) c FROM authorizations WHERE ip=? AND created > datetime('now','-1 hour')").bind(ip).first();
  if (n && n.c >= 5) return jerr('Too many attempts from this connection. Try again in an hour.', 429);
  const ref = (o.prefix || 'AP') + '-' + String(Math.floor(100000 + Math.random() * 900000));
  const enc = await encrypt(env, JSON.stringify({ routing, account }));
  const agreed = `I authorize ${o.entity} to debit my ${acctType} account at ${lk.name} (routing ${routing}, account ending ${account.slice(-4)}) for ${money(amount)}${repeat ? ' ' + repeat + (endCount ? ' for ' + endCount + ' payments' : endDate ? ' until ' + endDate : ' until I cancel') : ''}. I can revoke this at ${env.SITE}/me. ${new Date().toISOString().slice(0, 10)} from ${ip}.`;
  const tok = rnd(20);
  const r = await env.DB.prepare('INSERT INTO authorizations (key,ref,token,name,email,product,sku,amount,routing,bank_name,last4,acct_type,enc,interval,end_count,end_date,done,next_due,status,agreed,ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)')
    .bind(o.key, ref, tok, name, email, product, sku, amount, routing, lk.name, account.slice(-4), acctType, enc, repeat, endCount, endDate, repeat ? nextDue(new Date(), repeat) : null, 'active', agreed, ip).run();
  const authId = r.meta.last_row_id;
  // the first debit is due now
  await env.DB.prepare("INSERT INTO orders (key,ref,name,email,product,sku,amount,ip,status,auth_id) VALUES (?,?,?,?,?,?,?,?,'authorized',?)").bind(o.key, ref, name, email, product, sku, amount, ip, authId).run();
  if (code) { try { await env.DB.prepare('UPDATE orders SET code=? WHERE key=? AND ref=?').bind(code, o.key, ref).run(); } catch (e) {} }
  const don = o.mode === 'donation';
  await sendMail(env, o.email, `Payment authorized ${ref} — ${money(amount)}`, `${name} <${email}> authorized ${money(amount)} for ${product} from ${lk.name} (account ending ${account.slice(-4)}).\n${repeat ? 'Repeats ' + repeat + '.\n' : ''}\nIt is ready to collect: ${env.SITE}/desk/collect`);
  const notice = `Thank you${don ? ' for your donation' : ' for your purchase'}.\n\nYou have authorized a payment to ${o.entity}${o.address ? ', ' + o.address : ''} in the amount of ${money(amount)} from your ${acctType} account at ${lk.name}, ending ${account.slice(-4)}.${repeat ? '\nThis repeats ' + repeat + (endCount ? ' for ' + endCount + ' payments' : endDate ? ' until ' + endDate : ' until you stop it') + '.' : ''}\nReference: ${ref}\n\nYou will receive a receipt when the funds clear — usually quick, but it can take 1 to 3 business days.\n\nYour authorization, for your records:\n${agreed}\n`;
  await sendMail(env, email, `${don ? 'Your donation to' : 'Your payment to'} ${o.entity} — ${ref}`, notice + await meLine(env, email), o.email);
  return new Response(JSON.stringify({ ref, bank: lk.name, last4: account.slice(-4), notice }), { headers: H.json });
}

// the Collect page: what is ready to pull, and the file for the bank
async function collect(u, env, msg = '', req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const me = await whoami(env, o, req); const ro = !can(me, 'collect');
  const ready = (await env.DB.prepare("SELECT r.*, a.bank_name, a.last4, a.acct_type FROM orders r JOIN authorizations a ON a.id = r.auth_id WHERE r.key=? AND r.status='authorized' ORDER BY r.id").bind(o.key).all()).results;
  const sent = (await env.DB.prepare("SELECT r.*, a.bank_name, a.last4 FROM orders r JOIN authorizations a ON a.id = r.auth_id WHERE r.key=? AND r.status='collecting' ORDER BY r.id DESC LIMIT 100").bind(o.key).all()).results;
  const total = ready.reduce((t, r) => t + r.amount, 0);
  const setup = o.company_id && o.odfi_routing;
  const notInFile = ready.filter(r => !r.batch_id), inFile = ready.filter(r => r.batch_id);
  const batches = (await env.DB.prepare("SELECT b.*, (SELECT COUNT(*) FROM orders r WHERE r.batch_id=b.id AND r.status='paid') cleared, (SELECT COUNT(*) FROM orders r WHERE r.batch_id=b.id AND r.status='cancelled') returned FROM batches b WHERE b.key=? ORDER BY b.id DESC LIMIT 100").bind(o.key).all()).results;
  if (u.searchParams.get('err') === 'pw') msg = `<div class="notice" style="background:#fdecec;border-color:#e3a3a3"><b>Not marked.</b> Enter your password in the box on that row — marking a payment is signed by your login.</div>` + (msg || '');
  let b = `<h1>Collect</h1><p class="lead">Payments your customers have authorized. Download the bank file, upload it to your bank's ACH origination page, and mark it sent. When the money shows in your account, mark received and the customer gets their receipt.</p>${msg}`;
  if (!setup) b += `<div class="notice"><b>One-time setup.</b> Your bank needs two things in every file: your <b>Company ID</b> (your EIN, or the originator ID your bank gave you) and the <b>routing number your bank uses for ACH origination</b> (ask them — it is often the same as your account's routing number). Enter both in <a href="/dashboard?s=${esc(o.secret)}#settings">Settings → 6. Collecting</a>.</div>`;
  b += `<div class="grid"><div class="card"><small>Not yet in any bank file</small><b>${notInFile.length}</b><small>${money(notInFile.reduce((t, r) => t + r.amount, 0))} — press Download to put them in one</small></div><div class="card"><small>In a file, not yet marked sent</small><b>${inFile.length}</b><small>${money(inFile.reduce((t, r) => t + r.amount, 0))}</small></div></div>
  <h2>Ready to collect <span class="badge">${ready.length}</span> · ${money(total)}</h2>`;
  b += ready.length ? `<table><tr><th>Ref</th><th>File</th><th>Customer</th><th>Product</th><th>Bank</th><th>Amount</th></tr>${ready.map(r => `<tr><td><code>${esc(r.ref)}</code></td><td>${r.batch_id ? '#' + r.batch_id : '<span class="awaiting">not yet</span>'}</td><td>${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td><td>${esc(r.product)}</td><td>${esc(r.bank_name)} ····${esc(r.last4)}</td><td>${money(r.amount)}</td></tr>`).join('')}</table>
    <p style="margin-top:12px">${ro ? '<em>Read-only login — you can see everything here but not act on it.</em>' : setup ? `<a class="btn" href="/dashboard/file?s=${esc(o.secret)}">Download bank file — ${notInFile.length} new payment${notInFile.length === 1 ? '' : 's'}, ${money(notInFile.reduce((t, r) => t + r.amount, 0))}</a> &nbsp; <form method="post" action="/dashboard/collect" style="display:inline-flex;gap:6px;align-items:center"><input type="hidden" name="s" value="${esc(o.secret)}"><input name="password" type="password" autocomplete="current-password" placeholder="Your password — signs the file" style="width:220px;margin:0;padding:8px 10px"><button name="to" value="collecting" style="margin:0">I uploaded it — mark as sent to bank</button></form>` : '<em>Finish the setup above to download the file.</em>'}</p>` : '<p>Nothing waiting. When a customer approves a payment it appears here.</p>';
  b += `<h2>Bank files</h2>` + (batches.length ? `<table><tr><th>File</th><th>Made</th><th>Payments</th><th>Total</th><th>Downloaded by</th><th>Sent to bank</th><th>Cleared</th><th>Returned</th><th>References</th><th></th></tr>${batches.map(x => `<tr><td><b>#${x.id}</b></td><td>${esc(x.created.slice(0, 16))}</td><td>${x.count}</td><td>${money(x.total)}</td><td style="font-size:12px">${esc(x.downloaded_by || '')}</td><td>${x.sent_at ? esc(x.sent_at.slice(0, 16)) + '<br><small>' + esc(x.sent_by || '') + '</small>' : '<span class="awaiting">not yet</span>'}</td><td>${x.cleared} of ${x.count}</td><td>${x.returned}</td><td style="font-size:12px;max-width:260px;white-space:normal">${esc(x.refs)}</td><td><a href="/dashboard/file?s=${esc(o.secret)}&batch=${x.id}">Download again</a></td></tr>`).join('')}</table>` : '<p>None yet. Every time you press Download, the file is recorded here with what was in it.</p>');
  b += `<h2>Sent to bank — waiting to clear</h2>` + (sent.length ? `<table><tr><th>Ref</th><th>Customer</th><th>Bank</th><th>Amount</th><th>Sent</th><th></th></tr>${sent.map(r => `<tr><td><code>${esc(r.ref)}</code></td><td>${esc(r.name)}</td><td>${esc(r.bank_name)} ····${esc(r.last4)}</td><td>${money(r.amount)}</td><td>${esc((r.sent_at || '').slice(0, 10))}</td><td><form method="post" action="/dashboard/mark"><input type="hidden" name="s" value="${esc(o.secret)}"><input type="hidden" name="id" value="${r.id}"><input name="password" type="password" placeholder="Password" style="width:110px;display:inline-block;font-size:13px;padding:5px 8px;margin:4px 4px 0 0"><button name="to" value="paid" class="primary small">Received</button><button name="to" value="cancelled" class="small">Returned</button></form></td></tr>`).join('')}</table>` : '<p>None.</p>');
  return page('Collect', b, 200, deskNav(o.secret, 'collect', o));
}
async function collectPost(req, env) {
  const f = await req.formData(); const s = f.get('s') || cookieSecret(req);
  const o = await env.DB.prepare('SELECT key,email,password FROM owners WHERE secret=?').bind(s).first(); if (!o) return page('Collect', '<h1>No dashboard at that link.</h1>', 403);
  const me = await whoami(env, o, req); if (!can(me, 'collect')) return page('Collect', '<h1>Your role does not allow this.</h1>', 403);
  if (!(await checkPw(String(f.get('password') || ''), me.password))) return collect(new URL(`${env.SITE}/dashboard/collect`), env, `<div class="notice" style="background:#fdecec;border-color:#e3a3a3"><b>Not marked.</b> Enter your password next to the button — marking a file sent is signed by your login.</div>`, req);
  const by = (me.name ? me.name + ' ' : '') + '<' + me.email + '>';
  await env.DB.prepare("UPDATE orders SET status='collecting', sent_at=datetime('now') WHERE key=? AND status='authorized' AND batch_id>0").bind(o.key).run();
  await env.DB.prepare("UPDATE batches SET sent_at=datetime('now'), sent_by=? WHERE key=? AND sent_at IS NULL").bind(by, o.key).run();
  return Response.redirect(`${env.SITE}/dashboard/collect?s=${s}`, 303);
}
// NACHA PPD debit file
async function bankFile(u, env, req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  if (!o.company_id || !o.odfi_routing) return new Response('Set Company ID and origination routing number in Settings first.', { status: 400 });
  let rows, batchId = Number(u.searchParams.get('batch') || 0);
  if (batchId) rows = (await env.DB.prepare("SELECT r.*, a.enc, a.acct_type FROM orders r JOIN authorizations a ON a.id = r.auth_id WHERE r.key=? AND r.batch_id=? ORDER BY r.id").bind(o.key, batchId).all()).results;
  else {
    rows = (await env.DB.prepare("SELECT r.*, a.enc, a.acct_type FROM orders r JOIN authorizations a ON a.id = r.auth_id WHERE r.key=? AND r.status='authorized' AND (r.batch_id IS NULL OR r.batch_id=0) ORDER BY r.id").bind(o.key).all()).results;
    if (rows.length) {
      const total = rows.reduce((t, r) => t + r.amount, 0);
      const me = await whoami(env, o, req);
      const ins = await env.DB.prepare('INSERT INTO batches (key,count,total,refs,downloaded_by) VALUES (?,?,?,?,?)').bind(o.key, rows.length, total, rows.map(r => r.ref).join(','), (me.name ? me.name + ' ' : '') + '<' + me.email + '>').run();
      batchId = ins.meta.last_row_id;
      await env.DB.prepare(`UPDATE orders SET batch_id=? WHERE id IN (${rows.map(r => r.id).join(',')})`).bind(batchId).run();
    }
  }
  if (!rows.length) return new Response('Nothing to collect.', { status: 400 });
  const pad = (v, n, right = false, ch = ' ') => { v = String(v ?? ''); v = v.length > n ? v.slice(0, n) : v; return right ? v.padStart(n, ch) : v.padEnd(n, ch); };
  const num = (v, n) => pad(String(v).replace(/\D/g, ''), n, true, '0');
  const now = new Date(), yymmdd = now.toISOString().slice(2, 10).replace(/-/g, ''), hhmm = now.toISOString().slice(11, 16).replace(':', '');
  const eff = new Date(now.getTime() + 864e5).toISOString().slice(2, 10).replace(/-/g, '');
  const dest = num(o.odfi_routing, 9), origin = pad(('1' + o.company_id.replace(/\D/g, '')).slice(0, 10), 10, true, '0');
  const coName = pad((o.entity || '').toUpperCase(), 16), coId = pad(o.company_id.replace(/\D/g, '').slice(0, 10), 10);
  const lines = [];
  lines.push('101 ' + dest + origin + yymmdd + hhmm + 'A094101' + pad((o.bank || 'BANK').toUpperCase(), 23) + pad((o.entity || '').toUpperCase(), 23) + pad('', 8));
  lines.push('5225' + coName + pad('', 20) + coId + 'PPD' + pad('PAYMENT', 10) + pad('', 6) + eff + pad('', 3) + '1' + dest.slice(0, 8) + num(1, 7));
  let hash = 0, total = 0, seq = 0;
  for (const r of rows) {
    const d = JSON.parse(await decrypt(env, r.enc)); seq++;
    const tc = r.acct_type === 'savings' ? '37' : '27';
    hash += Number(d.routing.slice(0, 8)); total += Math.round(r.amount * 100);
    lines.push('6' + tc + d.routing.slice(0, 8) + d.routing.slice(8, 9) + pad(d.account, 17) + num(Math.round(r.amount * 100), 10) + pad(r.ref, 15) + pad(r.name.toUpperCase(), 22) + '  ' + '0' + dest.slice(0, 8) + num(seq, 7));
  }
  const bh = num(hash % 10000000000, 10);
  lines.push('8225' + num(seq, 6) + bh + num(total, 12) + num(0, 12) + coId + pad('', 19) + pad('', 6) + dest.slice(0, 8) + num(1, 7));
  const blocks = Math.ceil((lines.length + 1) / 10);
  lines.push('9' + num(1, 6) + num(blocks, 6) + num(seq, 8) + bh + num(total, 12) + num(0, 12) + pad('', 39));
  while (lines.length % 10) lines.push('9'.repeat(94));
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/plain', 'content-disposition': `attachment; filename="achplug-file-${batchId}-${now.toISOString().slice(0, 10)}.ach"` } });
}

/* ---------------- signup ---------------- */
function signupForm(msg = '', paid = false) {
  return (paid ? `<h1>Payment received. Create your login.</h1><p class="lead">Thank you. Choose the email and password you will use to open your dashboard — that is where your code, your orders and your Sales Journal live.</p>` : `<h1>Get started</h1><p class="lead">You get one line of code to paste on your site, and a dashboard here where your orders land.</p>`) + msg + `
  <form method="post" class="card">
    <label>Your email<input name="email" type="email" required></label>
    <label>Your website<input name="site" placeholder="https://" ></label><label>Choose a password (8 characters or more)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <button class="primary">Create my dashboard</button>
  </form>
  <h2>Already have a dashboard?</h2><p class="lead"><a href="/login">Log in</a> with your email and password.</p><p class="lead" style="display:none">
  </p>`;
}
async function signupPost(req, env) {
  const f = await req.formData(); const email = String(f.get('email') || '').trim(), site = String(f.get('site') || '').trim(), pw = String(f.get('password') || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return page('Sign up', signupForm('<p class="err">That email does not look right.</p>'), 200, pubNav);
  if (pw.length < 8) return page('Sign up', signupForm('<p class="err">Password must be at least 8 characters.</p>'), 200, pubNav);
  const pwHash = await hashPw(pw);
  const key = rnd(10), secret = rnd(24);
  const prefix = (site.replace(/^https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]/gi, '').slice(0, 2) || 'AP').toUpperCase();
  await env.DB.prepare('INSERT INTO owners (key,secret,email,site,prefix,password) VALUES (?,?,?,?,?,?)').bind(key, secret, email, site, prefix, pwHash).run();
  const link = `${env.SITE}/dashboard?s=${secret}`;
  await sendMail(env, email, 'Your ACHplug dashboard', `Log in any time at ${env.SITE}/login with your email and the password you chose.\nYour site key (safe to put on a page): ${key}`);
  return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard?new=1`, 'set-cookie': `achplug_s=${secret}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax` } });
}

async function recover(req, env) {
  const f = await req.formData(); const email = String(f.get('email') || '').trim();
  const rows = (await env.DB.prepare('SELECT secret,site FROM owners WHERE email=?').bind(email).all()).results;
  if (rows.length) await sendMail(env, email, 'Your ACHplug dashboard link', rows.map(r => `${r.site || 'Your dashboard'}: ${env.SITE}/dashboard?s=${r.secret}`).join('\n') + '\n\nKeep these private — each one is a login.');
  return page('Sent', `<h1>If that email has a dashboard, the link is on its way.</h1><p class="lead">Check your inbox and spam folder. <a href="/signup">Back</a></p>`, 200, pubNav);
}

function deskNav(secret, cur, o) {
  const items = [['sites', (o && o.site ? esc(o.site.replace(/^https?:\/\/(www\.)?/, '')) : 'Your sites') + ' ▾', `/dashboard/sites`], ['desk', 'Dashboard', `/dashboard?s=${secret}`], ['collect', 'Collect', `/dashboard/collect?s=${secret}`], ['journal', 'Sales Journal', `/dashboard/register?s=${secret}`], ['settings', 'Settings', `/dashboard?s=${secret}#settings`], ['team', 'Team', '/dashboard/team'], ['help', 'Help', 'https://achplug.com/help-collect.html'], ['logout', 'Log out', '/logout']];
  return '<nav class="nav">' + items.map(([k, l, h]) => `<a class="${k === cur ? 'on' : ''}" href="${esc(h)}"${k === 'help' ? ' target="_blank" rel="noopener"' : ''}>${l}</a>`).join('') + '</nav>';
}
const pubNav = '<nav class="nav"><a href="https://achplug.com/">Home</a><a href="https://achplug.com/features.html">Features</a><a href="/me/find">Find my payments</a><a href="/login">Log in</a><a href="/signup">Sign up</a></nav>';

/* ---------------- recurring: reminders, payer controls, owner view ---------------- */
async function collectDaily(env) {
  let sent = 0, setup = 0;
  const sellers = (await env.DB.prepare("SELECT o.*, COUNT(r.id) n, SUM(r.amount) t FROM owners o JOIN orders r ON r.key = o.key AND r.status='authorized' WHERE (o.collect IS NULL OR o.collect='pull') GROUP BY o.key").all()).results;
  for (const o of sellers) {
    if ((o.collect_mode || 'file') === 'api') { await apiCollect(env, o); continue; }
    if (!o.company_id || !o.odfi_routing) { setup++; await sendMail(env, o.email, `${o.n} payment${o.n > 1 ? 's' : ''} waiting to collect — setup needed`, `${o.n} customer payment${o.n > 1 ? 's' : ''} (${money(o.t)}) are authorized and waiting. To collect them, enter your Company ID and origination routing number: ${env.SITE}/dashboard?s=${o.secret}#settings\n\nHow to set this up with your bank: https://achplug.com/help-collect.html`); continue; }
    await sendMail(env, o.email, `Today's collection: ${o.n} payment${o.n > 1 ? 's' : ''}, ${money(o.t)}`,
`Your bank file for today is ready.

1. Download it: ${env.SITE}/dashboard/file?s=${o.secret}
2. Upload it on your bank's ACH origination page.
3. Then press this so ACHplug knows it went: ${env.SITE}/dashboard/collect?s=${o.secret}

When the money shows in your account, open Collect and press Received on each one — that sends the customer's receipt.

Collect page: ${env.SITE}/dashboard/collect?s=${o.secret}`); sent++;
  }
  return `collection emails: ${sent} sent, ${setup} setup reminders, ${sellers.length} sellers with approvals`;
}
// API adapter slot — fully automatic collection through a bank-rail partner. Not connected until a partner is chosen.
async function apiCollect(env, o) {
  if (!env.RAIL_PARTNER) { await sendMail(env, o.email, 'Automatic collection is not connected yet', `Your dashboard is set to Automatic, which is not available yet. Switch to "file" in Settings → 6 to collect today's ${o.n} payment${o.n > 1 ? 's' : ''} by upload.`); return; }
  // when a partner is chosen: for each authorized order → decrypt → partner.createDebit(...) → mark 'collecting' with partner id; webhook → 'paid' / 'cancelled'
}
async function remind(env) {
  const c = await collectDaily(env);
  // pull-mode repeats: create the next authorized debit when due
  const dueAuth = (await env.DB.prepare("SELECT * FROM authorizations WHERE status='active' AND interval<>'' AND next_due IS NOT NULL AND next_due <= date('now')").all()).results;
  for (const a of dueAuth) {
    const ref = a.ref + '-' + a.next_due.replace(/-/g, '').slice(2);
    await env.DB.prepare("INSERT OR IGNORE INTO orders (key,ref,name,email,product,sku,amount,ip,status,auth_id) VALUES (?,?,?,?,?,?,?,?,'authorized',?)").bind(a.key, ref, a.name, a.email, a.product, a.sku, a.amount, 'plan', a.id).run();
    const done = (a.done || 1) + 1, nd = nextDue(a.next_due + 'T12:00:00Z', a.interval);
    const finished = (a.end_count && done >= a.end_count) || (a.end_date && nd > a.end_date);
    await env.DB.prepare('UPDATE authorizations SET done=?, next_due=?, status=? WHERE id=?').bind(done, nd, finished ? 'finished' : 'active', a.id).run();
    const o = await env.DB.prepare('SELECT email,entity FROM owners WHERE key=?').bind(a.key).first();
    await sendMail(env, a.email, `Coming up: ${money(a.amount)} to ${o.entity}`, `Your ${a.interval} payment of ${money(a.amount)} to ${o.entity} for ${a.product} is being collected from your ${a.bank_name} account ending ${a.last4}, as you authorized.\nReference: ${ref}\n\nYou can pause or stop this any time:` + await meLine(env, a.email), o.email);
  }
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const due = (await env.DB.prepare("SELECT p.*, o.entity, o.routing, o.account, o.bank, o.days, o.email owner_email, o.site, o.prefix FROM plans p JOIN owners o ON o.key = p.key WHERE p.status='active' AND p.next_due <= ? AND (p.reminded IS NULL OR p.reminded < p.next_due)").bind(soon).all()).results;
  for (const p of due) {
    const ref = p.ref + '-' + p.next_due.replace(/-/g, '').slice(2);
    await env.DB.prepare('INSERT OR IGNORE INTO orders (key,ref,name,email,product,sku,amount,ip,plan_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(p.key, ref, p.name, p.email, p.product, p.sku, p.amount, 'plan', p.id).run();
    const body = `Reminder: your ${p.interval} payment of ${money(p.amount)} to ${p.entity} is due ${p.next_due}.

If you set up a repeating transfer at your bank, nothing to do — this is just so you know it is coming.
If you send each one by hand, here is the slip:

Pay to: ${p.entity}
Routing: ${p.routing}   Account: ${p.account}
Amount: ${money(p.amount)}
Reference (put in the memo): ${ref}

You are in control of this. ACHplug cannot charge you — it only reminds. Pause, resume or stop the reminders any time here:
${env.SITE}/plan?p=${p.token}

${p.site || env.SITE}`;
    await sendMail(env, p.email, `Coming up: ${money(p.amount)} to ${p.entity} on ${p.next_due}`, body + await meLine(env, p.email), p.owner_email);
    const done = (p.done || 1) + 1, nd = nextDue(p.next_due + 'T12:00:00Z', p.interval);
    const finished = (p.end_count && done >= p.end_count) || (p.end_date && nd > p.end_date);
    await env.DB.prepare('UPDATE plans SET reminded=?, next_due=?, done=?, status=? WHERE id=?').bind(p.next_due, nd, done, finished ? 'finished' : 'active', p.id).run();
  }
  return c + `; ${due.length} push reminders`;
}
async function planPage(u, env, msg = '') {
  const p = await env.DB.prepare('SELECT p.*, o.entity, o.site FROM plans p JOIN owners o ON o.key = p.key WHERE p.token=?').bind(u.searchParams.get('p') || '').first();
  if (!p) return page('Not found', '<h1>No plan at that link.</h1>', 404, pubNav);
  const st = { active: 'Active', paused: 'Paused', stopped: 'Stopped', finished: 'Finished' }[p.status] || p.status;
  const ends = p.end_count ? `for ${p.end_count} payments (${p.done || 1} so far)` : p.end_date ? `until ${p.end_date}` : 'until you stop it';
  const btn = (to, l, cls = '') => `<form method="post" action="/plan" style="display:inline"><input type="hidden" name="p" value="${esc(p.token)}"><button name="to" value="${to}" class="${cls}">${l}</button></form> `;
  return page('Your repeating payment', `<h1>Your repeating payment</h1>${msg}<div class="card"><p><b>${money(p.amount)} ${p.interval}</b> to ${esc(p.entity)} for ${esc(p.product)}, ${esc(ends)}</p><p>Status: <b>${st}</b>${p.status === 'active' ? ` · next reminder for ${esc(p.next_due)}` : ''}</p>
    <p class="lead">You are in control. ACHplug cannot charge you — it has no access to your account. All it does is send reminders, and you can pause or stop them here with one press. If you set up a repeating transfer at your own bank, change that at your bank too.</p>
    ${p.status === 'active' ? btn('paused', 'Pause') + btn('stopped', 'Stop', '') : p.status === 'paused' ? btn('active', 'Resume', 'primary') + btn('stopped', 'Stop') : btn('active', 'Start again', 'primary')}</div>`, 200, pubNav);
}
async function planPost(req, env) {
  const f = await req.formData(); const tok = String(f.get('p') || ''), to = String(f.get('to') || '');
  if (!['active', 'paused', 'stopped'].includes(to)) return new Response('No.', { status: 400 });
  const p = await env.DB.prepare('SELECT p.*, o.email owner_email, o.entity FROM plans p JOIN owners o ON o.key = p.key WHERE p.token=?').bind(tok).first();
  if (!p) return new Response('No.', { status: 404 });
  const nd = to === 'active' && p.status !== 'active' ? nextDue(new Date(), p.interval) : p.next_due;
  await env.DB.prepare('UPDATE plans SET status=?, next_due=?, reminded=NULL WHERE id=?').bind(to, nd, p.id).run();
  await sendMail(env, p.owner_email, `${p.name} ${to === 'stopped' ? 'stopped' : to === 'paused' ? 'paused' : 'resumed'} their ${p.interval} ${money(p.amount)} for ${p.product}`, `${p.name} <${p.email}> ${to} the repeating payment ${p.ref}.`);
  return planPage(new URL(`${env.SITE}/plan?p=${tok}`), env, `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1">Done — it is now <b>${to}</b>.</div>`);
}
async function planOwner(req, env) {
  const f = await req.formData(); const s = f.get('s') || '', id = Number(f.get('id')), to = String(f.get('to') || '');
  const o = await env.DB.prepare('SELECT key FROM owners WHERE secret=?').bind(s).first(); if (!o || !['active', 'paused', 'stopped'].includes(to)) return new Response('No.', { status: 403 });
  await env.DB.prepare('UPDATE plans SET status=? WHERE id=? AND key=?').bind(to, id, o.key).run();
  return Response.redirect(`${env.SITE}/dashboard?s=${s}#plans`, 303);
}
function plansTable(plans, secret) {
  if (!plans.length) return '<p>None yet. When a customer selects "repeat this payment" in the box, the plan appears here.</p>';
  return `<table><tr><th>Ref</th><th>Customer</th><th>Product</th><th>Amount</th><th>Every</th><th>Ends</th><th>Next due</th><th>Status</th><th></th></tr>${plans.map(p => `<tr><td><code>${esc(p.ref)}</code></td><td>${esc(p.name)}<br><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td><td>${esc(p.product)}</td><td>${money(p.amount)}</td><td>${esc(p.interval)}</td><td>${p.end_count ? esc(p.done || 1) + ' of ' + esc(p.end_count) : p.end_date ? esc(p.end_date) : 'when stopped'}</td><td>${esc(p.next_due)}</td><td class="${p.status === 'active' ? 'paid' : p.status === 'paused' ? 'awaiting' : 'cancelled'}">${esc(p.status)}</td>
    <td><form method="post" action="/dashboard/plan"><input type="hidden" name="s" value="${esc(secret)}"><input type="hidden" name="id" value="${p.id}">${p.status !== 'stopped' ? `<button name="to" value="stopped" class="small">Stop</button>` : `<button name="to" value="active" class="small">Restart</button>`}</form></td></tr>`).join('')}</table>`;
}

/* ---------------- buyer page: /me ---------------- */
function meFindForm(msg = '') { return `<h1>Find my payments</h1><p class="lead">Enter the email you used when you paid and we will send you your page.</p>${msg}<form method="post" action="/me/find" class="card"><label>Your email<input name="email" type="email" required></label><button class="primary">Send my link</button></form>`; }
async function meFind(req, env) {
  const f = await req.formData(); const email = String(f.get('email') || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) await sendMail(env, email, 'Your ACHplug payments page', 'Here is your page. It is private to this email address.' + await meLine(env, email));
  return page('Sent', `<h1>If we have payments for that email, the link is on its way.</h1><p class="lead">Check your inbox and spam folder.</p>`, 200, pubNav);
}
async function meAuth(u, env) { const e = (u.searchParams.get('e') || '').trim(), t = u.searchParams.get('t') || ''; return e && t === await meToken(env, e) ? e : null; }
async function mePage(u, env, msg = '') {
  const email = await meAuth(u, env); if (!email) return page('Not found', '<h1>That link does not work.</h1><p class="lead"><a href="/me/find">Get a new one</a>.</p>', 403, pubNav);
  const plans = (await env.DB.prepare('SELECT p.*, o.entity, o.site FROM plans p JOIN owners o ON o.key = p.key WHERE lower(p.email)=lower(?) ORDER BY p.id DESC').bind(email).all()).results;
  const orders = (await env.DB.prepare('SELECT r.*, o.entity, o.site, o.routing, o.account, o.bank FROM orders r JOIN owners o ON o.key = r.key WHERE lower(r.email)=lower(?) ORDER BY r.id DESC LIMIT 100').bind(email).all()).results;
  const self = `/me?e=${encodeURIComponent(email)}&t=${esc(u.searchParams.get('t'))}`;
  const btn = (id, to, l, cls = '') => `<form method="post" action="/me" style="display:inline"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(u.searchParams.get('t'))}"><input type="hidden" name="id" value="${id}"><button name="to" value="${to}" class="small ${cls}">${l}</button></form> `;
  let b = `<h1>Your payments</h1><p class="lead">${esc(email)} · This page is private to you. ACHplug cannot charge you — everything here is money you send from your own bank.</p>${msg}`;
  const auths = (await env.DB.prepare('SELECT a.*, o.entity, o.site FROM authorizations a JOIN owners o ON o.key = a.key WHERE lower(a.email)=lower(?) ORDER BY a.id DESC').bind(email).all()).results;
  if (auths.length) b += `<h2>Payments you have authorized</h2><table><tr><th>To</th><th>For</th><th>Amount</th><th>From</th><th>Repeats</th><th>Status</th><th></th></tr>${auths.map(a => `<tr><td>${esc(a.entity)}</td><td>${esc(a.product)}</td><td>${money(a.amount)}</td><td>${esc(a.bank_name)} ····${esc(a.last4)}</td><td>${a.interval ? esc(a.interval) + (a.end_count ? ', ' + esc(a.done || 1) + ' of ' + esc(a.end_count) : a.end_date ? ' until ' + esc(a.end_date) : '') : 'once'}</td><td class="${a.status === 'active' ? 'paid' : 'cancelled'}">${esc(a.status)}</td><td>${a.status === 'active' ? `<form method="post" action="/me" style="display:inline"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(u.searchParams.get('t'))}"><input type="hidden" name="auth" value="${a.id}"><button name="to" value="revoked" class="small">Revoke</button></form>` : ''}</td></tr>`).join('')}</table><p class="lead">Revoking stops any payment not yet sent to the bank and all future repeats. Your bank details stay encrypted and are deleted when the authorization ends.</p>`;
  b += `<h2>Repeating payments</h2>` + (plans.length ? `<table><tr><th>To</th><th>For</th><th>Amount</th><th>Every</th><th>Ends</th><th>Status</th><th></th></tr>${plans.map(p => `<tr><td>${esc(p.entity)}<br><small>${esc(p.site || '')}</small></td><td>${esc(p.product)}</td><td>${money(p.amount)}</td><td>${esc(p.interval)}</td><td>${p.end_count ? esc(p.done || 1) + ' of ' + esc(p.end_count) : p.end_date ? esc(p.end_date) : 'when you stop it'}</td><td class="${p.status === 'active' ? 'paid' : p.status === 'paused' ? 'awaiting' : 'cancelled'}">${esc(p.status)}</td>
    <td>${p.status === 'active' ? btn(p.id, 'paused', 'Pause') + btn(p.id, 'stopped', 'Stop') : p.status === 'paused' ? btn(p.id, 'active', 'Resume', 'primary') + btn(p.id, 'stopped', 'Stop') : btn(p.id, 'active', 'Start again', 'primary')}</td></tr>`).join('')}</table>` : '<p>None.</p>');
  const wait = orders.filter(r => r.status === 'awaiting'), done = orders.filter(r => r.status === 'paid');
  b += `<h2>Waiting for your transfer</h2>` + (wait.length ? wait.map(r => `<div class="card" style="margin-bottom:10px"><b>${money(r.amount)}</b> to ${esc(r.entity)} for ${esc(r.product)} · reference <code>${esc(r.ref)}</code><br><small>Pay to: ${esc(r.entity)} · ${esc(r.bank)} · Routing ${esc(r.routing)} · Account ${esc(r.account)} · Memo ${esc(r.ref)}</small><br><small>If you already sent it, nothing to do — it shows as received once it lands.</small></div>`).join('') : '<p>Nothing waiting.</p>');
  b += `<h2>Receipts</h2>` + (done.length ? `<table><tr><th>Date</th><th>To</th><th>For</th><th>Amount</th><th>Reference</th></tr>${done.map(r => `<tr><td>${esc((r.paid_at || r.created).slice(0, 10))}</td><td>${esc(r.entity)}</td><td>${esc(r.product)}</td><td>${money(r.amount)}</td><td><code>${esc(r.ref)}</code></td></tr>`).join('')}</table>` : '<p>None yet.</p>');
  b += `<p class="lead" style="margin-top:20px">Bookmark this page, or get the link again any time at <a href="/me/find">Find my payments</a>.</p>`;
  b += `<div class="card" style="margin-top:26px;border-color:var(--green)"><h2 style="margin-top:0">Do you have a website?</h2>
    <p><b>Take bank payments on it, the way you just paid here.</b> No card processor, no percentage, nobody who can hold your money. One-time or repeating. $25 once. <a href="https://achplug.com/?from=buyer" target="_blank" rel="noopener">See ACHplug →</a></p>
    <p style="margin-top:10px"><b>Earn from your pages.</b> AdHotBox puts ads on your site and pays you — one line of code, no minimums. <a href="https://adhotbox.com/?from=achplug" target="_blank" rel="noopener">Register or advertise →</a></p></div>`;
  return page('Your payments', b, 200, pubNav);
}
async function mePost(req, env) {
  const f = await req.formData(); const email = String(f.get('e') || ''), t = String(f.get('t') || ''), id = Number(f.get('id')), to = String(f.get('to') || '');
  if (t !== await meToken(env, email)) return new Response('No.', { status: 403 });
  if (to === 'revoked' && f.get('auth')) {
    const aid = Number(f.get('auth'));
    const a = await env.DB.prepare('SELECT a.*, o.email owner_email FROM authorizations a JOIN owners o ON o.key = a.key WHERE a.id=? AND lower(a.email)=lower(?)').bind(aid, email).first();
    if (!a) return new Response('No.', { status: 404 });
    await env.DB.prepare("UPDATE authorizations SET status='revoked', enc='' WHERE id=?").bind(aid).run();
    await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE auth_id=? AND status='authorized'").bind(aid).run();
    await sendMail(env, a.owner_email, `${a.name} revoked their authorization ${a.ref}`, `${a.name} <${a.email}> revoked the payment authorization ${a.ref} (${money(a.amount)}${a.interval ? ' ' + a.interval : ''}). Anything not yet sent to the bank is cancelled.`);
    return mePage(new URL(`${env.SITE}/me?e=${encodeURIComponent(email)}&t=${t}`), env, `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1">Revoked. Nothing further will be collected.</div>`);
  }
  if (!['active', 'paused', 'stopped'].includes(to)) return new Response('No.', { status: 403 });
  const p = await env.DB.prepare('SELECT p.*, o.email owner_email FROM plans p JOIN owners o ON o.key = p.key WHERE p.id=? AND lower(p.email)=lower(?)').bind(id, email).first();
  if (!p) return new Response('No.', { status: 404 });
  const nd = to === 'active' && p.status !== 'active' ? nextDue(new Date(), p.interval) : p.next_due;
  await env.DB.prepare('UPDATE plans SET status=?, next_due=?, reminded=NULL WHERE id=?').bind(to, nd, p.id).run();
  await sendMail(env, p.owner_email, `${p.name} ${to} their ${p.interval} ${money(p.amount)} for ${p.product}`, `${p.name} <${p.email}> set the repeating payment ${p.ref} to ${to}.`);
  return mePage(new URL(`${env.SITE}/me?e=${encodeURIComponent(email)}&t=${t}`), env, `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1">Done — it is now <b>${to}</b>.</div>`);
}

/* ---------------- one login, many sites ---------------- */
async function sites(u, env, req, msg = '') {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const all = (await env.DB.prepare('SELECT key,secret,site,entity,created,closed, (SELECT COUNT(*) FROM orders r WHERE r.key=owners.key AND r.status IN (\'authorized\',\'awaiting\',\'collecting\')) open, (SELECT COUNT(*) FROM orders r WHERE r.key=owners.key) total FROM owners WHERE lower(email)=lower(?) ORDER BY closed, created').bind(o.email).all()).results;
  let b = `<h1>Your sites</h1><p class="lead">${esc(o.email)} · one login, ${all.length} site${all.length === 1 ? '' : 's'}. Each has its own bank details, code, Collect and journal.</p>${msg}`;
  b += `<table><tr><th>Site</th><th>Payee</th><th>Open payments</th><th></th></tr>${all.map(x => `<tr><td><b>${esc(x.site || '(no site name)')}</b>${x.secret === o.secret ? ' <span class="badge" style="background:var(--green)">current</span>' : ''}${x.closed ? ' <span class="badge" style="background:#888">closed</span>' : ''}</td><td>${esc(x.entity || '—')}</td><td>${x.open}</td><td style="white-space:nowrap"><a class="btn" style="padding:6px 12px;font-size:13px" href="/dashboard/switch?to=${esc(x.key)}">Open</a> <form method="post" action="/dashboard/close" style="display:inline"><input type="hidden" name="key" value="${esc(x.key)}">${x.closed ? `<button name="to" value="open" class="small">Reopen</button>` : x.total ? `<button name="to" value="close" class="small" onclick="return confirm('Close ${esc(x.site || 'this site')}? The box stops taking payments and any repeating payments are stopped. The journal and authorizations are kept and the site can be reopened.')">Close</button>` : `<button name="to" value="remove" class="small" onclick="return confirm('Remove ${esc(x.site || 'this site')}? It has no payments, so it can be deleted.')">Remove</button>`}</form></td></tr>`).join('')}</table>
  <p class="lead" style="margin-top:8px">A site that has ever taken a payment can be closed but not deleted — its journal and the customer authorizations stay on record, as bank rules require. A site with no payments can be removed.</p>`;
  b += `<p style="margin-top:12px"><a class="btn" href="/dashboard/all">All sites — one journal, combined totals</a></p>`;
  b += `<h2>Add a site</h2><form method="post" action="/dashboard/sites" class="card"><label>Website address<input name="site" placeholder="https://" required></label><button class="primary">Add it</button></form><p class="lead">The new site starts empty — enter its payee name and bank details on its dashboard, and it gets its own code line.</p>`;
  return page('Your sites', b, 200, deskNav(o.secret, 'sites', o));
}
async function sitesPost(req, env) {
  const f = await req.formData(); const s = f.get('s') || cookieSecret(req);
  const o = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const site = String(f.get('site') || '').trim().slice(0, 200); if (!site) return Response.redirect(`${env.SITE}/dashboard/sites`, 303);
  const key = rnd(10), secret = rnd(24);
  const prefix = (site.replace(/^https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]/gi, '').slice(0, 2) || 'AP').toUpperCase();
  await env.DB.prepare('INSERT INTO owners (key,secret,email,site,prefix,password) VALUES (?,?,?,?,?,?)').bind(key, secret, o.email, site, prefix, o.password || '').run();
  return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard?new=1`, 'set-cookie': setCookie(secret) } });
}
async function switchSite(u, env, req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const t = await env.DB.prepare('SELECT secret FROM owners WHERE key=? AND lower(email)=lower(?)').bind(u.searchParams.get('to') || '', o.email).first();
  if (!t) return Response.redirect(`${env.SITE}/dashboard/sites`, 303);
  return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard`, 'set-cookie': setCookie(t.secret) } });
}

async function allJournal(u, env, req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const rows = (await env.DB.prepare("SELECT r.*, w.site FROM orders r JOIN owners w ON w.key = r.key WHERE lower(w.email)=lower(?) ORDER BY r.id DESC LIMIT 2000").bind(o.email).all()).results;
  const site = x => (x.site || '').replace(/^https?:\/\/(www\.)?/, '');
  if (u.searchParams.get('csv')) {
    const csv = 'site,ref,created,received,status,name,email,product,amount\n' + rows.map(r => [site(r), r.ref, r.created, r.paid_at || '', r.status, r.name, r.email, r.product, r.amount].map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="sales-journal-all-sites-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const paid = rows.filter(r => r.status === 'paid'), sum = a => a.reduce((t, r) => t + r.amount, 0);
  const now = new Date(), day = 864e5, since = d => paid.filter(r => new Date((r.paid_at || r.created).replace(' ', 'T') + 'Z') >= d);
  const wk = since(new Date(now - 7 * day)), mo = since(new Date(now.getFullYear(), now.getMonth(), 1)), yr = since(new Date(now.getFullYear(), 0, 1));
  const open = rows.filter(r => ['awaiting', 'authorized', 'collecting'].includes(r.status));
  const bySite = {}; for (const r of paid) { const k = site(r); (bySite[k] ||= { n: 0, t: 0 }); bySite[k].n++; bySite[k].t += r.amount; }
  let b = `<h1>Sales Journal — all sites</h1><p class="lead">${esc(o.email)} · <a href="/dashboard/sites">Your sites</a> · <a href="/dashboard/all?csv=1">Download CSV (all sites)</a></p>`;
  b += `<div class="grid four"><div class="card"><small>Last 7 days</small><b>${money(sum(wk))}</b><small>${wk.length} payments</small></div><div class="card"><small>This month</small><b>${money(sum(mo))}</b><small>${mo.length}</small></div><div class="card"><small>This year</small><b>${money(sum(yr))}</b><small>${yr.length}</small></div><div class="card"><small>All time</small><b>${money(sum(paid))}</b><small>${paid.length}</small></div></div>`;
  b += `<div class="grid" style="margin-top:12px"><div class="card"><small>Open — not yet received</small><b>${money(sum(open))}</b><small>${open.length}</small></div><div class="card"><small>Card fees you did not pay</small><b>${money(paid.reduce((t, r) => t + r.amount * 0.029 + 0.30, 0))}</b><small>at 2.9% + 30¢</small></div></div>`;
  b += `<h2>By site</h2><table><tr><th>Site</th><th>Payments</th><th>Received</th></tr>${Object.entries(bySite).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${money(v.t)}</td></tr>`).join('') || '<tr><td colspan=3>Nothing received yet.</td></tr>'}</table>`;
  b += `<h2>Every transaction</h2><table><tr><th>Site</th><th>Ref</th><th>Created</th><th>Received</th><th>Status</th><th>Customer</th><th>Product</th><th>Amount</th></tr>${rows.map(r => `<tr><td>${esc(site(r))}</td><td><code>${esc(r.ref)}</code></td><td>${esc(r.created.slice(0, 10))}</td><td>${esc((r.paid_at || '').slice(0, 10))}</td><td class="${r.status}">${esc(r.status)}</td><td>${esc(r.name)}</td><td>${esc(r.product)}</td><td>${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan=8>No payments yet.</td></tr>'}</table>`;
  return page('Sales Journal — all sites', b, 200, deskNav(o.secret, 'sites', o));
}

async function closeSite(req, env) {
  const f = await req.formData(); const s = f.get('s') || cookieSecret(req);
  const me = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (!me) return Response.redirect(`${env.SITE}/login`, 303);
  { const who = await whoami(env, me, req); if (!can(who, 'settings')) return page('Your sites', '<h1>Only the owner can close or remove a site.</h1>', 403); }
  const key = String(f.get('key') || ''), to = String(f.get('to') || '');
  const t = await env.DB.prepare('SELECT * FROM owners WHERE key=? AND lower(email)=lower(?)').bind(key, me.email).first(); if (!t) return Response.redirect(`${env.SITE}/dashboard/sites`, 303);
  const total = (await env.DB.prepare('SELECT COUNT(*) c FROM orders WHERE key=?').bind(key).first()).c;
  if (to === 'close') {
    await env.DB.prepare('UPDATE owners SET closed=1 WHERE key=?').bind(key).run();
    for (const a of (await env.DB.prepare("SELECT * FROM authorizations WHERE key=? AND status='active' AND interval<>''").bind(key).all()).results) {
      await env.DB.prepare("UPDATE authorizations SET status='stopped' WHERE id=?").bind(a.id).run();
      await sendMail(env, a.email, `Your repeating payment to ${t.entity} has ended`, `${t.entity} has closed its payment page, so your ${a.interval} payment of ${money(a.amount)} for ${a.product} will not be collected again. Nothing further is owed through this page.`);
    }
    for (const p of (await env.DB.prepare("SELECT * FROM plans WHERE key=? AND status='active'").bind(key).all()).results) await env.DB.prepare("UPDATE plans SET status='stopped' WHERE id=?").bind(p.id).run();
  } else if (to === 'open') {
    await env.DB.prepare('UPDATE owners SET closed=0 WHERE key=?').bind(key).run();
  } else if (to === 'remove' && total === 0) {
    await env.DB.prepare('DELETE FROM owners WHERE key=?').bind(key).run();
    if (t.secret === s) { const other = await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=lower(?) LIMIT 1').bind(me.email).first(); if (other) return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard/sites`, 'set-cookie': setCookie(other.secret) } }); return Response.redirect(`${env.SITE}/signup`, 303); }
  }
  return Response.redirect(`${env.SITE}/dashboard/sites`, 303);
}

/* ---------------- team ---------------- */
async function team(u, env, req, msg = '') {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const me = await whoami(env, o, req);
  const rows = (await env.DB.prepare("SELECT * FROM team WHERE lower(account)=lower(?) ORDER BY created").bind(o.email).all()).results;
  let b = `<h1>Team</h1><p class="lead">People who can log in to this account. Everything they mark carries their own name.</p>${msg}`;
  b += `<table><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr><tr><td>${esc(o.entity || '')}</td><td>${esc(o.email)}</td><td>owner</td><td class="paid">active</td><td></td></tr>${rows.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.role)}</td><td class="${t.status === 'active' ? (t.password ? 'paid' : 'awaiting') : 'cancelled'}">${t.status === 'active' ? (t.password ? 'active' : 'invited — not set up yet') : 'removed'}</td><td>${me.role === 'owner' && t.status === 'active' ? `<form method="post" action="/dashboard/team" style="display:inline"><input type="hidden" name="id" value="${t.id}"><button name="do" value="remove" class="small" onclick="return confirm('Remove ${esc(t.email)}? They can no longer log in. Their name stays on everything they signed.')">Remove</button></form>` : ''}</td></tr>`).join('')}</table>`;
  b += `<p class="lead" style="margin-top:8px"><b>Owner</b> can do everything. <b>Bookkeeper</b> can collect, download files, mark sent and received — not change settings or close sites. <b>Auditor</b> is read-only: every site, every journal, every bank file and who signed it, every CSV — and cannot press anything that changes a record.</p>`;
  if (me.role === 'owner') b += `<h2>Invite someone</h2><form method="post" action="/dashboard/team" class="card"><label>Their name<input name="name" required></label><label>Their email<input name="email" type="email" required></label><label>Role<select name="role"><option value="bookkeeper">Bookkeeper</option><option value="auditor">Auditor (read-only)</option><option value="owner">Owner</option></select></label><button name="do" value="invite" class="primary">Send the invitation</button></form><p class="lead">They get an email with a link to choose their own password. You never see it.</p>`;
  return page('Team', b, 200, deskNav(o.secret, 'team', o));
}
async function teamPost(req, env) {
  const f = await req.formData(); const s = f.get('s') || cookieSecret(req);
  const o = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const me = await whoami(env, o, req); if (me.role !== 'owner') return page('Team', '<h1>Only the owner can manage the team.</h1>', 403);
  const act = String(f.get('do') || '');
  if (act === 'invite') {
    const name = String(f.get('name') || '').trim().slice(0, 80), email = String(f.get('email') || '').trim().toLowerCase(), role = ['owner', 'bookkeeper', 'auditor'].includes(f.get('role')) ? f.get('role') : 'bookkeeper';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return team(new URL(`${env.SITE}/dashboard/team`), env, req, '<p class="err">Name and a working email, please.</p>');
    const clash = await env.DB.prepare('SELECT 1 FROM owners WHERE lower(email)=? UNION SELECT 1 FROM team WHERE lower(email)=? AND status=\'active\'').bind(email, email).first();
    if (clash) return team(new URL(`${env.SITE}/dashboard/team`), env, req, '<p class="err">That email already has a login.</p>');
    await env.DB.prepare("INSERT INTO team (account,email,name,role,status) VALUES (?,?,?,?,'active')").bind(o.email, email, name, role).run();
    const tok = rnd(24); const exp = new Date(Date.now() + 3 * 864e5).toISOString();
    await env.DB.prepare('INSERT INTO logins (token,secret,expires) VALUES (?,?,?)').bind(tok, 'team:' + email, exp).run();
    await sendMail(env, email, `${o.entity || o.email} added you to ACHplug`, `${name},\n\n${o.entity || o.email} has given you a ${role} login on their ACHplug dashboard.\n\nChoose your password here (the link works for 3 days):\n${env.SITE}/login/set?t=${tok}\n\nAfter that, log in any time at ${env.SITE}/login with this email and your password.`, o.email);
    return team(new URL(`${env.SITE}/dashboard/team`), env, req, `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1">Invitation sent to ${esc(email)}.</div>`);
  }
  if (act === 'remove') { await env.DB.prepare("UPDATE team SET status='removed' WHERE id=? AND lower(account)=lower(?)").bind(Number(f.get('id')), o.email).run(); }
  return Response.redirect(`${env.SITE}/dashboard/team`, 303);
}

/* ---------------- owner desk ---------------- */
async function hashPw(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256));
  const hex = a => [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex(salt) + ':' + hex(bits);
}
async function checkPw(pw, stored) { if (!stored || !stored.includes(':')) return false; const [salt] = stored.split(':'); return (await hashPw(pw, salt)) === stored; }
const setCookie = s => `achplug_s=${s}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`;
function cookieUser(req) { const m = /(?:^|;\s*)achplug_u=([^;]+)/.exec(req.headers.get('cookie') || ''); return m ? decodeURIComponent(m[1]) : ''; }
async function whoami(env, o, req) {
  const ue = req ? cookieUser(req) : '';
  if (ue && ue.toLowerCase() !== (o.email || '').toLowerCase()) { const t = await env.DB.prepare('SELECT * FROM team WHERE lower(email)=lower(?) AND lower(account)=lower(?) AND status=\'active\'').bind(ue, o.email).first(); if (t) return { email: t.email, name: t.name, role: t.role, password: t.password, team: true }; }
  return { email: o.email, name: '', role: 'owner', password: o.password, team: false };
}
const can = (me, what) => me.role === 'owner' || (me.role === 'bookkeeper' && ['collect', 'mark', 'view'].includes(what)) || ((me.role === 'auditor' || me.role === 'viewer') && what === 'view');
function cookieSecret(req) { const m = /(?:^|;\s*)achplug_s=([a-z0-9]+)/.exec(req.headers.get('cookie') || ''); return m ? m[1] : ''; }
async function owner(u, env, req) { const s = u.searchParams.get('s') || (req ? cookieSecret(req) : ''); return env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); }

/* ---------------- Google sign-in (dormant until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set) ---------------- */
const OAUTH = { google: false };
function googleStart(env) {
  if (!env.GOOGLE_CLIENT_ID) return Response.redirect(env.SITE + '/login', 303);
  const st = rnd(24);
  const a = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  a.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  a.searchParams.set('redirect_uri', env.SITE + '/login/google/cb');
  a.searchParams.set('response_type', 'code');
  a.searchParams.set('scope', 'openid email');
  a.searchParams.set('state', st);
  a.searchParams.set('prompt', 'select_account');
  return new Response(null, { status: 303, headers: { location: a.toString(), 'set-cookie': `achplug_st=${st}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax` } });
}
function jwtClaims(tok) {
  const b = String(tok).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - b.length % 4) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}
async function googleBack(u, env, req) {
  const fail = m => page('Log in', loginForm(`<p class="err">${esc(m)}</p>`), 200, pubNav);
  const code = u.searchParams.get('code') || '', st = u.searchParams.get('state') || '';
  const m = /(?:^|;\s*)achplug_st=([a-z0-9]+)/.exec(req.headers.get('cookie') || '');
  if (!code || !m || m[1] !== st) return fail('That sign-in could not be verified. Please try again.');
  let claims;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.SITE + '/login/google/cb', grant_type: 'authorization_code' }) });
    const j = await r.json();
    if (!j.id_token) return fail('Google did not complete the sign-in. Please try again, or use your email and password.');
    claims = jwtClaims(j.id_token);
  } catch (e) { return fail('Could not reach Google. Please use your email and password.'); }
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email || claims.email_verified === false) return fail('Google did not give us a verified email address.');
  const o = await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=? ORDER BY created LIMIT 1').bind(email).first();
  if (o) {
    const n = (await env.DB.prepare('SELECT COUNT(*) c FROM owners WHERE lower(email)=?').bind(email).first()).c;
    return new Response(null, { status: 303, headers: [['location', `${env.SITE}/dashboard${n > 1 ? '/sites' : ''}`], ['set-cookie', setCookie(o.secret)], ['set-cookie', 'achplug_u=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax'], ['set-cookie', 'achplug_st=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
  }
  const t = await env.DB.prepare("SELECT * FROM team WHERE lower(email)=? AND status='active' LIMIT 1").bind(email).first();
  if (t) {
    const acct = await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=lower(?) ORDER BY created LIMIT 1').bind(t.account).first();
    if (acct) return new Response(null, { status: 303, headers: [['location', `${env.SITE}/dashboard/sites`], ['set-cookie', setCookie(acct.secret)], ['set-cookie', `achplug_u=${encodeURIComponent(t.email)}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`], ['set-cookie', 'achplug_st=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
  }
  return fail(`No dashboard is set up for ${email}. Buy ACHplug and your dashboard is created, or sign in with the email you bought it under.`);
}
function loginForm(msg = '') {
  return `<h1>Log in</h1>${msg}
  ${OAUTH.google ? `<a class="gbtn" href="/login/google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.6 5-4.5 7l6.9 5.3C42.5 36.2 45 30.7 45 24z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-6.9-5.3c-1.9 1.3-4.4 2.2-7.7 2.2-5.9 0-10.9-3.9-12.7-9.2l-7.2 5.5C7.7 41 15.2 46 24 46z"/><path fill="#FBBC05" d="M11.3 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-2.9.7-4.3l-7.2-5.5C2.7 17 2 20.4 2 24s.7 7 2.1 9.8l7.2-5.5z"/><path fill="#EA4335" d="M24 10.6c3.3 0 5.6 1.4 6.9 2.6l5.1-5C32.9 5.4 28 3 24 3c-8.8 0-16.3 5-20 12.2l7.2 5.5c1.9-5.3 6.9-9.1 12.8-9.1z"/></svg> Continue with Google</a><div class="or"><span>or use your email and password</span></div>` : ''}
  <form method="post" action="/login" class="card"><label>Your email<input name="email" type="email" required autofocus autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Log in</button></form>
  <div class="buyers"><b>Only buyers get access to login.</b><a class="btn" href="https://achplug.com/#buy">Buy now</a></div>
  <p class="lead" style="margin-top:14px"><a href="/login/forgot">Forgot your password?</a> &nbsp;·&nbsp; New here? <a href="/signup">Create your dashboard</a>.</p>`;
}
function forgotForm(msg = '') {
  return `<h1>Reset your password</h1><p class="lead">Enter your email. We send a link; press it and choose a new password.</p>${msg}
  <form method="post" action="/login/forgot" class="card"><label>Your email<input name="email" type="email" required autofocus></label><button class="primary">Email me the link</button></form>`;
}
async function loginPost(req, env) {
  const f = await req.formData(); const email = String(f.get('email') || '').trim().toLowerCase(), pw = String(f.get('password') || '');
  let o = await env.DB.prepare('SELECT secret,password FROM owners WHERE lower(email)=? LIMIT 1').bind(email).first();
  if (!o) {
    const t = await env.DB.prepare("SELECT * FROM team WHERE lower(email)=? AND status='active' LIMIT 1").bind(email).first();
    if (t) { const acct = await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=lower(?) ORDER BY created LIMIT 1').bind(t.account).first();
      if (!t.password) return page('Log in', loginForm('<p class="err">Your invitation is waiting — <a href="/login/forgot">set your password here</a>.</p>'), 200, pubNav);
      if (!(await checkPw(pw, t.password))) return page('Log in', loginForm('<p class="err">Wrong password. <a href="/login/forgot">Reset it</a>.</p>'), 200, pubNav);
      return new Response(null, { status: 303, headers: [['location', `${env.SITE}/dashboard/sites`], ['set-cookie', setCookie(acct.secret)], ['set-cookie', `achplug_u=${encodeURIComponent(t.email)}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
    }
    return page('Log in', loginForm('<p class="err">No dashboard with that email. <a href="/signup">Create one</a>.</p>'), 200, pubNav);
  }
  if (!o.password) return page('Log in', loginForm(`<p class="err">This dashboard has no password yet. <a href="/login/forgot">Set one here</a> — we email you a link.</p>`), 200, pubNav);
  if (!(await checkPw(pw, o.password))) return page('Log in', loginForm('<p class="err">Wrong password. <a href="/login/forgot">Reset it</a>.</p>'), 200, pubNav);
  const n = (await env.DB.prepare('SELECT COUNT(*) c FROM owners WHERE lower(email)=?').bind(email).first()).c;
  return new Response(null, { status: 303, headers: [['location', `${env.SITE}/dashboard${n > 1 ? '/sites' : ''}`], ['set-cookie', setCookie(o.secret)], ['set-cookie', 'achplug_u=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax']] });
}
async function forgotPost(req, env) {
  const f = await req.formData(); const email = String(f.get('email') || '').trim().toLowerCase();
  let rows = (await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=?').bind(email).all()).results;
  if (!rows.length) { const t = await env.DB.prepare("SELECT email FROM team WHERE lower(email)=? AND status='active'").bind(email).first(); if (t) rows = [{ secret: 'team:' + t.email }]; }
  if (rows.length) {
    const tok = rnd(24); const exp = new Date(Date.now() + 30 * 60000).toISOString();
    await env.DB.prepare('INSERT INTO logins (token,secret,expires) VALUES (?,?,?)').bind(tok, rows[0].secret, exp).run();
    await sendMail(env, email, 'Set your ACHplug password', `Press this to choose your password:\n\n${env.SITE}/login/set?t=${tok}\n\nIt works once, for 30 minutes. If you did not ask for it, ignore this email.`);
  }
  return page('Check your email', `<h1>Check your email.</h1><p class="lead">If ${esc(email)} has a dashboard, a link is on its way. It works for 30 minutes. Look in spam if it is not there in a minute.</p>`, 200, pubNav);
}
async function setPwForm(u, env, msg = '') {
  const t = u.searchParams.get('t') || '';
  const row = await env.DB.prepare("SELECT secret FROM logins WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!row) return page('Reset your password', forgotForm('<p class="err">That link has expired or was already used. Ask for a new one.</p>'), 200, pubNav);
  return page('Choose a password', `<h1>Choose a password</h1>${msg}<form method="post" action="/login/set" class="card"><input type="hidden" name="t" value="${esc(t)}"><label>New password (8 characters or more)<input name="password" type="password" minlength="8" required autofocus autocomplete="new-password"></label><label>Type it again<input name="password2" type="password" minlength="8" required autocomplete="new-password"></label><button class="primary">Save password and log in</button></form>`, 200, pubNav);
}
async function setPwPost(req, env) {
  const f = await req.formData(); const t = String(f.get('t') || ''), p1 = String(f.get('password') || ''), p2 = String(f.get('password2') || '');
  const row = await env.DB.prepare("SELECT secret FROM logins WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!row) return page('Reset your password', forgotForm('<p class="err">That link has expired or was already used.</p>'), 200, pubNav);
  if (p1.length < 8 || p1 !== p2) return setPwForm(new URL(`${env.SITE}/login/set?t=${t}`), env, '<p class="err">Passwords must match and be at least 8 characters.</p>');
  await env.DB.prepare('DELETE FROM logins WHERE token=?').bind(t).run();
  if (row.secret.startsWith('team:')) {
    const em = row.secret.slice(5); await env.DB.prepare('UPDATE team SET password=? WHERE lower(email)=lower(?)').bind(await hashPw(p1), em).run();
    const tm = await env.DB.prepare('SELECT account FROM team WHERE lower(email)=lower(?)').bind(em).first(); const acct = await env.DB.prepare('SELECT secret FROM owners WHERE lower(email)=lower(?) ORDER BY created LIMIT 1').bind(tm.account).first();
    return new Response(null, { status: 303, headers: [['location', `${env.SITE}/dashboard/sites`], ['set-cookie', setCookie(acct.secret)], ['set-cookie', `achplug_u=${encodeURIComponent(em)}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`]] });
  }
  const who = await env.DB.prepare('SELECT email FROM owners WHERE secret=?').bind(row.secret).first();
  await env.DB.prepare('UPDATE owners SET password=? WHERE lower(email)=lower(?)').bind(await hashPw(p1), who.email).run();
  return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard`, 'set-cookie': setCookie(row.secret) } });
}
async function loginGo(u, env) {
  const t = u.searchParams.get('t') || '';
  const row = await env.DB.prepare("SELECT secret FROM logins WHERE token=? AND expires > datetime('now')").bind(t).first();
  if (!row) return page('Log in', loginForm('<p class="err">That link has expired or was already used. Ask for a new one.</p>'), 200, pubNav);
  await env.DB.prepare('DELETE FROM logins WHERE token=?').bind(t).run();
  return new Response(null, { status: 303, headers: { location: `${env.SITE}/dashboard`, 'set-cookie': `achplug_s=${row.secret}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax` } });
}
async function desk(u, env, req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303); if (false) return page('Desk', '<h1>No dashboard at that link.</h1><p><a href="/signup">Sign up</a> to get one.</p>', 403);
  const rows = (await env.DB.prepare("SELECT * FROM orders WHERE key=? AND status='awaiting' ORDER BY id DESC LIMIT 200").bind(o.key).all()).results;
  const waiting = rows.length;
  const cnt = await env.DB.prepare("SELECT COUNT(*) n, SUM(status='paid') p FROM orders WHERE key=?").bind(o.key).first();
  const line = `&lt;script src="${esc(env.SITE)}/plug.js" data-key="${esc(o.key)}" data-name="What you sell" data-price="20" data-desc="One line about it"&gt;&lt;/script&gt;`;
  const ready = o.routing && o.account && o.entity;
  const isDon = o.mode === 'donation';
  const ack = o.ack_tpl || DEF_ACK, rec = o.receipt_tpl || (isDon ? DEF_RECEIPT_DONATION : DEF_RECEIPT);
  const settings = `<form method="post" action="/dashboard/settings" class="card" id="setf"><input type="hidden" name="s" value="${esc(o.secret)}">
    <h3>1. What is this box for?</h3>
    <div class="tiles">
      <label class="tile"><input type="radio" name="mode" value="sale"${!isDon ? ' checked' : ''}><b>Selling something</b><span>The customer pays a price. You can give a discount for paying from the bank.</span></label>
      <label class="tile"><input type="radio" name="mode" value="donation"${isDon ? ' checked' : ''}><b>Taking donations</b><span>The donor picks the amount. No discount. The receipt carries your tax ID.</span></label>
    </div>
    <h3>2. Where the money goes</h3>
    ${fld('entity', 'Pay to — your legal name, exactly as your bank has it', o.entity)}${fld('bank', 'Bank name — filled in for you from the routing number when you save', o.bank)}${fld('routing', 'Routing number — nine digits, bottom left of your checks; looked up in the bank database when you save', o.routing)}${fld('account', 'Account number (a receiving-only account if your bank offers one)', o.account)}
    <div class="only-sale">${fld('discount', 'Discount for paying from the bank, % — 0 to 90, any number', o.discount, 'number')}</div>
    <div class="only-don">${fld('ein', 'Tax ID / EIN — printed on every donation receipt', o.ein)}${fld('amounts', 'Suggested amounts the donor can tap, comma-separated (they can also type their own)', o.amounts)}</div>
    <h3>3. The two emails your customer gets</h3>
    <p class="lead">Standard wording is already in each box. Press Edit to change it. The words in braces fill in by themselves: {name} {product} {ref} {amount} {date} {entity} {ein} {routing} {account} {days} {link} {site}.</p>
    <div class="tpl"><div class="tpl-h"><span>Sent the moment they press "I've sent it"</span><button type="button" class="small" data-edit="ack_tpl">Edit</button><button type="button" class="small" data-reset="ack_tpl">Reset to standard</button></div><textarea name="ack_tpl" rows="8" readonly>${esc(ack)}</textarea></div>
    <div class="tpl"><div class="tpl-h"><span>Sent when you mark it received — the receipt</span><button type="button" class="small" data-edit="receipt_tpl">Edit</button><button type="button" class="small" data-reset="receipt_tpl">Reset to standard</button></div><textarea name="receipt_tpl" rows="8" readonly>${esc(rec)}</textarea></div>
    <h3>4. Details</h3>
    <label>Promotion codes — one per line, CODE=dollars off (example: LAUNCH1=1). Buyers type the code on the ACH form; use the same code on your card checkout.<textarea name="codes" rows="3" style="width:100%;font-family:monospace">${esc(o.codes || '')}</textarea></label>
    ${fld('prefix', 'Order number prefix', o.prefix)}<p class="help">Two or three letters that start every order number your customers see — for example JC gives JC-482913. Best to use something that means something to you, like your initials or the first letters of your business.</p>
    ${fld('days', 'How long a transfer takes — shown to the customer. Most banks are now instant (RTP / FedNow); say so if yours is', o.days)}${fld('contact', 'Contact line shown in the box (email, phone)', o.contact)}${fld('email', 'Where new orders are emailed to you', o.email, 'email')}
    <div class="only-sale">${fld('card_url', 'Card checkout link, optional — a Stripe Payment Link, PayPal, anything. Leave blank for bank only.', o.card_url, 'url')}</div>
    <h3>5. How the money is collected</h3>
    <div class="tiles">
      <label class="tile"><input type="radio" name="collect" value="pull"${(o.collect || 'pull') === 'pull' ? ' checked' : ''}><b>Customer enters their bank details and approves</b><span>Your bank collects it from a file ACHplug builds (Collect page). Their account number is encrypted; you see the last four digits.</span></label>
      <label class="tile"><input type="radio" name="collect" value="push"${o.collect === 'push' ? ' checked' : ''}><b>Customer sends it from their bank</b><span>The box shows your payee name, routing and account number and the customer sends the money themselves.</span></label>
    </div>
    ${fld('address', 'Your business address — printed on the customer\'s confirmation', o.address)}
    <h3>6. Collecting — how the money gets pulled</h3>
    <div class="tiles">
      <label class="tile"><input type="radio" name="collect_mode" value="file"${(o.collect_mode || 'file') === 'file' ? ' checked' : ''}><b>I upload a file to my bank</b><span>Every morning ACHplug emails you the day's bank file and two links: download, and "mark as sent." One minute. Works with any business bank that offers ACH origination.</span></label>
      <label class="tile"><input type="radio" name="collect_mode" value="api"${o.collect_mode === 'api' ? ' checked' : ''}><b>Automatic (coming)</b><span>ACHplug sends each approved payment to the banking network for you. Nothing to download, nothing to upload. A few cents per payment. Not available yet — choose "I upload a file to my bank" for now. <a href="https://achplug.com/automatic.html" target="_blank" rel="noopener">Why, and what it will cost →</a></span></label>
    </div>
    <p class="help">Setting up ACH origination with your bank, step by step: <a href="https://achplug.com/help-collect.html" target="_blank" rel="noopener">achplug.com/help-collect</a></p>
    ${fld('company_id', 'Company ID — your EIN, or the originator ID your bank assigned', o.company_id)}${fld('odfi_routing', 'Routing number your bank uses for ACH origination (ask your bank; often the same as your account\'s)', o.odfi_routing)}
    <h3>7. Repeating payments</h3>
    <label class="tile" style="padding-left:40px"><input type="checkbox" name="recurring" value="1"${o.recurring ? ' checked' : ''}><b>Let customers select "repeat this payment"</b><span>They choose weekly, monthly or yearly, and how it ends — until they stop it, after a number of payments, or on a date. ACHplug reminds them before each one is due with Pause / Resume / Stop links. When the customer approved it on your site, each repeat appears on Collect by itself; when they send it themselves, ACHplug reminds them.</span></label>
    ${ready ? '' : '<p class="help" style="margin-top:26px;margin-bottom:-2px;font-size:13px;color:var(--ink)"><b>When you press "SAVE/Next", your code to paste appears on the next screen and is emailed to you.</b></p>'}<button class="primary big">${ready ? 'SAVE' : 'SAVE/Next'}</button></form>
    <script>(function(){var f=document.getElementById('setf'),D={ack_tpl:${JSON.stringify(DEF_ACK)},receipt_sale:${JSON.stringify(DEF_RECEIPT)},receipt_don:${JSON.stringify(DEF_RECEIPT_DONATION)}};
    function mode(){return f.querySelector('input[name=mode]:checked').value;}
    function apply(){var don=mode()==='donation';f.querySelectorAll('.only-sale').forEach(function(x){x.style.display=don?'none':''});f.querySelectorAll('.only-don').forEach(function(x){x.style.display=don?'':'none'});
      var r=f.querySelector('[name=receipt_tpl]');if(r.readOnly&&(r.value===D.receipt_sale||r.value===D.receipt_don))r.value=don?D.receipt_don:D.receipt_sale;}
    f.querySelectorAll('input[name=mode]').forEach(function(x){x.addEventListener('change',apply)});apply();
    f.addEventListener('click',function(e){var t=e.target;if(t.dataset.edit){var ta=f.querySelector('[name='+t.dataset.edit+']');ta.readOnly=false;ta.focus();t.textContent='Editing';}
      if(t.dataset.reset){var ta2=f.querySelector('[name='+t.dataset.reset+']');ta2.value=t.dataset.reset==='ack_tpl'?D.ack_tpl:(mode()==='donation'?D.receipt_don:D.receipt_sale);ta2.readOnly=true;var eb=f.querySelector('[data-edit='+t.dataset.reset+']');eb.textContent='Edit';}});
    })();</script>`;
  const deskLink = `${env.SITE}/dashboard?s=${esc(o.secret)}`;
  let b = `<h1>Your dashboard</h1><p class="lead">${esc(o.site || o.email)}</p>${ready ? `<p><a class="btn" href="/dashboard/register?s=${esc(o.secret)}">Sales Journal — ACH payments · ${cnt.n || 0} orders, ${cnt.p || 0} paid</a></p>` : ''}`;
  if (o.closed) b += `<div class="notice" style="background:#fdecec;border-color:#e3a3a3"><b>This site is closed.</b> The box is hidden on your pages and no new payments come in. Journal and authorizations are kept. <a href="/dashboard/sites">Reopen it from Your sites.</a></div>`;
  if (u.searchParams.get('ok')) b += `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1"><b>Routing number verified.</b> ${esc(u.searchParams.get('ok'))}. Money sent to this routing number and your account number reaches you.</div>`;
  if (u.searchParams.get('err')) b += `<div class="notice" style="background:#fdecec;border-color:#e3a3a3"><b>Not saved.</b> ${esc(u.searchParams.get('err'))}</div>`;
  if (u.searchParams.get('new')) b += `<div class="notice"><b>You are logged in on this device for 30 days.</b> From anywhere else: achplug.com → Log in → your email and password.</div>`;
  if (!ready) {
    b += `<h2>Step 1 of 2 — where the money goes</h2><p class="lead">Fill in the payee name, routing and account number and press the button. Your code appears on the next screen.</p>` + settings;
  } else {
    b += `<h2>Your code — paste this on your site where the box should appear</h2><p>One line. Change the words and the price to match what you sell; use one line per thing you sell. For a one-time sale that should never offer repeating, add <code>data-repeat="off"</code> to that line. It goes in any HTML block, code block or embed your site builder gives you.</p><pre>${line}</pre>`;
    const pull = (await env.DB.prepare("SELECT SUM(status='authorized') a, SUM(status='collecting') c FROM orders WHERE key=?").bind(o.key).first());
    if (pull && (pull.a || pull.c)) b += `<div class="notice" style="background:#eef5f1;border-color:#9cc7b1"><b>${pull.a || 0} authorized and ready to collect</b>, ${pull.c || 0} sent to your bank and waiting to clear — <a href="/dashboard/collect?s=${esc(o.secret)}">open Collect</a>.</div>`;
    b += `<h2>Waiting for money${waiting ? ` <span class="badge">${waiting}</span>` : ''}</h2><p class="lead">Orders where the customer is sending the money themselves. Once you mark one received it moves to the Sales Journal.</p>`;
    b += rows.length ? `<table><tr><th>Ref</th><th>When</th><th>Customer</th><th>Product</th><th>Amount</th><th>Status</th><th></th></tr>` + rows.map(r => `<tr>
    <td><code>${esc(r.ref)}</code></td><td>${esc(r.created.slice(0, 16))}</td><td>${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
    <td>${esc(r.product)}</td><td>${money(r.amount)}</td><td class="${r.status}">${r.status}</td>
    <td><form method="post" action="/dashboard/mark"><input type="hidden" name="s" value="${esc(o.secret)}"><input type="hidden" name="id" value="${r.id}">
      ${r.status !== 'paid' ? `<input name="link" placeholder="Link to email them (optional)"><input name="password" type="password" placeholder="Password" style="width:110px;display:inline-block;font-size:13px;padding:5px 8px;margin:4px 4px 0 0"><button name="to" value="paid" class="primary small">Mark received &amp; send receipt</button><button name="to" value="cancelled" class="small">Cancel</button>` : `<button name="to" value="awaiting" class="small">Undo</button>`}
    </form></td></tr>`).join('') + '</table>' : '<p>Nothing waiting. When a customer presses <em>I\'ve sent it</em>, it appears here and you get an email.</p>';
    const plans = (await env.DB.prepare('SELECT * FROM plans WHERE key=? ORDER BY id DESC LIMIT 200').bind(o.key).all()).results;
    b += `<h2 id="plans">Repeating payments</h2>` + plansTable(plans, o.secret);
    b += `<h2 id="settings">Settings</h2>` + settings;
  }
  return page('Dashboard', b, 200, deskNav(o.secret, 'desk', o));
}
const fld = (n, l, v, t = 'text') => `<label>${l}<input name="${n}" type="${t}" value="${esc(v ?? '')}"${t === 'number' ? ' step="0.5" min="0" max="90"' : ''}></label>`;
async function settingsPost(req, env) {
  const f = await req.formData(); const s = f.get('s') || cookieSecret(req);
  { const oo = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (oo) { const me = await whoami(env, oo, req); if (!can(me, 'settings')) return page('Settings', '<h1>Only the owner can change settings.</h1>', 403); } }
  const o = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (!o) return page('Desk', '<h1>No dashboard at that link.</h1>', 403);
  const g = n => String(f.get(n) || '').trim().slice(0, 200);
  const disc = Math.max(0, Math.min(90, Number(g('discount')) || 0));
  const routing = g('routing').replace(/\D/g, ''), account = g('account').replace(/[^0-9A-Za-z-]/g, '');
  const bad = [];
  let bankName = g('bank'), verified = '';
  if (routing) { const lk = await bankLookup(env, routing);
    if (!lk.ok) bad.push(`That routing number ${lk.reason}. It is printed on the bottom left of your checks, nine digits.`);
    else if (lk.name) { bankName = lk.name; verified = `${lk.name}${lk.city ? ', ' + lk.city : ''}${lk.state ? ' ' + lk.state : ''} — ACH accepted`; } }
  if (account && (account.length < 4 || account.length > 17 || /^(\d)\1+$/.test(account))) bad.push('That account number does not look right — bank account numbers are 4 to 17 characters and are not all the same digit.');
  if (bad.length) return Response.redirect(`${env.SITE}/dashboard?s=${s}&err=${encodeURIComponent(bad.join(' '))}`, 303);
  const t = n => { const v = String(f.get(n) || '').trim().slice(0, 3000); return [DEF_ACK.trim(), DEF_RECEIPT.trim(), DEF_RECEIPT_DONATION.trim()].includes(v) ? '' : v; };
  await env.DB.prepare('UPDATE owners SET entity=?,bank=?,routing=?,account=?,discount=?,days=?,prefix=?,card_url=?,contact=?,email=?,mode=?,ein=?,amounts=?,ack_tpl=?,receipt_tpl=? WHERE secret=?')
    .bind(g('entity'), bankName, routing, account, disc, g('days'), g('prefix').toUpperCase().slice(0, 3) || 'AP', g('card_url'), g('contact'), g('email'),
      g('mode') === 'donation' ? 'donation' : 'sale', g('ein'), g('amounts'), t('ack_tpl'), t('receipt_tpl'), s).run();
  await env.DB.prepare('UPDATE owners SET recurring=?, collect=?, address=?, company_id=?, odfi_routing=?, collect_mode=?, codes=? WHERE secret=?').bind(f.get('recurring') ? 1 : 0, g('collect') === 'push' ? 'push' : 'pull', g('address'), g('company_id'), g('odfi_routing').replace(/\D/g, ''), g('collect_mode') === 'api' ? 'api' : 'file', String(f.get('codes') || '').trim().slice(0, 2000), s).run();
  const after = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first();
  const wasReady = o.entity && o.routing && o.account, nowReady = after.entity && after.routing && after.account;
  if (!wasReady && nowReady) {
    const code = `<script src="${env.SITE}/plug.js" data-key="${after.key}" data-name="What you sell" data-price="20" data-desc="One line about it"></script>`;
    await sendMail(env, after.email, 'Your ACHplug code to paste', `Here is your code. Paste it on your site where the box should appear, and change the words and the price to match what you sell:\n\n${code}\n\nYour dashboard (bookmark it — it is your login): ${env.SITE}/dashboard?s=${s}`);
  }
  return Response.redirect(`${env.SITE}/dashboard?s=${s}${verified ? '&ok=' + encodeURIComponent(verified) : ''}`, 303);
}
async function mark(req, env) {
  const f = await req.formData(); const s = f.get('s') || '', id = Number(f.get('id')), to = String(f.get('to'));
  const o = await env.DB.prepare('SELECT * FROM owners WHERE secret=?').bind(s).first(); if (!o) return page('Desk', '<h1>No dashboard at that link.</h1>', 403);
  const r = await env.DB.prepare('SELECT * FROM orders WHERE id=? AND key=?').bind(id, o.key).first(); if (!r || !['paid', 'awaiting', 'cancelled'].includes(to)) return Response.redirect(`${env.SITE}/dashboard?s=${s}`, 303);
  const fromReg = (req.headers.get('referer') || '').includes('/register');
  const me = await whoami(env, o, req); if (!can(me, 'mark')) return page('Desk', '<h1>Your role does not allow this.</h1>', 403);
  if (!(await checkPw(String(f.get('password') || ''), me.password))) { const back = fromReg ? `${env.SITE}/dashboard/register?err=pw` : `${env.SITE}/dashboard/collect`; return Response.redirect(back + (back.includes('?') ? '&' : '?') + 'err=pw', 303); }
  const link = String(f.get('link') || '').trim().slice(0, 500);
  await env.DB.prepare("UPDATE orders SET status=?, paid_at=CASE WHEN ?='paid' THEN datetime('now') ELSE paid_at END, link=CASE WHEN ?<>'' THEN ? ELSE link END, marked_by=? WHERE id=?").bind(to, to, link, link, (me.name ? me.name + ' ' : '') + '<' + me.email + '>', id).run();
  if (to === 'paid') {
    const don = o.mode === 'donation';
    const vars = tplVars(o, { ...r, link: link || r.link, paid_at: new Date().toISOString() }, env);
    await sendMail(env, r.email, `${don ? 'Your donation receipt' : 'Your receipt'} — ${o.entity || o.site} — ${r.ref}`, fill(o.receipt_tpl || (don ? DEF_RECEIPT_DONATION : DEF_RECEIPT), vars) + await meLine(env, r.email), o.email);
  }
  const back = (req.headers.get('referer') || '').includes('/register') ? `${env.SITE}/dashboard/register?s=${s}&v=unpaid` : `${env.SITE}/dashboard?s=${s}`;
  return Response.redirect(back, 303);
}

/* ---------------- sales register ---------------- */
async function register(u, env, req) {
  const o = await owner(u, env, req); if (!o) return Response.redirect(`${env.SITE}/login`, 303);
  const all = (await env.DB.prepare('SELECT id,ref,created,paid_at,name,email,product,sku,amount,status,link,marked_by,code FROM orders WHERE key=? ORDER BY id DESC').bind(o.key).all()).results;
  const view = u.searchParams.get('v') || 'unpaid', q = (u.searchParams.get('q') || '').trim().toLowerCase();
  if (u.searchParams.get('csv')) {
    const csv = 'ref,created,paid_at,status,name,email,product,sku,amount\n' + all.map(r => [r.ref, r.created, r.paid_at || '', r.status, r.name, r.email, r.product, r.sku, r.amount].map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="sales-journal-ach-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const sum = (a, f) => a.filter(f).reduce((t, r) => t + r.amount, 0);
  const paid = all.filter(r => r.status === 'paid'), wait = all.filter(r => r.status === 'awaiting');
  const byMonth = {}; for (const r of paid) { const m = (r.paid_at || r.created).slice(0, 7); (byMonth[m] ||= { n: 0, t: 0 }); byMonth[m].n++; byMonth[m].t += r.amount; }
  const byProd = {}; for (const r of paid) { (byProd[r.product] ||= { n: 0, t: 0 }); byProd[r.product].n++; byProd[r.product].t += r.amount; }
  const cardFee = paid.reduce((t, r) => t + r.amount * 0.029 + 0.30, 0);
  const now = new Date(), day = 864e5, since = d => paid.filter(r => new Date((r.paid_at || r.created).replace(' ', 'T') + 'Z') >= d);
  const wk = since(new Date(now - 7 * day)), mo = since(new Date(now.getFullYear(), now.getMonth(), 1)), yr = since(new Date(now.getFullYear(), 0, 1));
  const strip = `<div class="grid four"><div class="card"><small>Last 7 days</small><b>${money(sum(wk, () => 1))}</b><small>${wk.length} payments</small></div><div class="card"><small>This month</small><b>${money(sum(mo, () => 1))}</b><small>${mo.length} payments</small></div><div class="card"><small>This year</small><b>${money(sum(yr, () => 1))}</b><small>${yr.length} payments</small></div><div class="card"><small>All time</small><b>${money(sum(paid, () => 1))}</b><small>${paid.length} payments</small></div></div>`;
  const shown = all.filter(r => (view === 'all' || (view === 'paid' ? r.status === 'paid' : r.status !== 'paid')) && (!q || [r.ref, r.name, r.email, r.product].join(' ').toLowerCase().includes(q)));
  const tab = (v, l) => `<a class="tab${view === v ? ' is-on' : ''}" href="/dashboard/register?s=${esc(o.secret)}&v=${v}${q ? '&q=' + encodeURIComponent(q) : ''}">${l}</a>`;
  const pwErr = u.searchParams.get('err') === 'pw' ? `<div class="notice" style="background:#fdecec;border-color:#e3a3a3"><b>Not marked.</b> Enter your password in the box on that row.</div>` : '';
  let b = `<h1>Sales Journal — ACH payments</h1>${pwErr}<p class="lead">${esc(o.site || o.email)} · <a href="/dashboard?s=${esc(o.secret)}">Back to dashboard</a> · <a href="/dashboard/register?s=${esc(o.secret)}&csv=1">Download CSV</a></p>
  ${strip}
  <div class="grid" style="margin-top:12px">
    <div class="card"><small>Awaiting transfer</small><b>${money(sum(wait, () => 1))}</b><small>${wait.length} orders</small></div>
    <div class="card"><small>Card fees you did not pay</small><b>${money(cardFee)}</b><small>at 2.9% + 30¢</small></div>
  </div>
  <h2>By month</h2><table><tr><th>Month</th><th>Orders</th><th>Paid</th></tr>${Object.keys(byMonth).sort().reverse().map(m => `<tr><td>${m}</td><td>${byMonth[m].n}</td><td>${money(byMonth[m].t)}</td></tr>`).join('') || '<tr><td colspan=3>Nothing paid yet.</td></tr>'}</table>
  <h2>By product</h2><table><tr><th>Product</th><th>Orders</th><th>Paid</th></tr>${Object.entries(byProd).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${money(v.t)}</td></tr>`).join('') || '<tr><td colspan=3>Nothing paid yet.</td></tr>'}</table>
  <h2>Invoices</h2>
  <div class="tabs">${tab('unpaid', 'Unpaid (' + all.filter(r => r.status !== 'paid').length + ')')}${tab('paid', 'Paid (' + paid.length + ')')}${tab('all', 'All (' + all.length + ')')}
    <form method="get" action="/desk/register" class="search"><input type="hidden" name="s" value="${esc(o.secret)}"><input type="hidden" name="v" value="${esc(view)}"><input name="q" value="${esc(q)}" placeholder="Search name, email, reference, product"><button class="small">Search</button></form></div>
  <table><tr><th>Ref</th><th>Created</th><th>Paid</th><th>Status</th><th>Customer</th><th>Product</th><th>Amount</th><th></th></tr>${shown.map(r => `<tr><td><code>${esc(r.ref)}</code></td><td>${esc(r.created.slice(0, 10))}</td><td>${esc((r.paid_at || '').slice(0, 10))}${r.marked_by ? '<br><small>by ' + esc(r.marked_by) + '</small>' : ''}</td><td class="${r.status}">${r.status}</td><td>${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td><td>${esc(r.product)}${r.code ? '<br><small>code ' + esc(r.code) + '</small>' : ''}</td><td>${money(r.amount)}</td>
    <td><form method="post" action="/dashboard/mark"><input type="hidden" name="s" value="${esc(o.secret)}"><input type="hidden" name="id" value="${r.id}"><input name="password" type="password" placeholder="Password" style="width:110px;display:inline-block;font-size:13px;padding:5px 8px;margin:4px 4px 0 0">${r.status !== 'paid' ? `<button name="to" value="paid" class="primary small">Mark received</button><button name="to" value="cancelled" class="small">Cancel</button>` : `<button name="to" value="awaiting" class="small">Undo</button>`}</form></td></tr>`).join('') || '<tr><td colspan=8>Nothing here.</td></tr>'}</table>`;
  return page('Sales Journal', b, 200, deskNav(o.secret, 'journal', o));
}

/* ---------------- your admin: owners and counts, never their orders ---------------- */
async function admin(u, env) {
  if (!env.ADMIN_TOKEN || u.searchParams.get('t') !== env.ADMIN_TOKEN) return new Response('No.', { status: 403 });
  const rows = (await env.DB.prepare(`SELECT o.key,o.secret,o.email,o.site,o.created,o.discount, (o.routing<>'' AND o.account<>'') ready,
    (SELECT COUNT(*) FROM orders WHERE key=o.key) n, (SELECT COUNT(*) FROM orders WHERE key=o.key AND status='paid') np FROM owners o ORDER BY o.created DESC`).all()).results;
  let banks = 0; try { banks = (await env.DB.prepare('SELECT COUNT(*) c FROM banks').first()).c; } catch (e) {}
  const t = esc(u.searchParams.get('t'));
  return page('ACHplug admin', `<h1>Owners</h1><p class="lead">${rows.length} dashboards · ${rows.filter(r => r.ready).length} with bank details entered · Fed ACH directory: ${banks ? banks + ' routing numbers' : '<b>not loaded</b>'} — <a href="/admin/import-banks?t=${esc(u.searchParams.get('t'))}">${banks ? 'refresh' : 'load it now'}</a></p>
  <table><tr><th>Since</th><th>Site</th><th>Email</th><th>Key</th><th>Disc.</th><th>Ready</th><th>Orders</th><th>Paid</th><th></th></tr>${rows.map(r => `<tr><td>${esc(r.created.slice(0, 10))}</td><td>${esc(r.site)}</td><td>${esc(r.email)}</td><td><code>${esc(r.key)}</code></td><td>${r.discount}%</td><td>${r.ready ? 'yes' : '—'}</td><td>${r.n}</td><td>${r.np}</td><td><a href="/dashboard?s=${esc(r.secret)}">open dashboard</a></td></tr>`).join('')}</table>`, 200, `<nav class="nav"><a class="on" href="/admin?t=${t}">Owners</a><a href="/admin/import-banks?t=${t}">Refresh bank directory</a><a href="/admin/run-daily?t=${t}">Run the daily job now</a><a href="https://achplug.com/">Site</a></nav>`);
}

/* ---------------- Fed ACH directory import (admin, one click) ---------------- */
async function importBanks(u, env) {
  if (!env.ADMIN_TOKEN || u.searchParams.get('t') !== env.ADMIN_TOKEN) return new Response('No.', { status: 403 });
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS banks (routing TEXT PRIMARY KEY, name TEXT, city TEXT, state TEXT, changed TEXT)').run();
  const src = env.FED_DIR_URL || 'https://raw.githubusercontent.com/moov-io/fed/master/data/FedACHdir.txt';
  const r = await fetch(src); if (!r.ok) return page('Import', `<h1>Could not fetch the directory</h1><p>${esc(src)} answered ${r.status}.</p>`);
  const lines = (await r.text()).split(/\r?\n/).filter(l => l.length > 129);
  const stmt = env.DB.prepare('INSERT OR REPLACE INTO banks (routing,name,city,state,changed) VALUES (?,?,?,?,?)');
  let n = 0;
  for (let i = 0; i < lines.length; i += 200) {
    const batch = lines.slice(i, i + 200).map(l => stmt.bind(l.slice(0, 9), l.slice(35, 71).trim(), l.slice(107, 127).trim(), l.slice(127, 129), l.slice(20, 26)));
    await env.DB.batch(batch); n += batch.length;
  }
  return page('Import', `<h1>Directory loaded</h1><p class="lead">${n} routing numbers now in your database. Re-run this any time to refresh. <a href="/admin?t=${esc(u.searchParams.get('t'))}">Back to admin</a></p>`);
}

/* ---------------- mail ---------------- */
async function sendMail(env, to, subject, text, replyTo) {
  if (!to) return;
  const from = env.FROM_EMAIL || 'hello@achplug.com';
  if (env.EMAIL && env.EMAIL.send) {
    try { await env.EMAIL.send({ from: { email: from, name: 'ACHplug' }, to, subject, text, ...(replyTo ? { replyTo } : {}) }); return; } catch (e) {}
  }
  if (env.RESEND_KEY) {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: `ACHplug <${from}>`, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }) }).catch(() => {});
  }
}

/* ---------------- page shell (desk pages only; the public site is on Pages) ---------------- */
function page(title, body, status = 200, nav = '') {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ACHplug</title>
<style>:root{--paper:#F7F9F6;--ink:#17251F;--green:#1E6B4E;--slate:#5F6F68;--line:#C9D4CE}*{box-sizing:border-box}body{margin:0;font:16px/1.5 "Source Sans 3",system-ui,sans-serif;color:var(--ink);background:var(--paper)}
.w{max-width:900px;margin:0 auto;padding:18px 20px 60px}header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 16px}header a.logo{font:600 22px Georgia,serif;color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;gap:8px}header a.logo svg{width:28px;height:28px}header b{color:var(--green)}.nav{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}.nav a{text-decoration:none;color:var(--ink);border:1px solid var(--line);border-radius:20px;padding:6px 12px;font-size:13px;background:var(--paper)}.nav a.on{background:var(--green);color:#fff;border-color:var(--green)}h1{font:600 28px Georgia,serif;margin:22px 0 6px}h2{font:600 20px Georgia,serif;margin:26px 0 8px}h3{font:600 17px Georgia,serif;margin:20px 0 4px}details summary{cursor:pointer;color:var(--slate);font-size:13px;margin-top:4px}
.lead{color:var(--slate);margin:0 0 8px}a{color:var(--green)}pre{background:var(--ink);color:var(--paper);padding:12px 14px;border-radius:8px;overflow:auto;font-size:13px}
table{width:100%;border-collapse:collapse;display:block;overflow-x:auto;white-space:nowrap;background:#fff;border:1px solid var(--line);border-radius:8px;font-size:14px}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--slate);font-weight:600}
td.paid{color:var(--green);font-weight:600}td.awaiting{color:#b45309;font-weight:600}td.cancelled{color:#888}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px}.card b{display:block;font:600 30px Georgia,serif;margin:2px 0}.card small{color:var(--slate);display:block}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.grid.four{grid-template-columns:repeat(4,1fr)}@media(max-width:600px){.grid,.grid.four{grid-template-columns:1fr 1fr}}
label{display:block;margin:10px 0 0;font-size:14px;color:var(--slate)}input,select,textarea{display:block;width:100%;margin-top:3px;font:inherit;padding:9px 11px;border:1.5px solid var(--line);border-radius:7px;font:inherit;font-size:16px}
button{font:inherit;font-weight:600;border:1px solid var(--line);background:#fff;border-radius:7px;padding:10px 16px;cursor:pointer;margin-top:12px}button.primary{background:var(--green);color:#fff;border-color:var(--green)}button.big{width:100%;padding:14px;font-size:17px}.btn{display:inline-block;background:var(--green);color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px}.tabs{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}.tab{padding:6px 12px;border:1px solid var(--line);border-radius:20px;text-decoration:none;color:var(--ink);font-size:14px;background:#fff}.tab.is-on{background:var(--ink);color:#fff;border-color:var(--ink)}.search{display:flex;gap:6px;margin-left:auto}.search input{width:260px;margin:0;padding:6px 10px;font-size:14px}.search button{margin:0}.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 4px}.tile{display:block;border:1.5px solid var(--line);border-radius:10px;padding:12px 14px 12px 40px;position:relative;cursor:pointer;color:var(--ink);font-size:15px;margin:0}.tile input{position:absolute;left:14px;top:16px;width:18px;height:18px;margin:0}.tile b{display:block;font-size:16px}.tile span{display:block;color:var(--slate);font-size:13px;margin-top:2px}.tile:has(input:checked){border-color:var(--green);background:#eef5f1}@media(max-width:600px){.tiles{grid-template-columns:1fr}}.tpl{margin-top:12px}.tpl-h{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--slate);flex-wrap:wrap}.tpl-h span{flex:1}.tpl-h button{margin:0}.tpl textarea[readonly]{background:#f3f6f4;color:#333}.help{font-size:13px;color:var(--slate);margin:4px 0 0}.notice{background:#fff8e6;border:1px solid #e8c77a;border-radius:8px;padding:12px 14px;margin:10px 0;font-size:14px}.notice code{display:block;margin-top:6px;word-break:break-all;background:#fff}button.small{padding:5px 10px;font-size:13px;margin:4px 4px 0 0}
form input[name=link]{width:220px;display:inline-block;font-size:13px;padding:5px 8px;margin:4px 4px 0 0}
.badge{background:#b45309;color:#fff;font-size:12px;border-radius:12px;padding:2px 9px;vertical-align:middle}.err{color:#b91c1c}code{background:#eef2ef;padding:1px 5px;border-radius:4px}.buyers{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:420px;background:#fff;border:1.5px solid var(--green);border-radius:8px;padding:12px 14px;margin:14px 0 0;font-size:15px}.buyers .btn{padding:8px 16px}.gbtn{display:flex;align-items:center;justify-content:center;gap:10px;max-width:420px;background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:12px 16px;text-decoration:none;color:var(--ink);font-weight:600;margin:14px 0 0}.gbtn:hover{border-color:var(--green)}.or{display:flex;align-items:center;gap:10px;max-width:420px;margin:14px 0 2px;color:var(--slate);font-size:13px}.or:before,.or:after{content:'';flex:1;height:1px;background:var(--line)}</style></head>
<body><div class="w"><header><a class="logo" href="/" title="ACHplug home"><svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true"><circle cx="32" cy="24" r="17" fill="#1E6B4E"/><circle cx="19" cy="30" r="10" fill="#1E6B4E"/><circle cx="45" cy="30" r="10" fill="#1E6B4E"/><path d="M29 38h6v14a3 3 0 0 1-6 0z" fill="#8a5a2b"/><path d="M22 56c4-3 16-3 20 0" fill="none" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="43" r="7.5" fill="#E8A33D"/><rect x="36.8" y="35" width="2.2" height="5" rx="1.1" fill="#F7F9F6"/><rect x="41" y="35" width="2.2" height="5" rx="1.1" fill="#F7F9F6"/><path d="M37 43.5l2 2 4-4" fill="none" stroke="#F7F9F6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="26" r="3" fill="#E8A33D"/><circle cx="33" cy="14" r="3" fill="#E8A33D"/></svg><span>ACH<b>plug</b></span></a>${nav}</header>${body}</div></body></html>`, { status, headers: H.html });
}

/* ---------------- plug.js — the one line ---------------- */
const PLUG_JS = SITE => `(function(){
var s=document.currentScript,d=s.dataset,key=d.key;if(!key)return;
var host=document.createElement('div');host.className='achplug';s.parentNode.insertBefore(host,s);
var css='.achplug{--ach-accent:#1E6B4E;--ach-bg:rgba(0,0,0,.03);--ach-line:rgba(0,0,0,.18);--ach-radius:10px;font:inherit;color:inherit;border:1px solid var(--ach-line);border-radius:var(--ach-radius);overflow:hidden;max-width:720px;margin:1.5em 0}.achplug *{box-sizing:border-box}.achplug-head{padding:20px 20px 4px}.achplug-title{margin:0;font-size:1.35em;line-height:1.2}.achplug-desc{margin:.25em 0 0;opacity:.7;font-size:.95em}.achplug-screen{display:none;padding:12px 20px 20px}.achplug-screen.is-on{display:block}.achplug-choice{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}.achplug-opt{border:1.5px solid var(--ach-line);border-radius:var(--ach-radius);padding:14px 14px 12px}.achplug-opt small{display:block;font-size:.85em;opacity:.7}.achplug-price{font-size:2em;line-height:1.05;margin:.15em 0;font-variant-numeric:tabular-nums;font-weight:600}.achplug-was{font-size:.85em;opacity:.6;text-decoration:line-through}.achplug-save{display:inline-block;margin-left:6px;font-size:.85em;font-weight:600;color:var(--ach-accent)}.achplug-bank{border-color:var(--ach-accent);background:var(--ach-bg)}.achplug-go{display:block;width:100%;margin-top:12px;border:0;border-radius:calc(var(--ach-radius) - 3px);padding:10px;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer;color:#fff;background:#222}.achplug-bank .achplug-go{background:var(--ach-accent)}.achplug-why{margin-top:14px;border-top:1px solid var(--ach-line);padding-top:10px;font-size:.95em}.achplug-why summary{cursor:pointer;color:var(--ach-accent);font-weight:600}.achplug-why p{margin:.5em 0 0;max-width:60ch}.achplug-field{display:block;margin-top:10px}.achplug-field span{display:block;font-size:.85em;opacity:.7;margin-bottom:3px}.achplug-field input{width:100%;border:1.5px solid var(--ach-line);border-radius:calc(var(--ach-radius) - 3px);padding:9px 11px;font:inherit;background:transparent;color:inherit}.achplug-slip{margin-top:14px;border:1.5px solid var(--ach-accent);border-radius:var(--ach-radius);background:var(--ach-bg);padding:14px}.achplug-slip h4{margin:0 0 6px;font-size:1.05em}.achplug-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--ach-line)}.achplug-row:last-child{border-bottom:0}.achplug-row span{font-size:.85em;opacity:.7}.achplug-row b{font-variant-numeric:tabular-nums;letter-spacing:.02em;text-align:right;font-weight:600}.achplug-big{font-size:1.5em;color:var(--ach-accent)}.achplug-copy{border:1px solid var(--ach-line);background:transparent;color:inherit;border-radius:5px;font:inherit;font-size:.75em;padding:2px 8px;margin-left:6px;cursor:pointer;vertical-align:middle}.achplug-copy.is-done{background:var(--ach-accent);color:#fff;border-color:var(--ach-accent)}.achplug-flow{display:flex;align-items:stretch;gap:6px;margin-top:14px}.achplug-fs{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;border:1px solid var(--ach-line);border-radius:var(--ach-radius);padding:10px 8px;font-size:.82em;line-height:1.3;background:transparent}.achplug-fs svg{width:34px;height:34px;fill:none;stroke:var(--ach-accent);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;margin-bottom:4px}.achplug-fs b{display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--ach-accent);color:#fff;font-size:.8em;align-items:center;justify-content:center;margin-bottom:5px}.achplug-fa{align-self:center;color:var(--ach-accent);font-size:1.3em;opacity:.7}@media(max-width:560px){.achplug-flow{flex-direction:column}.achplug-fa{transform:rotate(90deg)}.achplug-fs{flex-direction:row;text-align:left;gap:10px}.achplug-fs svg{margin:0}.achplug-fs b{margin:0}}.achplug-code{display:block;margin-top:12px;font-size:.85em;opacity:.75}.achplug-code input{display:block;width:100%;margin-top:3px;border:1.5px solid var(--ach-line);border-radius:calc(var(--ach-radius) - 3px);padding:9px 11px;font:inherit;background:transparent;color:inherit;text-transform:uppercase}.achplug-code-msg{display:block;margin-top:4px;font-size:1em;font-weight:600;color:var(--ach-accent);text-transform:none}.achplug-err{color:#b91c1c;font-size:.9em;margin:10px 0 0}.achplug-primary{display:block;width:100%;margin-top:14px;border:0;border-radius:calc(var(--ach-radius) - 3px);padding:12px;font:inherit;font-weight:600;background:var(--ach-accent);color:#fff;cursor:pointer}.achplug-ghost{display:block;width:100%;margin-top:8px;border:0;background:none;color:inherit;opacity:.6;font:inherit;font-size:.9em;padding:6px;cursor:pointer}.achplug-done{text-align:center;padding:8px 0 4px}.achplug-mark{width:52px;height:52px;border-radius:50%;background:var(--ach-accent);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:8px}.achplug-done h4{margin:0;font-size:1.25em}.achplug-done p{opacity:.7;margin:.4em auto 0;max-width:44ch}.achplug-ord{font-size:1.8em;margin:10px 0 2px;letter-spacing:.03em;font-weight:600}.achplug-foot{padding:10px 20px 12px;border-top:1px solid var(--ach-line);font-size:.8em;opacity:.7;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.achplug-foot a{color:inherit;display:inline-flex;align-items:center;gap:4px;vertical-align:middle}.achplug-agree{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:.9em;line-height:1.35}.achplug-agree input{margin-top:3px}.achplug-bank{display:block;margin-top:3px;font-size:.85em;opacity:.8}.achplug-slip .achplug-field{margin-top:8px}.achplug-slip select{width:100%;border:1.5px solid var(--ach-line);border-radius:calc(var(--ach-radius) - 3px);padding:9px 11px;font:inherit;background:transparent;color:inherit}.achplug-notice{white-space:pre-line;text-align:left;opacity:.85;margin:8px auto 0;max-width:52ch;font-size:.92em}.achplug-rec{margin-top:12px;border:1.5px dashed var(--ach-line);border-radius:var(--ach-radius);padding:10px 12px;font-size:.95em}.achplug-rec label{cursor:pointer}.achplug-rec select{font:inherit;padding:2px 4px}.achplug-rec p{margin:.4em 0 0;font-size:.85em;opacity:.75}.achplug-rec-end{margin-top:6px;font-size:.9em;display:flex;gap:10px;flex-wrap:wrap}.achplug-rec-end input[type=number],.achplug-rec-end input[type=date]{font:inherit;padding:2px 4px;border:1px solid var(--ach-line);border-radius:4px;background:transparent;color:inherit}.achplug-amts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.achplug-amt{border:1.5px solid var(--ach-line);background:transparent;color:inherit;border-radius:6px;padding:6px 10px;font:inherit;font-weight:600;cursor:pointer}.achplug-amt.is-on{border-color:var(--ach-accent);background:var(--ach-accent);color:#fff}.achplug-other{width:120px;border:1.5px solid var(--ach-line);border-radius:6px;padding:6px 8px;font:inherit;background:transparent;color:inherit}@media(max-width:480px){.achplug-choice{grid-template-columns:1fr}}';
if(!document.getElementById('achplug-css')){var st=document.createElement('style');st.id='achplug-css';st.textContent=css;document.head.appendChild(st);}
function money(n){return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function e(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
fetch('${SITE}/api/config?key='+encodeURIComponent(key)).then(function(r){return r.json();}).then(function(c){
 if(c.error||(!c.ready&&(!c.routing||!c.account))){host.style.display='none';return;}
 var don=c.mode==='donation',disc=don?0:Number(c.discount||0),price=Number(d.price||0),card=don?'':(d.card||c.card_url),ref='';
 var ach=Math.round(price*(1-disc/100)*100)/100;
 var amts=(d.amounts||c.amounts||'').split(',').map(function(x){return Number(x.trim());}).filter(function(x){return x>0;});
 var pick=don&&!price;var rec=!!c.recurring&&!don&&String(d.repeat||'').toLowerCase()!=='off';var repeat='';var pull=(c.collect||'pull')==='pull';if(pull&&!c.ready){host.style.display='none';return;}
 var pct=(Math.round(disc*10)/10).toString();
 host.innerHTML='<div class="achplug-head"><h3 class="achplug-title">'+e(d.name)+'</h3>'+(d.desc?'<p class="achplug-desc">'+e(d.desc)+'</p>':'')+'</div>'
 +'<div class="achplug-screen is-on" data-screen="1"><div class="achplug-choice">'
 +(card?'<div class="achplug-opt achplug-card"><small>Pay by card</small><div class="achplug-price">'+money(price)+'</div><small>Instant.</small><a class="achplug-go" href="'+e(card)+'">Pay by card</a></div>':'')
 +'<div class="achplug-opt achplug-bank"><small>'+(don?'Give from your bank':'Pay from your bank')+'</small>'
 +(pick?'<div class="achplug-amts">'+amts.map(function(a){return '<button type="button" class="achplug-amt" data-amt="'+a+'">'+money(a)+'</button>';}).join('')+'<input type="number" min="1" step="1" class="achplug-other" placeholder="Other amount"></div>':'<div class="achplug-price">'+money(ach)+'</div>')
 +(disc>0?'<span class="achplug-was">'+money(price)+'</span><span class="achplug-save">You save '+pct+'%</span>':(don?'<small>No card fees taken. 100% arrives.</small>':''))
 +'<button type="button" class="achplug-go" data-go="2">'+(don?'Give from my bank':'Pay from my bank')+'</button></div></div>'
 +'<details class="achplug-why"><summary>'+(don?'What is giving from my bank?':'What is paying from my bank?')+'</summary><p>You send the money straight from your bank account to ours, the same way you pay a utility bill. No card company sits in the middle taking a cut'+(disc>0?', which is why it costs less':(don?', so every dollar arrives':''))+'. Most banks now send it instantly; a few take up to three business days. '+(don?'You get a receipt by email the moment it arrives.':'We unlock your purchase the moment it arrives.')+'</p></details></div>'
 +(pull?
  '<div class="achplug-screen" data-screen="2"><label class="achplug-field"><span>Your name</span><input type="text" name="name" autocomplete="name" placeholder="As it appears on your bank account"></label><label class="achplug-field"><span>Email — your receipt goes here</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com"></label>'
 +'<div class="achplug-slip"><h4>Your bank account</h4><label class="achplug-field"><span>Routing number (9 digits)</span><input type="text" inputmode="numeric" name="routing" maxlength="9" placeholder="Bottom left of a check"><small class="achplug-bank"></small></label><label class="achplug-field"><span>Account number</span><input type="text" inputmode="numeric" name="account" maxlength="17" placeholder="Next to the routing number on a check"></label><label class="achplug-field"><span>Account type</span><select name="acct_type"><option value="checking">Checking</option><option value="savings">Savings</option></select></label></div>'+(c.has_codes?'<label class="achplug-code">Promotion code (optional)<input name="code" autocomplete="off" placeholder="Code"><small class="achplug-code-msg"></small></label>':'')
 +(rec?'<div class="achplug-rec"><label><input type="checkbox" class="achplug-rec-cb"> <b>Repeat this payment</b> every <select class="achplug-rec-int"><option value="monthly">month</option><option value="weekly">week</option><option value="yearly">year</option></select></label><div class="achplug-rec-end"><label><input type="radio" name="achplug-end" value="never" checked> until I stop it</label> <label><input type="radio" name="achplug-end" value="count"> for <input type="number" min="2" max="999" class="achplug-rec-count" value="12" style="width:64px"> payments</label> <label><input type="radio" name="achplug-end" value="date"> until <input type="date" class="achplug-rec-date"></label></div><p>You can pause or stop this any time from the link in your email. Nobody can collect after you stop it.</p></div>':'')
 +'<label class="achplug-agree"><input type="checkbox" name="agree"> <span>I authorize <b>'+e(c.entity)+'</b> to collect <b class="achplug-amt-out">'+money(ach)+'</b> from this account'+(rec?', and each repeat if I chose one,':'')+' and I understand I can revoke this any time from the link in my email.</span></label>'
 +'<p class="achplug-err" hidden></p><button type="button" class="achplug-primary" data-go="3">'+(don?'Give':'Buy')+' — '+money(ach)+'</button><button type="button" class="achplug-ghost" data-go="1">Back</button></div>'
 :
  '<div class="achplug-screen" data-screen="2"><label class="achplug-field"><span>Your name</span><input type="text" name="name" autocomplete="name" placeholder="As it appears on your bank account"></label><label class="achplug-field"><span>'+(don?'Email — your receipt goes here':'Email — we unlock your purchase here')+'</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com"></label>'
 +'<div class="achplug-slip"><h4>Send this from your bank</h4><div class="achplug-row"><span>Amount</span><b class="achplug-big achplug-amt-out">'+money(ach)+'</b></div><div class="achplug-row"><span>Pay to</span><b>'+e(c.entity)+'</b></div>'+(c.bank?'<div class="achplug-row"><span>Bank</span><b>'+e(c.bank)+'</b></div>':'')
 +'<div class="achplug-row"><span>Routing number</span><b>'+e(c.routing)+' <button type="button" class="achplug-copy" data-copy="'+e(c.routing)+'">Copy</button></b></div><div class="achplug-row"><span>Account number</span><b>'+e(c.account)+' <button type="button" class="achplug-copy" data-copy="'+e(c.account)+'">Copy</button></b></div><div class="achplug-row"><span>Memo / reference</span><b><span class="achplug-ref">—</span> <button type="button" class="achplug-copy" data-copy-ref>Copy</button></b></div></div>'
 +(rec?'<div class="achplug-rec"><label><input type="checkbox" class="achplug-rec-cb"> <b>Repeat this payment</b> every <select class="achplug-rec-int"><option value="monthly">month</option><option value="weekly">week</option><option value="yearly">year</option></select></label><div class="achplug-rec-end"><label><input type="radio" name="achplug-end" value="never" checked> until I stop it</label> <label><input type="radio" name="achplug-end" value="count"> for <input type="number" min="2" max="999" class="achplug-rec-count" value="12" style="width:64px"> payments</label> <label><input type="radio" name="achplug-end" value="date"> until <input type="date" class="achplug-rec-date"></label></div><p>You stay in control: nobody can charge you. We remind you before each one and you can pause or stop with one press.</p></div>':'')
 +'<p class="achplug-err" hidden></p><button type="button" class="achplug-primary" data-go="3">I\\'ve sent it</button><button type="button" class="achplug-ghost" data-go="1">Back</button></div>')
+'<div class="achplug-screen" data-screen="3"><div class="achplug-done"><div class="achplug-mark">&#10003;</div><h4>'+(pull?'Thank you.':'Thank you. We\\'re watching for it.')+'</h4>'+(pull?'<p class="achplug-notice"></p>':'')+'<div class="achplug-ord achplug-ref">—</div><p class="achplug-rec-note" hidden>This will repeat. You will get a reminder a few days before each one is due, with Pause and Stop links in it.</p>'+(pull?'':'<p>Keep this reference. When your transfer lands — '+e(c.days||'often within minutes, up to 3 business days')+' — '+(don?'your receipt goes to the address you gave.':'we\\'ll email your purchase to the address you gave.')+' Nothing else to do.</p>')+'</div></div>'
 +'<div class="achplug-foot"><span>'+(c.contact?'Questions? '+e(c.contact):'')+'</span><span class="achplug-by">Pay-from-bank checkout by <a href="${SITE}" rel="noopener"><svg viewBox=\"0 0 64 64\" width=\"14\" height=\"14\" aria-hidden=\"true\"><circle cx=\"32\" cy=\"24\" r=\"17\" fill=\"#1E6B4E\"/><circle cx=\"19\" cy=\"30\" r=\"10\" fill=\"#1E6B4E\"/><circle cx=\"45\" cy=\"30\" r=\"10\" fill=\"#1E6B4E\"/><path d=\"M29 38h6v14a3 3 0 0 1-6 0z\" fill=\"#8a5a2b\"/><path d=\"M22 56c4-3 16-3 20 0\" fill=\"none\" stroke=\"#8a5a2b\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"40\" cy=\"43\" r=\"7.5\" fill=\"#E8A33D\"/><rect x=\"36.8\" y=\"35\" width=\"2.2\" height=\"5\" rx=\"1.1\" fill=\"#F7F9F6\"/><rect x=\"41\" y=\"35\" width=\"2.2\" height=\"5\" rx=\"1.1\" fill=\"#F7F9F6\"/><path d=\"M37 43.5l2 2 4-4\" fill=\"none\" stroke=\"#F7F9F6\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"26\" r=\"3\" fill=\"#E8A33D\"/><circle cx=\"33\" cy=\"14\" r=\"3\" fill=\"#E8A33D\"/></svg> ACHplug</a></span></div>';
 var err=host.querySelector('.achplug-err');
 function show(n){host.querySelectorAll('.achplug-screen').forEach(function(x){x.classList.toggle('is-on',x.getAttribute('data-screen')==String(n));});host.scrollIntoView({block:'start',behavior:'smooth'});}
 function setRef(r){ref=r;host.querySelectorAll('.achplug-ref').forEach(function(x){x.textContent=r;});}
 setRef((d.sku||'REF').replace(/[^A-Z0-9]/gi,'').slice(0,3).toUpperCase()+'-'+String(Math.floor(100000+Math.random()*900000)));
 function setAmt(a){ach=Math.round(a*100)/100;host.querySelectorAll('.achplug-amt-out').forEach(function(x){x.textContent=money(ach);});host.querySelectorAll('.achplug-amt').forEach(function(x){x.classList.toggle('is-on',Number(x.getAttribute('data-amt'))===ach);});var pb=host.querySelector('.achplug-primary');if(pb&&pull&&!pb.disabled)pb.textContent=(don?'Give':'Buy')+' \u2014 '+money(ach);}
 if(pick&&amts.length){setAmt(amts[0]);}
 var rcb=host.querySelector('.achplug-rec-cb'),rint=host.querySelector('.achplug-rec-int'),endc=0,endd='';function upd(){repeat=rcb&&rcb.checked?rint.value:'';var m=host.querySelector('input[name=achplug-end]:checked');var v=m?m.value:'never';endc=v==='count'?Number(host.querySelector('.achplug-rec-count').value)||0:0;endd=v==='date'?host.querySelector('.achplug-rec-date').value:'';host.querySelector('.achplug-rec-end').style.display=rcb&&rcb.checked?'':'none';}if(rcb){host.querySelector('.achplug-rec').addEventListener('change',upd);host.querySelector('.achplug-rec').addEventListener('input',upd);upd();}
 var oth=host.querySelector('.achplug-other');if(oth)oth.addEventListener('input',function(){if(Number(oth.value)>0)setAmt(Number(oth.value));});
 host.addEventListener('click',function(ev){var am=ev.target.closest('.achplug-amt');if(am){setAmt(Number(am.getAttribute('data-amt')));if(oth)oth.value='';return;}
  var t=ev.target.closest('[data-go],[data-copy],[data-copy-ref]');if(!t)return;
  if(t.hasAttribute('data-copy')||t.hasAttribute('data-copy-ref')){var txt=t.hasAttribute('data-copy-ref')?ref:t.getAttribute('data-copy');if(navigator.clipboard)navigator.clipboard.writeText(txt);t.classList.add('is-done');t.textContent='Copied';setTimeout(function(){t.classList.remove('is-done');t.textContent='Copy';},1500);return;}
  var go=t.getAttribute('data-go');if(go==='2'&&!(ach>0)){return;}if(go==='3'){submit(t);return;}show(go);});
 var cin=host.querySelector('input[name=code]'),cm=host.querySelector('.achplug-code-msg'),base=ach,off=0;if(cin){cin.addEventListener('change',function(){var v=cin.value.trim().toUpperCase();if(!v){off=0;setAmt(base);cm.textContent='';return;}fetch('${SITE}/api/code?key='+key+'&code='+encodeURIComponent(v)).then(function(r){return r.json();}).then(function(j){if(j.ok){off=j.off;setAmt(Math.max(0.5,base-off));cm.textContent='Code applied: '+money(off)+' off.';cm.style.color='';}else{off=0;setAmt(base);cm.textContent='Code not recognized.';cm.style.color='#b91c1c';}});});}
 var rin=host.querySelector('input[name=routing]'),bn=host.querySelector('.achplug-bank');if(rin){rin.addEventListener('input',function(){var v=rin.value.replace(/\\D/g,'');rin.value=v;if(v.length===9){fetch('${SITE}/api/bank?rn='+v).then(function(r){return r.json();}).then(function(j){bn.textContent=j.ok&&j.name?j.name+(j.city?', '+j.city:'')+(j.state?' '+j.state:''):'Not a valid routing number';bn.style.color=j.ok&&j.name?'':'#b91c1c';});}else bn.textContent='';});}
 function submit(btn){var name=host.querySelector('input[name=name]').value.trim(),email=host.querySelector('input[name=email]').value.trim();err.hidden=true;
  if(pull){var routing=host.querySelector('input[name=routing]').value.trim(),account=host.querySelector('input[name=account]').value.trim(),agree=host.querySelector('input[name=agree]').checked,at=host.querySelector('select[name=acct_type]').value;
   if(!name||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){err.textContent='Please give your name and a working email address.';err.hidden=false;return;}
   if(!/^\\d{9}$/.test(routing)||account.length<4){err.textContent='Please enter your 9-digit routing number and your account number.';err.hidden=false;return;}
   if(!agree){err.textContent='Please check the box to authorize the payment.';err.hidden=false;return;}
   btn.disabled=true;btn.textContent='Sending…';
   fetch('${SITE}/api/authorize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:key,name:name,email:email,product:d.name,sku:d.sku||'',amount:base,code:cin?cin.value.trim():'',routing:routing,account:account,acct_type:at,agree:agree,repeat:repeat,end_count:endc,end_date:endd})})
   .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
   .then(function(x){btn.disabled=false;btn.textContent=(don?'Give':'Buy')+' — '+money(ach);if(!x.ok){err.textContent=(x.j&&x.j.message)||'Something went wrong. Try again.';err.hidden=false;return;}setRef(x.j.ref);var nt=host.querySelector('.achplug-notice');if(nt)nt.textContent=x.j.notice.split('\\n\\nYour authorization')[0];host.querySelectorAll('input[name=routing],input[name=account]').forEach(function(i){i.value='';});show(3);})
   .catch(function(){btn.disabled=false;btn.textContent=(don?'Give':'Buy')+' — '+money(ach);err.textContent='Could not reach ACHplug. Try again.';err.hidden=false;});
   return;}
  if(!name||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){err.textContent='Please give your name and a working email address.';err.hidden=false;return;}
  btn.disabled=true;btn.textContent='Saving…';
  fetch('${SITE}/api/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:key,name:name,email:email,product:d.name,sku:d.sku||'',amount:ach,repeat:repeat,end_count:endc,end_date:endd})})
  .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
  .then(function(x){btn.disabled=false;btn.textContent="I've sent it";if(!x.ok){err.textContent=(x.j&&x.j.message)||'Something went wrong. Try again.';err.hidden=false;return;}setRef(x.j.ref);var rn=host.querySelector('.achplug-rec-note');if(rn&&x.j.repeat)rn.hidden=false;show(3);})
  .catch(function(){btn.disabled=false;btn.textContent="I've sent it";err.textContent='Could not reach ACHplug. Try again.';err.hidden=false;});}
}).catch(function(){host.style.display='none';});
})();`;