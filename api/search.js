// api/search.js
// DEBUG MODE (&debug=1): tries known selectors; if none match, falls back
// to locating the first raw "$XX.XX" price string in the HTML and showing
// surrounding markup, so we can identify eBay's current layout on the fly.

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

    const titleSelectors = [".s-card__title", ".s-item__title", "h3"];
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
      if (!usedSelector) {
        // Nothing matched - find every "$xx.xx" occurrence and show
        // a bit of surrounding context for the first few, so we can see
        // what wraps a price on THIS page variant.
        const priceRegex = /\$[0-9]+\.[0-9]{2}/g;
        const matches = [...html.matchAll(priceRegex)].slice(0, 5);
        const contexts = matches.map((m) => {
          const idx = m.index;
          return html.slice(Math.max(0, idx - 300), idx + 100);
        });
        return res.status(200).json({
          query,
          usedSelector: null,
          totalItemsFound: 0,
          note: "No known selector matched. Showing raw context around the first few '$' prices found in the page instead.",
          priceOccurrenceCount: (html.match(priceRegex) || []).length,
          rawContexts: contexts,
        });
      }

      const container = $(usedSelector);
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
    const container = usedSelector ? $(usedSelector) : $();
    container.each((i, el) => {
      const { title, priceText } = extractItem(el);
      if (!priceText || !title) return;
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
