#!/usr/bin/env bash
# Install/update the admin library API on the tumei server.
#
# Usage:  bash deploy/setup-api.sh
#
# - Uploads deploy/library-api.py to /usr/local/lib/audiobook/library-api.py
# - Installs the admin token from deploy/admin-password.txt to
#   /etc/audiobook-api-token (0600). Generate one first if missing:
#     openssl rand -base64 15 | tr -d '=+/' > deploy/admin-password.txt
# - Registers systemd unit audiobook-api.service (127.0.0.1:8791)
# - Adds an /api/ proxy location to the nginx site and reloads
#
# Idempotent — rerun any time library-api.py changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
PW_FILE="$ROOT/deploy/admin-password.txt"
NGINX_CONF="/etc/nginx/conf.d/audiobook.tumei.online.conf"

[ -f "$KEY" ] || { echo "missing deploy key: $KEY"; exit 1; }
[ -s "$PW_FILE" ] || { echo "missing $PW_FILE — generate: openssl rand -base64 15 | tr -d '=+/' > $PW_FILE"; exit 1; }

echo "== uploading API service + token =="
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p /usr/local/lib/audiobook"
scp -i "$KEY" -q "$ROOT/deploy/library-api.py" "$HOST:/usr/local/lib/audiobook/library-api.py"
scp -i "$KEY" -q "$PW_FILE" "$HOST:/etc/audiobook-api-token"

ssh -i "$KEY" "$HOST" bash -s <<EOF
set -euo pipefail
LIB_DIR="/var/www/audiobook.tumei.online/library"

# Dedicated unprivileged service account — the API previously ran as root
id -u audiobook-api >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin audiobook-api
mkdir -p "\$LIB_DIR"
chown -R audiobook-api:audiobook-api "\$LIB_DIR"
chown audiobook-api:audiobook-api /etc/audiobook-api-token
chmod 600 /etc/audiobook-api-token

cat > /etc/systemd/system/audiobook-api.service <<'UNIT'
[Unit]
Description=Audiobook library admin API
After=network.target

[Service]
User=audiobook-api
Group=audiobook-api
ExecStart=/usr/bin/python3 /usr/local/lib/audiobook/library-api.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/www/audiobook.tumei.online/library
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now audiobook-api.service
systemctl restart audiobook-api.service

# Rate-limit zone must live in the nginx http{} context — a separate
# conf.d file (loaded alongside the site configs) is the simplest place.
cat > /etc/nginx/conf.d/audiobook-api-ratelimit.conf <<'RATELIMIT'
limit_req_zone \$binary_remote_addr zone=audiobook_api:10m rate=30r/s;
RATELIMIT

# Add the /api/ proxy to the nginx site if not present
if ! grep -q "location /api/" "$NGINX_CONF"; then
  python3 - <<'PYEOF'
import re
path = "$NGINX_CONF"
with open(path) as f:
    conf = f.read()
block = """
    location /api/ {
        limit_req zone=audiobook_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:8791;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        client_max_body_size 900m;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
"""
# insert into every server block right after the server_name line
out = re.sub(r"(server_name[^;]*;)", r"\\1" + block, conf)
with open(path, "w") as f:
    f.write(out)
print("nginx: /api/ location added")
PYEOF
  nginx -t
  systemctl reload nginx
elif ! grep -q "limit_req zone=audiobook_api" "$NGINX_CONF"; then
  python3 - <<'PYEOF'
import re
path = "$NGINX_CONF"
with open(path) as f:
    conf = f.read()
out = re.sub(
    r"(location /api/ \{)",
    r"\1\n        limit_req zone=audiobook_api burst=20 nodelay;",
    conf,
)
with open(path, "w") as f:
    f.write(out)
print("nginx: rate limit added to existing /api/ location")
PYEOF
  nginx -t
  systemctl reload nginx
else
  echo "nginx: /api/ location + rate limit already present"
fi

sleep 1
systemctl --no-pager --lines=3 status audiobook-api.service | head -n 6
EOF

echo "== verifying =="
TOKEN="$(head -n1 "$PW_FILE" | tr -d '[:space:]')"
ssh -i "$KEY" "$HOST" "curl -s -o /dev/null -w '%{http_code}' -H 'X-Admin-Token: $TOKEN' http://127.0.0.1:8791/api/ping" \
  | grep -q 200 && echo "OK: API answers on the server" || { echo "FAIL: API not answering"; exit 1; }
