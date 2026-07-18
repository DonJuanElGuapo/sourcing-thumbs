// api/poshmark.js
// Fetches Poshmark's public "sold" search results for a given search term,
// routed through ScraperAPI (same pattern as api/search.js for eBay).
//
// DEBUG MODE: add &debug=1 to see raw diagnostics - since we don't yet know
// Poshmark's exact current page structure, use this first to find real
// selectors before trusting the normal (non-debug) output.

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response;
    try {
      response = await fetch(scraperUrl, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({
          error: "Request to ScraperAPI/Poshmark timed out after 25 seconds (premium proxy requests can be slow).",
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

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
    }

    return res.status(200).json({
      query,
      message: "Real parsing not yet implemented - use &debug=1 first to inspect Poshmark's page structure.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
