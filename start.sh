#!/usr/bin/env bash
# ===== QALens launcher (macOS / Linux) =====
# Starts the reverse proxy (if not already running) and opens the tool
# from the proxy origin (http://localhost:8090/__app/) so cookies/data work.

set -e
cd "$(dirname "$0")"

URL="http://localhost:8090/__app/"
HEALTH="http://localhost:8090/__rqa/health"

open_url() {
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  else echo "Open this in your browser: $URL"; fi
}

if command -v node >/dev/null 2>&1; then :; else
  echo "Node.js is required. Install it from https://nodejs.org and re-run."; exit 1
fi

# Already running? Just open the tool.
if curl -fsS -o /dev/null "$HEALTH" 2>/dev/null; then
  echo "Proxy already running on port 8090 — reusing it."
  open_url
  exit 0
fi

echo "Starting QALens proxy…  (Ctrl+C to stop)"
# --open makes the proxy open the browser once it is listening.
exec node proxy.js --open
