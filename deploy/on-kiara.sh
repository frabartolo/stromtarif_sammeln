#!/usr/bin/env bash
# Übernimmt Discord-Zugang von Hermes auf Kiara:
#   /home/kiara/.hermes/.env  (DISCORD_BOT_TOKEN, DISCORD_ALLOWED_USERS,
#   optional DISCORD_HOME_CHANNEL)
# Webhook bleibt als Fallback (khanhiwara-migration).
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

read_env_var() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  local line value
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

BOT_TOKEN="${DISCORD_BOT_TOKEN:-}"
ALLOWED_USERS="${DISCORD_ALLOWED_USERS:-}"
HOME_CHANNEL="${DISCORD_HOME_CHANNEL:-${DISCORD_CHANNEL_ID:-}}"
WEBHOOK="${DISCORD_WEBHOOK_URL:-}"

HERMES_FILES=(
  /home/kiara/.hermes/.env
  "${HOME}/.hermes/.env"
  /home/stefan/.hermes/.env
)

for file in "${HERMES_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    [[ -z "$BOT_TOKEN" ]] && BOT_TOKEN="$(read_env_var "$file" DISCORD_BOT_TOKEN)"
    [[ -z "$ALLOWED_USERS" ]] && ALLOWED_USERS="$(read_env_var "$file" DISCORD_ALLOWED_USERS)"
    [[ -z "$HOME_CHANNEL" ]] && HOME_CHANNEL="$(read_env_var "$file" DISCORD_HOME_CHANNEL)"
    [[ -z "$HOME_CHANNEL" ]] && HOME_CHANNEL="$(read_env_var "$file" DISCORD_CHANNEL_ID)"
    [[ -z "$WEBHOOK" ]] && WEBHOOK="$(read_env_var "$file" DISCORD_WEBHOOK_URL)"
  fi
done

if [[ -z "$WEBHOOK" ]] && command -v systemctl >/dev/null 2>&1; then
  WEBHOOK="$(systemctl show coldlairs-migrate.service -p Environment --no-pager 2>/dev/null | sed -n 's/.*DISCORD_WEBHOOK_URL=\([^ ]*\).*/\1/p' || true)"
fi

if [[ -z "$WEBHOOK" ]]; then
  for candidate in \
    /etc/environment \
    /home/stefan/.env \
    /var/opt/shares/_transfer_logs/.discord-webhook \
    /var/opt/shares/_transfer_logs/khanhiwara-migration/.env \
    "$ROOT/.env"
  do
    if [[ -f "$candidate" ]]; then
      value="$(read_env_var "$candidate" DISCORD_WEBHOOK_URL)"
      if [[ -n "$value" ]]; then
        WEBHOOK="$value"
        break
      fi
    fi
  done
fi

bot_ok=0
if [[ -n "$BOT_TOKEN" && ( -n "$HOME_CHANNEL" || -n "$ALLOWED_USERS" ) ]]; then
  bot_ok=1
fi

webhook_ok=0
if [[ "$WEBHOOK" == https://discord.com/api/webhooks/* || "$WEBHOOK" == https://discordapp.com/api/webhooks/* ]]; then
  webhook_ok=1
fi

if [[ "$bot_ok" -eq 0 && "$webhook_ok" -eq 0 ]]; then
  echo "Kein Discord-Ziel gefunden."
  echo "Erwartet in /home/kiara/.hermes/.env:"
  echo "  DISCORD_BOT_TOKEN=..."
  echo "  DISCORD_ALLOWED_USERS=...   (oder DISCORD_HOME_CHANNEL=...)"
  echo "Optional Fallback: DISCORD_WEBHOOK_URL"
  exit 1
fi

tmp="$(mktemp)"
if [[ -f .env ]]; then
  grep -Ev '^(DISCORD_BOT_TOKEN|DISCORD_ALLOWED_USERS|DISCORD_HOME_CHANNEL|DISCORD_WEBHOOK_URL|REPORT_CRON|TZ|PORT)=' .env > "$tmp" || true
else
  : > "$tmp"
fi

if [[ "$bot_ok" -eq 1 ]]; then
  printf 'DISCORD_BOT_TOKEN=%s\n' "$BOT_TOKEN" >> "$tmp"
  [[ -n "$ALLOWED_USERS" ]] && printf 'DISCORD_ALLOWED_USERS=%s\n' "$ALLOWED_USERS" >> "$tmp"
  [[ -n "$HOME_CHANNEL" ]] && printf 'DISCORD_HOME_CHANNEL=%s\n' "$HOME_CHANNEL" >> "$tmp"
fi
if [[ "$webhook_ok" -eq 1 ]]; then
  printf 'DISCORD_WEBHOOK_URL=%s\n' "$WEBHOOK" >> "$tmp"
fi
printf 'REPORT_CRON=0 7 * * 1\nTZ=Europe/Berlin\nPORT=43145\n' >> "$tmp"
mv "$tmp" .env
chmod 600 .env

if [[ "$bot_ok" -eq 1 ]]; then
  echo "Hermes-Discord aus /home/kiara/.hermes/.env übernommen (Token nicht ausgegeben)."
else
  echo "Webhook in .env übernommen (nicht ausgegeben)."
fi

if command -v docker >/dev/null 2>&1; then
  compose up -d --build
  echo "Stromtarif-Agent läuft auf http://127.0.0.1:43145"
  echo "Im LAN: http://$(hostname -I 2>/dev/null | awk '{print $1}'):43145"
else
  echo "Docker nicht gefunden. .env ist gesetzt – später: docker compose up -d --build"
fi
