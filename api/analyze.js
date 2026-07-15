export default async function handler(req, res) {
  const appId = process.env.EBAY_PRODUCTION_APP_ID;
  const query = req.query.item || "test";

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(query)}`;
    ?OPERATION-NAME=findCompletedItems
    &SERVICE-VERSION=1.13.0
    &SECURITY-APPNAME=${appId}
    &RESPONSE-DATA-FORMAT=JSON
    &REST-PAYLOAD
    &keywords=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
