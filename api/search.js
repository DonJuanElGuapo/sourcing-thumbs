// api/search.js
// Fetches eBay's public "sold/completed listings" search results for a given
// search term and returns the individual sold prices + an average.
// No eBay API auth needed - this reads eBay's public search results page.

const cheerio = require("cheerio");

module.exports = async function handler(req, res) {
  const query = (req.query.q || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Missing search term (q)" });
  }

  try {
    const url =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(query) +
      "&LH_Sold=1&LH_Complete=1&_sop=13"; // _sop=13 sorts by "recently sold"

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "eBay returned status " + response.status });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const prices = [];

    $("li.s-item").each((i, el) => {
      const priceText = $(el).find(".s-item__price").first().text().trim();
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
        message: "No sold listings found for this search term.",
      });
    }

    const average =
      prices.reduce((sum, p) => sum + p, 0) / prices.length;

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
