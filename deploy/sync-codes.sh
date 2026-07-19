#!/usr/bin/env bash
# Sync valid access codes from the admin spreadsheet to the server catalog.
# Codes in the spreadsheet can log in even before any book is assigned
# (they see an empty shelf with "contact the admin").
#
# Usage:
#   bash deploy/sync-codes.sh                 # reads 访问码管理.xlsx in repo root
#   bash deploy/sync-codes.sh /path/to.xlsx   # or an explicit spreadsheet path
#
# Reads column "访问码" (column B) of sheet "访问码管理".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
LIB="/var/www/audiobook.tumei.online/library"
XLSX="${1:-$ROOT/访问码管理.xlsx}"

[ -f "$KEY" ] || { echo "missing deploy key: $KEY"; exit 1; }
[ -f "$XLSX" ] || { echo "missing spreadsheet: $XLSX"; exit 1; }

CODES=$(python3 - "$XLSX" <<'PYEOF'
import sys
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1], read_only=True)
ws = wb['访问码管理'] if '访问码管理' in wb.sheetnames else wb.active
codes = []
for row in ws.iter_rows(min_row=2, min_col=2, max_col=2, values_only=True):
    v = row[0]
    if v and str(v).strip():
        codes.append(str(v).strip().lower())
print(','.join(sorted(set(codes))))
PYEOF
)

COUNT=$(echo "$CODES" | tr ',' '\n' | grep -c . || true)
echo "syncing $COUNT codes from $XLSX"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "python3 - '$CODES' <<'PYEOF'
import json, os, sys
codes = [c for c in sys.argv[1].split(',') if c]
path = '$LIB/catalog.json'
catalog = {'books': []}
if os.path.exists(path):
    with open(path) as f:
        catalog = json.load(f)
catalog['validCodes'] = codes
with open(path, 'w') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)
print('validCodes updated:', len(codes), 'codes')
PYEOF"

echo "OK: all spreadsheet codes can now log in"
