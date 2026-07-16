// api/search.js
// DEBUG MODE (&debug=1) now returns the first 10 items' TITLE + PRICE so we
// can see whether the scraped items are actually genuine, on-topic matches
// or noise (ads, unrelated categories, bundles, etc.)

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

    const selectorsToTry = ["li.s-card", "li.s-item"];
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
    const priceSelectors = [".s-card__price", ".s-item__price"];

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

    if (debug) {
      const container = usedSelector ? $(usedSelector) : $();
      const sample = [];
      container.each((i, el) => {
        if (i < 15) sample.push(extractItem(el));
      });
      return res.status(200).json({
        query,
        usedSelector,
        totalItemsFound: container.length,
        sampleItems: sample,
      });
    }

    const prices = [];
    const container = usedSelector ? $(usedSelector) : $("li.s-item");
    container.each((i, el) => {
      const { title, priceText } = extractItem(el);
      if (!priceText || !title) return;

      // Skip obvious non-matches / noise: "shop on ebay", empty titles, etc.
      if (/shop on ebay/i.test(title)) return;

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
        message: "No sold listings found. Try &debug=1 for diagnostics.",
      });
    }

    // Trim outliers: drop the top and bottom 10% before averaging, since
    // eBay result pages often include unrelated "related searches" items.
    const sorted = [...prices].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.1);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount || sorted.length);
    const finalSet = trimmed.length > 0 ? trimmed : sorted;

    const average = finalSet.reduce((sum, p) => sum + p, 0) / finalSet.length;

    return res.status(200).json({
      query,
      count: finalSet.length,
      totalRawMatches: prices.length,
      average: Math.round(average * 100) / 100,
      low: Math.min(...finalSet),
      high: Math.max(...finalSet),
      prices: finalSet.slice(0, 20),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
