// api/search.js
// Fetches eBay's public sold-listings search results via ScraperAPI (to
// avoid 403 blocking), parses out sold prices, and returns an average.
//
// eBay serves inconsistent internal page layouts between requests, so a
// single attempt sometimes finds 0 items even for common searches. To work
// around this transparently, we retry the fetch (up to 3 total attempts)
// whenever an attempt comes back with no matching items, before finally
// giving up and reporting "no comps found."
//
// DEBUG MODE: add &debug=1 to see raw diagnostics for a single attempt
// (no retries) - useful for inspecting eBay's current page structure.

const cheerio = require("cheerio");

const MAX_ATTEMPTS = 3;

async function fetchAndParse(query, scraperApiKey, usedOnly) {
  const conditionParam = usedOnly ? "&LH_ItemCondition=3000" : "";
  const targetUrl =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query) +
    "&LH_Sold=1&LH_Complete=1&_sop=13" +
    conditionParam;

  const
