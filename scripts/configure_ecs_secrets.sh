#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/ai-fund-mate/shared/app.env"
echo "AI Fund Mate server secret setup"
read -r -s -p "New Zhipu API key: " ZHIPU_KEY
echo
read -r -s -p "Supabase Session pooler URI: " DATABASE_URL
echo

if [[ -z "$ZHIPU_KEY" || -z "$DATABASE_URL" ]]; then
  echo "API key and database URI cannot be empty." >&2
  exit 1
fi
if [[ "$DATABASE_URL" != postgresql://*pooler.supabase.com:5432/* && "$DATABASE_URL" != postgres://*pooler.supabase.com:5432/* ]]; then
  echo "Use the IPv4 Session pooler URI (port 5432) copied from Supabase Connect." >&2
  exit 1
fi

sudo install -d -m 750 -o admin -g admin "$(dirname "$ENV_FILE")"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if sudo test -f "$ENV_FILE"; then
  sudo grep -Ev '^(ANALYSIS_API_KEY|DATABASE_URL)=' "$ENV_FILE" > "$TMP_FILE" || true
fi

{
  cat "$TMP_FILE"
  printf 'ANALYSIS_API_KEY=%s\n' "$ZHIPU_KEY"
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
} | sudo tee "$ENV_FILE" >/dev/null

sudo chown root:root "$ENV_FILE"
sudo chmod 600 "$ENV_FILE"
unset ZHIPU_KEY DATABASE_URL

sudo systemctl restart ai-fund-mate
sudo systemctl --no-pager --full status ai-fund-mate | sed -n '1,12p'
echo "Secrets saved. Values were not printed."
