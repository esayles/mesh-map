// Returns consolidated coverage and sample data.
import * as util from '../content/shared.js';

function addItem(map, id, observed, heard, time) {
  const value = {
    o: observed ? 1 : 0,
    h: heard ? 1 : 0,
    a: Math.round(util.ageInDays(time) * 10) / 10
  };
  const prevValue = map.get(id);

  // If the id doesn't exist, add it.
  if (!prevValue) {
    map.set(id, value);
    return;
  }

  // Update the previous entry in-place.
  // o is 0|1 for "observed" -- prefer observed.
  // h is 0|1 for "heard" -- prefer heard.
  // a is "age in days" -- prefer newest.
  prevValue.o = Math.max(value.o, prevValue.o);
  prevValue.h = Math.max(value.h, prevValue.h);
  prevValue.a = Math.min(value.a, prevValue.a);
}

export async function onRequest(context) {
  const coverageStore = context.env.COVERAGE;
  const sampleStore = context.env.SAMPLES;
  const url = new URL(context.request.url);
  const prefix = url.searchParams.get('p');
  const tiles = new Map();
  let cursor = null;

  do {
    const coverage = await coverageStore.list({ prefix: prefix, cursor: cursor });
    cursor = coverage.cursor ?? null;
    coverage.keys.forEach(c => {
      const id = c.name;
      const observed = (c.metadata.observed ?? c.metadata.heard) > 0;
      const heard = c.metadata.heard > 0;
      const updatedTime = c.metadata.updated ?? c.metadata.lastHeard;
      addItem(tiles, id, observed, heard, updatedTime);
    });
  } while (cursor !== null)

  do {
    const samplesList = await sampleStore.list({ prefix: prefix, cursor: cursor });
    cursor = samplesList.cursor ?? null;
    samplesList.keys.forEach(s => {
      const id = s.name.substring(0, 6);
      const path = s.metadata.path ?? [];
      const observed = s.metadata.observed ?? path.length > 0;
      const heard = path.length > 0;
      const time = s.metadata.time;
      addItem(tiles, id, observed, heard, time);
    });
  } while (cursor !== null)

  return new Response(JSON.stringify(Array.from(tiles)));
}
