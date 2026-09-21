/* BUILT 2026-09-15 · direct 1a
   ============================================================================
   THE DIRECTIONAL WORKER — the names bought to point at Warrant Wire. Not
   inventory (that is park), not sites of their own: doors.

   Two kinds of door, chosen per name in the table:
     page: true   the name means something on its own (stockscrew), so the
                  visitor gets ONE screen in Warrant Wire's own dress — the
                  line, and a button — and every other path is a 301 to the
                  destination. The screen is canonical-to-warrantwire and
                  noindex, so search engines never see two home pages.
     page: false  the name is an alias (wrntwire, wrntco): a 301 straight
                  through, nobody sees an interstitial for a typo.

   HIS CALL, 15 Sep: the traffic belongs AT warrantwire.com - what was built
   there is the thing; these names are a tool to help people find it, never
   a site of their own. So every door is page:false today - a 301 passes the
   visitor and the search-engine credit straight through. The screen stays
   in the code for the day a name needs one; flip page:true and deploy.

   `to` is the destination. Today every door opens on warrantwire.com; when
   8K10Q is ready, a door can be re-aimed by changing one line here and
   running  .\tools\cf.ps1 deploy direct

   Routing: each zone carries A 192.0.2.1 (a placeholder, never a site) at
   the apex and www, proxied, and a route  *<name>/*  -> direct. Both can be
   set while the zone is still PENDING, so the door works the moment the
   nameservers flip at GoDaddy. tools/direct.ps1 does that, re-runnably.
   ============================================================================ */
const TO = "https://warrantwire.com/";
/* the screw names deliver to THE WARNING, not the home page: a visitor who
   typed "screw" gets the page that says warrants are used for you and against
   you, and the danger is not knowing. Original words, on warrantwire.com. */
/* /warning, not /warning.html: Pages serves clean URLs and 308s the .html
   away, so the .html form would cost the visitor a second hop */
const WARN = "https://warrantwire.com/warning";

const DOORS = {
  "stockscrew.com": { page: false, to: WARN,
    line: "Stock <em>screw</em>? It's in your company's filings.",
    sub: "StockScrew.com is a door to Warrant Wire. Type your ticker there and we read your company's SEC filings, exhibits included, and tell you in plain English what its warrant paper permits — and who is behind it." },
  "screwedstocks.com": { page: false, to: WARN,
    line: "Screwed by your stock? It's in the filings.",
    sub: "ScrewedStocks.com is a door to Warrant Wire. Type your ticker there and we read your company's SEC filings, exhibits included, and tell you in plain English what its warrant paper permits — and who is behind it." },
  "wrntwire.com": { page: false, to: TO },
  "wrntco.com":   { page: false, to: TO },
  /* THE MARKETPLACE NAMES — his call, 18 Sep: Nujobi and Gigapoo are TWO
     SEPARATE BRANDS with different looks, both to be built. Until either has
     a site they open on the gig readers page, which is the market as it
     stands. When a brand's site is live, take its line OUT of here and give
     the zone real records — a brand is not a door. Out of park's for-sale
     table. */
  "nujobi.com":  { page: false, to: "https://warrantwire.com/market" },
  /* 21 Sep: wslth.com is the short way into the research club — his call:
     "these type of people will use it" — listed on the club's pages */
  "wslth.com":   { page: false, to: "https://wisesleuth.com/" }
  /* 21 Sep: wisesleuth.com is a SITE — the research club — served by the
     `wisesleuth` worker in the gigapoo repo, not a door. wisesleuths.com and
     wslth.com, bought with it, are for sale (park). */
  /* gigapoo.com left the doors on 20 Sep: it is a site now (Pages project
     `gigapoo`, the engine's own home). nujobi.com opens on the market until
     its own site is built. */
};

function page(host, d) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${host} — a door to Warrant Wire</title>
<meta name="description" content="${d.sub.replace(/"/g, "&quot;")}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${d.to}">
<style>
:root{--paper:#fff;--panel:#f6f5ef;--line:#dcdad0;--ink:#14150f;--ink2:#474a3e;--ink3:#7a7d70;--hot:#c0392b;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
html,body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--sans)}
main{min-height:100vh;display:grid;place-items:center;padding:40px 22px;box-sizing:border-box}
.card{max-width:640px}
.k{display:block;font:700 11px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);margin:0 0 14px}
h1{font:700 clamp(30px,5vw,46px)/1.08 var(--serif);letter-spacing:-.01em;margin:0 0 16px}
h1 em{font-style:normal;color:var(--hot)}
p{margin:0 0 26px;font-size:17px;color:var(--ink2);max-width:52ch}
a.go{display:inline-block;background:var(--hot);color:#fff;text-decoration:none;font:600 17px var(--sans);padding:14px 26px;border-radius:8px}
a.go:hover{background:#a9311f}
.wire{margin:34px 0 0;padding-top:18px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink3)}
.wire b{font-family:var(--serif);font-weight:700;color:var(--ink)}
</style>
</head>
<body>
<main><div class="card">
  <span class="k">${host}</span>
  <h1>${d.line}</h1>
  <p>${d.sub}</p>
  <a class="go" href="${d.to}">Go to Warrant Wire &rarr;</a>
  <div class="wire"><b>Warrant Wire</b> &middot; warrantwire.com &middot; getting screwed in the market? It's in the filings.</div>
</div></main>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const d = DOORS[host];
    const to = d ? d.to : TO;
    if (d && d.page && url.pathname === "/" && request.method === "GET") {
      return new Response(page(host, d), { status: 200, headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Door-To": to
      } });
    }
    return new Response(null, { status: 301, headers: {
      "Location": to,
      "Cache-Control": "public, max-age=3600",
      "X-Door-To": to
    } });
  }
};
