export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Missing code");
  }

  // TODO: Exchange code for token with eBay API
  // Example: POST to https://api.ebay.com/identity/v1/oauth2/token

  res.status(200).send(`OAuth Callback Received. Code: ${code}, State: ${state}`);
}
