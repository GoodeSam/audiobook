#!/usr/bin/env python3
"""Admin API for the audiobook.tumei.online content library.

Runs as a systemd service on 127.0.0.1:8791 behind nginx (/api/).
Lets the admin publish books, change access, and manage login codes
straight from the browser (#admin) — no terminal needed.

Auth: every request must carry header  X-Admin-Token: <token>
where <token> matches the single line in TOKEN_PATH.

Endpoints (all JSON responses):
  GET    /api/ping                 -> {ok: true}          (auth check)
  GET    /api/catalog              -> full catalog.json incl. validCodes
  POST   /api/publish?access=a,b   -> body = publish ZIP (from the app's
                                      publish exporter); unpacks to
                                      library/<bookId>/ and upserts catalog
  POST   /api/access               -> {bookId, access: "public"|[codes]}
  POST   /api/codes                -> {codes: [..]} replaces validCodes
  DELETE /api/books/<bookId>       -> removes the book + catalog entry
"""

import hmac
import json
import os
import re
import shutil
import tempfile
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

LIB = "/var/www/audiobook.tumei.online/library"
TOKEN_PATH = "/etc/audiobook-api-token"
MAX_UPLOAD = 800 * 1024 * 1024  # 800 MB — publish ZIP, streamed to a temp file
MAX_JSON_BODY = 2 * 1024 * 1024  # 2 MB — plenty for /api/access, /api/codes
MAX_MANIFEST_BYTES = 5 * 1024 * 1024  # book.json
# Generous ceiling for a full audiobook's chapters + MP3s decompressed —
# still blocks classic zip-bomb ratios (KB compressed -> GB+ uncompressed).
MAX_TOTAL_UNCOMPRESSED = 1024 * 1024 * 1024
BOOK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,80}$")
SAFE_MEMBER_RE = re.compile(r"^[A-Za-z0-9._-]+$")  # flat filenames only

# Serializes every catalog.json read-modify-write and the publish/delete
# directory swaps so concurrent admin requests can't interleave and corrupt
# the catalog or a book's on-disk directory.
_catalog_lock = threading.Lock()


def load_token():
    with open(TOKEN_PATH) as f:
        return f.read().strip()


