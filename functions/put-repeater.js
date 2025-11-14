import { parseLocation } from '../content/shared.js'

export async function onRequest(context) {
  const request = context.request;
  const data = await request.json();
  const store = context.env.REPEATERS;
  
  const [lat, lon] = parseFloat(data.lat, data.lon);
  const time = Date.now();
  const id = data.id;
  const name = data.name;
  const path = data.path ?? [];

  const key = `${id}|${lat}|${lon}`;
  await store.put(key, "", {
    metadata: { time: time, id: id, name: name, lat: lat, lon: lon, path: path }
  });

  return new Response('OK');
}
