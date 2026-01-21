/**
 * Export endpoint for repeater migration
 * Returns repeaters in the format expected by migrate-repeaters.js script
 * Format: { keys: [{ metadata: { id, name, lat, lon } }] }
 */

const geo = await import("ngeohash");

export async function onRequest(context) {
  const { results } = await context.env.DB
    .prepare("SELECT * FROM repeaters")
    .all();

  // Transform repeaters to migration format
  // Need to decode the geohash to get lat/lon
  const keys = results.map((repeater) => {
    const { latitude, longitude } = geo.decode(repeater.hash);

    return {
      metadata: {
        id: repeater.id,
        name: repeater.name || "",
        lat: latitude,
        lon: longitude,
        hash: repeater.hash,
        time: repeater.time,
        elevation: repeater.elevation ?? null,
      },
    };
  });

  return Response.json({ keys });
}
