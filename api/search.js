// api/search.js
// Fetches eBay's public "sold/completed listings" search results for a given
// search term, routed through ScraperAPI so the request isn't blocked (403)
// by eBay's bot detection. Returns the individual sold prices + an average.

const cheerio = require("cheerio");

module.exports = async function handler(req, res) {
  const query = (req.query.q || "").trim();

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
    // The actual eBay sold-listings search URL we want data from
    const targetUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(query) +
      "&LH_Sold=1&LH_Complete=1&_sop=13"; // _sop=13 sorts by "recently sold"

    // Route the request through ScraperAPI, which uses rotating residential
    // IPs so eBay sees it as normal browser traffic instead of a bot.
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

    const prices = [];

    $("li.s-item").each((i, el) => {
      const priceText = $(el).find(".s-item__price").first().text().trim();
      if (!priceText) return;

      // Handles "$45.00" and ranges like "$20.00 to $30.00" (takes first number)
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
        message: "No sold listings found for this search term.",
      });
    }

    const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    return res.status(200).json({
      query,
      count: prices.length,
      average: Math.round(average * 100) / 100,
      low: Math.min(...prices),
      high: Math.max(...prices),
      prices: prices.slice(0, 20), // cap payload size
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
