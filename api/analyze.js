export default async function handler(req, res) {
  const appId = process.env.EBAY_PRODUCTION_APP_ID; // now using Production key

  const query = req.query.item || "test";

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.status(200).send(text);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
