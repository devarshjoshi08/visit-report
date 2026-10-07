#!/usr/bin/env bash
# Refresh schools.csv from ClickHouse and push it, so the page always has a current mapping.
#
# Run this on a machine that can reach ClickHouse (office network or VPN) — GitHub
# cannot: 10.0.4.183 is a private address and nothing on GitHub runs this script.
#
#   cp tools/.env.example tools/.env     # fill in your read-only credentials, once
#   bash tools/update_mapping.sh
#
# To have it run by itself, add a weekly cron entry on that machine, e.g. Fridays 18:00:
#   0 18 * * 5 cd /path/to/visit-report && bash tools/update_mapping.sh >> /tmp/mapping.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

python3 tools/fetch_mapping.py --out schools.csv "$@"

if [ -n "$(git status --porcelain schools.csv)" ]; then
    git add schools.csv
    git commit -m "Refresh school mapping from ClickHouse ($(date +%Y-%m-%d))"
    git push
    echo "schools.csv updated and pushed."
else
    echo "Mapping unchanged — nothing to push."
fi
