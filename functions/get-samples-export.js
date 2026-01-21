/**
 * Export endpoint for sample migration
 * Returns samples AND coverage data in the format expected by migrate-samples.js script
 * Format: { keys: [{ name: geohash, metadata: { ... } }] }
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const prefix = url.searchParams.get("p") ?? "";

  // Fetch samples
  const { results: samples } = await context.env.DB.prepare(
    "SELECT * FROM samples WHERE hash LIKE ?",
  )
    .bind(`${prefix}%`)
    .all();

  // Fetch coverage
  const { results: coverage } = await context.env.DB.prepare(
    "SELECT * FROM coverage WHERE hash LIKE ?",
  )
    .bind(`${prefix}%`)
    .all();

  // Transform samples to migration format
  const sampleKeys = samples.map((sample) => ({
    name: sample.hash,
    metadata: {
      time: sample.time,
      path: JSON.parse(sample.repeaters || "[]"),
      snr: null,
      rssi: null,
      observed: sample.observed === 1,
    },
  }));

  // Transform coverage to migration format
  const coverageKeys = coverage.map((cov) => ({
    name: cov.hash,
    metadata: {
      time: cov.time,
      lastObserved: cov.lastObserved,
      lastHeard: cov.lastHeard,
      observed: cov.observed > 0,
      heard: cov.heard,
      lost: cov.lost,
      path: JSON.parse(cov.repeaters || "[]"),
      snr: null,
      rssi: null,
      entries: JSON.parse(cov.entries || "[]"),
    },
  }));

  // Combine both datasets
  const keys = [...sampleKeys, ...coverageKeys];

  return Response.json({ keys });
}
