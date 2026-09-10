#!/usr/bin/env bash
# Auf Kiara: Repo holen (falls nötig) und Container starten.
set -euo pipefail

REPO="${REPO:-https://github.com/frabartolo/stromtarif_sammeln.git}"
DEST="${DEST:-$HOME/stromtarif_sammeln}"

if [[ ! -d "$DEST/.git" ]]; then
  echo "Klone $REPO nach $DEST"
  git clone "$REPO" "$DEST"
else
  echo "Aktualisiere $DEST"
  git -C "$DEST" pull --ff-only
fi

exec "$DEST/deploy/on-kiara.sh"
