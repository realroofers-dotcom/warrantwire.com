/* BUILT 2026-11-15 · story-1d (card icon on the cards link) · story-1c (cards-home-1a: 'Their cards, on 8K10Q') · story-1b · warrantwire.com/story.js - ONE COPY, used by Warrant Wire's and 8K10Q's company pages
   (Mark: "what we just did on warrantwire on PEOPLE and Universities all goes on 8k10q because it is pertinent").
   Mark, 15 Nov 2026: "BRANDING and urgency" / "chart the stock movements" / "THE PEOPLE ... which SCHOOLS" / "the salaries
   are my point, and that is a sell sign" / "if a company came from a shell it should have that shell logo" / "if there is a
   poison pill and the earnings date ... is it in person and where located" / "a shell could be taken over if its sleeping"
   / "we cannot use vague language ... speak exact".
   Data: people.realroofers.workers.dev ?profile ?pay ?schools ?careers ?people (all public, facts from filings).
   FREE: counts, chart, money, names, schools, the pay headline, the calendar. PAID (opts.open): which terms, the companies
   each person served, the pay tables (Mark 14 Nov: free = how many, not what).
   WWStory.render(el, ticker, {open, site})   WWStory.people(el, ticker, {open, data, prepend, site}) */
(function () {
  var API = "https://people.realroofers.workers.dev";
  var css = ".story{margin:16px 0 4px}"
    + ".sbadge{display:flex;align-items:center;gap:10px;background:#11161b;color:#ecebe6;border-radius:10px;padding:9px 14px;margin:0 0 12px;text-decoration:none}"
    + ".sbadge svg{width:30px;height:30px;color:#e0a63a;flex:0 0 auto}.sbadge b{font:800 13px ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#e0a63a}.sbadge span{font-size:14px}"
    + ".alarm{border-left:8px solid #c0392b;background:#fdecea;padding:12px 16px;border-radius:8px}"
    + ".alarm .ak{font:800 12.5px ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#c0392b}.alarm .ab{display:block;font:700 20px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin-top:3px;color:#15160f}"
    + ".alarm.watch{border-left-color:#c99a2e;background:#fff6dc}.alarm.watch .ak{color:#8a6400}"
    + ".chartbox{margin:12px 0 2px;border:1px solid #ddd;border-radius:10px;padding:8px;background:#fff}"
    + ".chartcap{font-size:12.5px;color:#6b6c62;margin:2px 0 10px}"
    + ".sgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}@media(max-width:640px){.sgrid{grid-template-columns:repeat(2,1fr)}}"
    + ".sstat{background:#f6f5ef;border-radius:8px;padding:8px 10px;color:#15160f}.sstat b{display:block;font-size:18px}.sstat span{font-size:12.5px;color:#6b6c62}.sstat.neg b{color:#c0392b}"
    + ".wwsell{display:block;background:#15160f;color:#fff;border-radius:8px;padding:10px 14px;font-weight:700;margin:6px 0 4px}.wwsell b{display:inline;color:#ff8a7a}"
    + ".sh3{font:800 13.5px ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;margin:20px 0 8px;border-bottom:2px solid currentColor;padding-bottom:4px}"
    + ".pcard{border:1px solid #ddd;border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff;color:#15160f}"
    + ".pcard .pn{font:800 17px Georgia,serif}.pcard .pr{font-size:13px;color:#6b6c62;margin-bottom:5px}"
    + ".sch{display:inline-block;background:#eef4ff;border:1px solid #c9d8f2;border-radius:6px;padding:2px 8px;font-size:12.5px;margin:2px 4px 2px 0}.sch.hk{background:#f7f0e3;border-color:#e5d2a8}"
    + ".pk{font:700 11.5px ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#6b6c62;margin:8px 0 2px;text-transform:uppercase}"
    + ".pcard ul{margin:0;padding-left:18px;font-size:13.5px}.pcard li{margin:2px 0}"
    + ".ptab{border-collapse:collapse;font-size:13.5px}.ptab td,.ptab th{padding:2px 12px 2px 0;text-align:left}.ptab th{color:#6b6c62;font-weight:600}"
    + ".calrow{display:flex;gap:12px;align-items:baseline;border:1px solid #ddd;border-left:6px solid #9aa0a6;border-radius:8px;padding:8px 12px;margin:6px 0;background:#fff;color:#15160f;font-size:14.5px}"
    + ".calrow>span{flex:1 1 0;min-width:0;overflow-wrap:anywhere}.calrow>b{font:800 11.5px ui-monospace,Menlo,monospace;letter-spacing:.1em;min-width:132px;flex:0 0 auto}"
    + ".calrow.red{border-left-color:#c0392b}.calrow.go{border-left-color:#0b6b49}.calrow.sleep{border-left-color:#c99a2e;background:#fff6dc}"
    + "@media(max-width:560px){.calrow{flex-direction:column;gap:2px}}"
    + ".learnbox{background:#eef4ff;border-left:6px solid #1d5fa8;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:14.5px;color:#15160f}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  /* A FORM 4 NAME IS ALWAYS SURNAME FIRST - "SHALLCROSS STEVEN A" */
  function personName(s) { var w = String(s || "").trim().split(/\s+/); if (w.length > 1) w.push(w.shift()); return w.map(function (x) { return x.length === 1 ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1).toLowerCase(); }).join(" "); }
  function money(v) { if (v == null) return "-"; var a = Math.abs(v), s = v < 0 ? "-" : ""; return a >= 1e9 ? s + "$" + (a / 1e9).toFixed(1) + "B" : a >= 1e6 ? s + "$" + (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? s + "$" + Math.round(a / 1e3) + "K" : s + "$" + Math.round(a); }
  function dollars(v) { return v == null ? "-" : "$" + Math.round(v).toLocaleString("en-US"); }
  function fd(d) { return d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function J(u) { return fetch(u).then(function (r) { return r.json(); }).catch(function () { return null; }); }
  function yearEnd(p, y) { var w = (p.weekly || []).filter(function (x) { return x[0].slice(0, 4) === String(y); }); return w.length ? w[w.length - 1][1] : null; }
  /* card-icon-1a (Mark 15 Nov: 'make a baseball card looking icon and place it as a link to the cards, i want the cards to become powerful and tradeable'); also warrantwire.com/card-icon.svg */
  var CARD_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true" style="width:26px;height:26px;flex:0 0 auto"><g transform="rotate(-8 24 24)"><rect x="9" y="4" width="30" height="40" rx="3.5" fill="#fffaf0" stroke="#c99a2e" stroke-width="2.6"/><rect x="12.5" y="7.5" width="23" height="20" rx="1.5" fill="#1d5fa8"/><circle cx="24" cy="15" r="4.2" fill="#fffaf0"/><path d="M15.5 27.5c.6-4.6 4.1-7.4 8.5-7.4s7.9 2.8 8.5 7.4z" fill="#fffaf0"/><rect x="11" y="25.5" width="26" height="5.5" rx="1" fill="#c0392b"/><path d="M14 34.5h20M14 38h14" stroke="#15160f" stroke-width="1.8" stroke-linecap="round"/><path d="M33.5 35.2l1.1 2.2 2.4.3-1.75 1.7.42 2.4-2.17-1.15-2.17 1.15.42-2.4-1.75-1.7 2.4-.3z" fill="#c99a2e"/></g></svg>';
  var SHELL_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-9 0-16 8-16 18 0 6 3 11 7 14h18c4-3 7-8 7-14C40 14 33 6 24 6z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 8v28M16 12l5 24M32 12l-5 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M14 40h20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

  function chartSVG(p) {
    var w = p.weekly || []; if (w.length < 10) return "";
    var W = 640, Hh = 230, L = 50, R = 10, Tp = 12, B = 34;
    var t0 = Date.parse(w[0][0]), t1 = Date.parse(w[w.length - 1][0]), span = t1 - t0 || 1;
    var vals = w.map(function (x) { return x[1]; }).filter(function (v) { return v > 0; });
    var lo = Math.floor(Math.log10(Math.min.apply(null, vals))), hi = Math.ceil(Math.log10(Math.max.apply(null, vals))); if (hi === lo) hi = lo + 1;
    var X = function (d) { return L + (Date.parse(d) - t0) / span * (W - L - R); };
    var Y = function (v) { return Tp + (1 - (Math.log10(Math.max(v, 1e-9)) - lo) / (hi - lo)) * (Hh - Tp - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" role="img" aria-label="Price, split-adjusted, with warrant deals and reverse splits marked">';
    for (var k = lo; k <= hi; k++) { var y = Y(Math.pow(10, k)), v = Math.pow(10, k), lab = v >= 1e6 ? "$" + v / 1e6 + "M" : v >= 1e3 ? "$" + v / 1e3 + "K" : v >= 1 ? "$" + v : "$" + v.toFixed(-k);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#e3e1d8"/><text x="' + (L - 4) + '" y="' + (y + 3).toFixed(1) + '" font-size="10" text-anchor="end" fill="#888">' + lab + '</text>'; }
    var y0 = new Date(t0).getUTCFullYear() + 1, y1 = new Date(t1).getUTCFullYear();
    for (var yr = y0; yr <= y1; yr++) { var x = X(yr + "-01-01"); s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Tp + '" y2="' + (Hh - B) + '" stroke="#f0eee6"/><text x="' + x.toFixed(1) + '" y="' + (Hh - B + 12) + '" font-size="10" text-anchor="middle" fill="#888">' + yr + '</text>'; }
    (p.deal_days || []).forEach(function (d) { if (d < w[0][0]) return; var x = X(d); s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (Hh - B - 8) + '" y2="' + (Hh - B) + '" stroke="#e5a100" stroke-width="1.4"/>'; });
    s += '<path d="M' + w.map(function (x) { return X(x[0]).toFixed(1) + "," + Y(x[1]).toFixed(1); }).join(" L") + '" fill="none" stroke="#15160f" stroke-width="1.8"/>';
    (p.splits || []).forEach(function (sp) { if (!sp.reverse || sp.d < w[0][0]) return; var q = w.filter(function (z) { return z[0] >= sp.d; })[0]; if (!q) return; var x = X(sp.d), y = Y(q[1]);
      s += '<path d="M' + x.toFixed(1) + ',' + (y - 2).toFixed(1) + ' l-6,-11 h12 z" fill="#c0392b"/><text x="' + x.toFixed(1) + '" y="' + (y - 16).toFixed(1) + '" font-size="10" text-anchor="middle" fill="#c0392b" font-weight="bold">' + esc(sp.ratio) + '</text>'; });
    s += '<text x="' + L + '" y="' + (Hh - 6) + '" font-size="10" fill="#c27f00">| warrant deal paper filed</text><text x="' + (W - R) + '" y="' + (Hh - 6) + '" font-size="10" fill="#c0392b" text-anchor="end">&#9660; reverse split</text></svg>';
    return s;
  }

  function render(el, tk, opts) {
    opts = opts || {}; if (!el) return; var open = !!opts.open, k8 = opts.site === "k8";
    Promise.all([J(API + "/?profile=1&ticker=" + encodeURIComponent(tk)), J(API + "/?pay=1&ticker=" + encodeURIComponent(tk))]).then(function (res) {
      var p = res[0], pay = res[1]; if (!p || !p.ok) return;
      var rs = (p.splits || []).filter(function (s) { return s.reverse; }), h = "";
      if (p.from_shell) h += '<a class="sbadge" href="https://shellmkt.com/" title="Shell Market">' + SHELL_SVG + '<span><b>CAME FROM A SHELL</b><br>' + esc(p.from_shell.how) + (p.from_shell.d ? ', ' + esc(p.from_shell.d) : '') + ' &middot; shellmkt.com</span></a>';
      var hv = p.holder ? p.holder.value : null;
      var hvTxt = hv == null ? "" : "$1,000 held since " + new Date(p.holder.from).toLocaleDateString("en-US", { month: "long", year: "numeric" }) + " is worth " + (hv < 1 ? "under $1" : dollars(hv)) + ".";
      var line = [];
      if (rs.length) line.push(rs.length + " reverse split" + (rs.length > 1 ? "s" : "") + " in 5 years");
      if (p.deal_papers) line.push(p.deal_papers + " warrant deal paper" + (p.deal_papers > 1 ? "s" : ""));
      if (hvTxt) line.push(hvTxt);
      var said = esc(line.join(". ").replace(/\.\./g, "."));
      if (rs.length && p.deal_papers >= 2 && hv != null && hv <= 250) h += '<div class="alarm"><div class="ak">THERIVA PATTERN</div><span class="ab">' + said + '</span></div>';
      else if (line.length) h += '<div class="alarm watch"><div class="ak">ON THE WATCH LIST</div><span class="ab">' + said + '</span></div>';
      var ch = chartSVG(p); if (ch) h += '<div class="chartbox">' + ch + '</div><p class="chartcap">Weekly close, split-adjusted, log scale. Red: reverse splits' + (rs.length ? ' (' + rs.map(function (s) { return esc(s.ratio) + ' ' + esc(s.d.slice(0, 7)); }).join(', ') + ')' : '') + '. Orange: each day a warrant deal paper was filed.</p>';
      /* the money */
      var rev = p.revenue || [], net = p.net || [], lastNet = net.length ? net[net.length - 1] : null, lastRev = rev.length ? rev[rev.length - 1] : null;
      h += '<div class="sh3">What the shareholders&rsquo; money bought</div><div class="sgrid">'
        + (p.deficit ? '<div class="sstat neg"><b>' + money(p.deficit.v) + '</b><span>lost since it began (accumulated deficit, ' + esc(p.deficit.d) + ')</span></div>' : '')
        + (rev.length && lastNet && +lastRev[0] < +lastNet[0] - 1 ? '<div class="sstat neg"><b>none</b><span>no revenue reported since ' + esc(lastRev[0]) + '</span></div>' : rev.length ? '<div class="sstat"><b>' + money(rev[0][1]) + ' &rarr; ' + money(lastRev[1]) + '</b><span>yearly revenue, ' + esc(rev[0][0]) + ' to ' + esc(lastRev[0]) + '</span></div>' : '<div class="sstat neg"><b>none</b><span>no yearly revenue reported</span></div>')
        + (lastNet ? '<div class="sstat' + (lastNet[1] < 0 ? ' neg' : '') + '"><b>' + money(lastNet[1]) + '</b><span>net ' + (lastNet[1] < 0 ? 'loss' : 'income') + ' in ' + esc(lastNet[0]) + '</span></div>' : '')
        + (p.cash ? '<div class="sstat"><b>' + money(p.cash.v) + '</b><span>cash on hand (' + esc(p.cash.d) + ')</span></div>' : '') + '</div>';
      if (lastNet && lastRev && lastNet[1] < 0 && lastRev[1] > 0 && lastNet[0] === lastRev[0]) h += '<div class="wwsell">Cure or game? It lost $' + (Math.abs(lastNet[1]) / lastRev[1]).toFixed(2) + ' for every $1 of revenue in ' + esc(lastNet[0]) + '.</div>';
      /* THE SELL SIGN: pay held while the stock fell (Mark, 15 Nov) */
      if (pay && pay.ok && (pay.here || []).length) {
        var top = {}; (pay.here || []).forEach(function (x) { if (!top[x.year] || x.total > top[x.year].total) top[x.year] = x; });
        var ys = Object.keys(top).sort(), yl = ys[ys.length - 1], tp = top[yl], e0 = yearEnd(p, +yl - 1), e1 = yearEnd(p, +yl);
        if (tp && e0 && e1) { var chg = Math.round((e1 / e0 - 1) * 100);
          h += '<div class="wwsell">' + (chg <= -50 ? '<b>SELL SIGN:</b> ' : '') + esc(tp.person) + ' was paid <b>' + dollars(tp.total) + '</b> in ' + esc(yl) + ' (salary ' + dollars(tp.salary) + ') while the stock ' + (chg < 0 ? 'fell ' + (-chg) + '%' : 'rose ' + chg + '%') + ' that year.</div>'; }
      }
      /* the calendar and the defences */
      var cal = "";
      if (p.sleeping) cal += '<div class="calrow sleep"><b>SLEEPING</b><span>' + (p.sleeping.since ? 'No annual meeting since ' + esc(fd(p.sleeping.since)) + ', none scheduled.' : 'No annual-meeting proxy found in its filings.') + ' A company with no meeting is easier to take over.</span></div>';
      if (p.next_meeting) { var nm = p.next_meeting;
        cal += '<div class="calrow ' + (nm.in_person ? 'go' : 'red') + '"><b>' + (nm.kind === "special" ? "SPECIAL MEETING" : "ANNUAL MEETING") + '</b><span>' + esc(fd(nm.d)) + (nm.time ? ', ' + esc(nm.time) : '') + ' &middot; '
          + (nm.in_person ? '<b>In person</b>' + (nm.place ? ' at ' + esc(nm.place) : '') + '. Shareholders of record can attend and speak.' : '<b>Virtual only</b> &mdash; no room, no faces.')
          + (nm.url ? ' <a href="' + esc(nm.url) + '" target="_blank" rel="noopener">The proxy</a>' : '') + '</span></div>'; }
      else if (p.last_annual) cal += '<div class="calrow"><b>LAST ANNUAL MEETING</b><span>' + esc(fd(p.last_annual.d)) + ' &middot; ' + (p.last_annual.in_person ? 'in person' + (p.last_annual.place ? ' at ' + esc(p.last_annual.place) : '') : 'virtual only') + '</span></div>';
      if (p.earnings) cal += '<div class="calrow"><b>EARNINGS</b><span>' + esc(fd(p.earnings.d)) + (p.earnings.when ? ', ' + esc(p.earnings.when) : '') + ' <small>(expected, per Nasdaq)</small></span></div>';
      cal += '<div class="calrow"><b>POISON PILL</b><span>' + (p.poison_pill ? '<b>Yes</b> &mdash; ' + esc(p.poison_pill.how) + ', ' + esc(fd(p.poison_pill.d)) : 'No rights plan in its own filings.')
        + (p.buyers_exempt_from_pill ? ' &middot; <b>' + p.buyers_exempt_from_pill.agreements + ' deal agreement' + (p.buyers_exempt_from_pill.agreements > 1 ? 's' : '') + ' exempt the buyers from any poison pill</b> (latest ' + esc(fd(p.buyers_exempt_from_pill.last)) + ').' : '') + '</span></div>';
      h += '<div class="sh3">The calendar and the defences</div>' + cal;
      if ((p.terms || []).length) {
        if (k8) h += '<p class="chartcap" style="margin-top:8px"><b>' + p.terms.length + ' kinds of warrant terms</b> in its deal papers. Warrant analysis is on <a href="https://warrantwire.com/company.html?t=' + encodeURIComponent(tk) + '">Warrant Wire</a>.</p>';
        else if (!open) h += '<p class="chartcap" style="margin-top:8px"><b>' + p.terms.length + ' kinds of terms</b> in its deal papers. Which ones, and in which deal, is in the report.</p>';
        else h += '<div class="sh3">The exact terms in its deal papers</div><p style="font-size:14px">' + p.terms.map(function (t) { return esc(t[0]) + ' (' + t[1] + ')'; }).join(' &middot; ') + '</p>';
      }
      h += '<div class="learnbox"><b>We are learning in public.</b> Since August 2021 we have read every filing carrying warrant language. Every report adds what happened after each deal, and who was in charge, so the next warning comes earlier.</div>';
      el.innerHTML = h;
    });
  }

  /* THE PEOPLE WHO RAN IT: schools quoted from the proxy (free - Mark: "Professors will demand higher ethics when the
     schools are called out"), how many other companies (free), the companies and the pay tables (paid / sample). */
  function people(el, tk, opts) {
    opts = opts || {}; if (!el) return; var open = !!opts.open;
    var go = function (d) {
      Promise.all([J(API + "/?schools=1&ticker=" + encodeURIComponent(tk)), J(API + "/?careers=1&ticker=" + encodeURIComponent(tk)), J(API + "/?pay=1&ticker=" + encodeURIComponent(tk))]).then(function (r) {
        var sc = (r[0] && r[0].schools) || [], ca = (r[1] && r[1].people) || [], py = (r[2] && r[2].here) || [];
        var ppl = ((d && d.officers) || []).map(function (x) { return [x, x.title || "Officer"]; }).concat(((d && d.directors) || []).map(function (x) { return [x, "Director"]; }));
        if (!ppl.length) return;
        var last = function (s) { return String(s || "").split(/\s+/)[0].toLowerCase(); };
        /* cards-home-1a (Mark 15 Nov: 'the cards belong to 8k10q.com'): the cards live in the company's 8K10Q room; every site sends people there */
        var cardsBtn = '<a href="https://8k10q.com/room?t=' + encodeURIComponent(tk) + '#cards" style="display:inline-flex;align-items:center;gap:8px;margin:2px 0 8px;background:#1d5fa8;color:#fff;border-radius:9px;padding:6px 14px 6px 8px;font-weight:700;text-decoration:none">' + CARD_SVG + 'Their cards, on 8K10Q &rarr;</a>';
        var h = '<div class="sh3">The people who ran it</div>' + cardsBtn + '<p class="chartcap">Schools quoted from the company&rsquo;s own proxy biography. Other companies from each person&rsquo;s SEC insider record. Pay from each year&rsquo;s 10-K or proxy.</p>';
        ppl.forEach(function (pr) {
          var x = pr[0], nm = personName(x.name), mine = sc.filter(function (s) { return s.person === x.name; });
          var cr = ca.filter(function (c) { return c.name === x.name; })[0], others = cr ? cr.elsewhere || [] : [];
          var pays = py.filter(function (q) { return String(q.person).toLowerCase().indexOf(last(x.name)) >= 0; });
          h += '<div class="pcard"><div class="pn">' + esc(nm) + '</div><div class="pr">' + esc(pr[1]) + '</div><div>'
            + (mine.length ? mine.map(function (s) { return /hard knocks/i.test(s.school) ? '<span class="sch hk">School of hard knocks <small>(no degree listed in the company&rsquo;s proxy)</small></span>' : '<span class="sch"><b>' + esc(s.level || "") + '</b> &middot; ' + esc(s.school) + ' <small>(' + esc(s.degree) + ')</small></span>'; }).join('') : '<span class="sch hk">Schools: not read yet</span>') + '</div>'
            + '<div class="pk">Other companies on their SEC record: ' + others.length + '</div>';
          if (open && others.length) h += '<ul>' + others.slice(0, 8).map(function (o) { var f = o.filings || {}, s = o.shares || {}, b = [];
              if (f.exchange_notices_301) b.push(f.exchange_notices_301 + " exchange notice" + (f.exchange_notices_301 > 1 ? "s" : "")); if (f.charter_amendments_503) b.push(f.charter_amendments_503 + " charter amendments"); if (o.name_changes) b.push("renamed " + o.name_changes + "x"); if (s.first && s.now && s.now / s.first >= 2) b.push("shares x" + (s.now / s.first).toFixed(1)); if (o.deficit && o.deficit.amount) b.push("deficit " + money(o.deficit.amount));
              return '<li><b>' + esc(o.now_called) + '</b> <span style="color:#6b6c62">(' + esc(o.role) + ', last filed ' + esc(o.last_transaction) + ')</span>' + (b.length ? ' &mdash; ' + esc(b.join(', ')) : '') + '</li>'; }).join('') + '</ul>';
          else if (others.length) h += '<p class="chartcap">Which companies, and what happened at each, is in the report.</p>';
          if (pays.length) {
            if (open) h += '<div class="pk">Pay</div><table class="ptab"><tr><th>Year</th><th>Salary</th><th>Total</th></tr>' + pays.map(function (q) { return '<tr><td>' + q.year + '</td><td>' + dollars(q.salary) + '</td><td><b>' + dollars(q.total) + '</b></td></tr>'; }).join('') + '</table>';
            else h += '<p class="chartcap">' + pays.length + ' year' + (pays.length > 1 ? 's' : '') + ' of pay on file &mdash; in the report.</p>';
          }
          h += '</div>';
        });
        el.innerHTML = opts.prepend ? h + el.innerHTML : h;
      });
    };
    if (opts.data) go(opts.data); else J(API + "/?people=1&ticker=" + encodeURIComponent(tk)).then(function (d) { if (d && d.ok) go(d); });
  }
  window.WWStory = { render: render, people: people };
})();
