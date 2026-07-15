export default async function handler(req, res) {
  const appId = process.env.EBAY_PRODUCTION_APP_ID;
  const query = req.query.item || "test";

  const url = "https://svcs.ebay.com/services/search/FindingService/v1";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-EBAY-SOA-OPERATION-NAME": "findCompletedItems",
        "X-EBAY-SOA-SERVICE-VERSION": "1.13.0",
        "X-EBAY-SOA-SECURITY-APPNAME": appId,
        "X-EBAY-SOA-RESPONSE-DATA-FORMAT": "JSON",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        keywords: query,
        paginationInput: { entriesPerPage: 5 }
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from eBay", details: error.message });
  }
}
