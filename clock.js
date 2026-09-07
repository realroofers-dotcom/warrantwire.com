/* BUILT 2026-09-07 16:58 ET · clock-1a · New York date and time
   ---------------------------------------------------------------------------
   ONE FILE, ALL THREE FINANCE SITES. Drop clock.js in the repo root and put
   this line at the bottom of the page, just before </body>:

       <script src="/clock.js"></script>

   Nothing else to edit. It finds its own spot on the page:
     1. an element with id="nyc", if you have put one there yourself
     2. otherwise the masthead (.mast)
     3. otherwise the first <header>

   ALWAYS NEW YORK TIME, whoever is reading. It does not use the visitor's
   clock — a man in London sees 4:58 PM ET, the same as a man in Newark.
   Daylight saving is handled by the browser's own timezone database, so
   nothing has to be changed twice a year.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var ZONE = "America/New_York";

  /* ---- where it goes ---- */
  function slot() {
    var el = document.getElementById("nyc");
    if (el) return el;
    var host = document.querySelector(".mast") || document.querySelector("header");
    if (!host) return null;
    el = document.createElement("div");
    el.id = "nyc";
    host.appendChild(el);
    return el;
  }

  /* ---- its own styling, so no site stylesheet has to change ---- */
  function style() {
    if (document.getElementById("nyc-style")) return;
    var s = document.createElement("style");
    s.id = "nyc-style";
    s.textContent =
      "#nyc{font:600 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "letter-spacing:.06em;text-transform:uppercase;opacity:.72;" +
      "white-space:nowrap;margin-top:6px}" +
      "#nyc .nyc-t{font-variant-numeric:tabular-nums}" +
      "#nyc .nyc-z{opacity:.7;margin-left:5px}" +
      "@media(max-width:560px){#nyc{font-size:11px}}";
    document.head.appendChild(s);
  }

  /* ---- the two formatters, built once ---- */
  var fmtDate, fmtTime, fmtZone;
  try {
    fmtDate = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE, weekday: "short", month: "short",
      day: "numeric", year: "numeric"
    });
    fmtTime = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE, hour: "numeric", minute: "2-digit",
      second: "2-digit", hour12: true
    });
    fmtZone = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE, timeZoneName: "short"
    });
  } catch (e) {
    return;                    /* very old browser - show nothing rather than something wrong */
  }

  /* EST in winter, EDT in summer - read it off the date, never hardcode it */
  function zoneName(d) {
    var parts = fmtZone.formatToParts(d);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "timeZoneName") return parts[i].value;
    }
    return "ET";
  }

  var el = null;

  function tick() {
    if (!el) return;
    var d = new Date();
    el.innerHTML =
      '<span class="nyc-d">' + fmtDate.format(d) + '</span>' +
      ' &middot; <span class="nyc-t">' + fmtTime.format(d) + '</span>' +
      '<span class="nyc-z">' + zoneName(d) + '</span>';
  }

  function start() {
    style();
    el = slot();
    if (!el) return;
    el.setAttribute("aria-label", "Current date and time in New York");
    tick();
    /* line up on the second so it does not drift or stutter */
    setTimeout(function () {
      tick();
      setInterval(tick, 1000);
    }, 1000 - (new Date().getMilliseconds()));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
