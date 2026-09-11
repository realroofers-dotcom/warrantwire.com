/* BUILT 2026-09-11 · warrantwire corner.js 1a
   THE CORNER: Amalia's player and the breaking bulletin. Moved out of the
   home page unchanged, so any page can carry the corner by including the
   #topstack markup and this file. Two workers, one line each to check:
   amalia (the broadcast) and newsroom (the bulletin). */
(function () {
  /* ⚠ ONE LINE TO CHECK if her worker ever moves. */
  var AMALIA = "https://amalia.realroofers.workers.dev";

  var box = document.getElementById("squawk");
  if (!box) return;
  var au = document.getElementById("sqaudio");
  var go = document.getElementById("sqgo");
  var on = null, ticking = null;

  function two(n) { return ("0" + n).slice(-2); }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ":" + two(s%60); }

  function away(mins) {
    if (mins < 1) return "any moment";
    if (mins < 60) return "in " + mins + (mins === 1 ? " minute" : " minutes");
    var h = Math.floor(mins / 60), m = mins % 60;
    return "in " + h + (h === 1 ? " hour" : " hours") + (m ? " " + m + " minutes" : "");
  }

  function paint(d) {
    if (!d || !d.ok) { box.hidden = true; return; }

    /* ⚠ NOTHING RECORDED MEANS NOTHING SHOWN. No dead player. */
    if (!d.on_air) { box.hidden = true; return; }

    box.hidden = false;

    var isNew = !on || on.audio !== d.on_air.audio;
    on = d.on_air;

    document.getElementById("sqwho").textContent = "Amalia — " + on.broadcast;
    document.getElementById("sqwhen").textContent = d.now_in_new_york + " New York";

    document.getElementById("sqline").innerHTML =
      "<b>" + (on.minutes ? on.minutes + " minutes" : "Ready") + "</b> &middot; " +
      "recorded " + (on.air_date === (new Date()).toISOString().slice(0,10)
        ? "today" : "on " + on.air_date);

    document.getElementById("sqnext").innerHTML =
      d.weekend
        ? "She is off at the weekend &mdash; the markets are shut and so is she. " +
          "Back Monday at <b>08:18</b>."
        : "Next: <b>" + d.next.broadcast + "</b> at <b>" + d.next.at +
          "</b> &mdash; " + away(d.next.minutes_away) + ".";

    var t = "";
    for (var i = 0; i < (d.schedule || []).length; i++) {
      var s2 = d.schedule[i];
      t += '<span class="' + (s2.slot === on.slot ? "now" : "") + '">' +
           s2.at + ' ' + s2.broadcast + '</span>';
    }
    document.getElementById("sqtimes").innerHTML = t;

    /* ⚠ A NEW BROADCAST DOES NOT INTERRUPT SOMEBODY LISTENING. */
    if (isNew && au.paused) au.src = AMALIA + on.audio;
  }

  go.addEventListener("click", function () {
    if (!on) return;
    if (!au.src) au.src = AMALIA + on.audio;
    if (au.paused) au.play(); else au.pause();
  });

  au.addEventListener("play", function () {
    box.classList.add("playing");
    document.getElementById("sqstate").textContent = "Playing";
  });
  function stopped() {
    box.classList.remove("playing");
    document.getElementById("sqstate").textContent = "On air";
  }
  au.addEventListener("pause", stopped);
  au.addEventListener("ended", function () {
    stopped();
    document.getElementById("sqbar").style.width = "0";
  });
  au.addEventListener("timeupdate", function () {
    if (!au.duration || !isFinite(au.duration)) return;
    document.getElementById("sqbar").style.width =
      (au.currentTime / au.duration * 100) + "%";
    document.getElementById("sqline").innerHTML =
      "<b>" + mmss(au.duration - au.currentTime) + " left</b> &middot; " +
      on.broadcast.toLowerCase();
  });

  function look() {
    fetch(AMALIA + "/?live=1")
      .then(function (r) { return r.json(); })
      .then(paint)
      .catch(function () {});
  }

  look();
  /* ninety seconds — she airs five times a day, not five times a minute */
  setInterval(look, 90000);
})();

