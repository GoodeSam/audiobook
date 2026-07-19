#!/usr/bin/env bash
# Pull the published book list from the server into the admin spreadsheet
# (访问码管理.xlsx, sheet 书籍资源) so newly published books show up as
# assignable resources. Existing sheets (访问码管理 etc.) are untouched.
#
# Usage:
#   bash deploy/sync-books.sh                 # updates 访问码管理.xlsx in repo root
#   bash deploy/sync-books.sh /path/to.xlsx   # or an explicit spreadsheet path
#
# Runs automatically at the end of publish-book.sh and set-access.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
LIB="/var/www/audiobook.tumei.online/library"
XLSX="${1:-$ROOT/访问码管理.xlsx}"

[ -f "$KEY" ] || { echo "missing deploy key: $KEY"; exit 1; }
[ -f "$XLSX" ] || { echo "missing spreadsheet: $XLSX"; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "cat '$LIB/catalog.json' 2>/dev/null || echo '{\"books\":[]}'" > "$TMP"

python3 - "$XLSX" "$TMP" <<'PYEOF'
import json, sys, datetime
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

xlsx_path, catalog_path = sys.argv[1], sys.argv[2]
with open(catalog_path) as f:
    catalog = json.load(f)
books = sorted(catalog.get('books', []), key=lambda b: -(b.get('updatedAt') or 0))

try:
    wb = load_workbook(xlsx_path)
except PermissionError:
    sys.exit('spreadsheet is open in another program - close it and rerun deploy/sync-books.sh')

SHEET = '书籍资源'
if SHEET in wb.sheetnames:
    del wb[SHEET]
ws = wb.create_sheet(SHEET, index=1)

headers = ['书籍ID', '书名', '章节数', '音频数', '当前可访问的码', '最近更新']
widths  = [24, 34, 8, 8, 40, 18]
fill = PatternFill('solid', fgColor='4A6FA5')
for col, (h, w) in enumerate(zip(headers, widths), 1):
    c = ws.cell(row=1, column=col, value=h)
    c.font = Font(bold=True, color='FFFFFF')
    c.fill = fill
    c.alignment = Alignment(horizontal='center')
    ws.column_dimensions[get_column_letter(col)].width = w

for r, b in enumerate(books, 2):
    ws.cell(row=r, column=1, value=b.get('id')).font = Font(name='Courier New')
    ws.cell(row=r, column=2, value=b.get('title'))
    ws.cell(row=r, column=3, value=b.get('chapterCount'))
    ws.cell(row=r, column=4, value=b.get('audioCount'))
    access = b.get('access')
    ws.cell(row=r, column=5, value='public（所有人）' if access == 'public' else ', '.join(access or []))
    ts = b.get('updatedAt')
    if ts:
        ws.cell(row=r, column=6, value=datetime.datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d %H:%M'))

ws.freeze_panes = 'A2'
if books:
    ws.auto_filter.ref = f'A1:F{len(books) + 1}'

wb.save(xlsx_path)
print(f'sheet 书籍资源 updated: {len(books)} books')
PYEOF

echo "OK: $XLSX"
