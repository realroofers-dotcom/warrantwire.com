/* ============================================================================
   THE CART WORKER  —  Cloudflare Worker  ·  worker name: cart
   One copy of the checkout button, served to every site.

   Built 2026-09-11 · cart-worker-1d — lower again, clear of the breaking news box

   ----------------------------------------------------------------------------
   ⚠ THIS WORKER DOES NOT RUN THE BUTTON. IT HANDS IT OUT.

   The button is BROWSER code — it reads localStorage and writes to the page,
   and neither of those exists on a server. Pasted straight into a worker it
   does nothing at all, which is what "Hello World" in the preview was telling
   you. So the worker's whole job is to answer with that code as a file.

   ⚠ WHY A WORKER RATHER THAN A FILE IN EACH REPO. Because warrantwire, 8k10q
   and triggeredshort would each carry their own copy, and three copies is two
   of them going stale. One address, one copy, every site.

   ⚠ NO DATABASE BINDING. Remove OVERHANG from this worker if it is set — a
   cart button has no business reaching a database, and the red bar in the
   editor is Cloudflare saying the binding cannot attach anyway.

   ----------------------------------------------------------------------------
   ON EVERY PAGE, ONE LINE:

       <script src="https://cart.realroofers.workers.dev/" defer></script>

   Or, with a route on a domain:

       <script src="/cart.js" defer></script>

   BINDINGS   none
   SECRETS    none
   ============================================================================ */

const BUILD = "cart-worker-1d · 2026-09-11";

export default {
  async fetch(request) {
    const u = new URL(request.url);

    /* a plain health answer, so it can be checked without reading the file */
    if (u.searchParams.get("health")) {
      return new Response(JSON.stringify({
        ok: true, build: BUILD, serves: "the checkout button",
        note: "This worker hands out browser code. It holds nothing and " +
              "touches no database."
      }, null, 2), { headers: { "content-type": "application/json" } });
    }

    return new Response(BUTTON, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        /* ⚠ FIVE MINUTES, NOT A YEAR. Long enough that it is not fetched on
           every page view, short enough that a change reaches every site the
           same afternoon. */
        "cache-control": "public, max-age=300",
        /* it is loaded by pages on other origins */
        "access-control-allow-origin": "*"
      }
    });
  }
};

/* ============================================================================
   EVERYTHING BELOW IS SENT TO THE BROWSER AS A FILE.
   It never executes here.
   ============================================================================ */
const BUTTON = `/* the checkout button — served by the cart worker */
(function () {
  "use strict";

  var BASKET = "ww.checkout";

  /* ⚠ WHERE THE PRICES COME FROM. The checkout page is the one place a price
     is typed, and it is on whichever site the reader is standing on. */
  var CHECKOUT = "/checkout.html";

  /* not on the checkout itself — he is already there */
  if (/\\/checkout(\\.html)?$/i.test(location.pathname)) return;

  function held() {
    try {
      var raw = localStorage.getItem(BASKET);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (x) { return x && x.sku; }) : [];
    } catch (e) { return []; }
  }

  var list = held();
  /* ⚠ AN EMPTY CHECKOUT BUTTON ON EVERY PAGE IS FURNITURE. */
  if (!list.length) return;

  function draw() {
    if (document.getElementById("wwcart")) return;

    var css = document.createElement("style");
    css.textContent =
      /* ⚠ TOP RIGHT, NOT FLOATING IN A CORNER. A cart lives in the header on
       every shop anybody has ever used, and a pill hovering over the
       bottom-right of the text is a chat widget, not a checkout. */
        /* ⚠ A THIRD OF THE WAY DOWN, NOT AT THE VERY TOP. Sitting at 14px it
       covered the masthead and the nav on every page it appeared on.

       ⚠ AND LOWER STILL, BECAUSE THE BREAKING NEWS BOX LIVES UP THERE. Two
       things fighting for the same corner is one of them a man cannot press. */
    "#wwcart{position:fixed;top:46vh;right:18px;z-index:9999;" +
        "display:inline-flex;align-items:center;gap:9px;" +
        "background:#c65a4a;color:#fff;text-decoration:none;" +
        "border-radius:6px;padding:9px 15px;" +
        "font:600 13.5px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;" +
        "box-shadow:0 3px 14px rgba(0,0,0,.35);line-height:1}" +
      "#wwcart:hover{background:#d76b58}" +
      "#wwcart b{font-weight:700;font-variant-numeric:tabular-nums}" +
      "#wwcart .n{background:rgba(0,0,0,.26);border-radius:20px;padding:2px 8px;font-weight:700}" +
      "@media(max-width:560px){#wwcart{top:46vh;right:10px;padding:8px 12px;font-size:12.5px}}";
    document.head.appendChild(css);

    var a = document.createElement("a");
    a.href = CHECKOUT;
    a.id = "wwcart";
    a.setAttribute("aria-label", "Go to the checkout");
    put(a, null);
    document.body.appendChild(a);

    /* ⚠ THE TOTAL IS ASKED FOR, NEVER INVENTED. Until the checkout page
       answers, the button says how many and no money. */
    fetch(CHECKOUT)
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var m = t.match(/var PRODUCTS = (\\{[\\s\\S]*?\\n\\};)/);
        if (!m) return;
        var P = new Function("return " + m[1].replace(/;$/, ""))();
        var total = 0, known = 0;
        list.forEach(function (x) {
          if (P[x.sku]) { total += P[x.sku].price; known++; }
        });
        /* ⚠ A PARTIAL TOTAL IS WORSE THAN NONE — it reads as the amount he is
           about to pay. */
        if (known === list.length) put(a, total);
      })
      .catch(function () { /* the count on its own is still useful */ });
  }

  function put(a, total) {
    /* ⚠ IT SAYS CHECKOUT. A basket icon with a number beside it is a puzzle;
       the word is not. */
    a.innerHTML =
      '<span class="n">' + list.length + '</span>' +
      '<span>Checkout</span>' +
      (total != null ? '<b>$' + total.toLocaleString() + '</b>' : '');
  }

  /* ⚠ THE PAGE MAY NOT HAVE A BODY YET. Loaded with defer it will, but a site
     that drops the tag in the head without defer would otherwise get nothing
     and no error. */
  if (document.body) draw();
  else document.addEventListener("DOMContentLoaded", draw);
})();
`;