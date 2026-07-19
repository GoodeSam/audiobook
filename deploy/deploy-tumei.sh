#!/usr/bin/env bash
# 一键部署：构建并把 dist/ 同步到 audiobook.tumei.online
# （腾讯云广州 · 系统自带 Nginx 静态站，与 read/word/wordtest/wordtest1.tumei.online 同一台服务器 43.139.242.52）
#
# 本应用是 Vite 构建的静态站（PWA）：发布内容 = dist/ 整个目录。
# 注意：GitHub Pages 版本 base 为 /audiobook/，tumei 版本部署在域名根，
# 所以这里用 DEPLOY_BASE=/ 重新构建。
#
# 前提：本机 ~/.ssh/tumei_deploy 私钥已授权到服务器 root（与其他 tumei 项目共用同一把钥匙）。
# 日常更新：改完代码后，直接 bash deploy/deploy-tumei.sh 即可。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${TUMEI_KEY:-$HOME/.ssh/tumei_deploy}"
HOST="${TUMEI_HOST:-root@43.139.242.52}"
DEST="/var/www/audiobook.tumei.online"

[ -f "$KEY" ] || { echo "找不到部署私钥 $KEY"; exit 1; }

echo "构建 dist/（base=/）..."
(cd "$ROOT" && DEPLOY_BASE=/ npx vite build)

echo "同步 dist/ -> $HOST:$DEST"
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  "$ROOT/dist/" "$HOST:$DEST/"

ssh -i "$KEY" "$HOST" 'nginx -t >/dev/null 2>&1 && systemctl reload nginx && echo nginx-reloaded'
echo "✅ 已部署 -> https://audiobook.tumei.online/"
