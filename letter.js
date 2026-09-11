/* BUILT 2026-09-11 · warrantwire letter.js 1a
   ============================================================================
   THE LETTER TO THE SEC — one copy, drawn on the Rule 421 page and on every
   company report that grades F or below.

   His words, 11 Sep: "based on the rules of the SEC and a review of the
   clarity by a program built to evaluate, we find that this company is in
   violation." That is the letter's finding, and it is stated as such — with
   the filing, the date, the accession number, the grade and the score under
   it, so the Commission can check every fact in it in a minute.

   Nothing is sent from the site. It is the investor's letter, under the
   investor's name, printed and mailed — certified mail, so it is on record.

     WWLetter.mount(el, facts)   draws the form + the letter into `el`
     facts = { company, ticker, cik, n, doc:{form, filed_on, accession, grade, score, words} }
   ============================================================================ */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function today() { return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }

  function letter(f, you) {
    var d = f.doc || {};
    var stand = you.hold === "hold" ? "I hold shares of " : you.hold === "held" ? "I have held shares of " : "I am an investor who has considered an investment in ";
    var gradeWords = d.grade === "WORD SALAD"
      ? "the lowest grade on the scale, below F: a document that, by the measure, cannot be read"
      : "a grade of F: a document a reader must dig through for the parts that matter";
    return ''
      + '<p class="addr">' + esc(you.name) + '\n' + esc(you.address) + (you.contact ? '\n' + esc(you.contact) : '') + '</p>'
      + '<p>' + esc(today()) + '</p>'
      + '<p class="addr">Division of Corporation Finance\nU.S. Securities and Exchange Commission\n100 F Street, NE\nWashington, DC 20549</p>'
      + '<p class="addr">cc: Office of Investor Education and Advocacy\nU.S. Securities and Exchange Commission\n100 F Street, NE\nWashington, DC 20549</p>'
      + '<p class="re">Re: Violation of the plain English requirements of Rule 421 (17 CFR 230.421) — ' + esc(f.company) + (f.ticker ? ' (' + esc(f.ticker) + ')' : '') + (f.cik ? ', CIK ' + esc(f.cik) : '') + '</p>'
      + '<p>Dear Sir or Madam,</p>'
      + '<p>' + stand + esc(f.company) + (f.ticker ? ' (ticker ' + esc(f.ticker) + ')' : '') + ', and I am writing as an individual investor to report a filing that does not meet the Commission’s own plain English rule.</p>'
      + '<p><b>Based on the rules of the SEC, and a review of the filing’s clarity by a program built to evaluate it against those rules, we find that this company is in violation of Rule 421.</b> '
      + 'Rule 421(b) requires that a prospectus be written so that its information is clear, concise and understandable. Rule 421(d) requires that the cover page, the summary and the risk factors be written in plain English: short sentences, everyday language, the active voice, and no legal or technical terms where plainer words would do. The rule exists so that an investor can read what he is buying.</p>'
      + '<p>The filing is ' + (d.form ? '<b>Form ' + esc(d.form) + '</b>, filed <b>' + esc(d.filed_on) + '</b>, accession number <b>' + esc(d.accession) + '</b>' : 'identified below')
      + '. Measured against the standard with published readability measures, it received ' + gradeWords
      + (d.score != null ? ' (readability score ' + esc(d.score) + (d.words ? ', ' + Number(d.words).toLocaleString() + ' words' : '') + ')' : '') + '.'
      + (f.n > 1 ? ' In all, <b>' + f.n + '</b> of this company’s filings graded F or below.' : '') + '</p>'
      + '<p>I cannot read this filing well enough to understand what it says about my investment, and I do not believe an ordinary investor could. I ask that the Division review the filing against Rule 421 and require the company to revise it so that its shareholders can read it, and that the Commission consider whatever further action the rule provides.</p>'
      + '<p>The program’s method is published and every grade can be reproduced from the filing itself. The filing is on EDGAR at the address below.</p>'
      + '<p>Thank you for your attention. I would be grateful for a reply at the address above.</p>'
      + '<p>Respectfully,</p>'
      + '<p class="sig"><span class="sigline"></span><br>' + esc(you.name) + '</p>'
      + '<p class="small">Filing: https://www.sec.gov/Archives/edgar/data/' + esc(f.cik || "") + '/' + esc(String(d.accession || "").replace(/-/g, "")) + '/ · Method: https://warrantwire.com/grades.html · Sent by USPS Certified Mail.</p>';
  }

  var CSS = ''
    + '.wwl .form{max-width:620px}'
    + '.wwl .lbar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin:18px 0 12px}'
    + '.wwl .lbar .fine{flex:1 1 300px;margin:0}'
    + '.wwl .paper{background:#fff;color:#111;font:15px/1.55 Georgia,"Times New Roman",serif;padding:52px 56px;max-width:760px;border-radius:4px;box-shadow:0 8px 30px rgba(0,0,0,.4)}'
    + '.wwl .paper p{margin:0 0 14px;max-width:none;color:#111;font-size:15px}'
    + '.wwl .paper .addr{white-space:pre-line}.wwl .paper .re{font-weight:700;margin:18px 0}'
    + '.wwl .paper .sig{margin-top:40px}.wwl .paper .sigline{display:inline-block;min-width:280px;border-bottom:1px solid #111;height:34px}'
    + '.wwl .paper .small{font-size:12.5px;color:#444}'
    + '@media(max-width:620px){.wwl .paper{padding:28px 22px}}'
    + '@media print{body *{visibility:hidden}.wwl .paper,.wwl .paper *{visibility:visible}.wwl .paper{position:absolute;left:0;top:0;width:100%;max-width:none;box-shadow:none;border-radius:0;padding:.75in .9in;font-size:12.5pt}html,body{background:#fff}}';

  function mount(el, f) {
    if (!document.getElementById("wwl-css")) { var s = document.createElement("style"); s.id = "wwl-css"; s.textContent = CSS; document.head.appendChild(s); }
    el.classList.add("wwl");
    el.innerHTML = ''
      + '<form class="form" onsubmit="return false">'
      + '<label>Your name</label><input class="yn" placeholder="Full name" autocomplete="name" required>'
      + '<label>Your address</label><textarea class="ya" placeholder="Street&#10;City, State ZIP" rows="3" autocomplete="street-address" required style="min-height:80px"></textarea>'
      + '<label>Your email and telephone (optional, for the Commission’s reply)</label><input class="ye" placeholder="email · telephone">'
      + '<label>Do you hold the stock?</label><select class="yh"><option value="hold">I hold shares of this company</option><option value="held">I held shares of this company</option><option value="investor">I am an investor considering this company</option></select>'
      + '<button type="button" class="draw">Draw the letter for ' + esc(f.ticker || f.company) + '</button>'
      + '</form>'
      + '<div class="out" hidden><div class="lbar"><button type="button" class="wbuy gold print">Print the letter</button><button type="button" class="wbuy ghost copy">Copy the text</button>'
      + '<span class="fine">Print it, sign it, and send by <b>USPS Certified Mail</b> with return receipt. Keep your copy and the receipt.</span></div>'
      + '<article class="paper"></article></div>';
    var q = function (c) { return el.querySelector(c); };
    q(".draw").addEventListener("click", function () {
      var you = { name: q(".yn").value.trim(), address: q(".ya").value.trim(), contact: q(".ye").value.trim(), hold: q(".yh").value };
      if (!you.name || !you.address) { alert("Your name and address go on the letter — it is sent under your name."); return; }
      q(".paper").innerHTML = letter(f, you);
      q(".out").hidden = false;
      q(".out").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    q(".print").addEventListener("click", function () { window.print(); });
    q(".copy").addEventListener("click", function () {
      var t = q(".paper").innerText;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { alert("Copied. Paste it into any word processor or email."); });
    });
  }

  window.WWLetter = { mount: mount, letter: letter };
})();
