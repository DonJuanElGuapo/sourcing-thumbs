export default async function handler(req, res) {
  const token = process.env.EBAY_OAUTH_TOKEN;   // Vercel injects your User Token here
  const query = req.query.item || "jacket";     // default search term

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&filter=buyingOptions:{FIXED_PRICE}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
