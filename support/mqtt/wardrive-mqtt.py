import io
import json
import os
import paho.mqtt.client as mqtt
import re
import requests
import ssl

from collections import deque
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from haversine import haversine, Unit

# Globals
CONFIG = json.load(open("config.json"))
CENTER_POSITION = tuple(CONFIG["center_position"])
VALID_DIST = CONFIG["valid_dist"]
CHANNEL_HASH = CONFIG["channel_hash"]
CHANNEL_SECRET = bytes.fromhex(CONFIG["channel_secret"])

SERVICE_HOST = CONFIG["service_host"]
ADD_REPEATER_URL = "/put-repeater"
ADD_SAMPLE_URL = "/put-sample"

SEEN = deque(maxlen=100)
COORD_PAIR = re.compile(
  r"""
  (?P<lat>[+-]?\d+(?:\.\d+)?)        # latitude number
  \s*,?\s+                           # whitespace (optional comma)
  (?P<lon>[+-]?\d+(?:\.\d+)?)        # longitude number
  (\s+(?P<ignored>[0-9a-fA-F]{2}))?  # optional ignored repeater id
  """,
  re.VERBOSE,
)


# Returns true if the specified location is valid for upload.
def is_valid_location(lat: float, lon: float):
  if (not (-90 <= lat <= 90 and -180 <= lon <= 180)):
    print(f"Invalid position data {(lat, lon)}")
    return False

  distance = haversine(CENTER_POSITION, (lat, lon), unit=Unit.MILES) 
  if (distance > VALID_DIST):
    print(f"{(lat, lon)} distance {distance} exceeds max distance")
    return False

  return True


# Sends data to the specified url with error logging.
def post_to_service(url, data):
  try:
    resp = requests.post(url, json=data, timeout=5)
    resp.raise_for_status()
    print(f"Sent {data} response: {resp.status_code}")
  except requests.RequestException as e:
      print(f"POST {data} failed:{e}")


# Uploads an observed sample to the service.
def upload_sample(lat: float, lon: float, path: list[str]):
  payload = {
    "lat": lat,
    "lon": lon,
    "path": path,
    "observed": True
  }
  url = SERVICE_HOST + ADD_SAMPLE_URL
  post_to_service(url, payload)


# Uploads a repeater update to the service.
def upload_repeater(id: str, name: str, lat: float, lon: float):
  payload = {
    "id": id,
    "name": name,
    "lat": lat,
    "lon": lon,
    "path": []
  }
  url = SERVICE_HOST + ADD_REPEATER_URL
  post_to_service(url, payload)


# Decrypts a payload using the given secret.
def decrypt(secret: bytes, encrypted: bytes) -> bytes:
  cipher = Cipher(algorithms.AES(secret), modes.ECB())
  decryptor = cipher.decryptor()
  return decryptor.update(encrypted) + decryptor.finalize()


# Decodes UTF8 characters and removes null padding bytes.
def to_utf8(data: bytes) -> str:
  return data.decode("utf-8", "ignore").replace("\0", "")


# Builds a MeshCore packet from raw bytes.
def make_packet(raw: str):
  # see https://github.com/meshcore-dev/MeshCore/blob/9405e8bee35195866ad1557be4af5f0c140b6ad1/src/Packet.h
  buf = io.BytesIO(bytes.fromhex(raw))
  header = buf.read(1)[0]
  route_type = header & 0x3
  packet_type = header >> 2 & 0xF
  transport_codes = [0, 0]

  # Read transport codes from transport route types.
  if route_type in [0, 3]:
    transport_codes[0] = int.from_bytes(buf.read(2), byteorder="little")
    transport_codes[1] = int.from_bytes(buf.read(2), byteorder="little")

  path_len = buf.read(1)[0]
  path = buf.read(path_len).hex()
  payload = buf.read()
  return {
    "transport_codes": transport_codes,
    "route_type": route_type,
    "packet_type": packet_type,
    "path_len": path_len,
    "path": path,
    "payload": payload
  }


