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

## 管理员内容库工作流（用户不能自己生成音频）

应用有两种模式：
- **用户模式**（默认）：输入访问码登录 → 书架只显示分配给该码的书 → 听音频/看文本。
  无任何上传、翻译、生成功能；界面提示"联系管理员微信 tumei321123"。
- **管理员模式**：打开 `https://audiobook.tumei.online/#admin`（或本地开发地址加 `#admin`，
  会记住状态；`#user` 切回）。拥有完整生成功能。

发布一本书的完整流程：
1. 管理员模式里上传书籍 → 翻译 → 生成各章 MP3。
2. 侧栏点 **Publish ZIP**，下载 `<bookId>_publish.zip`（含 book.json + 各章 MP3 + 时间线）。
3. 本机执行：
   ```bash
   bash deploy/publish-book.sh ~/Downloads/<bookId>_publish.zip 访问码1,访问码2
   # 或所有登录用户可见：
   bash deploy/publish-book.sh ~/Downloads/<bookId>_publish.zip public
   ```
4. 用户用自己的访问码登录后即可在书架看到并收听。

权限管理（访问码就是"账号"，管理员通过微信分发）：
```bash
bash deploy/set-access.sh --list                 # 查看内容库与权限
bash deploy/set-access.sh <bookId> alice,bob     # 调整某本书的可见用户
bash deploy/set-access.sh <bookId> public        # 设为公开
```

注意：
- `deploy-tumei.sh` 同步代码时自动排除服务器上的 `library/`，内容库不会被覆盖。
- 静态托管方案：访问码只控制书架可见性，不是加密安全边界（适合私人学习服务）。
- 演示书：访问码 `demo` 可看到《演示 · The Quiet Village》（macOS 语音合成的样例）。
