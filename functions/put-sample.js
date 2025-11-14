import { parseLocation, ageInDays } from '../content/shared.js'

export async function onRequest(context) {
  const request = context.request;
  const data = await request.json();
  const store = context.env.SAMPLES;

  const [lat, lon] = parseLocation(data.lat, data.lon);
  const time = Date.now();
  const path = data.path ?? [];

  const key = `${lat}|${lon}`;
  const resp = await store.getWithMetadata(key);
  const metadata = { time: time, lat: lat, lon: lon, path: path };

  if (resp.value !== null && resp.metadata !== null && ageInDays(resp.metadata.time) < 1) {
    // Merge path information with existing.
    resp.metadata.path.forEach(p => {
      if (!metadata.path.includes(p)) {
        metadata.path.push(p);
      }
    });
  }

  console.log(`PUT ${key} -> ${JSON.stringify(metadata)}`);
  await store.put(key, "", {
    metadata: metadata,
    expirationTtl: 15552000  // 180 days
  });

  return new Response('OK');
}
