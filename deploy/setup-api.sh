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
chmod 600 /etc/audiobook-api-token

cat > /etc/systemd/system/audiobook-api.service <<'UNIT'
[Unit]
Description=Audiobook library admin API
After=network.target

[Service]
ExecStart=/usr/bin/python3 /usr/local/lib/audiobook/library-api.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now audiobook-api.service
systemctl restart audiobook-api.service

# Add the /api/ proxy to the nginx site if not present
if ! grep -q "location /api/" "$NGINX_CONF"; then
  python3 - <<'PYEOF'
import re
path = "$NGINX_CONF"
with open(path) as f:
    conf = f.read()
block = """
    location /api/ {
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
else
  echo "nginx: /api/ location already present"
fi

sleep 1
systemctl --no-pager --lines=3 status audiobook-api.service | head -n 6
EOF

echo "== verifying =="
TOKEN="$(head -n1 "$PW_FILE" | tr -d '[:space:]')"
ssh -i "$KEY" "$HOST" "curl -s -o /dev/null -w '%{http_code}' -H 'X-Admin-Token: $TOKEN' http://127.0.0.1:8791/api/ping" \
  | grep -q 200 && echo "OK: API answers on the server" || { echo "FAIL: API not answering"; exit 1; }
