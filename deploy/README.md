# 部署到 audiobook.tumei.online（腾讯云 · 大陆访问）

参照 `read.tumei.online`（英文原著阅读器）的方式，把本应用发布到
**已备案的国内服务器**。应用为纯静态 PWA（Vite 构建），无后端；
用户档案、书库、音频与收听进度都保存在浏览器 IndexedDB（按设备本地存储）。

## 现状
- **网址**：https://audiobook.tumei.online/ （DNS 生效 + 证书签发后可用）
- **服务器**：腾讯云轻量，广州，`43.139.242.52`，系统 Nginx
  （与 `read` / `word` / `wordtest` / `wordtest1` / `home.tumei.online` 同一台）
- **站点根目录**：`/var/www/audiobook.tumei.online`（`DEPLOY_BASE=/ vite build` 的 dist/ 整体上传）
- **Nginx 配置**：`/etc/nginx/conf.d/audiobook.tumei.online.conf`
- **部署密钥**：本机 `~/.ssh/tumei_deploy`（与其他 tumei 项目共用）

## 日常更新内容
改完代码后，一条命令（自动构建 + 上传 + reload）：
```bash
bash deploy/deploy-tumei.sh
```

## 首次部署步骤（备查）
1. **DNS**（DNSPod → `tumei.online`）：`audiobook`　类型 `A`　记录值 `43.139.242.52`。
2. 服务器建目录 `/var/www/audiobook.tumei.online`，rsync 上传 `dist/`。
3. 写 `/etc/nginx/conf.d/audiobook.tumei.online.conf`
   （root + index.html/sw.js 不缓存，其余静态资源长缓存），reload。
4. DNS 生效后签发证书 + 强制 HTTPS：
   ```bash
   ssh -i ~/.ssh/tumei_deploy root@43.139.242.52 \
     'certbot --nginx -d audiobook.tumei.online --redirect -n --agree-tos -m sgoode017@gmail.com'
   ```

## 注意
- **sw.js（Service Worker）和 index.html 必须 no-cache**，否则 PWA 更新不及时。
- 应用运行时只访问：`edge.microsoft.com`（翻译授权）、
  `api.cognitive.microsofttranslator.com`（翻译）、`wss://speech.platform.bing.com`（Edge TTS）。
- GitHub Pages 版本（https://GoodeSam.github.io/audiobook/）仍由 GitHub Actions 自动构建，
  与本部署互不影响（base 路径不同，构建时区分）。
