// api/search.js
// Fetches eBay's public "sold/completed listings" search results for a given
// search term, routed through ScraperAPI so the request isn't blocked (403)
// by eBay's bot detection. Returns the individual sold prices + an average.
//
// DEBUG MODE: add &debug=1 to the request (e.g. /api/search?q=test&debug=1)
// to get back raw diagnostic info (html length + a snippet) instead of the
// normal parsed response. Useful for figuring out why parsing returns 0.

const cheerio = require("cheerio");

module.exports = async function handler(req, res) {
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
    const targetUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(query) +
      "&LH_Sold=1&LH_Complete=1&_sop=13";

    const scraperUrl =
      "https://api.scraperapi.com?api_key=" +
      encodeURIComponent(scraperApiKey) +
      "&url=" +
      encodeURIComponent(targetUrl);

    const response = await fetch(scraperUrl);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "ScraperAPI/eBay returned status " + response.status });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try a couple of different selector patterns, since eBay's markup
    // has changed over time and varies between page layouts.
    const selectorsToTry = [
      "li.s-item",
      "li.s-card",
      "div.s-item__info",
      "[data-testid='item-card']",
    ];

    let usedSelector = null;
    let itemCount = 0;
    for (const sel of selectorsToTry) {
      const count = $(sel).length;
      if (count > 0) {
        usedSelector = sel;
        itemCount = count;
        break;
      }
    }

    if (debug) {
      return res.status(200).json({
        query,
        htmlLength: html.length,
        looksLikeBlockPage:
          html.toLowerCase().includes("captcha") ||
          html.toLowerCase().includes("are you a human") ||
          html.toLowerCase().includes("pardon our interruption"),
        selectorResults: selectorsToTry.map((sel) => ({
          selector: sel,
          count: $(sel).length,
        })),
        usedSelector,
        itemCount,
        htmlSnippet: html.slice(0, 1500),
      });
    }

    const prices = [];
    const priceSelectors = [
      ".s-item__price",
      ".s-card__price",
      "[data-testid='item-price']",
    ];

    const container = usedSelector ? $(usedSelector) : $("li.s-item");
    container.each((i, el) => {
      let priceText = "";
      for (const psel of priceSelectors) {
        priceText = $(el).find(psel).first().text().trim();
        if (priceText) break;
      }
      if (!priceText) return;

      const match = priceText.replace(/,/g, "").match(/\$([0-9]+(\.[0-9]+)?)/);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          prices.push(value);
        }
      }
    });

    if (prices.length === 0) {
      return res.status(200).json({
        query,
        count: 0,
        average: null,
        prices: [],
        message:
          "No sold listings found for this search term. Try adding &debug=1 to this request in your browser to see raw diagnostics.",
      });
    }

    const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    return res.status(200).json({
      query,
      count: prices.length,
      average: Math.round(average * 100) / 100,
      low: Math.min(...prices),
      high: Math.max(...prices),
      prices: prices.slice(0, 20),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
