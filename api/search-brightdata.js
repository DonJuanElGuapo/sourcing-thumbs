// api/search-brightdata.js
// TEST ENDPOINT - separate from api/search.js, does not affect the working
// ScraperAPI-based search. Tries Bright Data's Web Scraper API (pre-built
// eBay dataset) to see if it can pull sold/completed listing data, and to
// find out (via your Bright Data dashboard) which credit balance it draws
// from - the recurring 5,000/month free credits, or the $2 trial.

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const query = (req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing search term (q)" });
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing BRIGHTDATA_API_KEY environment variable in Vercel.",
    });
  }

  const EBAY_DATASET_ID = "gd_ltr9mjt81n0zzdk1fb";

  try {
    const ebaySearchUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(query) +
      "&LH_Sold=1&LH_Complete=1";

    const response = await fetch(
      "https://api.brightdata.com/datasets/v3/scrape?dataset_id=" +
        EBAY_DATASET_ID +
        "&format=json",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ url: ebaySearchUrl }]),
      }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text.slice(0, 2000) };
    }

    return res.status(response.status).json({
      requestedUrl: ebaySearchUrl,
      brightDataStatus: response.status,
      brightDataResponse: data,
      note: "Check your Bright Data dashboard now to see which credit balance (5,000 free vs $2 trial) this request drew from.",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
