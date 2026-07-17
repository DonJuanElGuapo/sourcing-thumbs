// api/identify.js
// Takes a base64-encoded photo (sent from the browser) and asks Gemini to
// identify the clothing item - brand, type, color, size if visible - in a
// short phrase suitable for plugging straight into an eBay search.

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({
      error: "Missing GEMINI_API_KEY environment variable in Vercel.",
    });
  }

  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: "Missing 'image' (base64) in request body" });
  }

  try {
    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" +
      encodeURIComponent(geminiApiKey);

    const prompt =
      "Look at this photo of a clothing/fashion item. Identify it as briefly " +
      "and specifically as possible for searching eBay - item type, color, " +
      "and size (if visible on a tag). " +
      "IMPORTANT: only include a brand name if you can clearly see a logo, " +
      "tag, or other strong visual evidence of that specific brand. Do NOT " +
      "guess a premium/name brand based on style alone (e.g. do not call " +
      "generic sherpa slippers 'UGGs' just because they look similar) - if " +
      "you are not confident of the exact brand, omit it and just describe " +
      "the item generically instead. " +
      "Respond with ONLY the short search phrase, nothing else. " +
      'Example good response with visible brand: "Levi\'s 501 denim jacket ' +
      'blue medium". Example good response with no confident brand: ' +
      '"brown sherpa-lined slipper, well-worn".';

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: image,
              },
            },
          ],
        },
      ],
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!text) {
      return res.status(200).json({
        description: "",
        message: "Gemini couldn't identify the item. Try a clearer photo or type the description manually.",
      });
    }

    return res.status(200).json({ description: text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
