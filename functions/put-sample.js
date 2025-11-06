export async function onRequest(context) {
  const request = context.request;
  const data = await request.json();
  const store = context.env.SAMPLES;

  const time = Date.now();
  const lat = Number(data.lat);
  const lon = Number(data.lon);
  const path = data.path ?? [];

  if (isNaN(lat) || isNaN(lon) {
    throw new Error('Invalid data');
  }

  const key = `${time}|${lat}|${lon}`;
  await store.put(key, "", {
    metadata: { time: time, lat: lat, lon: lon, path: path },
    expirationTtl: 15552000  // 180 days
  });

  return new Response('OK');
}
