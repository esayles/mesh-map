# What is this for?

The goal of this project is to map out "effective" coverage of a MeshCore mesh.
The MeshCore client app will already tell you whether a repeater heard your message,
but that doesn't really tell you much. Did it actually go anywhere? Did anyone else
receive it? By using MQTT data from prominent observer nodes, this helps visualize
that places where a sent message will be widely received.

## What this is not

This is not intended to be a general purpose "repeater coverage" map. It's also not
meant to support multiple regions in the same map. What would a green tile even mean
if messages made it to one part of the map but not the whole map?

# How this works

There are 4 parts to this service.

1. The MQTT observer network. This is outside the scope of this project. If you don't
   already have this infrastructure set up for you mesh, you have to start there. 1) It _is_ possible to run this using your own radio as a makeshift observer, but
   only if that radio is in a location that would be considered "central" to your mesh. 2) For the PNW mesh, this uses the MQTT feed hosted [here](https://analyzer.letsme.sh/about).
2. The backend service. This is a Cloudflare Pages app that uses D1 for storage. This
   is reasonably easy to set up and you can get started for free to test things out. You
   will absolutely need a paid subscription if you want others to contribute. It's $5/month.
3. Batch script. This runs hourly to consolidate Samples into Coverage and perform other
   housekeeping tasks. This just call the service, but Cloudflare doesn't have a place
   to host something like a cron job so I use a Linux machine I have.
4. A companion radio and the web app. This is the client part. You run the web app and
   drive around. Samples (a.k.a. Pings) are sent to the service.

## Basic flow

1. Client sends a Ping containing the current location to the mesh and the service.
   The location is the shared "key" for a ping.
2. If the Ping is received by the MQTT observer, the packet is read and the location and
   first-hop repeater are extracted from the packet.
3. The Sample item in the service is update with the first-hop repeater. This indicates
   a the Ping was heard.
4. The map shows Coverage and Samples - green indicates it was heard (that is the Sample
   has values for the repeater), red indicates that the Sample was not heard.

## Terms

- Repeater - it's just a repeater.
- Sample or Ping - a location message sent to the service and the mesh. Pings are what
  the client sends. Samples is what it's referred to on the service-side.
- Coverage or Tile - a tile on the map. Samples are consolidated into Tiles for efficiency.
- Geohash - A way to encode location. The service stores Samples and Coverage using Geohash.
  8 digits are used to encode Samples. This gives ~5m accuracy. 6 digits encode a tile. The
  magic bit of Geohash is that to find the Coverage item for a Sample just remove the last
  two digits.

# Setup

## MQTT

You're on your own here. There are lots of docs online. Definitely check out
[letsme.sh](https://analyzer.letsme.sh/about).

## Cloudflare

You need a Cloudflare account - you can start with a free account for testing.
You also need a GitHub account. The app is automatically deployed from the main branch.

1. Fork the [project](https://github.com/kallanreed/mesh-map).
2. Create the new Pages app and point it at the repo.
3. Create the required D1 database (use wrangler or the UI).
   1. `npx wrangler d1 create mesh-map`
   2. `npx wrangler d1 list` -- note the UUID.
   3. You can use wrangler or the UI to execute queries against your data.
4. Update the wrangler.jsonc with the actual id and name for your database.
   Leave the binding names alone. Those are the names used in the code.
5. Create the tables in the DB.
   1. `npx wrangler d1 execute mesh-map --file=./support/schema.sql --remote`
   2. If you're running locally, you'll need to do without `--remote` to set up the local DB too.
6. Change the host in functions/slurp to your host. This is kind of optional because
   'slurp' is only used to pull service data locally for local testing.
7. There are some hard coded constants in content/shared_npm.js that need to be updated.
   - centerPos - the center of your map.
   - maxDistanceMiles - how far out you want to consider "in" your region.
   - Use `npx esbuild content/shared_npm.js --bundle --format=esm --outfile=content/shared.js` to regen the samples.js bundle.
8. Commit your changes to git and push. Cloudflare should pick up your changes
   and deploy to your Pages app.

## Wrangler / Pages variables

You can set default environment variables for Pages in `wrangler.jsonc` (top-level
`vars` object) or set them in the Pages UI under _Settings → Environment variables_.
Sensitive values (like `MQTT_PASSWORD`) should be set as
secret environment variables in the Pages UI rather than committed to the repo.

Add a `vars` block to `wrangler.jsonc` (example):

```
    "vars": {
        "SERVICE_HOST": "https://ct-mesh-map.pages.dev",
        "MQTT_HOST": "analyzer.letsmesh.net",
        "MQTT_PORT": "443",
        "MQTT_USERNAME": "",
        "MQTT_TOPIC": "meshcore/BDL/+/packets",
        "CENTER_POSITION": "[41.613889,-72.7725]",
        "VALID_DIST": "67",
        "CHANNEL_HASH": "e0",
        "CHANNEL_SECRET": "4076c315c1ef385fa93f066027320fe5",
        "WATCHED_OBSERVERS": "[\"K1HFZ Base 2\",\"KO4TSM MQTT Upload\",\"🐌 base\"]"
    }
```

How to set secrets:

- Use the Pages dashboard → your site → _Settings → Environment variables_ and add
  `MQTT_PASSWORD` as **Secret** value.
- Alternatively, use `wrangler` or API-based approaches to store secrets if you
  prefer automation (the Pages UI is simplest).

Build-time notes (shared_npm.js):

- `content/shared_npm.js` reads `CENTER_POSITION` and `VALID_DIST` from build-time
  env vars if present. When building locally, you can inject these for the bundle. Example:

```bash
CENTER_POSITION='[41.613889,-72.7725]' VALID_DIST=67 npx esbuild content/shared_npm.js --bundle --format=esm --outfile=content/shared.js
```

Runtime notes (functions):

- The `functions/*` endpoints read `SERVICE_HOST` and other `vars` from `context.env`.
  We updated `functions/slurp.js` to use `context.env.SERVICE_HOST` instead of a
  hard-coded host so the slurp endpoint will work against your Pages deployment.

### Migration

If you have data in KV namespaces (previously used), you can migrate your existing data into the database.
This assumes you still have the bindings for COVERAGE, REPEATERS, SAMPLES, and ARCHIVE in your wrangler.jsonc.

The general process here is browse to the migration function.
It will return a JSON blob like this:

```
{"archive_has_more":true,"archive_insert_time":1766523554091,"archive_migrated":500}
```

If it says `has_more: true`, then you will need to wait around 10 seconds and run it again. Repeat this (YOU MUST WAIT BETWEEN CALLS) until `has_more` is false.

1. Migrate repeaters - browse to /db-migrate?op=repeaters
2. Migrate samples - browse to /db-migrate?op=samples
3. Migrate archive - browse to /db-migrate?op=archive

> **MIGRATING COVERAGE IS DIFFERENT**
> BEFORE YOU START, DISABLE THE MAINTENANCE SCRIPT!

1. Migrate coverage metadata - browse to /db-migrate?op=coverage-1
   1. This should be pretty quick and once this is done, your map should work again.
2. Migrate coverage data - browse to /db-migrate?op=coverage-2
   1. This will happen in batches. Re-run until you no longer see `has_more`. You don't have to wait in between calls, but only make one request at a time.
3. Re-enable the maintenance script when you're done.

Once you have migrated, you can remove the KV bindings from wrangler.jsonc and commit.

## MQTT Client

Under the support/mqtt folder are the scripts that you need to run somewhere. Get a Linux
VM somewhere get a python environment set up. Use systemd to set the scripts to run as
services that start on boot. The systemd files are there for reference. Once you have
the services running, use journalctl to watch the logs.

### Configuration

Configuration for the MQTT helper scripts is now read from environment variables
instead of a local `config.json` file. The support/mqtt scripts accept the
following env vars (names are case-sensitive):

- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC`
- `SERVICE_HOST` (your Pages app host)
- `CENTER_POSITION` (JSON array or comma-separated lat,lon)
- `VALID_DIST` (miles)
- `CHANNEL_HASH`, `CHANNEL_SECRET`
- `WATCHED_OBSERVERS` (JSON array or comma-separated list)

These are suitable to set as Cloudflare Pages environment variables or system
environment variables on the host running the MQTT scripts.

### Python Setup

1. Set up a virtual environment `python -m venv .` and activate it `source ./bin/activate`
2. `pip install` the following:
   - cryptography
   - haversine
   - paho-mqtt
   - requests
