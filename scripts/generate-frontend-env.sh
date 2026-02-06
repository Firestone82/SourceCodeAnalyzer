#!/bin/sh
set -eu

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

API_BASE_URL="$(grep -E '^API_BASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"

if [ -z "$API_BASE_URL" ]; then
  API_BASE_URL="http://localhost:4100"
fi

API_BASE_URL="${API_BASE_URL#\"}"
API_BASE_URL="${API_BASE_URL%\"}"
API_BASE_URL="${API_BASE_URL#\'}"
API_BASE_URL="${API_BASE_URL%\'}"

cat <<EOF > frontend/public/env.js
window.__env = window.__env || {};
window.__env.API_BASE_URL = '${API_BASE_URL}';
EOF

echo "Updated frontend/public/env.js with API_BASE_URL=${API_BASE_URL}"
