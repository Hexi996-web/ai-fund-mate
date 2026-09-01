#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/opt/ai-fund-mate
RELEASE_ID="${GITHUB_SHA:-$(date -u +%Y%m%d%H%M%S)}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"

sudo install -d -o admin -g admin "$APP_ROOT/releases" "$APP_ROOT/shared"
install -d "$RELEASE_DIR"
tar -xzf /tmp/ai-fund-mate-release.tar.gz -C "$RELEASE_DIR"
cd "$RELEASE_DIR"
npm ci --omit=dev

test -f "$APP_ROOT/shared/app.env"
DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' "$APP_ROOT/shared/app.env")"
if [[ "$DATABASE_URL" != postgresql://*pooler.supabase.com:5432/* && "$DATABASE_URL" != postgres://*pooler.supabase.com:5432/* ]]; then
  echo "DATABASE_URL must use the Supabase IPv4 Session pooler on port 5432." >&2
  exit 1
fi
unset DATABASE_URL
sudo ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
sudo install -m 0644 deploy/ai-fund-mate.service /etc/systemd/system/ai-fund-mate.service
sudo install -m 0644 deploy/nginx-chanpin.becoming.fund.conf /etc/nginx/sites-available/chanpin.becoming.fund
sudo ln -sfn /etc/nginx/sites-available/chanpin.becoming.fund /etc/nginx/sites-enabled/chanpin.becoming.fund
sudo systemctl daemon-reload
sudo systemctl enable --now ai-fund-mate.service
sudo systemctl restart ai-fund-mate.service
sudo nginx -t
sudo systemctl reload nginx
curl --fail --silent --show-error http://127.0.0.1:8800/healthz

find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
