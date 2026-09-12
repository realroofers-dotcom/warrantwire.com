/* BUILT 2026-09-12 · warrantwire nav.js 1a
   ============================================================================
   THE ICON NAV — the nine doors from the home page, on every page, in one
   row under the masthead. His ruling, 12 Sep: navigation should be icon
   driven like the home page; icons work for us.

   ONE COPY. A page includes <script src="/nav.js" defer></script> and gets
   the strip; the doors are listed here and nowhere else, so adding one is
   one line. The old hamburger panel, where a page still has it, is hidden by
   this file so there is one navigation, not two.

   The strip is drawn right after <header class="top"> where a page has one,
   otherwise at the top of <body>. The current page's door is marked.
   ============================================================================ */
(function () {
  "use strict";
  var DOORS = [
    ["lime",   "/",                          "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 2v4M12 18v4M2 12h4M18 12h4M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "Check my stock"],
    ["rose",   "/player.html",               "M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6", "On air", true],
    ["amber",  "/concern.html",              "M12 3 2 21h20L12 3zM12 10v5M12 18v.5", "About to fold?"],
    ["orange", "/patterns.html",             "M4 7h11l-3-3M20 17H9l3 3M4 12h16", "Reverse-split?"],
    ["violet", "/company.html?t=TOVX#could", "M9 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M15 6h6M15 10h6M17 14h4", "Who's behind it?"],
    ["green",  "/violations.html",           "M5 4h14v16H5zM8 8h8M8 11h8M8 14h5M15 15l4 4", "File Salad"],
    ["teal",   "/wire.html",                 "M4 5h16v14H4zM8 9h8M8 12h8M8 15h5", "Free reports"],
    ["sky",    "/look.html",                 "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "Look at this"],
    ["blue",   "/#alerts",                   "M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0", "Warn me"]
  ];
  var COLOR = { lime:"#a6f542", rose:"#f28cb1", amber:"#e5b83a", orange:"#f0904a", violet:"#b48be6", green:"#63c48f", teal:"#4fd1c5", sky:"#7cc7f5", blue:"#6fa8e0" };

  var CSS = ''
    + '.wwnav{border-bottom:1px solid var(--line,#dcdad0);background:var(--paper,#fff)}'
    + '.wwnav ul{list-style:none;margin:0 auto;padding:10px 22px;max-width:1100px;display:flex;gap:6px 4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}'
    + '.wwnav ul::-webkit-scrollbar{display:none}'
    + '.wwnav li{flex:0 0 auto}'
    + '.wwnav a{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink,#14150f);font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;padding:6px 10px 6px 6px;border-radius:999px;border:1px solid transparent;white-space:nowrap}'
    + '.wwnav a:hover{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,#fff)}'
    + '.wwnav a.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 22%,#fff)}'
    + '.wwnav .d{position:relative;width:30px;height:30px;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;flex:0 0 30px}'
    + '.wwnav .d svg{width:17px;height:17px;stroke:#14150f;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}'
    + '.wwnav .d.live::after{content:"";position:absolute;top:-1px;right:-1px;width:9px;height:9px;border-radius:50%;background:#e3242b;border:2px solid #fff;animation:wwonair 1.6s ease-in-out infinite}'
    + '@keyframes wwonair{0%,100%{box-shadow:0 0 0 0 rgba(227,36,43,.6)}60%{box-shadow:0 0 0 6px rgba(227,36,43,0)}}'
    + '@media(max-width:700px){.wwnav ul{padding:8px 12px}.wwnav a{flex-direction:column;gap:4px;padding:6px 6px;font-size:10.5px;min-width:64px;text-align:center}.wwnav .d{width:34px;height:34px;flex-basis:34px}.wwnav .d svg{width:19px;height:19px}}'
    /* one navigation, not two: the old hamburger panel goes */
    + '.navbtn,.navpanel,.navscrim,.wwflag{display:none !important}'
    + '@media(max-width:820px){.masthead{padding-top:26px !important}}';

  function draw() {
    if (document.querySelector(".wwnav")) return;
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    var here = location.pathname.replace(/\/index\.html$/, "/") + location.search;
    var nav = document.createElement("nav"); nav.className = "wwnav"; nav.setAttribute("aria-label", "Site");
    var ul = document.createElement("ul");
    DOORS.forEach(function (d) {
      var li = document.createElement("li"), a = document.createElement("a");
      a.href = d[1]; a.style.setProperty("--c", COLOR[d[0]]);
      var path = d[1].split("#")[0];
      if (path && path !== "/" && here.indexOf(path) === 0) a.className = "on";
      if (path === "/" && (here === "/" || here === "")) a.className = "on";
      a.innerHTML = '<span class="d' + (d[4] ? ' live' : '') + '"><svg viewBox="0 0 24 24"><path d="' + d[2] + '"/></svg></span><span>' + d[3] + '</span>';
      li.appendChild(a); ul.appendChild(li);
    });
    nav.appendChild(ul);
    var top = document.querySelector("header.top") || document.querySelector("header");
    if (top && top.parentNode) top.parentNode.insertBefore(nav, top.nextSibling);
    else document.body.insertBefore(nav, document.body.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw); else draw();
})();
