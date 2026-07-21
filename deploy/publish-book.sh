#!/usr/bin/env bash
# Publish a book to the audiobook.tumei.online content library.
#
# Usage:
#   bash deploy/publish-book.sh <publish.zip> [code1,code2,... | public]
#
# Examples:
#   bash deploy/publish-book.sh ~/Downloads/my-book_publish.zip alice,bob
#   bash deploy/publish-book.sh ~/Downloads/my-book_publish.zip public
#
# The publish.zip comes from the "Publish ZIP" button in admin mode
# (open the app with #admin). It contains book.json (chapter text,
# translations, timelines) and per-chapter MP3s.
# Without an access argument the book defaults to "public"
# (visible to every logged-in user).
#
# To change access for an already-published book (no re-upload):
#   bash deploy/set-access.sh <bookId> <code1,code2,... | public>
set -euo pipefail
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
LIB="/var/www/audiobook.tumei.online/library"

ZIP="${1:?usage: bash deploy/publish-book.sh <publish.zip> [code1,code2,... | public]}"
ACCESS="${2:-public}"

[ -f "$KEY" ] || { echo "missing deploy key: $KEY"; exit 1; }
[ -f "$ZIP" ] || { echo "missing publish zip: $ZIP"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
[ -f "$TMP/book.json" ] || { echo "book.json not found in zip"; exit 1; }

BOOK_ID=$(python3 -c "import json;print(json.load(open('$TMP/book.json'))['id'])")
TITLE=$(python3 -c "import json;print(json.load(open('$TMP/book.json'))['title'])")
CHAPTERS=$(python3 -c "import json;print(len(json.load(open('$TMP/book.json'))['chapters']))")
AUDIO=$(python3 -c "import json;print(sum(1 for c in json.load(open('$TMP/book.json'))['chapters'] if c.get('audioFiles') or c.get('audioFile')))")

echo "publishing: $TITLE (id=$BOOK_ID, chapters=$CHAPTERS, audio=$AUDIO, access=$ACCESS)"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p '$LIB/$BOOK_ID'"
rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r -e "ssh -i $KEY" "$TMP/" "$HOST:$LIB/$BOOK_ID/"

# Base64-encode the title before it crosses the SSH command boundary — a
# title containing an apostrophe (very common: "Charlotte's Web") would
# otherwise close the single-quoted shell argument early and break the
# remote command.
TITLE_B64=$(printf '%s' "$TITLE" | base64 | tr -d '\n')

# Upsert the book into catalog.json on the server
ssh -i "$KEY" "$HOST" "python3 - '$BOOK_ID' '$TITLE_B64' '$CHAPTERS' '$AUDIO' '$ACCESS' <<'PYEOF'
import base64, json, os, sys, time
book_id, title_b64, chapters, audio, access = sys.argv[1:6]
title = base64.b64decode(title_b64).decode('utf-8')
path = '$LIB/catalog.json'
catalog = {'books': []}
if os.path.exists(path):
    with open(path) as f:
        catalog = json.load(f)
access_val = 'public' if access == 'public' else [c.strip() for c in access.split(',') if c.strip()]
entry = {
    'id': book_id, 'title': title,
    'chapterCount': int(chapters), 'audioCount': int(audio),
    'access': access_val, 'updatedAt': int(time.time() * 1000),
}
catalog['books'] = [b for b in catalog.get('books', []) if b.get('id') != book_id] + [entry]
with open(path, 'w') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)
print('catalog updated:', len(catalog['books']), 'books')
PYEOF"

echo "OK -> https://audiobook.tumei.online/ (access: $ACCESS)"

# Refresh the admin spreadsheet's book list (best-effort)
bash "$(dirname "$0")/sync-books.sh" || echo "note: spreadsheet not updated - run deploy/sync-books.sh manually"
