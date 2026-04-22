#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"
COOKIE_FILE="${2:-cookies.txt}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: $0 <base_url> [cookie_file]"
  echo "Example: $0 https://shiatsu.test /tmp/grav-cookies.txt"
  exit 1
fi

API_PATH="/api/cabinet/admin/migrate-practitioner-id"
URL="${BASE_URL%/}${API_PATH}"

echo "POST $URL"

if [[ ! -f "$COOKIE_FILE" ]]; then
  echo "Cookie file not found: $COOKIE_FILE"
  exit 1
fi

COOKIE_ARG=()
if grep -q $'\t' "$COOKIE_FILE" || grep -qi '^# netscape http cookie file' "$COOKIE_FILE"; then
  COOKIE_ARG=(-b "$COOKIE_FILE")
else
  RAW_LINE="$(head -n 1 "$COOKIE_FILE" | tr -d '\r')"
  COOKIE_PAIR="${RAW_LINE%%;*}"
  if [[ "$COOKIE_PAIR" != *=* ]]; then
    echo "Invalid cookie format in $COOKIE_FILE"
    echo "Expected either Netscape cookie-jar file or raw Set-Cookie line"
    exit 1
  fi
  COOKIE_ARG=(-b "$COOKIE_PAIR")
fi

TMP_BODY="$(mktemp)"
HTTP_CODE="$(curl --silent --show-error \
  -o "$TMP_BODY" \
  -w '%{http_code}' \
  -X POST \
  "${COOKIE_ARG[@]}" \
  -H "Content-Type: application/json" \
  "$URL")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Migration failed with HTTP $HTTP_CODE"
  cat "$TMP_BODY"
  rm -f "$TMP_BODY"
  exit 1
fi

cat "$TMP_BODY"
rm -f "$TMP_BODY"

echo
echo "Migration finished."
