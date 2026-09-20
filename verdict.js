/* BUILT 2026-09-20 · warrantwire verdict.js · RULES VERSION 4 (v2 18 Sep: W9; v3 19 Sep: W10; v4 20 Sep: W11 name change, W12 reverse split)
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

  /* version 2, 18 Sep 2026: W9, the no-press-release clause. His ask: some deal
     papers say in so many words that neither party will announce the deal.
     That is the clearest sign in the paper itself that it was built to be
     missed, and the wire reports it. */
  /* version 3, 19 Sep 2026: W10, merger or sale of the company. His ask: a
     near-term merger says the company is being sold or liquidated, and that
     is a necessary disclosure. It fires from the wire's signals, on the wire
     or not — it is the one rule that runs even when W0 says nothing is. */
  /* version 4, 20 Sep 2026: W11, the name change. His rule: "any company that
     changes its name must be identified as a high risk" — WGRX/MEDS the
     example. EDGAR keeps every former name with its dates; the wire passes
     them in signals.renamed. Like W10 it runs before W0: a renamed company
     with nothing on the wire is still high risk. */
  var VERSION = 4, DATE = "2026-09-20";

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

    /* W10 — merger or sale of the company on the table. From the signals, which
       the wire reports for every company; runs before W0 because it matters
       most for a company that has nothing else on the wire. */
    var sig = (d.signals && d.signals.merger) || [];
    var w10 = null;
    if (sig.length) {
      var latest = sig[0], allSaid = sig.map(function (x) { return String(x.said || ""); }).join(",");
      var said = String(latest.said || "").split(",").map(function (w) { return "“" + w.trim() + "”"; }).join(", ");
      var when = latest.filed_on ? " on " + latest.filed_on : "";
      /* the gravest word wins: liquidation over a CVR over a review over a merger */
      var kind = /liquidation|dissolution|wind/i.test(allSaid) ? "a liquidation or wind-down" : /contingent value/i.test(allSaid) ? "a merger with a contingent value right — the shareholders get what is left, if anything" : /reverse merger/i.test(allSaid) ? "a reverse merger — the company is to be folded into another, and its shareholders diluted into it" : /strategic/i.test(allSaid) ? "a strategic review — the company is looking for a buyer" : "a merger or sale";
      w10 = { id: "W10", name: "Merger or sale of the company",
        text: "The company's own " + (latest.form || "filing") + when + " carries the language of " + kind +
          " (" + said + (sig.length > 1 ? ", in " + sig.length + " filings" : "") + "). For a company that has lived on warrant paper this is usually how the story ends, and what is sold is the shareholders’ stake." };
      fired.push(w10);
    }

    /* W11 — the company has changed its name: HIGH RISK, every time. The old
       filings, the old paper and the old shareholders stay on EDGAR under the
       old name; a reader who searches the new one finds a clean slate. */
    var rn = d.signals && d.signals.renamed, w11 = null;
    if (rn && rn.former && rn.former.length) {
      var was = rn.former.map(function (f) { return "“" + f.name + "”" + (f.to ? " until " + String(f.to).slice(0, 10) : ""); }).join("; ");
      w11 = { id: "W11", name: "Changed its name — high risk", risk: "high",
        text: name + " has filed under " + (rn.former.length === 1 ? "another name" : rn.former.length + " other names") + ": " + was +
          ". A company that changes its name is high risk on this wire, without exception: the record — the filings, the warrant paper, the shareholders who held the old paper — stays behind under the old name, and the new name starts clean. Search the old name" + (rn.former.length === 1 ? "" : "s") + " too." };
      fired.push(w11);
    }

    /* W12 — the reverse split: the third tell-tale. "Reverse splits, name change
       and warrants are tell-tales." From the wire's split signal; before W0. */
    var sp = (d.signals && d.signals.splits) || [], w12 = null;
    if (sp.length) {
      var l12 = sp[0], said12 = String(l12.said || "").split(",").map(function (w) { return "“" + w.trim() + "”"; }).join(", ");
      w12 = { id: "W12", name: "Reverse split — high risk", risk: "high",
        text: "The company's own " + (l12.form || "filing") + (l12.filed_on ? " on " + l12.filed_on : "") + " carries the language of a reverse split (" + said12 + (sp.length > 1 ? ", in " + sp.length + " filings" : "") + "). A reverse split changes nothing about the company and everything about the count: the same business, fewer shares, and the price marked up to match — until the next round of paper takes it back down." };
      fired.push(w12);
    }

    /* W0 — nothing on the wire: no verdict, and not a clean bill of health */
    if (!n) {
      fired.push({ id: "W0", name: "Nothing on the wire",
        text: "No filing from this company has matched the language of a warrant financing since 2021." });
      var s0 = [];
      if (w11) s0.push("has changed its name — high risk");
      if (w12) s0.push("has done a reverse split — high risk");
      if (w10) s0.push("has a merger, sale or wind-down on the table");
      return { version: VERSION, date: DATE, fired: fired, sentence: s0.length ? name + " " + s0.join(", and ") + ". Nothing on the wire." : null, missing: missing, none: true, merger: !!w10, renamed: !!w11, split: !!w12, high_risk: !!(w11 || w12) };
    }
    if (w10) subject.unshift("has a merger, sale or wind-down on the table" + (sig[0].filed_on ? " as of " + sig[0].filed_on : ""));
    if (w12) subject.unshift("has done a reverse split — high risk");
    if (w11) subject.unshift("has changed its name — high risk");

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

    /* per-row counts for W3–W6, and W9 */
    var cut = 0, induce = 0, stackMax = 0, sellNotHold = false, quiet = 0;
    rows.forEach(function (r) {
      var L = labelsOf(r);
      if (has(L, ["No press release clause"])) quiet++;
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

    /* W9 — no press release: the parties agreed the deal would not be announced. Once is enough. */
    if (quiet >= 1) {
      fired.push({ id: "W9", name: "No press release",
        text: "The deal papers say no press release" + (quiet > 1 ? " — in " + quiet + " filings" : "") + ": the parties agreed the deal would not be announced. A financing the company agreed not to talk about is one the shareholder has to find in the exhibit." });
      subject.unshift("agreed in writing that a financing would not be announced" + (quiet > 1 ? " — " + quiet + " times" : ""));
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

    return { version: VERSION, date: DATE, fired: fired, sentence: parts.join(" ") || null, missing: missing, none: false, merger: !!w10, renamed: !!w11, split: !!w12, high_risk: !!(w11 || w12) };
  }

  window.WWVerdict = { version: VERSION, date: DATE, render: render };
})();
