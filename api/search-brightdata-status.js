// api/search-brightdata-status.js
// TEST ENDPOINT - checks the status of (and downloads results from) a
// Bright Data snapshot_id returned by api/search-brightdata.js.
// Usage: /api/search-brightdata-status?id=SNAPSHOT_ID

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const snapshotId = (req.query.id || "").trim();
  if (!snapshotId) {
    return res.status(400).json({ error: "Missing snapshot id (id)" });
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing BRIGHTDATA_API_KEY environment variable in Vercel.",
    });
  }

  try {
    const progressResponse = await fetch(
      "https://api.brightdata.com/datasets/v3/progress/" + snapshotId,
      {
        headers: { Authorization: "Bearer " + apiKey },
      }
    );
    const progressText = await progressResponse.text();
    let progressData;
    try {
      progressData = JSON.parse(progressText);
    } catch {
      progressData = { rawText: progressText.slice(0, 1000) };
    }

    let snapshotData = null;
    if (progressData.status === "ready" || progressData.status === "done") {
      const downloadResponse = await fetch(
        "https://api.brightdata.com/datasets/v3/snapshot/" +
          snapshotId +
          "?format=json",
        {
          headers: { Authorization: "Bearer " + apiKey },
        }
      );
      const downloadText = await downloadResponse.text();
      try {
        snapshotData = JSON.parse(downloadText);
      } catch {
        snapshotData = { rawText: downloadText.slice(0, 3000) };
      }
    }

    return res.status(200).json({
      snapshotId,
      progressStatus: progressResponse.status,
      progressData,
      snapshotData,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
