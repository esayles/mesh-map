import { parseLocation, ageInDays, sampleKey, retry } from '../content/shared.js'

export async function onRequest(context) {
  const request = context.request;
  const data = await request.json();
  const store = context.env.SAMPLES;

  const [lat, lon] = parseLocation(data.lat, data.lon);
  const time = Date.now();
  const path = (data?.path ?? []).map(p => p.toLowerCase());

  const key = sampleKey(lat, lon);
  const metadata = { time: time, path: path };

  // KV only allows one write to a key per second.
  // There's a strong possibility that's hit by #wardrive.
  retry(async () => {
    const resp = await store.getWithMetadata(key);
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
      metadata: metadata
    });
  });

  return new Response('OK');
}
