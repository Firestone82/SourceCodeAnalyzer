#!/bin/sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:4100}"

cat <<EOF > /app/public/env.js
window.__env = window.__env || {};
window.__env.API_BASE_URL = '${API_BASE_URL}';
EOF

exec "$@"
