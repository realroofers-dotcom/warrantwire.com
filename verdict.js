/* BUILT 2026-09-11 · warrantwire verdict.js · RULES VERSION 1
   ============================================================================
   THE AUTOMATIC VERDICT, PART ONE. Runs on what the wire knows about every
   company. Every rule here is written out in plain English on /rules.html
   under the same number, and THAT PAGE IS THE AUTHORITY: a rule is changed
   there first, then here. If the two disagree, this file is wrong.

   ⚠ IT COMPUTES, IT DOES NOT CONCLUDE. It names what the record shows and
   never why. ⚠ IT SAYS SO WHEN IT DOES NOT KNOW. A rule that cannot run for
   want of a figure is listed under `missing`, not silently skipped.

   Input: the wire's answer to ?wire=1&q=TICKER — .company, .about, .rows.
   Output: { version, date, fired:[{id,name,text}], sentence, missing:[] }

   Part two (R1–R6: dilution, splits, overhang, reprice, spend, parties) runs
   in the verdict worker against the hand-built record and is merged by the
   page where it exists.
   ============================================================================ */
(function () {
  "use strict";

  var VERSION = 1, DATE = "2026-09-11";

  var HEAVY = ["Price reset","Cashless exercise","Warrant inducement","Inducement agreement",
               "Reduced exercise price","Variable rate transaction","Equity line"];
  var STACK = ["Pre-funded warrants","ATM programme","ATM program","Variable rate transaction",
               "Equity line","Price reset"];

  function has(labels, names) {
    var low = labels.map(function (l) { return l.toLowerCase(); });
    return names.some(function (n) { return low.indexOf(n.toLowerCase()) > -1; });
  }
  function labelsOf(row) {
    return String(row.labels || "").split(" | ").map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function daysBetween(a, b) {
    var t1 = Date.parse(a), t2 = Date.parse(b);
    if (isNaN(t1) || isNaN(t2)) return null;
    return Math.round((t2 - t1) / 86400000);
  }

  var SPLIT = {
    NV: ["Nevada",   "a reverse split can be done by board resolution, with no stockholder vote"],
    DE: ["Delaware", "since August 2023 a reverse split needs a majority of votes cast, not of shares outstanding"],
    TX: ["Texas",    "adopted the Delaware standard in 2025 — a majority of votes cast"]
  };

  function render(d) {
    var fired = [], missing = [], subject = [], rest = [];
    var a = d.about || {}, c = d.company || {}, rows = d.rows || [];
    var name = c.name || a.company || (c.ticker || a.ticker || "").toUpperCase();
    var n = Number(a.filings || rows.length || 0);

    /* W0 — nothing on the wire: no verdict, and not a clean bill of health */
    if (!n) {
      fired.push({ id: "W0", name: "Nothing on the wire",
        text: "No filing from this company has matched the language of a warrant financing since 2021." });
      return { version: VERSION, date: DATE, fired: fired, sentence: null, missing: missing, none: true };
    }

    /* W1 — how often: filings per year over the period on record */
    var span = daysBetween(a.first, a.latest);
    if (span != null) {
      var years = Math.max(1, span / 365.25);
      var rate = n / years;
      var word = rate < 1.5 ? "occasionally" : rate <= 4 ? "repeatedly" : "serially";
      fired.push({ id: "W1", name: "How often",
        text: n + " filing" + (n === 1 ? "" : "s") + " carrying warrant terms since " + a.first
          + " — " + (Math.round(rate * 10) / 10) + " a year, " + word + "." });
      subject.push("has filed warrant paper " + word + " — " + n + " filings since " + String(a.first).slice(0, 4));
    } else missing.push("W1 — the first and latest dates");

    /* W2 — the heavier terms in half or more of the filings */
    var heavyN = Number(a.heavy || 0);
    if (heavyN && n && heavyN / n >= 0.5) {
      fired.push({ id: "W2", name: "The heavier terms",
        text: "The heavier terms are in " + heavyN + " of its " + n + " filings." });
      rest.push("The heavier terms — resets, inducements, cashless exercise — are in " + heavyN + " of the " + n);
    }

    /* per-row counts for W3–W6 */
    var cut = 0, induce = 0, stackMax = 0, sellNotHold = false;
    rows.forEach(function (r) {
      var L = labelsOf(r);
      if (has(L, ["Reduced exercise price", "Price reset"])) cut++;
      if (has(L, ["Warrant inducement", "Inducement agreement"])) induce++;
      var s = 0, seen = {};
      L.forEach(function (l) {
        var k = l.toLowerCase().replace("program", "programme");
        if (STACK.map(function (x) { return x.toLowerCase().replace("program", "programme"); }).indexOf(k) > -1 && !seen[k]) { seen[k] = 1; s++; }
      });
      if (s > stackMax) stackMax = s;
      if (has(L, ["Pre-funded warrants"]) && has(L, ["Ownership blocker"])) sellNotHold = true;
    });
    if (!rows.length) missing.push("W3 to W6 — the terms on each filing");

    /* W3 — the price was cut, in two or more filings */
    if (cut >= 2) {
      fired.push({ id: "W3", name: "The price was cut",
        text: "Has lowered the price on its warrants in at least " + cut + " filings." });
      subject.push("has lowered the price on its warrants in " + cut + " filings");
    }

    /* W4 — paid to convert early; three or more is a habit */
    if (induce >= 1) {
      var t4 = "Has paid warrant holders to convert early.";
      if (induce >= 3) t4 += " It has done so in " + induce + " filings, which is a habit.";
      fired.push({ id: "W4", name: "Paid to convert early", text: t4 });
      subject.push("has paid holders to convert early" + (induce >= 3 ? " in " + induce + " filings — a habit" : ""));
    }

    /* W5 — the stack: three or more of the five in one filing */
    if (stackMax >= 3) {
      fired.push({ id: "W5", name: "The stack",
        text: "One filing carried " + stackMax + " of the 5 terms that stack." });
      rest.push("One filing carried " + stackMax + " of the five terms that together mean the price can only go one way");
    }

    /* W6 — arranged to sell, not hold */
    if (sellNotHold) {
      fired.push({ id: "W6", name: "Arranged to sell, not hold",
        text: "The buyer's stake is capped and the stock is already paid for — the paper is arranged to be sold, not held." });
      rest.push("At least one deal capped the buyer's stake and pre-paid the stock — paper arranged to be sold, not held");
    }

    /* W7 — how recent */
    var ago = a.latest ? daysBetween(a.latest, new Date().toISOString().slice(0, 10)) : null;
    if (ago != null && ago <= 90) {
      fired.push({ id: "W7", name: "How recent",
        text: "The most recent was " + ago + " day" + (ago === 1 ? "" : "s") + " ago." });
      rest.push("The most recent was " + ago + " days ago");
    } else if (ago == null) missing.push("W7 — the latest date");

    /* W8 — where it is incorporated */
    var st = String(c.state_inc || "").toUpperCase(), sp = SPLIT[st];
    if (sp) {
      fired.push({ id: "W8", name: "Where it is incorporated",
        text: "Incorporated in " + sp[0] + ", where " + sp[1] + "." });
      rest.push("It is incorporated in " + sp[0] + ", where " + sp[1]);
    } else if (!st) missing.push("W8 — the state of incorporation");

    /* the sentence: the company name in front of the parts that take one,
       every later sentence capitalised. */
    var cap = function (t) { return t ? t[0].toUpperCase() + t.slice(1) : t; };
    var parts = [];
    if (subject.length) parts.push(name + " " + subject.join("; ") + ".");
    rest.forEach(function (t) { parts.push(cap(t) + "."); });

    return { version: VERSION, date: DATE, fired: fired, sentence: parts.join(" ") || null, missing: missing, none: false };
  }

  window.WWVerdict = { version: VERSION, date: DATE, render: render };
})();
