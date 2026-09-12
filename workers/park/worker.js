/* BUILT 2026-09-12 · park 1b · reconciled against the GoDaddy export of 12 Sep:
   eleven names not in the registrar account came out, seven names about to
   become businesses (goodsolar, hikersball, trailshrinks, rooferschool, the
   jobcreation three) came out, five owned-and-idle names went in: 147 names.
   The same change to the marketplace table is in
   wallstdomains-dotcom/data/reconcile_2026-09-12.sql.
   Earlier: park 1a, 2026-09-11.
   ============================================================================
   THE PARKING WORKER — every domain in the Wall St Domains inventory points
   here. Whoever types goodsolar.com lands on that name's page on
   wallstdomains.com, with its story, price and the Buy button — instead of
   the registrar's parking junk.

   Any hostname routed to this worker is sent to
     https://wallstdomains.com/domain/<name as stored>
   The marketplace looks the name up EXACTLY as stored (mixed case and all),
   so the table below carries the stored spelling. A host not in the table
   goes to the marketplace home page rather than to a "not found".

   Nothing is served from the parked domain itself; it is a redirect, so the
   marketplace stays the one place a name is described.
   ============================================================================ */
const NAMES = {
  "66kt.com": "66KT.COM",
  "66kt.org": "66kt.org",
  "66kt.us": "66kt.us",
  "84domains.com": "84domains.com",
  "adhotbox.com": "ADHOTBOX.COM",
  "aqua-tru.com": "AQUA-TRU.COM",
  "atomwatt.com": "ATOMWATT.COM",
  "atomwatt.org": "atomwatt.org",
  "atomwatts.com": "atomwatts.com",
  "atom-watts.com": "atom-watts.com",
  "atomwatts.org": "atomwatts.org",
  "atomwatts.us": "atomwatts.us",
  "bayonneroofrepair.com": "BAYONNEROOFREPAIR.COM",
  "benchpresscontest.com": "BENCHPRESSCONTEST.COM",
  "bidappy.com": "bidappy.com",
  "bookraffle.com": "BOOKRAFFLE.COM",
  "colorappy.com": "colorappy.com",
  "comedyisnews.com": "COMEDYISNEWS.COM",
  "comedyisnews.net": "comedyisnews.net",
  "continentalroofsystems.com": "CONTINENTALROOFSYSTEMS.COM",
  "corruptmen.com": "CORRUPTMEN.COM",
  "datalola.com": "DATALOLA.COM",
  "dataloli.com": "DATALOLI.COM",
  "downsyndromedia.com": "downsyndromedia.com",
  "fidgetroom.com": "FIDGETROOM.COM",
  "freakshoe.com": "FREAKSHOE.COM",
  "gas2water.com": "gas2water.com",
  "getitupamerica.com": "getitupamerica.com",
  "gigapoo.com": "gigapoo.com",
  "gogohose.com": "GOGOHOSE.COM",
  "gogoscrew.com": "GOGOSCREW.COM",
  "goodsolar.ca": "GOODSOLAR.CA",
  "goodsolar.net": "GOODSOLAR.NET",
  "goodsolar.org": "GOODSOLAR.ORG",
  "goodsolar.us": "GOODSOLAR.US",
  "h2ofuels.com": "h2ofuels.com",
  "hardcloth.com": "Hardcloth.com",
  "hobokenroofrepair.com": "HOBOKENROOFREPAIR.COM",
  "ineedagoodtherapist.com": "INEEDAGOODTHERAPIST.COM",
  "itsneverasitseems.com": "itsneverasitseems.com",
  "jackraffle.com": "JACKRAFFLE.COM",
  "jerseycitymason.com": "JERSEYCITYMASON.COM",
  "jerseycityroofer.com": "JERSEYCITYROOFER.COM",
  "jerseycityroofrepair.com": "JERSEYCITYROOFREPAIR.COM",
  "jerseyshorecontractor.com": "JERSEYSHORECONTRACTOR.COM",
  "jerseyshorecontractors.com": "JERSEYSHORECONTRACTORS.COM",
  "jerseyshoremason.com": "JERSEYSHOREMASON.COM",
  "jerseyshoreroofrepair.com": "jerseyshoreroofrepair.com",
  "lacasatriste.com": "lacasatriste.com",
  "lasvegasroofrepair.com": "lasvegasroofrepair.com",
  "liftamericaup.com": "LIFTAMERICAUP.COM",
  "magkinetics.com": "MAGKINETICS.COM",
  "manofegg.com": "MANOFEGG.COM",
  "mojoping.com": "MOJOPING.COM",
  "musicinnews.com": "musicinnews.com",
  "musicisnew.com": "musicisnew.com",
  "musicisnews.com": "MUSICISNEWS.COM",
  "musicisnews.net": "musicisnews.net",
  "musicisnews.org": "musicisnews.org",
  "mycustomerinformation.com": "MYCUSTOMERINFORMATION.COM",
  "neverasitseems.com": "neverasitseems.com",
  "newsweed.co": "newsweed.co",
  "newsweed.com": "NEWSWEED.COM",
  "newsweed.net": "newsweed.net",
  "newsweed.org": "newsweed.org",
  "newsweed.us": "NEWSWEED.US",
  "newsweeds.com": "newsweeds.com",
  "newsweedstocks.com": "newsweedstocks.com",
  "newsworkcity.com": "NEWSWORKCITY.COM",
  "newsyorkcity.com": "NEWSYORKCITY.COM",
  "nft300.com": "nft300.com",
  "nft400.com": "nft400.com",
  "nft48.com": "nft48.com",
  "nft600.com": "nft600.com",
  "nft700.com": "nft700.com",
  "nft737.com": "nft737.com",
  "nft747.com": "nft747.com",
  "nft84.com": "nft84.com",
  "nft85.com": "nft85.com",
  "nft87.com": "nft87.com",
  "nft900.com": "nft900.com",
  "nft92.com": "nft92.com",
  "nft93.com": "nft93.com",
  "nft94.com": "nft94.com",
  "nft96.com": "nft96.com",
  "nft98.com": "nft98.com",
  "nftchord.com": "nftchord.com",
  "nftscrew.com": "nftscrew.com",
  "noticiasnews.com": "NOTICIASNEWS.COM",
  "nuevanoticias.com": "NUEVANOTICIAS.COM",
  "nujabee.com": "NUJABEE.COM",
  "nujabes.com": "NUJABES.COM",
  "nujabi.com": "NUJABI.COM",
  "nujabis.com": "NUJABIS.COM",
  "nujaby.com": "NUJABY.COM",
  "nujobi.com": "NUJOBI.COM",
  "nycfraudaudit.com": "NYCFRAUDAUDIT.COM",
  "nycroofrepairs.com": "NYCROOFREPAIRS.COM",
  "p2logic.com": "P2LOGIC.COM",
  "patersonroofrepair.com": "PATERSONROOFREPAIR.COM",
  "princetonroofrepair.com": "princetonroofrepair.com",
  "realbuilder.us": "REALBUILDER.US",
  "realroofer.co": "REALROOFER.CO",
  "realroofer.co.uk": "REALROOFER.CO.UK",
  "realroofer.com": "REALROOFER.COM",
  "realroofer.net": "REALROOFER.NET",
  "realroofer.org": "REALROOFER.ORG",
  "realroofers.co": "REALROOFERS.CO",
  "realroofers.co.uk": "REALROOFERS.CO.UK",
  "realroofers.com": "REALROOFERS.COM",
  "real-roofers.com": "real-roofers.com",
  "realroofers.es": "realroofers.es",
  "realroofers.net": "REALROOFERS.NET",
  "realroofers.org": "REALROOFERS.ORG",
  "realroofersllc.com": "realroofersllc.com",
  "roofinspectionservice.com": "roofinspectionservice.com",
  "roofleak.co": "roofleak.co",
  "roofleakemergency.com": "ROOFLEAKEMERGENCY.COM",
  "roofrepair24hours.com": "ROOFREPAIR24HOURS.COM",
  "roofrepairco.com": "roofrepairco.com",
  "roofrepairco.us": "roofrepairco.us",
  "roofrepairemergency.com": "ROOFREPAIREMERGENCY.COM",
  "roofrepairnyc.com": "ROOFREPAIRNYC.COM",
  "roofrepairs.us": "roofrepairs.us",
  "roofrepairsalltypes.com": "roofrepairsalltypes.com",
  "secretsss.com": "secretsss.com",
  "shoeraffle.com": "SHOERAFFLE.COM",
  "sidingup.com": "sidingup.com",
  "siliconroofing.com": "siliconroofing.com",
  "tattooisnews.com": "TATTOOISNEWS.COM",
  "thehikersball.com": "THEHIKERSBALL.COM",
  "thepregameshow.com": "thepregameshow.com",
  "theroofrepairco.com": "theroofrepairco.com",
  "timeappy.com": "Timeappy.com",
  "tinyhousers.com": "TINYHOUSERS.COM",
  "tinyroof.com": "TINYROOF.COM",
  "tinyroofer.com": "TINYROOFER.COM",
  "tinyroofs.com": "TINYROOFS.COM",
  "trailshrink.com": "trailshrink.com",
  "uglystartup.com": "UGLYSTARTUP.COM",
  "unionroofrepair.com": "UNIONROOFREPAIR.COM",
  "upyours.us": "upyours.us",
  "wallstdomain.com": "wallstdomain.com",
  "wallstdomains.com": "wallstdomains.com",
  "workappy.com": "workappy.com"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const stored = NAMES[host];
    const to = stored
      ? "https://wallstdomains.com/domain/" + encodeURIComponent(stored)
      : "https://wallstdomains.com/?from=" + encodeURIComponent(host);
    return new Response(null, { status: 302, headers: {
      "Location": to,
      "Cache-Control": "no-store",
      "X-Parked-By": "wallstdomains.com"
    } });
  }
};
