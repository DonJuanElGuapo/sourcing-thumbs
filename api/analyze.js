export default async function handler(req, res) {
  const appId = process.env.EBAY_PRODUCTION_APP_ID;
  const query = req.query.item || "jacket";

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&filter=buyingOptions:{FIXED_PRICE}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${appId}`, // Browse API requires OAuth2 token
        "Content-Type": "application/json"
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(200).send(text);
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
