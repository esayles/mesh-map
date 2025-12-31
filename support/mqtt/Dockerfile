FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./

# Install build deps needed for some packages (cryptography), install Python deps, then clean up
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential libssl-dev libffi-dev cargo \
  && pip install --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt \
  && apt-get purge -y --auto-remove build-essential cargo \
  && rm -rf /var/lib/apt/lists/*

COPY . .

# Default command runs the MQTT client; override with a different command if desired
CMD ["python", "wardrive-mqtt.py"]
