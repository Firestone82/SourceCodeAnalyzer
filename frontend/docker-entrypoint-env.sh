#!/bin/sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:4100}"

case "$API_BASE_URL" in
  http://localhost:*|http://127.0.0.1:*)
    API_BASE_URL="$(printf '%s' "$API_BASE_URL" | sed 's#http://localhost#http://host.docker.internal#' | sed 's#http://127.0.0.1#http://host.docker.internal#')"
    ;;
esac

cat <<EOF > /usr/share/nginx/html/env.js
window.__env = window.__env || {};
window.__env.API_BASE_URL = '${API_BASE_URL}';
EOF
