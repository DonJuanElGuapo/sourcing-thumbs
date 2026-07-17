// api/poshmark.js
// Fetches Poshmark's public "sold" search results for a given search term,
// routed through ScraperAPI using its "premium" residential proxy pool
// (Poshmark's bot detection is stronger than eBay's, so the basic proxy
// pool gets blocked with a 403).
//
// DEBUG MODE: add &debug=1 to see raw diagnostics.

const cheerio = require("cheerio");

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
    const targetUrl =
      "https://poshmark.com/search?query=" +
      encodeURIComponent(query) +
      "&availability=sold_out";

    const scraperUrl =
      "https://api.scraperapi.com?api_key=" +
      encodeURIComponent(scraperApiKey) +
      "&premium=true" +
      "&url=" +
      encodeURIComponent(targetUrl);

    const response = await fetch(scraperUrl);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "ScraperAPI/Poshmark returned status " + response.status });
    }

    const html = await response.text();

    if (debug) {
      const priceRegex = /\$[0-9]+(\.[0-9]{2})?/g;
      const matches = [...html.matchAll(priceRegex)].slice(0, 6);
      const contexts = matches.map((m) => {
        const idx = m.index;
        return html.slice(Math.max(0, idx - 300), idx + 150);
      });

      return res.status(200).json({
        query,
        htmlLength: html.length,
        priceOccurrenceCount: (html.match(priceRegex) || []).length,
        rawContexts: contexts,
      });
