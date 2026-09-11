/* BUILT 2026-09-11 · warrantwire wire.js 1a
   ============================================================================
   ONE SCRIPT FOR WHAT EVERY PAGE DOES. v1.2.

   The home page and the company page both draw rows, both add to the
   checkout, both reveal Stephen's clips, both open the menu. That code was
   pasted into each page and drifted. This is the one copy. It puts one
   object on the window, WW, and nothing else.

     WW.esc(s)              escape for HTML
     WW.nameOf(s)           strip "(CIK 123)" off a company name
     WW.plainTag(label)     the plain-English words for a term; the term stays
                            as the tooltip
     WW.marks(labels)       the mark spans for a " | " list, deduped in plain
                            English, pre-funded flashing
     WW.row(filing)         one free row: ticker, name, industry, marks, buy
     WW.gate(n, ticker)     the gate after the free rows
     WW.wbuy(sku, t, acc)   add to the checkout and say so
     WW.clips.reveal()      light the speakers on rows that have a clip
     WW.API, WW.HEAVY       the wire's address; the heavier terms

   ⚠ EVERY ADDRESS IS HERE, ONCE. Check these before anything else when a
   page stops answering.
   ============================================================================ */
(function () {
  "use strict";

  var WW = {
    API:     "https://triggeredshort-wire.realroofers.workers.dev",
    STEPHEN: "https://stephen.realroofers.workers.dev",
    PAY:     "https://pay.realroofers.workers.dev",
    BASKET:  "ww.checkout"
  };

  /* the seven phrases the wire treats as heavier than the rest */
  WW.HEAVY = ["Price reset","Cashless exercise","Warrant inducement","Inducement agreement",
              "Reduced exercise price","Variable rate transaction","Equity line"];

  WW.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  WW.nameOf = function (s) {
    return String(s || "").replace(/\s*\(CIK\s*\d+\)\s*$/i, "").trim();
  };

  /* ⚠ PLAIN ENGLISH ON THE TAGS. His instruction: "in plain language they have
     this, they have that — we don't want to give them the kitchen sink." The
     proper term stays as the tooltip, because the glossary teaches it. */
  var PLAIN = {
    "variable rate transaction": "Price moves with the market",
    "ownership blocker":         "Buyer's stake capped",
    "pre-funded warrants":       "Stock already paid for",
    "price reset":               "Price can be lowered",
    "reduced exercise price":    "Price was cut",
    "warrant inducement":        "Paid to convert early",
    "inducement agreement":      "Paid to convert early",
    "cashless exercise":         "Converts without cash",
    "equity line":               "Shares sold off over time",
    "floor price":               "A floor on the price",
    "most favored nation":       "Gets any better terms later",
    "most favoured nation":      "Gets any better terms later",
    "participation right":       "Can join the next raise",
    "registered direct":         "Sold to chosen buyers",
    "atm programme":             "Sold into the open market",
    "atm program":               "Sold into the open market",
    "placement agent":           "Placement agent"
  };
  WW.plainTag = function (l) {
    return PLAIN[String(l || "").toLowerCase().trim()] || l;
  };

  /* ⚠ DEDUPE AFTER TRANSLATION. "Warrant inducement" and "Inducement agreement"
     are two phrases with one meaning; printing "Paid to convert early" twice
     makes a reader stop trusting the count. The first raw phrase wins and
     keeps its own tooltip. */
  WW.dedupe = function (labels) {
    var out = [], seen = {};
    (labels || []).forEach(function (l) {
      if (!l) return;
      var pl = String(WW.plainTag(l)).toLowerCase();
      if (seen[pl]) return;
      seen[pl] = 1; out.push(l);
    });
    return out;
  };
  WW.split = function (s) {
    return String(s || "").split(" | ").map(function (x) { return x.trim(); }).filter(Boolean);
  };
  WW.marks = function (labels, max) {
    var list = WW.dedupe(Array.isArray(labels) ? labels : WW.split(labels));
    if (max) list = list.slice(0, max);
    return list.map(function (l) {
      var cls = "m" + (WW.HEAVY.indexOf(l) > -1 ? " h" : "") + (/pre[-\s]?funded/i.test(l) ? " pf" : "");
      return '<span class="' + cls + '" title="' + WW.esc(l) + '">' + WW.esc(WW.plainTag(l)) + '</span>';
    }).join("");
  };

  /* ⚠ THE FREE ROW GIVES THE NAME, THE INDUSTRY AND THE MARKS. NOTHING ELSE.
     His ruling: "we are selling information repackaged, that is our product."
     No date, no form, no accession, no link to the document. The accession
     travels inside the buy button and is never printed. */
  WW.row = function (f) {
    var t = (f.ticker || "").toUpperCase();
    var acc = WW.esc(f.accession || "");
    var page = t ? "/company.html?t=" + encodeURIComponent(t) : null;
    return '<div class="row' + (f.heavy ? ' heavy' : '') + '">'
      + '<div class="tk">' + (page ? '<a href="' + page + '">' + WW.esc(t) + '</a>' : '&mdash;') + '</div>'
      + '<div><p class="co">'
      +   (page ? '<a href="' + page + '">' + WW.esc(WW.nameOf(f.company)) + '</a>' : WW.esc(WW.nameOf(f.company)))
      +   '<button class="spk" type="button" aria-pressed="false" data-acc="' + acc + '" '
      +     'title="Hear this row read aloud" aria-label="Hear this row read aloud">'
      +     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4z"/></svg>'
      +   '</button><span class="spklen" data-acc="' + acc + '"></span></p>'
      +   (f.sector ? '<p class="ind">' + WW.esc(f.sector) + '</p>' : '')
      +   '<div class="marks">' + WW.marks(f.labels) + '</div></div>'
      + '<div class="go">'
      +   (page ? '<a class="verdict" href="' + page + '">The verdict &rarr;</a><br>' : '')
      +   '<button class="wbuy readbtn" data-sku="wire_read" data-t="' + WW.esc(t) + '" data-acc="' + acc + '">'
      +     'Read this one &middot; $20</button>'
      + '</div></div>';
  };

  /* THE GATE. Five free everywhere on this site, then this. One ask. */
  WW.gate = function (n) {
    return '<div class="gate">'
      + '<p class="g1">' + n + ' more filing' + (n === 1 ? '' : 's') + ' in this window.</p>'
      + '<p class="g2">The five above are the most recent from today\'s scan, free, and they '
      + 'change every day. <b>Search a company you name and get its verdict &mdash; every '
      + 'filing, every year, and what they add up to.</b></p>'
      + '<a class="wbuy gold" href="#q" data-focus="q">Search a company &mdash; $12</a>'
      + '<p class="g3">One payment. Nothing recurring. <b style="color:var(--ink)">A search that '
      + 'finds nothing costs you nothing.</b> Everything else is on '
      + '<a href="/prices.html">the price page</a>.</p>'
      + '</div>';
  };

  /* ---- the checkout ---------------------------------------------------------
     ⚠ THE AMOUNT IS NEVER SENT FROM A PAGE. The pay worker holds every price.
     What is kept here is a list of SKUs with the company and filing attached,
     so the checkout says what was actually bought. It adds and LEAVES HIM
     WHERE HE IS — he goes to the checkout when he decides he is done. */
  function held() {
    try { var r = localStorage.getItem(WW.BASKET); var l = r ? JSON.parse(r) : [];
          return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  WW.wmsg = function (t, bad) {
    var m = document.getElementById("wbuymsg");
    if (!m) return;
    m.textContent = t; m.className = bad ? "bad" : "";
  };
  WW.wbuy = function (sku, ticker, accession, reader) {
    if (!sku) return;
    var q = document.getElementById("q");
    var t = (ticker || (q && q.value) || "").trim().toUpperCase();
    var acc = accession || "";
    var l = held(), i, done = false;
    for (i = 0; i < l.length; i++) {
      if (l[i].sku !== sku) continue;
      var has = !!(l[i].ticker || l[i].acc), want = !!(t || acc);
      if (has && want && (l[i].ticker || "") === t && (l[i].acc || "") === acc) { done = true; break; }
      if (!has && want) { l[i].ticker = t; l[i].acc = acc; if (reader) l[i].reader = reader; done = true; break; }
      if (!want) { done = true; break; }
    }
    if (!done) { var line = { sku: sku, ticker: t, acc: acc }; if (reader) line.reader = reader; l.push(line); }
    try { localStorage.setItem(WW.BASKET, JSON.stringify(l)); } catch (e) {}
    WW.wmsg("Added. " + l.length + " on the checkout — the button is at the top right.");
    if (window.wwRefreshCart) try { window.wwRefreshCart(); } catch (e) {}
  };

  /* ---- Stephen on the row ---------------------------------------------------
     ⚠ ASKED ONCE, NOT PER ROW. One call returns every accession he has recorded;
     drawing a speaker is then a lookup. The clip list and the rows arrive in
     either order, so both call reveal() and whichever is last does the work. */
  var CLIPS = null, PLAYER = null, PLAYING = null;
  WW.clips = {
    reveal: function () {
      if (!CLIPS) return;
      var btns = document.querySelectorAll("button.spk"), i;
      for (i = 0; i < btns.length; i++) {
        var acc = btns[i].getAttribute("data-acc");
        if (acc && CLIPS[acc] !== undefined) btns[i].classList.add("on");
      }
      var tags = document.querySelectorAll("span.spklen");
      for (i = 0; i < tags.length; i++) {
        var a2 = tags[i].getAttribute("data-acc"), secs = a2 ? CLIPS[a2] : undefined;
        if (secs) { tags[i].textContent = secs + "s"; tags[i].classList.add("on"); }
      }
    }
  };
  function stopClip() {
    if (PLAYER) { try { PLAYER.pause(); } catch (e) {} }
    if (PLAYING) { PLAYING.setAttribute("aria-pressed", "false"); PLAYING = null; }
  }
  function playClip(btn) {
    var acc = btn.getAttribute("data-acc");
    if (!acc) return;
    if (PLAYING === btn) { stopClip(); return; }
    stopClip();
    if (!PLAYER) { PLAYER = new Audio(); PLAYER.addEventListener("ended", stopClip); PLAYER.addEventListener("error", stopClip); }
    PLAYER.src = WW.STEPHEN + "/?row=" + encodeURIComponent(acc);
    PLAYING = btn; btn.setAttribute("aria-pressed", "true");
    var p = PLAYER.play();
    if (p && p.catch) p.catch(function () { stopClip(); });
  }
  if (document.querySelector("#rows, #vrows, .rows")) {
    fetch(WW.STEPHEN + "/?rows=1")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        CLIPS = {};
        ((d && d.clips) || []).forEach(function (c) { CLIPS[c.accession] = c.seconds || 0; });
        WW.clips.reveal();
      })
      .catch(function () { CLIPS = null; });
  }

  /* ---- one listener for the whole page ------------------------------------ */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("button.spk, .wbuy[data-sku], [data-focus]") : null;
    if (!el) return;
    if (el.classList.contains("spk")) { e.preventDefault(); playClip(el); return; }
    if (el.hasAttribute("data-focus")) {
      var q = document.getElementById(el.getAttribute("data-focus"));
      if (q) { e.preventDefault(); q.focus(); try { q.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (x) {} }
      return;
    }
    if (el.tagName === "A") e.preventDefault();
    WW.wbuy(el.getAttribute("data-sku"), el.getAttribute("data-t"),
            el.getAttribute("data-acc"), el.getAttribute("data-reader"));
  });

  /* ---- the search box sends you to the company page ----------------------- */
  WW.go = function (t) {
    t = String(t || "").trim().toUpperCase();
    if (!t) return;
    location.href = "/company.html?t=" + encodeURIComponent(t);
  };
  var q = document.getElementById("q"), go = document.getElementById("go");
  if (q && go) {
    go.addEventListener("click", function () { WW.go(q.value); });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") WW.go(q.value); });
  }

  /* ---- the menu ------------------------------------------------------------- */
  (function () {
    var b = document.getElementById("navbtn"), p = document.getElementById("navpanel"),
        s = document.getElementById("navscrim");
    if (!b || !p) return;
    function set(open) {
      b.setAttribute("aria-expanded", open ? "true" : "false");
      p.setAttribute("data-open", open ? "1" : "0");
      if (s) s.setAttribute("data-open", open ? "1" : "0");
    }
    b.addEventListener("click", function () { set(b.getAttribute("aria-expanded") !== "true"); });
    if (s) s.addEventListener("click", function () { set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  })();

  window.WW = WW;
})();
