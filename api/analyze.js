export default async function handler(req, res) {
  const appId = process.env.EBAY_SANDBOX_APP_ID;

  // Get the item keyword from the request (e.g., scanned item)
  const query = req.query.item || "test";

  // eBay Finding API for completed (sold) items
  const url = `https://svcs.sandbox.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const text = await response.text(); // get raw response as text
    res.status(200).send(text); // send it back directly
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
