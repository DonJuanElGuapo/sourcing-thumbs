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

  const scraperUrl =
    "https://api.scraperapi.com?api_key=" +
    encodeURIComponent(scraperApiKey) +
    "&url=" +
    encodeURIComponent(targetUrl);

  const response = await fetch(scraperUrl);

  if (!response.ok) {
    return { ok: false, status: response.status, prices: [] };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const selectorsToTry = ["li.s-card", "li.s-item", "div.su-card-container"];
  let usedSelector = null;
  for (const sel of selectorsToTry) {
    if ($(sel).length > 0) {
      usedSelector = sel;
      break;
    }
  }

  const titleSelectors = [
    ".s-card__title",
    ".s-item__title",
    "[role='heading']",
    "h3",
  ];
  const priceSelectors = [
    ".s-card__price",
    ".s-item__price",
    ".su-item-card__price",
  ];

  function extractItem(el) {
    let title = "";
    for (const tsel of titleSelectors) {
      title = $(el).find(tsel).first().text().trim();
      if (title) break;
    }
    let priceText = "";
    for (const psel of priceSelectors) {
      priceText = $(el).find(psel).first().text().trim();
      if (priceText) break;
    }
    return { title, priceText };
  }

  const prices = [];
  const container = usedSelector ? $(usedSelector) : $();
  container.each((i, el) => {
    const { title, priceText } = extractItem(el);
    if (!priceText || !title) return;
    if (/shop on ebay/i.test(title)) return;

    const match = priceText.replace(/,/g, "").match(/\$([0-9]+(\.[0-9]+)?)/);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value > 0 && value < 3000) {
        prices.push(value);
      }
    }
  });

  return { ok: true, usedSelector, prices, html, $ };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const query = (req.query.q || "").trim();
  const debug = req.query.debug === "1";

  if (!query) {
    return res.status(400).json({ error: "Missing search term (q)" });
  }

  const scraperApiKey = process.env.SCRAPER_API_KEY;
  if (!scraperApiKey) {
    return res.status(500).json({
      error: "Missing SCRAPER_API_KEY environment variable in Vercel.",
    });
  }

  try {
    if (debug) {
      const usedOnlyDebug = req.query.all !== "1";
      const result = await fetchAndParse(query, scraperApiKey, usedOnlyDebug);
      if (!result.ok) {
        return res
          .status(result.status)
          .json({ error: "ScraperAPI/eBay returned status " + result.status });
      }
      if (!result.usedSelector) {
        const priceRegex = /\$[0-9]+\.[0-9]{2}/g;
        const matches = [...result.html.matchAll(priceRegex)].slice(0, 5);
        const contexts = matches.map((m) => {
          const idx = m.index;
          return result.html.slice(Math.max(0, idx - 300), idx + 100);
        });
        return res.status(200).json({
          query,
          usedOnlyFilter: usedOnlyDebug,
          usedSelector: null,
          totalItemsFound: 0,
          note: "No known selector matched on this attempt.",
          rawContexts: contexts,
        });
      }
      return res.status(200).json({
        query,
        usedOnlyFilter: usedOnlyDebug,
        usedSelector: result.usedSelector,
        totalItemsFound: result.prices.length,
        prices: result.prices.slice(0, 15),
      });
    }

    async function tryStrategy(usedOnly) {
      let result = null;
      let attempts = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        attempts = attempt;
        result = await fetchAndParse(query, scraperApiKey, usedOnly);
        if (result.ok && result.prices.length > 0) break;
      }
      return { result, attempts };
    }

    const [usedRun, anyRun] = await Promise.all([
      tryStrategy(true),
      tryStrategy(false),
    ]);

    const attemptsMade = usedRun.attempts + anyRun.attempts;
    let lastResult = usedRun.result;
    let usedFilterApplied = true;

    if (!usedRun.result.ok && !anyRun.result.ok) {
      return res.status(502).json({
        error: "Could not reach eBay via ScraperAPI after " + attemptsMade + " attempt(s).",
      });
    }

    if (!usedRun.result.prices || usedRun.result.prices.length === 0) {
      lastResult = anyRun.result;
      usedFilterApplied = false;
    }

    const prices = lastResult.prices;

    if (prices.length === 0) {
      return res.status(200).json({
        query,
        count: 0,
        average: null,
        prices: [],
        attemptsMade,
        message:
          "No sold listings found after " + attemptsMade + " attempt(s). Try a broader or different search term.",
      });
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.1);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount || sorted.length);
    const finalSet = trimmed.length > 0 ? trimmed : sorted;

    const average = finalSet.reduce((sum, p) => sum + p, 0) / finalSet.length;

    return res.status(200).json({
      query,
      count: finalSet.length,
      totalRawMatches: prices.length,
      attemptsMade,
      usedFilterApplied,
      average: Math.round(average * 100) / 100,
      low: Math.min(...finalSet),
      high: Math.max(...finalSet),
      prices: finalSet.slice(0, 20),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
