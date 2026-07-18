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
    const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash-lite"];

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
      "IMPORTANT: many boutique/indie brands print a short or stylized " +
      "name on the tag (e.g. a tag that just says 'lala' in lowercase " +
      "script) that differs from their full storefront/brand name (e.g. " +
      "'Dressed in Lala'). If you recognize the tag as belonging to a " +
      "known brand with a fuller commonly-searched name, use that fuller " +
      "name in your answer instead of transcribing the short tag text " +
      "literally, since that fuller name will get much better search " +
      "results. If you don't recognize the short tag as any specific " +
      "known brand, just transcribe it as-is. " +
      "Respond with ONLY the short search phrase, nothing else. " +
      'Example good response with visible brand: "Levi\'s 501 denim jacket ' +
      'blue medium". Example good response with no confident brand: ' +
      '"brown sherpa-lined slipper, well-worn". Example good response ' +
      'expanding a known short tag: "Dressed in Lala leopard print wide ' +
      'leg pants".';

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

    let lastError = null;

    for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const geminiUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          model +
          ":generateContent?key=" +
          encodeURIComponent(geminiApiKey);

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await response.json();

        if (response.ok) {
          const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          if (text) {
            return res.status(200).json({ description: text, modelUsed: model });
          }
          lastError = { message: "Empty response from " + model };
          break;
        }

        lastError = data;

        if (response.status !== 503 && response.status !== 429) {
          return res.status(response.status).json({ error: data });
        }
      }
    }

    return res.status(503).json({
      error: lastError || { message: "All models unavailable after retries." },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
