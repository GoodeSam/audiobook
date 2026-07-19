#!/usr/bin/env bash
# Change which access codes can see an already-published book
# (no content re-upload).
#
# Usage:
#   bash deploy/set-access.sh <bookId> <code1,code2,... | public>
# Examples:
#   bash deploy/set-access.sh my-book alice,charlie
#   bash deploy/set-access.sh my-book public
#
# List the current library and access assignments:
#   bash deploy/set-access.sh --list
set -euo pipefail
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
LIB="/var/www/audiobook.tumei.online/library"

if [ "${1:-}" = "--list" ]; then
  ssh -i "$KEY" "$HOST" "python3 - <<'PYEOF'
import json
with open('$LIB/catalog.json') as f:
    catalog = json.load(f)
for b in catalog.get('books', []):
    access = b['access'] if b['access'] == 'public' else ','.join(b['access'])
    print(f\"{b['id']:30s} {b['title'][:40]:40s} ch:{b['chapterCount']:3d} audio:{b['audioCount']:3d} access:{access}\")
PYEOF"
  exit 0
fi

BOOK_ID="${1:?usage: bash deploy/set-access.sh <bookId> <codes|public>, or --list}"
ACCESS="${2:?missing access codes (comma-separated, or public)}"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "python3 - '$BOOK_ID' '$ACCESS' <<'PYEOF'
import json, sys, time
book_id, access = sys.argv[1:3]
path = '$LIB/catalog.json'
with open(path) as f:
    catalog = json.load(f)
found = False
for b in catalog.get('books', []):
    if b['id'] == book_id:
        b['access'] = 'public' if access == 'public' else [c.strip() for c in access.split(',') if c.strip()]
        b['updatedAt'] = int(time.time() * 1000)
        found = True
if not found:
    sys.exit(f'book not found: {book_id}')
with open(path, 'w') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)
print('access updated for', book_id)
PYEOF"
echo "OK: $BOOK_ID -> $ACCESS"
