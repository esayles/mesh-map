/**
 * Export endpoint for sample migration
 * Returns samples in the format expected by migrate-samples.js script
 * Format: { keys: [{ name: geohash, metadata: { ... } }] }
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const prefix = url.searchParams.get('p') ?? '';

  const { results } = await context.env.DB
    .prepare("SELECT * FROM samples WHERE hash LIKE ?")
    .bind(`${prefix}%`)
    .all();

  // Transform samples to migration format
  const keys = results.map(sample => ({
    name: sample.hash,
    metadata: {
      time: sample.time,
      path: JSON.parse(sample.repeaters || '[]'),
      snr: sample.snr ?? null,
      rssi: sample.rssi ?? null,
      observed: sample.observed === 1
    }
  }));

  return Response.json({ keys });
}