def read_catalog():
    path = os.path.join(LIB, "catalog.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {"books": []}


def write_catalog(catalog):
    path = os.path.join(LIB, "catalog.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def parse_access(raw):
    """'public' or comma list -> catalog access value."""
    if isinstance(raw, list):
        codes = [str(c).strip().lower() for c in raw if str(c).strip()]
        return codes or "public"
    raw = (raw or "").strip()
    if not raw or raw.lower() == "public":
        return "public"
    return [c.strip().lower() for c in raw.split(",") if c.strip()]


class Handler(BaseHTTPRequestHandler):
    server_version = "AudiobookLibraryAPI/1"
    protocol_version = "HTTP/1.1"

    # ── plumbing ──
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        token = self.headers.get("X-Admin-Token", "")
        try:
            expected = load_token()
        except OSError:
            self._json(500, {"error": "token file missing on server"})
            return False
        if not expected or not hmac.compare_digest(token, expected):
            self._json(401, {"error": "bad admin token"})
            return False
        return True

    def _body(self):
        """Read a small JSON request body fully into memory."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return b""
        if length > MAX_JSON_BODY:
            raise ValueError("request body too large")
        remaining, chunks = length, []
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 1 << 20))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _body_to_tempfile(self):
        """Stream a large request body (the publish ZIP) straight to disk
        instead of buffering it twice in RAM (once while reading, once when
        joining chunks). Caller must delete the returned path when done."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            raise ValueError("empty request body")
        if length > MAX_UPLOAD:
            raise ValueError("upload too large")
        fd, path = tempfile.mkstemp(prefix=".upload-", dir=LIB)
        try:
            remaining = length
            with os.fdopen(fd, "wb") as out:
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, 1 << 20))
                    if not chunk:
                        break
                    out.write(chunk)
                    remaining -= len(chunk)
            return path
        except BaseException:
            try:
                os.remove(path)
            except OSError:
                pass
            raise

    def log_message(self, fmt, *args):  # journal-friendly one-liners
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)

    # ── routing ──
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if not self._authed():
            return
        if path == "/api/ping":
            return self._json(200, {"ok": True})
        if path == "/api/catalog":
            return self._json(200, read_catalog())
        self._json(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        if not self._authed():
            return
        try:
            if url.path == "/api/publish":
                return self._publish(url)
            if url.path == "/api/access":
                return self._set_access()
            if url.path == "/api/codes":
                return self._set_codes()
        except (ValueError, json.JSONDecodeError, zipfile.BadZipFile, KeyError) as e:
            return self._json(400, {"error": str(e)})
        except OSError as e:
            return self._json(500, {"error": "server storage error: " + str(e)})
        self._json(404, {"error": "not found"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not self._authed():
            return
        m = re.match(r"^/api/books/([^/]+)$", path)
        if not m:
            return self._json(404, {"error": "not found"})
        book_id = m.group(1)
        if not BOOK_ID_RE.match(book_id):
            return self._json(400, {"error": "bad book id"})
        with _catalog_lock:
            catalog = read_catalog()
            before = len(catalog.get("books", []))
            catalog["books"] = [b for b in catalog.get("books", []) if b.get("id") != book_id]
            if len(catalog["books"]) == before:
                return self._json(404, {"error": "book not found: " + book_id})
            shutil.rmtree(os.path.join(LIB, book_id), ignore_errors=True)
            write_catalog(catalog)
        self._json(200, {"ok": True, "deleted": book_id})

    # ── handlers ──
    def _publish(self, url):
        access = parse_access(parse_qs(url.query).get("access", [""])[0])
        upload_path = self._body_to_tempfile()
        staging = None
        try:
            with zipfile.ZipFile(upload_path) as zf:
                infos = zf.infolist()
                names = [i.filename for i in infos]
                if "book.json" not in names:
                    raise ValueError("book.json not found in zip")
                for name in names:
                    if not SAFE_MEMBER_RE.match(name):
                        raise ValueError("unsafe zip member: " + name)

                # Reject decompression bombs before extracting anything.
                total_uncompressed = 0
                for info in infos:
                    if info.file_size > MAX_TOTAL_UNCOMPRESSED:
                        raise ValueError("zip member too large: " + info.filename)
                    total_uncompressed += info.file_size
                    if total_uncompressed > MAX_TOTAL_UNCOMPRESSED:
                        raise ValueError("zip archive too large when decompressed")

                book_json_info = zf.getinfo("book.json")
                if book_json_info.file_size > MAX_MANIFEST_BYTES:
                    raise ValueError("book.json too large")
                manifest = json.loads(zf.read("book.json"))
                book_id = str(manifest.get("id") or "")
                if not BOOK_ID_RE.match(book_id):
                    raise ValueError("bad book id in manifest: " + repr(book_id))

                # Extract into a staging directory first — a mid-extraction
                # failure (bad member, disk full, crash) must never destroy
                # the book that's already live.
                staging = os.path.join(LIB, "." + book_id + ".staging")
                shutil.rmtree(staging, ignore_errors=True)
                os.makedirs(staging, exist_ok=True)
                for name in names:
                    with zf.open(name) as src, open(os.path.join(staging, name), "wb") as out:
                        shutil.copyfileobj(src, out)
                    os.chmod(os.path.join(staging, name), 0o644)

            chapters = manifest.get("chapters", [])
            entry = {
                "id": book_id,
                "title": manifest.get("title") or book_id,
                "chapterCount": len(chapters),
                "audioCount": sum(1 for c in chapters if c.get("audioFile")),
                "access": access,
                "updatedAt": int(time.time() * 1000),
            }
            dest = os.path.join(LIB, book_id)
            with _catalog_lock:
                # Only now, with a fully-extracted and validated staging
                # directory in hand, do we touch the live book directory.
                shutil.rmtree(dest, ignore_errors=True)
                os.replace(staging, dest)
                staging = None  # already moved — don't clean it up below

                catalog = read_catalog()
                catalog["books"] = [b for b in catalog.get("books", []) if b.get("id") != book_id]
                catalog["books"].append(entry)
                write_catalog(catalog)
            self._json(200, {"ok": True, "book": entry})
        finally:
            if staging:
                shutil.rmtree(staging, ignore_errors=True)
            try:
                os.remove(upload_path)
            except OSError:
                pass

    def _set_access(self):
        req = json.loads(self._body() or b"{}")
        book_id = str(req.get("bookId") or "")
        if not BOOK_ID_RE.match(book_id):
            raise ValueError("bad book id")
        access = parse_access(req.get("access"))
        with _catalog_lock:
            catalog = read_catalog()
            for b in catalog.get("books", []):
                if b.get("id") == book_id:
                    b["access"] = access
                    b["updatedAt"] = int(time.time() * 1000)
                    write_catalog(catalog)
                    return self._json(200, {"ok": True, "book": b})
        self._json(404, {"error": "book not found: " + book_id})

    def _set_codes(self):
        req = json.loads(self._body() or b"{}")
        codes = req.get("codes")
        if not isinstance(codes, list):
            raise ValueError("codes must be a list")
        with _catalog_lock:
            catalog = read_catalog()
            catalog["validCodes"] = sorted({str(c).strip().lower() for c in codes if str(c).strip()})
            write_catalog(catalog)
        self._json(200, {"ok": True, "validCodes": catalog["validCodes"]})


if __name__ == "__main__":
    os.makedirs(LIB, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8791), Handler)
    print("audiobook library API listening on 127.0.0.1:8791", flush=True)
    server.serve_forever()
