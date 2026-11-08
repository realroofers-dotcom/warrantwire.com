/* BUILT 2026-11-08 · pulse-1b — THE LIVE TAB ICON.

   Mark, 8 Nov 2026, in his own words:
     8K10Q        "i want a blue dot pulsing"
     Warrant Wire "warrantwire i want a ww red pulse"
     Wise Sleuth  "wise in brown for wisesleuth"
     marknejmeh   "i want a changing color MN"

   ⚠ WHAT IT IS. The tab icon moves. A dot that breathes like a recording
   light, or letters that change colour. The favicon is the only part of a site
   a man sees when he is looking at a different tab, and a still one says
   nothing. This is the cheapest signal we own that the desk is live.

   TWO MODES, one file:
     data-mode="dot"    paints a pulsing dot on the corner of the real icon
     data-mode="glyph"  draws the letters itself and cycles their colour

   ⚠ "dot" DRAWS ON TOP OF THE REAL ICON. It starts from /favicon-32.png so the
   site keeps its own mark. If that file cannot be read the script does nothing
   at all and the ordinary favicon stays — never a blank tab.

   ⚠ IT STOPS WHEN NOBODY IS LOOKING. On a hidden tab the loop is cancelled,
   not slowed: animating something nobody can see is just burning a battery.
   It also stops for anyone whose machine asks for less motion.

   ⚠ THE FRAMES ARE DRAWN ONCE. They become data URLs and are then cycled, so
   after the first moment this costs one assignment per tick and no drawing.

   USE:
     <script src="/pulse.js" data-mode="dot" data-colour="#2a7fd6" defer></script>
     <script src="/pulse.js" data-mode="glyph" data-text="MN"
             data-tile="#101014" data-font="Arial Black" defer></script>
*/
(function () {
  "use strict";

  var tag = document.currentScript;
  function attr(k, d) { return (tag && tag.getAttribute(k)) || d; }

  var MODE   = attr("data-mode", "dot");
  var COLOUR = attr("data-colour", "#2a7fd6");
  var BASE   = attr("data-base", "/favicon-32.png");
  var TEXT   = attr("data-text", "MN");
  var TILE   = attr("data-tile", "#101014");
  var FONT   = attr("data-font", "Arial Black, Arial, sans-serif");

  var FRAMES  = MODE === "glyph" ? 24 : 8;
  var STEP_MS = MODE === "glyph" ? 320 : 190;

  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch (e) {}
  if (!document.createElement("canvas").getContext) return;

  var link = null, frames = null, i = 0, timer = null;

  function iconLink() {
    var l = document.querySelector('link[rel="icon"][data-pulse]');
    if (l) return l;
    l = document.createElement("link");
    l.setAttribute("rel", "icon");
    l.setAttribute("type", "image/png");
    l.setAttribute("data-pulse", "1");
    document.head.appendChild(l);
    return l;
  }

  function canvas32() {
    var c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    return c;
  }

  /* a rounded tile, because a square icon in a round slot looks like a mistake */
  function tile(g, colour) {
    var r = 6;
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(32 - r, 0); g.quadraticCurveTo(32, 0, 32, r);
    g.lineTo(32, 32 - r); g.quadraticCurveTo(32, 32, 32 - r, 32);
    g.lineTo(r, 32); g.quadraticCurveTo(0, 32, 0, 32 - r);
    g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.closePath(); g.fill();
  }

  /* ⚠ THE LETTERS ARE FITTED, NOT GUESSED. Two letters and one letter need
     very different sizes, and a guess that overflows at 32px is unreadable at
     16px, which is the only size that matters. */
  function fitText(g, text) {
    var size = 26;
    for (; size > 6; size--) {
      g.font = "900 " + size + "px " + FONT;
      if (g.measureText(text).width <= 27) break;
    }
    return size;
  }

  function buildGlyph() {
    var out = [];
    for (var f = 0; f < FRAMES; f++) {
      var c = canvas32(), g = c.getContext("2d");
      g.clearRect(0, 0, 32, 32);
      tile(g, TILE);
      /* right round the wheel across the frames, never landing on a muddy hue */
      var hue = Math.round(f * (360 / FRAMES));
      g.fillStyle = "hsl(" + hue + ", 85%, 60%)";
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, TEXT);
      g.fillText(TEXT, 16, 17);
      try { out.push(c.toDataURL("image/png")); } catch (e) { return null; }
    }
    return out;
  }

  function buildDot(img) {
    var out = [];
    for (var f = 0; f < FRAMES; f++) {
      var c = canvas32(), g = c.getContext("2d");
      g.clearRect(0, 0, 32, 32);
      try { g.drawImage(img, 0, 0, 32, 32); } catch (e) { return null; }

      /* one breath out and back across the frames — a pulse, never a blink */
      var swell = Math.sin((f / FRAMES) * Math.PI * 2) * 0.5 + 0.5;
      var cx = 24.5, cy = 24.5;

      g.globalAlpha = 0.33 * (1 - swell);
      g.fillStyle = COLOUR;
      g.beginPath(); g.arc(cx, cy, 5.5 + swell * 4.5, 0, Math.PI * 2); g.fill();

      /* a white ring so the dot reads against whatever mark is underneath */
      g.globalAlpha = 1;
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(cx, cy, 6.1, 0, Math.PI * 2); g.fill();

      g.fillStyle = COLOUR;
      g.globalAlpha = 0.72 + swell * 0.28;
      g.beginPath(); g.arc(cx, cy, 4.6, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;

      try { out.push(c.toDataURL("image/png")); } catch (e) { return null; }
    }
    return out;
  }

  function show() { if (frames) { link.setAttribute("href", frames[i]); i = (i + 1) % frames.length; } }
  function stop()  { if (timer) { clearInterval(timer); timer = null; } }
  function run()   { stop(); if (!frames || document.hidden) return; show(); timer = setInterval(show, STEP_MS); }

  function start(built) {
    if (!built) return;                       /* drawing failed: leave the tab alone */
    frames = built;
    link = iconLink();
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : run(); });
    run();
  }

  if (MODE === "glyph") {
    start(buildGlyph());
  } else {
    var img = new Image();
    img.onload  = function () { start(buildDot(img)); };
    img.onerror = function () { /* no base icon: keep the plain one */ };
    img.src = BASE;
  }
})();