(function () {
  /* ⚠ THE NEWSROOM IS ITS OWN WORKER. Bulletins, breaking news, the archive
     and the RSS all moved off Amalia on 11 Sep — she broadcasts and nothing
     else. Anything to do with a bulletin asks the newsroom. */
  var NEWSROOM = "https://newsroom.realroofers.workers.dev";
  var box = document.getElementById("bkcorner");
  if (!box) return;
  var seen = null;

  /* dismissed for THIS bulletin only — the next one shows again */
  function dismissed(id) {
    try { return window.name.indexOf("bk" + id + ";") >= 0; } catch (e) { return false; }
  }
  function dismiss(id) {
    try { window.name = (window.name || "") + "bk" + id + ";"; } catch (e) {}
    box.removeAttribute("data-show");
  }

  document.getElementById("bkx").addEventListener("click", function () {
    if (seen) dismiss(seen);
    else box.removeAttribute("data-show");
  });

  function paint(d) {
    /* ⚠ NOTHING LIVE MEANS NOTHING SHOWN. A corner that is always shouting
       stops being read. */
    /* ⚠ NOTHING BREAKING MEANS NOTHING ON THE PAGE AT ALL. No empty box,
       no "no news today", no play button with nothing behind it. */
    if (!d || !d.live || !d.breaking) {
      var pp = document.getElementById("bkplayer");
      if (pp && !pp.paused) pp.pause();
      box.removeAttribute("data-show");
      seen = null;
      return;
    }
    if (d.id === seen) return;                 /* already up, leave it alone */
    if (dismissed(d.id)) return;

    seen = d.id;
    document.getElementById("bktext").textContent = d.text || "";

    var a = document.getElementById("bkaudio");
    var by = document.getElementById("bkby");

    /* ⚠ THE BUTTON ONLY APPEARS WHEN THERE IS SOMETHING TO PLAY. */
    if (d.audio) {
      a.innerHTML =
        '<button class="bkplay" id="bkgo">' +
          '<span class="tri" aria-hidden="true"></span>' +
          '<span class="sq" aria-hidden="true"></span>' +
          '<span>Listen</span><span class="len" id="bklen"></span>' +
        '</button>';
      var p = document.getElementById("bkplayer");
      p.src = NEWSROOM + d.audio;
      var btn = document.getElementById("bkgo");

      btn.addEventListener("click", function () {
        if (p.paused) { p.play(); } else { p.pause(); }
      });
      p.addEventListener("play",  function () { btn.setAttribute("data-playing", "1"); });
      p.addEventListener("pause", function () { btn.removeAttribute("data-playing"); });
      p.addEventListener("ended", function () { btn.removeAttribute("data-playing"); });
      p.addEventListener("loadedmetadata", function () {
        if (isFinite(p.duration)) {
          var s2 = Math.round(p.duration);
          document.getElementById("bklen").textContent =
            Math.floor(s2 / 60) + ":" + ("0" + (s2 % 60)).slice(-2);
        }
      });
      p.addEventListener("timeupdate", function () {
        var left = Math.max(0, Math.round((p.duration || 0) - p.currentTime));
        if (isFinite(left) && !p.paused)
          document.getElementById("bklen").textContent =
            "-" + Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2);
      });

      by.innerHTML = d.read_by
        ? 'Read by <b>' + d.read_by + '</b>.'
        : 'Read by <b>Amalia</b>.';
    } else {
      a.innerHTML = "";
      by.innerHTML = 'In writing for now. Amalia records it shortly.';
    }
    box.setAttribute("data-show", "1");
  }

  function look() {
    fetch(NEWSROOM + "/?breaking=1")
      .then(function (r) { return r.json(); })
      .then(paint)
      .catch(function () {});
  }

  look();
  setInterval(look, 90000);      /* a minute and a half — news, not a ticker */
})();
