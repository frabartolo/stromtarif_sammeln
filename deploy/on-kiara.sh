#!/usr/bin/env bash
# Übernimmt DISCORD_WEBHOOK_URL so, wie der khanhiwara-Migrate-Dienst ihn nutzt
# (migrate_service/lib/notify.sh, Environment DISCORD_WEBHOOK_URL).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose nicht gefunden."
    return 1
  fi
}

found=""

if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
  found="$DISCORD_WEBHOOK_URL"
fi

if [[ -z "$found" ]] && command -v systemctl >/dev/null 2>&1; then
  found="$(systemctl show coldlairs-migrate.service -p Environment --no-pager 2>/dev/null | sed -n 's/.*DISCORD_WEBHOOK_URL=\([^ ]*\).*/\1/p' || true)"
fi

if [[ -z "$found" ]]; then
  for candidate in \
    /etc/environment \
    /home/stefan/.env \
    /var/opt/shares/_transfer_logs/.discord-webhook \
    /var/opt/shares/_transfer_logs/khanhiwara-migration/.env \
    "$ROOT/.env"
  do
    if [[ -f "$candidate" ]]; then
      line="$(grep -E '^[[:space:]]*DISCORD_WEBHOOK_URL=' "$candidate" | tail -n1 || true)"
      if [[ -n "$line" ]]; then
        found="${line#DISCORD_WEBHOOK_URL=}"
        found="${found%\"}"
        found="${found#\"}"
        break
      fi
    fi
  done
fi

if [[ -z "$found" ]]; then
  echo "Kein DISCORD_WEBHOOK_URL gefunden."
  echo "Der Migrate-Dienst erwartet dieselbe Variable (siehe notify.sh)."
  echo "Auf Kiara/khanhiwara z. B.:"
  echo "  systemctl show coldlairs-migrate.service -p Environment"
  echo "  grep DISCORD_WEBHOOK_URL /etc/environment ~/.env"
  exit 1
fi

if [[ "$found" != https://discord.com/api/webhooks/* && "$found" != https://discordapp.com/api/webhooks/* ]]; then
  echo "Gefundener Wert sieht nicht nach einem Discord-Webhook aus – Abbruch."
  exit 1
fi

tmp="$(mktemp)"
if [[ -f .env ]]; then
  grep -v '^DISCORD_WEBHOOK_URL=' .env > "$tmp" || true
else
  : > "$tmp"
fi
printf 'DISCORD_WEBHOOK_URL=%s\n' "$found" >> "$tmp"
printf 'REPORT_CRON=0 7 * * 1\nTZ=Europe/Berlin\nPORT=43145\n' >> "$tmp"
mv "$tmp" .env
chmod 600 .env
echo "Webhook in .env übernommen (nicht ausgegeben)."

if command -v docker >/dev/null 2>&1; then
  compose up -d --build
  echo "Stromtarif-Agent läuft auf http://127.0.0.1:43145"
  echo "Im LAN: http://$(hostname -I 2>/dev/null | awk '{print $1}'):43145"
else
  echo "Docker nicht gefunden. .env ist gesetzt – später: docker compose up -d --build"
fi