# Handle an ADVERT packet.
def handle_advert(packet):
  # See https://github.com/meshcore-dev/MeshCore/blob/9405e8bee35195866ad1557be4af5f0c140b6ad1/src/Mesh.cpp#L231
  # See https://github.com/meshcore-dev/MeshCore/blob/9405e8bee35195866ad1557be4af5f0c140b6ad1/src/helpers/AdvertDataHelpers.cpp#L29
  payload = io.BytesIO(packet["payload"])

  pubkey = payload.read(32).hex()
  timestamp = int.from_bytes(payload.read(4), byteorder="little")
  signature = payload.read(64).hex()
  flags = payload.read(1)[0]
  type = flags & 0xF # ADV_TYPE_MASK

  # Only care about repeaters (2).
  if type != 2: return

  id = pubkey[0:2]
  lat = 0
  lon = 0
  name = ""

  if flags & 0x10: # ADV_LATLON_MASK
    lat = int.from_bytes(payload.read(4), byteorder="little", signed=True) / 1e6
    lon = int.from_bytes(payload.read(4), byteorder="little", signed=True) / 1e6
  if flags & 0x20: # ADV_FEAT1_MASK
    payload.read(2)
  if flags & 0x40: # ADV_FEAT2_MASK
    payload.read(2)
  if flags & 0x80: # ADV_NAME_MASK
    name = to_utf8(payload.read())

  if is_valid_location(lat, lon):
    upload_repeater(id, name, lat, lon)


# Handle a GROUP_MSG packet.
def handle_channel_msg(packet):
  # See https://github.com/meshcore-dev/MeshCore/blob/9405e8bee35195866ad1557be4af5f0c140b6ad1/src/Mesh.cpp#L206C1-L206C33
  payload = io.BytesIO(packet["payload"])
  
  channel_hash = payload.read(1).hex()
  mac = payload.read(2)
  encrypted = payload.read()

  # Encrypted data truncated.
  if len(encrypted) % 16 != 0: return

  # Not the watched channel.
  if channel_hash != CHANNEL_HASH: return

  # TODO: technically should check the HMAC here.
  data = decrypt(CHANNEL_SECRET, encrypted)

  # Data wasn't decrypted or complete.
  if len(data) <= 4: return

  plain_text = to_utf8(data[5:]).lower()
  first_repeater = packet['path'][0:2]
  match = re.search(COORD_PAIR, plain_text)

  # Not a lat/lon sample.
  if not match: return

  lat = float(match.group('lat'))
  lon = float(match.group('lon'))
  ignored = match.group('ignored')

  # First path should be ignored (mobile repeater case).
  if first_repeater == ignored:
    first_repeater = packet['path'][2:4]
    print(f"Ignoring first hop {ignored}, using {first_repeater}")

  if is_valid_location(lat, lon) and first_repeater != '':
    upload_sample(lat, lon, [first_repeater])


# Callback when the client receives a CONNACK response from the broker.
def on_connect(client, userdata, flags, reason_code, properties = None):
  if reason_code == 0:
    print("Connected to MQTT Broker")
    client.subscribe(CONFIG["mqtt_topic"])
  else:
    print(f"Failed to connect, return code {reason_code}", flush = True)
    os._exit(1)


# Callback when the client is disconnected from the broker.
def on_disconnect(client, userdata, flags, reason_code, properties = None):
  if reason_code != 0:
    print(f"MQTT disconnected unexpectedly, rc={reason_code}", flush = True)
    os._exit(1)


# Callback when a PUBLISH message is received from the broker.
def on_message(client, userdata, msg):
  data = {}
  
  try:
    data = json.loads(msg.payload.decode())

    # Don't reprocess packets for now. Might be worth
    # extracting other paths at some point. That requires
    # stashing packets and processing them all at once.
    packet_hash = data.get("hash")
    if (packet_hash is None or packet_hash in SEEN): return

    # Is this one of the "authoritative" observers in the region?
    if data["origin"] not in CONFIG["watched_observers"]: return

    # Is this an advert (4) or group message (5)?
    packet_type = data["packet_type"]
    if packet_type not in ["4", "5"]: return

    # Parse the outer packet.
    raw = data["raw"]
    packet = make_packet(data["raw"])

    # Messages won't have the observer in the path.
    # Append the observer's id to the path.
    packet["path"] += data["origin_id"][0:2].lower()
    packet["path_len"] += 2

    # Handle the app-specific payload.
    if packet_type == "4":
      handle_advert(packet)
    elif packet_type == "5":
      handle_channel_msg(packet)

    # All done, mark this hash 'seen'.
    SEEN.append(packet_hash)
  except Exception as e:
    print(f"Error handling message: {e}")
    print(f">> {data}")


def main():
  # Initialize the MQTT client
  client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="wardrive_bot",
    protocol=mqtt.MQTTv311)

  client.username_pw_set(
    CONFIG["mqtt_username"],
    CONFIG["mqtt_password"])

  client.on_connect = on_connect
  client.on_disconnect = on_disconnect
  client.on_message = on_message

  try:
    print(f"Connecting to {CONFIG['mqtt_host']}:{CONFIG['mqtt_port']}");
    client.connect(CONFIG["mqtt_host"], CONFIG["mqtt_port"], 60)
    client.loop_forever()
  except Exception as e:
    print(f"An error occurred: {e}")


if __name__ == "__main__":
  main()
