import * as util from '../content/shared.js';

function overlaps(a, b) {
  const dist = util.haversineMiles(a, b);
  return dist <= 0.25;  // Consider anything under 1/4 mile overlapped.
}

async function cleanSamples(context) {
}

function groupByOverlap(items) {
  const groups = [];

  for (const i of items) {
    let found = false;
    const loc = [i.metadata.lat, i.metadata.lon];

    // Look for an existing overlap group.
    // TODO: Technically should compute a group center for comparison.
    for (const g of groups) {
      if (overlaps(g.loc, loc)) {
        g.items.push(i);
        found = true;
        break;
      }
    }

    if (!found) {
      // Add a new group.
      groups.push({ id: i.metadata.id, loc: loc, items: [i] });
    }
  }

  return groups;
}

async function deduplicateGroup(group, store) {
  if (group.items.length === 1) {
    console.log(`Group ${group.id} ${group.loc} only has 1 item.`);
    return;
  }

  // In groups with duplicates, keep the newest.
  const itemsToDelete = [];
  group.items.reduce((max, current) => {
    if (max === null) {
      return current;
    }
    itemsToDelete.push(max.metadata.time > current.metadata.time ? current : max);
    return max.metadata.time > current.metadata.time ? max : current;
  }, null);

  // Delete all the older items.
  await Promise.all(itemsToDelete.map(async i => {
    console.log(`Deleting duplicate ${i.name}`);
    await store.delete(i.name);
  }));
}

async function cleanRepeaters(context) {
  const store = context.env.REPEATERS;
  const repeatersList = await store.list();
  const indexed = new Map();

  // Delete stale entries.
  await Promise.all(repeatersList.keys.map(async r => {
    const time = r.metadata.time ?? 0;
    if (util.ageInDays(time) > 10) {
      console.log(`Deleting stale ${r.name}`);
      await store.delete(r.name);
    }
  }));

  // Index repeaters by Id.
  repeatersList.keys.forEach(r => {
    const metadata = r.metadata;
    const items = indexed.get(metadata.id) ?? [];
    items.push(r);
    indexed.set(metadata.id, items);
  });

  // Compute overlap groups and deduplicate.
  await Promise.all(indexed.entries().map(async ([key, val]) => {
    if (val.length === 1) {
      console.log(`${key} has no duplicates.`);
    } else {
      console.log(`${key} has duplicates.`);
      const groups = groupByOverlap(val);
      await Promise.all(groups.map(async g => {
        await deduplicateGroup(g, store);
      }));
    }
  }));
}

export async function onRequest(context) {
  await cleanSamples(context);
  await cleanRepeaters(context);

  return new Response('OK');
}
