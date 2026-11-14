#!/usr/bin/env bash
# Descarga precios NM/EX de Cardmarket desde TU ordenador (IP doméstica) y los sube a GitHub.
# Tarda ~35-45 min para las 130 cartas: va despacio a propósito.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --rebase --autostash
python3 -m pip install -q -r scripts/requirements.txt
python3 scripts/fetch_prices.py "$@"
git add data/prices.json data/cardmarket_urls.json data/cardmarket_ids.json
if git diff --cached --quiet; then echo "Sin cambios"; exit 0; fi
git commit -m "Actualizar precios de Cardmarket (local)"
git push
