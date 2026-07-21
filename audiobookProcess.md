Append (do not overwrite) the final report(English first and then  Chinese) to the end of the currently open Markdown file（/Users/victor/projects/audiobook/[audiobookProcess.md](http://audiobookProcess.md)）.

\>> 借鉴 /Users/victor/projects/EasyOriginals 和 /Users/victor/projects/tepub的内容，制作一个gitpage，当我上传一个epub书籍时，他可以把这个书籍extract成多个markdown文件，并对每一个markdown组成文件利用Edge TTS转换成mp3。 Build a gitpage that extracts uploaded EPUB books into multiple markdown files and converts each markdown file to mp3 using Edge TTS. Reference /Users/victor/projects/EasyOriginals and /Users/victor/projects/tepub for implementation patterns.

```javascript
⏺ Pushed. The GitHub Actions workflow will build and
  deploy to GitHub Pages automatically. Once it      
  completes, the site will be live at                
  https://GoodeSam.github.io/audiobook/.           
                                                     
  You'll need to enable GitHub Pages in the repo     
  settings (Settings > Pages > Source: GitHub        
  Actions) if it's not already configured.
```

\>> 使用TDD实现：上传书籍直audiobook的界面后，可以选择对某个或多个章节进行提取至markdown，也可以选择免费的microsoft进行翻译，还可以对某个或多个章节的翻译的全原文，译文，原文和译文的混合体进行转语音，语音角色有多个选项，且可以分别设置中英文音频的速度。过程要显示具体的进度。 Implement using TDD: In the audiobook interface, add functionality to extract one or multiple chapters to markdown, translate using Microsoft's free translation service, and convert chapters (in original text, translated, or mixed form) to speech with multiple voice role options and separate speed controls for Chinese and English audio. Display progress throughout the process.

\>> 当书籍上传至audiobook以后，没有做任何选择，就一直显示working，解决。 Fix the audiobook uploader to resolve the 'working' status after upload completes, regardless of user selection.

\>> 解决上传书籍时一次不能上传成功，需要两次才能上传成功。 Fix the book upload feature to work on the first attempt instead of requiring two uploads.

\>> 使用TDD解决上传书籍成功后，界面显示working，且操作后无响应的问题

\>> 询问COdex如何解决上传书籍成功后，界面显示working，且操作后无响应的问题

\>> 删除当前所有代码，重构实现的思路。 Delete all current code and refactor the implementation approach from scratch.

\>> 在选择chapters时，选中一个，可以在右侧的空白页面，预览选中的内容。 When a chapter is selected in the chapters panel, display its content in the editor pane on the right.

\>> 修复问题：在选择chapters时，选中一个后，在右侧的空白页面仍然不能预览选中的内容。Fix chapter content not displaying in the editor when selected from the sidebar.

\>> 对于translate等等图标，如果操作完成，该图标应该有变化，而而避免重复操作。 Update icon states (e.g., translate) to change appearance after operations complete, preventing users from repeating the action.

\>> genarates MP3s的进度显示应该是百分比的显示   Display MP3 generation progress as a percentage indicator.

\>>  set Chinese voice defaut yunyang。 Set the default voice to yunyang (Chinese).

\>>  对于English Voice and Chinese voice 有一个简单的例句和音频，可以让用户来体验每种声音。 Add audio samples and example sentences for English and Chinese voices to allow users to audition each voice option.

\>> audio speed的设置可以有+和-，每按下一次，调整5%的速度差异。Add + and - controls to adjust audio playback speed by 5% per press.

\>> 翻译后，可以输出一种为纯译文，一种是原文和译文每个一段的混合。  Add translation output with two formats: pure translation and hybrid mode alternating original-translated text paragraph-by-paragraph.

\>> 使用TDD实现，如果原书没有分为10个以上的chapters，则在Chapter下面继续细分，将原书分为10个小的部分，可以对每个小的部分进行翻译和转语音。注意每个小部分的划分要以段落单位，不要在段落内拆分。且每个小的部分内容量差异尽量不超过10%

Implement using TDD to divide the source into at least 10 parts: if 10+ chapters exist, use them; otherwise subdivide at the paragraph level. Ensure no mid-paragraph splits and content volume variance between parts does not exceed 10%, enabling independent translation and voice conversion per part.

\>>Set the default English voice to Christoper ,set the default English voice speed to -5%.    Set the default English voice to Christopher and the default English voice speed to -5%.

\>> 优化界面显示，可以选中一本书的全部章节，按下一个键以后：可以将全书逐章翻译，并生成音频。 Implement multi-chapter selection in the sidebar and add a keyboard shortcut to batch-translate all selected chapters and generate audio for each.

\>> 对于译文中的数字，朗读时用中文朗读，而不是英文朗读.   Configure text-to-speech synthesis to vocalize numbers in translated text using Chinese pronunciation instead of English.

\>> set the default Audio mode to bilingual mode.  Set the default Audio mode to bilingual.

\>> 优化界面显示

\>> 如果对同一本书的翻译或者音频生成中途有终止，下一次在终止前一点点继续，且注意衔接良好

```python
 Add resumption support for interrupted             
  translations and audio generation,                 
  continuing from the checkpoint just before 
  the interruption with seamless segment             
  continuity.
```

\>> 对本项目生成一个便于识别的图标。Generate a recognizable icon for this project.

\>> 翻译后输出两种格式的翻译文本，一种是只有译文，一种是原文和译文的混合，其中一段是原文，一段是译文       Generate two translation formats:

translation-only and alternating

original-translated paragraphs.

\>> 询问Codex如何解决翻译的中文发音中的数字依然是使用英语发音而不是中文发音的问题 Fix numbers in Chinese translations being pronounced as English instead of Chinese.

\>> 解决对很多标题（比如Wealth Is Knowledge）没有进行翻译的问题。 Fix translation of titles like Wealth Is Knowledge that are currently untranslated.

\>> 询问codex当前代码还有哪些应该优化的地方     Use Codex to identify optimization opportunities in the current codebase.

\>> 使代码对于上传的PDF书籍，也能有这样的功能。 Add the same functionality for uploaded PDF books.

\>> 对于现有的UI，你认为可以有哪些优化的方向，给我计划，不要修改代码。 Analyze the audiobook UI and identify optimization opportunities. Provide a plan without implementing code changes.

\>> 慎重考虑一下下面的意见：基于当前实现，我认为 UI 优化重点不在“补更多功能”，
而在“把已有能力重新编排”，让主流程更清晰、状态更可
见、移动端更可用。现在的主要问题是：上传后信息密度
一下子过高，设置栏、批量操作、章节状态、阅读区同时
争夺注意力；而真正的主任务链路其实只有 3 步，选书、
选章节、生成结果。相关结构可以直接从 index.html:29
和 src/main.js:573 看出来，视觉层则主要受 src/
app.css:151 到 src/app.css:615 这一段影响。

优化方向

1. 重构信息层级。当前设置栏把语音、语速、音频模式、
   翻译目标全部平铺在顶部，index.html:36 对首次使用
   者负担偏大。建议改成“基础设置默认展开，高级设置
   折叠”，并把“当前输出配置”做成摘要卡片，避免用户
   频繁扫读所有控件。
2. 强化主操作路径。侧栏里同时有 Translate、MP3s、
   All-in-One、Export、ZIP，index.html:129 的操作优
   先级不够明确。建议只突出一个主 CTA，比如“生成音
   频”，其余操作降级为次级按钮或更多菜单。
3. 让章节状态更可读。现在章节状态主要靠 emoji 图标
   组合，src/main.js:330 到 src/main.js:374 可见，
   识别成本偏高。建议改成明确标签体系，例如“未处
   理 / 已翻译 / 已生成 / 可继续”，并补充进度数字。
4. 优化阅读区的任务上下文。章节详情页顶部操作和正文
   区是分离的，但缺少“这一章当前到了哪一步”的摘要。
   index.html:147 这里适合增加一行状态条，显示翻译
   状态、音频状态、上次中断点、可下载项。
5. 调整视觉密度和可扫描性。当前按钮字号、间距、控件
   高度整体偏小，尤其是设置栏和侧栏按钮，src/
   app.css:289 与 src/app.css:418 这两处最明显。建
   议统一 2 到 3 档尺寸体系，拉开主次层级。
6. 提升移动端策略。现在移动端基本是纵向堆叠，src/
   app.css:617 之后可见，但不是围绕移动场景重新设
   计。建议把“章节列表”和“正文阅读”改成切换式视图，
   而不是同时保留长侧栏。
7. 改善反馈机制。错误主要依赖 alert()，src/
   main.js:601 以后多处都是这样，体验比较硬。建议改
   成页面内 toast / inline error / 任务结果摘要，进
   度弹层也可以增加当前章节、剩余时间预估、后台继续
   能力。
8. 优化双语阅读呈现。当前 bilingual 是段落交错拼
   接，src/bilingual-view\.js:17，功能够用，但阅读体
   验一般。后续可以考虑“上下对照”或“左右对照”两种模
   式切换。

建议排期

1. 第一阶段，先做结构梳理。
   目标是把页面从“功能面板”变成“任务流界面”。
   输出应包括：页面信息架构图、按钮优先级矩阵、桌面
   端低保真线框。
2. 第二阶段，做关键交互重排。
   重点处理上传后首页、章节侧栏、章节详情头部、进度
   反馈这四块。
   输出应包括：主流程原型，覆盖“首次生成”“批量生
   成”“中断恢复”三条路径。
3. 第三阶段，做视觉系统收敛。
   统一颜色变量、按钮尺寸、标签样式、状态色和留白节
   奏。你现在已有变量基础，src/app.css:7 可以继续扩
   展成更完整的 design tokens。
4. 第四阶段，单独做移动端方案。
   不要只靠 media query 压缩桌面布局，而是重新定义
   移动端优先任务：选章节、看进度、下载结果。
   输出应包括移动端线框和关键手势/切换说明。

优先级最高的 5 项

- 把顶部设置区折叠成“基础设置 + 高级设置”
- 侧栏只保留一个主操作，其他批量动作降级
- 用明确状态标签替代 emoji 状态组合
- 在章节详情页增加任务状态摘要条
- 用非阻塞式错误/成功反馈替代 alert()

\>> 重新读取当前代码，如何让audiobook对于移动端也有更好的操作体验，给我计划，而不要直接修改代码     Analyze the audiobook codebase for mobile UX improvements and create a plan. Do not implement code changes.

结合下面的意见，提高对移动端的操作体验：

The mobile UX is serviceable but still desktop-
first. The codebase mostly adapts by stacking
existing regions instead of redefining the mobile
workflow, so the main pain points are density,
navigation friction, and action overload rather
than missing features.

Key Findings

1. The reader layout keeps the desktop mental model
   on mobile. At 768px and below, .main-content
   switches to a column and the sidebar stays
   visible above content with max-height: 35vh,
   which still forces users to manage both chapter
   navigation and reading in one long scroll flow.
   See src/app.css:622 and index.html:126.
2. The top settings area is too dense for mobile.
   Voice selection, preview, speed, audio mode, and
   translation target remain visible as one stacked
   block, which creates a lot of control weight
   before the user even reaches chapter content.
   See index.html:36 and src/app.css:151.
3. Bulk actions are overloaded in the sidebar. On
   mobile, five actions compete in a compressed
   grid, and at 480px the layout becomes a 3-column
   button cluster that is hard to scan and easy to
   mis-tap. See index.html:129 and src/app.css:289.
4. Chapter state is not legible enough on small
   screens. The row model relies on a checkbox,
   tiny emoji status icons, and truncated chapter
   text. That works on desktop but gets ambiguous
   on touch devices. See src/main.js:301 and src/
   app.css:324.
5. The chapter detail header is action-heavy and
   not optimized for thumb reach. The action row
   can wrap, but mobile still exposes translate,
   generate, download MP3, and download MD together
   without a stronger primary action hierarchy. See
   index.html:147 and src/app.css:394.
6. Progress feedback is functional but modal-
   centric. Long-running work always uses a
   blocking overlay with a cancel button, which is
   fine for safety but not ideal for mobile
   multitasking or context retention. See
   index.html:167 and src/main.js:975.
7. Errors still rely on alert(), which is
   especially disruptive on mobile. This appears
   across translation, generation, export, and
   download flows. See src/main.js:604, src/
   main.js:762, src/main.js:879, src/main.js:942,
   and src/main.js:969.

Mobile UX Plan

1. Redefine the mobile information architecture.
   Use a two-view model: Chapters and Reader,
   instead of stacking sidebar plus content. On
   mobile, the default entry after parsing should
   be the chapter list, and tapping a chapter
   should move into a dedicated reading/action
   view.
2. Collapse advanced controls.
   Keep only the most important mobile controls
   visible by default:
   Audio Mode, Translate To, and one “Voice
   Settings” entry point.
   Move voice selection, preview, and speed
   controls into a bottom sheet or expandable
   section.
3. Simplify action hierarchy.
   Promote one primary action per context:
   For chapter list: Generate Selected
   For chapter detail: Generate MP3
   Demote translation-only, export, and ZIP actions
   into a secondary menu.
4. Redesign chapter rows for touch.
   Increase tap targets and replace emoji-only
   state with explicit chips or labels such as
   Translated, Audio Ready, Resume, Queued. Keep
   the checkbox only in a dedicated selection mode
   rather than always showing it.
5. Add a mobile selection mode.
   Instead of persistent checkboxes, enter a batch-
   selection state with a sticky bottom action bar
   showing:
   N selected
   Translate
   Generate
   Export
   This reduces visual clutter in the default
   browsing state.
6. Make progress persistent rather than fully
   blocking.
   Keep cancel support, but shift from a full modal
   overlay to a compact progress panel or bottom
   sheet on mobile, with current chapter, stage,
   and percent complete. Users should be able to
   keep reading chapter content while batch work
   runs.
7. Replace disruptive alerts with inline feedback.
   Use non-blocking error/success surfaces:
   toast for transient success
   inline banner for failures
   chapter-level status for resumable work
8. Improve reader ergonomics.
   Increase content width usage on mobile, raise
   body text slightly, and keep the chapter title
   and primary action in a sticky header. Tabs for
   Original, Translated, and Bilingual should
   remain visible during scroll.
9. Rework bilingual reading for narrow screens.
   The current interleaved paragraph output is fine
   structurally, but mobile should prefer a clearer
   distinction between source and translation, such
   as card pairs or stronger spacing/color
   separation between alternating blocks. See src/
   bilingual-view\.js:17.
10. Audit keyboard-first assumptions.
    Some interaction logic is optimized for desktop
    patterns like shift-click range selection and
    keyboard activation. That is fine to keep, but
    mobile should not inherit UI complexity designed
    to support those behaviors. See src/main.js:288
    and src/main.js:409.

Suggested Phases

1. Mobile workflow design
   Define the mobile-first journey for upload,
   chapter browse, chapter action, batch action,
   and progress monitoring.
2. Wireframe pass
   Create low-fidelity wireframes for:
   upload screen
   chapter list
   selection mode
   chapter detail
   progress panel
3. UI spec pass
   Document spacing, tap target sizes, sticky
   regions, action priority, and responsive
   breakpoints.
4. Validation pass
   Test the plan against three common scenarios:
   single chapter generate
   batch generate across many chapters
   resume after cancellation/error

\>> 解决但中文翻译中有少量的英语字母（比如人名，公司名）和数字时，语音用英语语音朗读的问题，这个时候依然应该用中文语音朗读。 Fix text-to-speech routing so that English

letters, names, company names, and numbers

within Chinese text are read using Chinese

voice instead of English voice.

\>> 解决这个问题：Audio generation error:Edge TTS returned noaudio for voice "en-US-ChristopherNeural".Voicelanguage: en-US Try selecting a voice that matchesthe text language.

\>> 使生成的通知，有一个按钮，可以复制下来

\>> 使代码对上传的docx文件也能读取和语音转文字

\>> 后续每次代码有改动，都直接上传到github上

打开两个terminal，同时问Codex和Claude，让他们对某个功能给出计划，而不是直接修改代码

\>> 解决输出的markdown文件中没有图片，而是一段乱码字符的问题。例如markdown中显示：“!\[images]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABV8AAAJDCAAAAAFO/As0AAAACXBIWXMAAC4jAAAuIwF4pT92AAADGGlDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjaY2BgnuDo4uTKJMDAUFBUUuQe5BgZERmlwH6egY2BmYGBgYGBITG5uMAxIMCHgYGBIS8/L5UBFTAyMHy7xsDIwMDAcFnX0cXJlYE0wJpcUFTCwMBwgIGBwSgltTiZgYHhCwMDQ3p5SUEJAwNjDAMDg0hSdkEJAwNjAQMDg0h2SJAzAwNjCwMDE09JakUJAwMDg3N+QWVRZnpGiYKhpaWlgmNKflKqQnBlcUlqbrGCZ15yflFBflFiSWoKAwMD1A4GBgYGXpf8EgX3xMw8BSMDVQYqg4jIKAUICxE+CDEESC4tKoMHJQODAIMCgwGDA0MAQyJDPcMChqMMbxjFGV0YSxlXMN5jEmMKYprAdIFZmDmSeSHzGxZLlg6WW6x6rK2s99gs2aaxfWMPZ9/NocTRxfGFM5HzApcj1xZuTe4FPFI8U3mFeCfxCfNN45fhXyygI7BD0FXwilCq0A/hXhEVkb2i4aJfxCaJG4lfkaiQlJM8JpUvLS19QqZMVl32llyfvIv8H4WtioVKekpvldeqFKiaqP5UO6jepRGqqaT5QeuA9iSdVF0rPUG9V/pHDBYY1hrFGNuayJsym740u2C+02KJ5QSrOutcmzjbQDtXe2sHY0cdJzVnJRcFV3k3BXdlD3VPXS8Tbxsfd99gvwT//ID6wIlBS4N3hVwMfRnOFCEXaRUVEV0RMzN2T9yDBLZE3aSw5IaUNak30zkyLDIzs+ZmX8xlz7PPryjYVPiuWLskq3RV2ZsK/cqSql01jLVedVPrHzbqNdU0n22VaytsP9op3VXUfbpXta+x/+5Em0mzJ/+dGj/t8AyNmf2zvs9JmHt6vvmCpYtEFrcu+bYsc/m9lSGrTq9xWbtvveWGbZtMNm/ZarJt+w6rnft3u+45uy9s/4ODOYd+Hmk/Jn58xUnrU+...”

Fix the issue where exported markdown files contain embedded base64 image data URIs (e.g., `data:image/png;base64,iVBORw0KGgo...`) instead of properly exporting images as separate files or valid image references.

\>> 在audiobook的预览区域，可以成功地看到图片，但是download md以后，图片在typoria中打开后显示为“![images](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABWcAAAJ6CAAAAAEWrZ+dAAAACXBIWXMAAC4jAAAuIwF4pT92AAADGGlDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjaY2BgnuDo4uTKJMDAUFBUUuQe5BgZERmlwH6egY2BmYGBgYGBITG5uMAxIMCHgYGBIS8/L5UBFTAyMHy7...”

对/Users/victor/projects/audiobook/进行优化，使其在最后的download Zip 后不仅可以下载现有内容，还可以把已有的多个mp3文件合成一个整体的mp3文件

使Audiobook可以打开html文件并转化为语音

使audiobook最终的音频输出结果在目前的基础上增加一种组合模式：同一段文字先播放英语音频，然后播放汉语翻译音频，然后再播放英语音频。

\>> 对这个audiobook进行全面升级，使其可以是一个在手机上使用的APP。上传书籍后按当前选择生成翻译和音频；在手机APP里听音频时屏幕显示对应英语文本，正在发音的句子高亮，中文音频不显示中文文本；文本与音频进度匹配；可选择小节、暂停等；支持多用户并记录收听内容和进度。并借鉴 reading 项目部署到腾讯云 audiobook.tumei.online。

**Final report (EN):** Upgraded the audiobook web app into a mobile-first PWA with a synced listening player and multi-user progress tracking, deployed to Tencent Cloud.

1. **Audio–text sync**: Edge TTS outputs CBR MP3 (48kbps), so each segment's duration is derived from its byte size. `generateChapterAudio` now returns `{blob, timeline}` where the timeline maps playback time → paragraph + language, with English segments subdivided into per-sentence spans (proportional to character count). New module `src/audio-timeline.js` (+27 unit tests).
2. **Player** (`src/player.js` + `#player-screen`): full-screen mobile view showing English text only; the sentence being spoken is highlighted (Chinese audio highlights the corresponding English paragraph with a distinct style, no Chinese text shown). Auto-scroll follows playback; controls: play/pause, ±15s, prev/next chapter, seek bar, playback rate (0.75–1.5×), chapter drawer; Media Session lock-screen controls.
3. **Multi-user + library** (`src/db.js`, IndexedDB): listener profiles (create/switch on home screen), books (chapters + translations), per-chapter MP3s + timelines, and per-user per-chapter listening progress (saved every 5s and on pause/close; resume on reopen). Home screen shows "My Library" with per-user "Continue" entries. All data is stored locally on the device.
4. **PWA**: manifest + service worker (offline app shell) + PNG icons; installable to phone home screen.
5. **Deployment**: Tencent Cloud (43.139.242.52, same server as read.tumei.online), nginx site + `deploy/deploy-tumei.sh` (builds with `DEPLOY_BASE=/`). GitHub Pages deployment unchanged (base `/audiobook/`). Remaining manual step: add DNSPod A record `audiobook → 43.139.242.52`; certbot HTTPS issuance runs automatically once DNS resolves (or run the command in `deploy/README.md`).
All 280 tests pass. Verified end-to-end in browser: upload → parse → translate → library persistence across reloads → player rendering with sentence highlighting.

**最终报告（中文）：** 已将 audiobook 升级为移动端优先的 PWA，带同步收听播放器和多用户进度记录，并部署到腾讯云。

1. **音文同步**：Edge TTS 输出恒定码率 MP3（48kbps），每段音频时长可由字节数推算。`generateChapterAudio` 现在返回 `{blob, timeline}`，时间线把播放时间映射到段落+语言；英文段按句子字符数比例细分到句。新模块 `src/audio-timeline.js`（含 27 个单元测试）。
2. **播放器**（`src/player.js`）：全屏移动端界面，只显示英语文本；正在朗读的句子高亮（播放中文音频时以另一种样式高亮对应英文段落，不显示中文）。自动滚动跟随进度；控制项：播放/暂停、±15秒、上/下一章、进度条、倍速（0.75–1.5×）、章节抽屉；支持锁屏媒体控制。
3. **多用户+书库**（`src/db.js`，IndexedDB）：首页可新建/切换听者档案；书库保存书籍（含译文）、每章 MP3+时间线、每个用户每章的收听进度（每 5 秒及暂停/关闭时保存，重开自动续听）。首页"My Library"显示每个用户的"继续收听"。数据保存在本设备。
4. **PWA**：manifest + Service Worker（离线壳缓存）+ PNG 图标，可"添加到主屏幕"。
5. **部署**：腾讯云（43.139.242.52，与 read.tumei.online 同一台），nginx 站点 + `deploy/deploy-tumei.sh`（以 `DEPLOY_BASE=/` 构建）。GitHub Pages 部署不受影响。**剩余一步手动操作：在 DNSPod 给 `tumei.online` 添加 A 记录 `audiobook → 43.139.242.52`**；DNS 生效后 HTTPS 证书会自动签发（后台脚本监测中，也可手动执行 `deploy/README.md` 中的 certbot 命令）。
全部 280 个测试通过。浏览器端到端验证：上传 → 解析 → 翻译 → 书库跨刷新持久化 → 播放器句子高亮渲染。

\>> 用户登陆自己的账户后，不能自己生成音频，而是联系管理员（微信tumei321123）由管理员生成；生成后书籍出现在用户APP界面，可听音频看文本学习。管理员可建内容库，并指定某些人对某些书有访问权限，而不是所有人都能访问所有书。优化相关显示界面。

**Final report (EN):** Restructured the app into an admin-publishes / users-listen model with per-book access control.

1. **Two modes.** User mode (default): a clean login screen asking for an access code, a personal shelf of admin-published books, and a "contact admin on WeChat: tumei321123" banner with a copy button. All upload/translate/generate UI is hidden. Admin mode (open with `#admin`, persists; `#user` switches back): the full generation workspace, plus a new "Publish ZIP" button.
2. **Content library with per-book permissions.** The server hosts `library/catalog.json` + one folder per book (book.json with chapters/translations/timelines + per-chapter MP3s). Each catalog entry has `access`: either specific access codes or `public`. A user's shelf shows only books assigned to their code — verified end-to-end (code "alice" sees her book, not "bob"'s).
3. **Admin workflow.** Generate in the browser → click Publish ZIP → `bash deploy/publish-book.sh <zip> code1,code2` uploads and registers the book; `deploy/set-access.sh` lists the library and changes permissions without re-uploading. `deploy-tumei.sh` now excludes `library/` so code deploys never touch content.
4. **User experience.** Tapping a book streams text immediately; chapter audio downloads on demand and is cached in IndexedDB for offline replay; listening progress is tracked per access code with "continue where you left off" on the shelf. The player (synced sentence highlighting, English-only text) is unchanged.
5. **Verified live** on https://audiobook.tumei.online with a real published demo book (access code `demo`, macOS-synthesized speech): login, permission filtering, on-demand audio fetch, playback with sentence/paragraph highlighting, and progress resume all work. 291 unit tests pass.
Note: this is a static-hosting design — access codes control shelf visibility, not cryptographic security; fine for a private WeChat-run learning service.

**最终报告（中文）：** 应用已重构为"管理员生成、用户收听"模式，并支持按书授权。

1. **双模式。** 用户模式（默认）：访问码登录页 + 个人书架 + "联系管理员微信 tumei321123"横幅（带复制按钮），所有上传/翻译/生成功能全部隐藏。管理员模式（网址加 `#admin` 开启并记住，`#user` 切回）：保留完整生成工作台，新增 "Publish ZIP" 发布按钮。
2. **内容库与按书授权。** 服务器托管 `library/catalog.json` + 每本书一个目录（book.json 含章节/译文/时间线 + 各章 MP3）。每本书的 `access` 字段指定可见的访问码列表（或 `public` 公开）。用户书架只显示分配给自己访问码的书——已实测（alice 看不到 bob 的书）。
3. **管理员流程。** 浏览器里生成 → 点 Publish ZIP → 本机执行 `bash deploy/publish-book.sh <zip> 访问码1,访问码2` 上传并登记；`deploy/set-access.sh` 可查看内容库、随时调整权限（无需重传）。`deploy-tumei.sh` 已排除 `library/`，代码部署不会碰内容库。
4. **用户体验。** 打开书立即看到文本；章节音频按需下载并缓存到 IndexedDB（可离线重听）；收听进度按访问码记录，书架显示"上次听到"一键续听。播放器（句子同步高亮、只显示英文）不变。
5. **线上实测通过**：在 https://audiobook.tumei.online 用真实发布的演示书（访问码 `demo`，macOS 语音合成）完整走通登录、权限过滤、按需加载音频、句子/段落高亮播放、进度续听。291 个单元测试全部通过。
说明：静态托管方案下，访问码控制的是书架可见性，并非加密安全边界——适合微信私域学习服务的场景。

\>> 使本软件也能对doc格式进行转化。 Add support for legacy .doc (binary Word) files.

**Final report (EN):** Added browser-side parsing of legacy binary Word (.doc) files — no server or library needed. New `src/doc-parser.js` implements an OLE2 Compound File (CFB) reader (FAT/miniFAT/DIFAT chains, directory, mini-stream) plus MS-DOC text extraction: reads the FIB, locates the piece table (CLX/PlcPcd) in the 0Table/1Table stream, and decodes each piece as Windows-1252 or UTF-16LE; falls back to contiguous fcMin text for Word 6/95 files. Field codes (e.g. HYPERLINK instructions) are stripped keeping their visible result; table cell marks and control characters are normalized. Chapters are detected heuristically ("Chapter N", 第N章, Prologue/前言, etc.), with a single-chapter fallback. Wired into upload UI (drop zone, file picker, drag-drop) alongside EPUB/PDF/DOCX/HTML. 13 new tests use real .doc fixtures generated with macOS textutil (English + mixed Chinese/English); 305 tests pass. Verified in the browser: uploading sample-en.doc parses into 2 chapters with correct text. Deployed to audiobook.tumei.online.

**最终报告（中文）：** 已支持老版二进制 Word（.doc）格式，纯浏览器解析，无需服务器或第三方库。新模块 `src/doc-parser.js` 实现了 OLE2 复合文件（CFB）读取（FAT/miniFAT/DIFAT 链、目录、mini-stream）和 MS-DOC 文本提取：解析 FIB、在 0Table/1Table 流中定位 piece table（CLX/PlcPcd），按块解码 Windows-1252 或 UTF-16LE；对 Word 6/95 老文件回退到 fcMin 连续文本。域代码（如超链接指令）会被剥除并保留可见文本；表格符和控制字符做规范化。章节按启发式识别（"Chapter N"、第N章、前言等），无标题时归为单章。已接入上传界面（拖放、文件选择器）与 EPUB/PDF/DOCX/HTML 并列。新增 13 个测试，使用 macOS textutil 生成的真实 .doc 样例（英文 + 中英混排）；305 个测试全部通过。浏览器实测：上传 sample-en.doc 正确解析为 2 章。已部署到 audiobook.tumei.online。

\>> 对于目前的"我在 #admin 生成音频，用户在 https://audiobook.tumei.online 获得指定的音频"的过程进行优化。 Streamline the admin-generates / users-receive workflow.

**Final report (EN):** Publishing is now one click inside the browser — no more download-ZIP-then-run-a-script.

1. **Server admin API** (`deploy/library-api.py`): a stdlib-only Python service (systemd unit `audiobook-api`, 127.0.0.1:8791) proxied by nginx at `/api/`. Endpoints: publish a book ZIP, change a book's access list, replace the registered login codes, delete a book, plus ping/catalog. Every request is authenticated with an `X-Admin-Token` header checked (constant-time) against `/etc/audiobook-api-token`; uploads are capped at 800 MB with zip-slip and book-id validation. `deploy/setup-api.sh` installs/updates the whole thing idempotently.
2. **One-click publish.** The sidebar's primary action in #admin is now "🚀 发布到网站": a dialog shows the book/chapter/audio summary, takes the access codes (comma/Chinese-comma/space separated; empty or "public" = everyone) and the admin password (remembered in localStorage after the first use; a wrong password clears it and re-prompts), then builds the publish ZIP in the browser and uploads it with a live progress bar. The book appears on users' shelves immediately. "Publish ZIP" remains as a command-line fallback.
3. **In-browser management.** The admin shelf now shows the registered access codes with a 🔑 manager (add/remove codes that may log in), and every book row has ✏️ (edit which codes see the book) and 🗑 (two-tap confirm, removes the book from the site). All changes take effect instantly for users.
4. **Works from anywhere:** the API has CORS enabled, so #admin on localhost dev or GitHub Pages also publishes to the production library.
5. **Verified live end-to-end** on audiobook.tumei.online: auth rejects missing/wrong tokens (401), publish → static serving → access change → delete round-trip, and the codes endpoint round-trips the 100 existing registered codes; the demo book and spreadsheet data were untouched. 314 unit tests pass (9 new). Note: publishing from the browser no longer updates 访问码管理.xlsx automatically — run `bash deploy/sync-books.sh` when you want the spreadsheet refreshed.

**最终报告（中文）：** 发布流程已优化为浏览器里一键完成——不再需要"下载 ZIP → 切终端跑脚本"。

1. **服务器管理 API**（`deploy/library-api.py`）：纯 Python 标准库小服务（systemd 服务 `audiobook-api`，监听 127.0.0.1:8791），nginx 反代到 `/api/`。接口包括：上传发布包、修改某本书的访问权限、更新可登录访问码、下架书籍，以及 ping/目录查询。所有请求用 `X-Admin-Token` 请求头鉴权（与服务器 `/etc/audiobook-api-token` 恒时比较）；上传限 800 MB，并校验 zip 成员名与书籍 ID，防止路径穿越。`deploy/setup-api.sh` 一条命令安装/更新（可重复执行）。
2. **一键发布。** #admin 侧栏新增主按钮"🚀 发布到网站"：弹窗显示书名/章节/音频数，填访问码（支持中英文逗号、顿号、空格分隔；留空或 public 为所有人可见）和管理员密码（首次输入后浏览器记住，密码错误会自动清除并重新提示），然后在浏览器内打包并带进度条上传。发布完成后用户书架立即可见。原"Publish ZIP"保留为命令行备用方案。
3. **浏览器内管理。** 管理员书架顶部显示已登记的访问码并提供 🔑 管理入口（增删可登录的码）；每本书有 ✏️（修改哪些码可见）和 🗑（两次点击确认后从网站下架）。所有修改对用户即时生效。
4. **任何入口都能用：** API 已开启 CORS，本地开发或 GitHub Pages 上的 #admin 也直接发布到正式内容库。
5. **线上端到端实测通过**：无/错误密码返回 401；发布 → 静态访问 → 改权限 → 下架全链路正常；访问码接口对现有 100 个码原样读写无损；演示书与表格数据未受影响。314 个单元测试全部通过（新增 9 个）。注意：浏览器发布不会自动更新 访问码管理.xlsx——需要时执行 `bash deploy/sync-books.sh` 把最新书目拉回表格。

\>> 我在翻译一本书的过程中出现了报错 Translation error: Microsoft Translate error: 429。 Fix translation failures caused by Microsoft Translate rate limiting (HTTP 429).

**Final report (EN):** Translation now survives Microsoft's rate limiting instead of dying on it.

1. **Why it happened:** the app fires translation batches back-to-back; the free Edge Translate endpoint rate-limits bursts with HTTP 429, and the old code only retried twice (1s/3s) — far shorter than a real rate-limit window — then gave up.
2. **Longer, smarter retries:** on 429 the app now retries up to 5 times waiting 5s → 15s → 30s → 60s → 90s, and when Microsoft sends a `Retry-After` header its value is honored (capped at 120s). Transient 401/5xx errors keep their own short backoff.
3. **Prevention:** batches are now spaced 350ms apart, which stays under the burst threshold in normal use.
4. **Visible waiting:** during a rate-limit wait the progress dialog shows "⏳ 翻译服务限流 (429)，N 秒后自动重试 — 进度不会丢失", and Cancel aborts instantly even mid-wait.
5. **If it still fails** after all retries, the error message now explains that progress is checkpointed — clicking Translate again resumes from the last completed paragraph (checkpointing already existed; nothing is retranslated or lost).
316 unit tests pass (2 new: 429-retry-then-succeed, Retry-After honored). Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 翻译遇到微软限流不再直接报错中断，会自动等待并重试。

1. **原因：** 应用连续不间断地发送翻译批次，免费的 Edge 翻译接口对突发请求返回 429 限流；旧代码只重试 2 次（等 1 秒/3 秒），远短于实际限流窗口，然后就放弃报错。
2. **更长更聪明的重试：** 遇到 429 现在最多重试 5 次，依次等待 5→15→30→60→90 秒；若微软返回 `Retry-After` 头则按它指定的时间等（上限 120 秒）。临时性的 401/5xx 错误保持原有的短间隔重试。
3. **预防触发：** 批次之间新增 350 毫秒间隔，正常使用下不易再触发限流。
4. **等待可见：** 限流等待期间进度框显示"⏳ 翻译服务限流 (429)，N 秒后自动重试 — 进度不会丢失"，等待中点 Cancel 可立即中止。
5. **万一重试仍失败**，错误提示会说明进度已保存——再点一次 Translate 会从上次完成的段落继续（断点续译机制原本就有，不会重翻或丢失）。
316 个单元测试全部通过（新增 2 个：429 重试后成功、遵循 Retry-After）。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 点击发布到网站按钮后，应该有结果反馈发布成功与否；目前先不管访问权限的问题，先把系统改成管理员上传书籍后所有人都可以访问。 Show clear publish success/failure feedback; temporarily open every published book to all users.

**Final report (EN):**

1. **Publish feedback in the dialog.** The publish dialog no longer closes silently into a corner toast. On success it switches to a result view — big ✅ "发布成功！", the book's title/chapter/audio counts, its visibility, and "用户刷新书架即可看到" — which stays open until the admin clicks 关闭. On failure it shows ❌ with the exact reason, keeps the form visible, and the confirm button becomes 重试; a wrong admin password clears the saved one and refocuses the password field, and the message reassures that the book stays safe on the local machine.
2. **All books open to everyone (temporary).** Per request, per-book access control is bypassed for now: every logged-in user's shelf shows all published books; the access-code field in the publish dialog is hidden (publishes default to public); and the one existing server book was flipped to public. The permission machinery (API, ✏️ editor, catalog access lists) is intact and commented for easy re-enable — restoring per-code filtering is a one-line change back to visibleBooks() plus unhiding the field.
316 tests pass. Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：**

1. **发布结果直接显示在弹窗里。** 点"发布"后不再是悄悄关窗+角落提示：成功时弹窗切换为结果页——大号 ✅"发布成功！"、书名/章节数/音频数、可见范围、"用户刷新书架即可看到"，看清后手动点"关闭"；失败时显示 ❌ 和具体原因，表单保留、按钮变为"重试"；密码错误会自动清除已存密码并让你重输，并提示书籍仍在本机不会丢失。
2. **临时开放全部书籍（按要求）。** 目前跳过按书授权：所有登录用户的书架显示全部已发布书籍；发布弹窗隐藏访问码栏（发布默认公开）；服务器上现有书籍已全部设为 public。权限机制（API、✏️ 权限编辑、目录中的访问码列表）全部保留并加了注释，日后恢复只需一行改回 visibleBooks() 并取消隐藏访问码栏。
316 个测试通过。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 我点侧栏绿色的 🚀 发布到网站 后没有任何反应，没有让我输入密码的界面。 Fix: clicking Publish-to-Site did nothing — no password dialog appeared.

**Final report (EN):** Found and fixed — the publish dialog could never display.

1. **Root cause:** the dialog reused the app's `.progress-overlay` CSS, which is `display:none` until a `visible` class is added; the code only toggled the `hidden` attribute, which that CSS silently overrides. The click handler ran, but nothing could ever appear on screen.
2. **Fix:** new `showModal()/hideModal()` helpers toggle both the attribute and the `visible` class for the publish dialog and the access/codes editor dialog. The same CSS pitfall also kept the (supposedly hidden) access-code field visible inside the dialog — added explicit `[hidden]` overrides for `.modal-label` and `.shelf-admin-tools`.
3. **Verified in a real browser** on the live site: clicking 🚀 发布到网站 now opens the dialog (book summary + admin password field only, since access control is currently open to everyone), and 取消 closes it. Screenshot-confirmed. Also removed a leftover empty `_test` folder from the server library.
316 tests pass. Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 已定位并修复——发布弹窗此前根本无法显示。

1. **根本原因：** 弹窗复用了应用的 `.progress-overlay` 样式，该样式默认 `display:none`，必须加 `visible` class 才显示；而代码只切换了 `hidden` 属性——被 CSS 覆盖后毫无效果。点击后代码其实在执行，只是界面上永远看不到。
2. **修复：** 新增 `showModal()/hideModal()` 辅助函数，同时切换属性和 `visible` class（发布弹窗和权限/访问码编辑弹窗都已接入）。同一 CSS 陷阱还导致弹窗里本应隐藏的访问码栏仍然可见——已为 `.modal-label`、`.shelf-admin-tools` 补上 `[hidden]` 覆盖规则。
3. **已在真实浏览器里对线上站点验证：** 点 🚀 发布到网站 弹窗正常出现（只显示书籍信息 + 管理员密码栏，因为当前权限全开放），取消可正常关闭，截图确认。顺带清理了服务器内容库里遗留的空 `_test` 目录。
316 个测试通过。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 发布失败：bad book id in manifest: 'self-talk-6-16-(organized)-copy-2'。 Fix publish rejection for titles containing special characters.

**Final report (EN):** Publishing no longer fails on titles with parentheses or other special characters.

1. **Root cause:** the publish id was derived from the book title keeping characters like `(`/`)`; the server (correctly) rejects anything outside lowercase letters, digits, `-`, `_`.
2. **Fix:** new `makePublishId()` in src/library-api.js — lowercases, collapses every run of other characters into `-`, trims, caps at 60 chars ("Self-Talk 6-16 (Organized) copy 2" → `self-talk-6-16-organized-copy-2`). Titles with no latin letters at all (e.g. pure Chinese) get a stable `book-<hash>` id, so republishing the same book still overwrites rather than duplicates. Used by both 🚀 publish-to-site and the Publish ZIP fallback; local library ids are untouched.
4 new unit tests (320 total, all pass). Deployed to audiobook.tumei.online and pushed to GitHub. The 发布失败 dialog did its job — the exact server reason was visible, which is what pinpointed this bug.

**最终报告（中文）：** 书名含括号等特殊字符不再导致发布失败。

1. **原因：** 发布用的书籍 ID 直接从书名生成，保留了 `(`、`)` 等字符；服务器出于安全只接受小写字母、数字、`-`、`_`，于是拒绝。
2. **修复：** src/library-api.js 新增 `makePublishId()`——转小写、把其余字符段压成 `-`、去首尾、限 60 字符（"Self-Talk 6-16 (Organized) copy 2" → `self-talk-6-16-organized-copy-2`）。完全没有拉丁字母的书名（如纯中文）用稳定的 `book-<哈希>` ID，重复发布同一本书仍是覆盖而非新建。🚀 发布到网站和 Publish ZIP 备用通道都已换用；本机书库 ID 不受影响。
新增 4 个单元测试（共 320 个，全部通过）。已部署 audiobook.tumei.online 并推送 GitHub。这次"发布失败"弹窗准确显示了服务器返回的原因——反馈机制正是靠它定位到了这个 bug。

\>> 发布成功了。对于管理员的界面，已经发布成功的内容，在界面上应该有所标识。 Mark already-published content in the admin interface.

**Final report (EN):** The admin interface now shows publish status everywhere it matters.

1. **My Library badges:** every locally generated book carries a pill badge — green "✅ 已发布" (hover shows when the site version was last updated, and the meta line shows 网站版 date) or grey "未发布".
2. **Sidebar publish button:** when the open book is already on the site, the green 🚀 button turns blue and reads "✅ 已发布 · 点此更新网站版本", with the publish date and audio count in its tooltip. Unpublished books keep the green 🚀 发布到网站.
3. **Overwrite awareness:** the publish dialog notes "已于 <时间> 发布过，本次发布将覆盖网站版本" when republishing; after a successful publish all indicators refresh immediately. Books opened from the shelf (already-remote) are matched by their remote id, local books by their sanitized publish id.
Status comes from the live server catalog (fetched fresh on each library render / book open; falls back to last known state offline). Verified live in the browser: an already-published book shows the blue updated-state button with correct timestamp. 320 tests pass; deployed and pushed.

**最终报告（中文）：** 管理员界面现在处处可见发布状态。

1. **My Library 徽章：** 每本本地生成的书都带状态胶囊——绿色"✅ 已发布"（悬停可见网站版本更新时间，信息行也显示"网站版 <时间>"）或灰色"未发布"。
2. **侧栏发布按钮：** 当前打开的书如果已在网站上，绿色 🚀 按钮变为蓝色"✅ 已发布 · 点此更新网站版本"，悬停提示发布时间和音频数；未发布的书保持绿色"🚀 发布到网站"。
3. **覆盖提醒：** 重复发布时弹窗会注明"已于 <时间> 发布过，本次发布将覆盖网站版本"；发布成功后所有标识立即刷新。从书架打开的（已在网站上的）书按远程 ID 匹配，本地书按清理后的发布 ID 匹配。
状态实时取自服务器目录（每次渲染书库/打开书都拉取最新，离线时沿用上次已知状态）。已在浏览器线上验证：打开已发布的书显示蓝色更新按钮和正确的时间戳。320 个测试通过；已部署并推送。

\>> 增加 repeat each sentence 的选项，并将 EN ZH EN (repeat each sentence) 设为默认选择；在 EN ZH EN 模式中上一句的最后一次英语和下一句开始的英语音频之间有一个间隔提示音。 Add a repeat-each-sentence audio mode (default), with a separator chime between repeat groups.

**Final report (EN):**

1. **New audio mode "EN→ZH→EN (repeat each sentence)"** — now the default. Every English sentence is spoken as EN → its Chinese translation → EN again. The Chinese comes from per-sentence machine translation done automatically at generation time (chunked 25/request with the same 429-backoff), so the mode works even on untranslated chapters; already-Chinese sentences are spoken once. Progress shows "正在逐句翻译 N / M 句…".
2. **Separator chime.** A soft 0.7s 880Hz "ding" plays between repeat groups — between the closing EN of one sentence and the opening EN of the next — so listeners can tell the repetition boundary. Applied to both the new sentence mode and the existing paragraph EN→ZH→EN mode. The chime is a 4KB embedded MP3 encoded exactly like Edge TTS output (24kHz mono 48kbps CBR), keeping blob concatenation and the byte-based timeline math valid.
3. **Player highlighting upgraded** for the new mode: the exact sentence being spoken is highlighted during its English readings, and stays highlighted while its Chinese translation plays (matched via a srcSentence link in the timeline); the chime keeps the paragraph highlight.
12 new unit tests (327 total, all pass): segment ordering EN/ZH/EN + beep placement, Chinese-sentence passthrough, markdown stripping, beep blob decode/cache, translateTexts chunking. Deployed to audiobook.tumei.online (verified live: mode list + default) and pushed to GitHub.

**最终报告（中文）：**

1. **新音频模式"EN→ZH→EN (repeat each sentence)"并设为默认。** 每个英文句子按"英文 → 中文翻译 → 英文"朗读。中文来自生成时自动进行的逐句机器翻译（每 25 句一批，带 429 限流退避），因此未翻译的章节也能直接用此模式生成；本身是中文的句子只读一遍。进度框显示"正在逐句翻译 N / M 句…"。
2. **间隔提示音。** 句组之间——上一句最后一遍英文和下一句第一遍英文之间——播放一声轻柔的 0.7 秒 880Hz "叮"，标记重复边界。新逐句模式和原有的按段落 EN→ZH→EN 模式都已加上。提示音是 4KB 内嵌 MP3，编码参数与 Edge TTS 输出完全一致（24kHz 单声道 48kbps CBR），拼接和按字节推算时长的时间线机制不受影响。
3. **播放器高亮升级：** 逐句模式下，正在朗读的那个句子精确高亮；播放它的中文翻译时该英文句保持高亮（时间线新增 srcSentence 关联）；提示音期间保持段落高亮。
新增 12 个单元测试（共 327 个，全部通过）：EN/ZH/EN+提示音的分段顺序、中文句子直读、markdown 清理、提示音解码缓存、逐句翻译分批。已部署 audiobook.tumei.online（线上验证模式列表与默认值）并推送 GitHub。

\>> 长书上传后用户点击 Listen 半天没反应——按章节分割并显示下载进度；另：为什么最近翻译频繁 429（内容都很短）？ Fix slow Listen on long books (chapter splitting + download progress); explain/fix the frequent 429s.

**Final report (EN):**

1. **Download progress.** Tapping Listen now immediately opens a progress dialog "⬇️ 下载本章音频: <chapter>" with a streamed progress bar showing 已下载 X / Y MB and percent (fetch + ReadableStream against Content-Length; Cancel aborts the download). Once downloaded, audio is cached in IndexedDB — replays are instant.
2. **Per-chapter download state.** User-mode chapter rows now show ✓ 已下载 (cached on this device), ☁️ 可听 + file size (tap to download — size comes from a new audioSize field in the publish manifest), or 文本 (no audio). Audio was already stored per chapter — only the tapped chapter downloads.
3. **Auto-split long books.** Books whose source has no usable chapter structure (e.g. a whole book parsed as one chapter) are now split automatically at upload: any chapter over ~9k characters becomes balanced ~6k-char parts at paragraph boundaries, titled "Title (i/n)" (wired the previously unused content-splitter). Smaller chapters → shorter generation runs, smaller MP3s, faster user downloads.
4. **Why the 429s, and the fix.** The sentence-repeat mode re-translated every sentence on every Generate Audio run — repeated tests of the same content burned the free API's per-IP quota. Added a persistent sentence-translation cache (IndexedDB): a sentence is translated once ever; regenerations hit the cache ("翻译缓存命中 N 句") and only new sentences reach the API.
Verified live in a real browser: progress dialog with MB counter, player opens after download, badge flips to ✓ 已下载. 6 new tests (333 total, all pass). Deployed and pushed.

**最终报告（中文）：**

1. **下载进度可见。** 点 Listen 立即弹出"⬇️ 下载本章音频"进度框，流式显示"已下载 X / Y MB"和百分比（Cancel 可中止）。下载过的章节缓存在设备上，再次播放秒开。
2. **每章下载状态。** 用户模式章节列表显示：✓ 已下载（本机已缓存）、☁️ 可听 + 文件大小（点击即下载；大小来自发布清单新增的 audioSize 字段）、文本（无音频）。音频本来就按章节存储——点哪章只下载哪章。
3. **长书自动分章。** 源文件没有章节结构的书（比如整本解析成一章）上传时自动分割：超过约 9000 字符的章节按段落边界均衡切成约 6000 字符的部分，标题为"原标题 (i/n)"（接入了此前未使用的 content-splitter 模块）。章节变小 → 生成更快、MP3 更小、用户下载更快。
4. **429 频繁的原因与修复。** 逐句模式此前每次 Generate Audio 都把全部句子重新翻译一遍——反复测试同样内容会重复消耗免费接口的 IP 配额。现已加入持久化的句子翻译缓存（IndexedDB）：每个句子一生只翻一次，重新生成时直接命中缓存（提示"翻译缓存命中 N 句"），只有新句子才请求接口。
已在真实浏览器线上验证：进度框 MB 计数、下载完成后播放器打开、徽章变为 ✓ 已下载。新增 6 个测试（共 333 个，全部通过）。已部署并推送。

\>> 此时改为使用 Google 的免费翻译。 Switch to Google's free translation while Microsoft is rate-limited.

**Final report (EN):** Translation now falls back to Google automatically — no waiting out Microsoft's limit window.

1. **New provider module** `src/google-translator.js`: uses Google's public gtx endpoint (`translate.googleapis.com/translate_a/t`), batch-capable (one form field per text, one request per 25-sentence batch), no API key, CORS-friendly. Language codes are mapped (zh-Hans → zh-CN); both fixed-source and auto-detect response shapes are parsed. Verified working live from the browser.
2. **Automatic fallback**: whenever Microsoft returns 429, the same batch is immediately retried against Google. If Google succeeds the flow continues seamlessly (progress shows "⚡ 微软翻译限流 — 已自动切换 Google 翻译继续"); if Google is unreachable the original Microsoft backoff/retry chain resumes. Applies everywhere — paragraph translation, sentence-repeat mode, and the sentence cache stores the result regardless of provider.
3. Note: Google must be reachable from the admin's machine (translation runs admin-side only; end users in mainland China are unaffected).
11 new tests (341 total, all pass). Deployed to audiobook.tumei.online and pushed to GitHub. (A background probe is watching Microsoft's limit; it was still 429 at deploy time — with the fallback this no longer blocks work.)

**最终报告（中文）：** 翻译遇到微软限流时自动切换 Google，免去等待。

1. **新翻译模块** `src/google-translator.js`：使用 Google 公开的 gtx 端点（`translate.googleapis.com/translate_a/t`），支持批量（每批 25 句一次请求）、无需 API key、浏览器跨域可用。语言代码自动映射（zh-Hans → zh-CN），固定源语言和自动检测两种返回格式都能解析。已在浏览器实测可用。
2. **自动切换**：微软返回 429 时，同一批句子立即改用 Google 翻译，成功则无缝继续（进度框显示"⚡ 微软翻译限流 — 已自动切换 Google 翻译继续"）；若 Google 也不可达则回到微软的退避重试。段落翻译、逐句模式全部生效；翻译缓存对两个来源的结果一视同仁。
3. 说明：Google 需要管理员电脑的网络可达（翻译只在管理员端进行，大陆用户端不受影响）。
新增 11 个测试（共 341 个，全部通过）。已部署并推送 GitHub。（后台仍在探测微软限流，部署时仍为 429——但有了自动切换，这不再阻塞任何操作。）

\>> 这个软件在客户端可以改成多一种显示模式：在播放的时候，只显示播放的这一句和前后一句的字幕，然后手机端界面用全屏显示，然后字体就可以做到更大，方便阅读 Add a client-side subtitle display mode: while playing, show only the current sentence plus one before and one after, fullscreen on mobile with larger type for easier reading.

**Final report (EN):** The player now has a subtitle-style reading mode, toggled from its header.

1. **New toggle button** (💬) in the player header switches between the existing full-chapter scroll view and a new "subtitle" view. The choice is remembered in localStorage across sessions and chapters.
2. **Subtitle view** shows exactly three lines, centered in the already-fullscreen mobile player: the previous sentence (dimmed, smaller), the sentence currently being spoken (bold, large — 1.85rem, 2.2rem on phones), and the next sentence (dimmed, smaller). It stays in sync with playback via the existing audio timeline, and the sentence flow continues seamlessly across paragraph breaks (a new flat, chapter-wide sentence index drives the prev/next lookup instead of the old per-paragraph indexing).
3. Reused the existing highlight/timeline logic entirely — the new mode just reads the same "currently speaking" sentence and renders it three-lines-at-a-time instead of highlighting it inside the full scrolling text; toggling back to full-text mode keeps working exactly as before.
Verified live in the browser (mobile viewport): toggle switches modes correctly, the first sentence pre-fills on chapter open, mid-chapter and paragraph-crossing sentences show correct prev/current/next text, and the last sentence of a chapter correctly leaves "next" blank. 341 tests pass (no new test file — this is UI/DOM behavior, verified live). Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 播放器新增字幕式阅读模式，从页头一键切换。

1. **新增切换按钮**（💬）位于播放器页头，可在原有的整章滚动视图和新的"字幕"视图之间切换。选择会存入 localStorage，跨会话、跨章节保持。
2. **字幕视图** 在已经全屏的手机播放器中央只显示三行：上一句（变暗、字号较小）、正在朗读的句子（加粗放大——1.85rem，手机上 2.2rem）、下一句（变暗、字号较小）。与现有的音频时间线保持同步，且跨段落时句子流转仍然连续（新增了一个横跨全章、不分段落的句子索引，用它来查找上一句/下一句，替代原来按段落内索引的做法）。
3. 完全复用了原有的高亮/时间线逻辑——新模式只是读取同一个"正在朗读"的句子，把它渲染成三行而不是在整段滚动文字里高亮；切回整文模式行为不受影响。
已在浏览器（手机视口）线上验证：切换按钮正确换视图，打开章节时预填第一句，章节中段及跨段落的句子前后句显示正确，章节最后一句"下一句"正确留空。341 个测试通过（无需新增测试文件——这是 UI/DOM 行为，已线上验证）。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 这个功能很不错，在阅读界面还应该有全屏模式，让快速播放等界面都消失，最大程度展示文本 Add a true fullscreen mode to the reading view — hide the header, playback controls, etc. so the text is shown to the maximum extent.

**Final report (EN):** The player now has a fullscreen reading mode, orthogonal to the full-text/subtitle toggle added earlier.

1. **New ⛶ toggle button** in the player header. Tapping it hides the header (back/mode/chapters buttons, book/chapter title) and the bottom controls bar (seek, play, speed, prev/next), so whichever text view is active — full chapter or subtitle — expands via flexbox to fill the entire screen.
2. **Tap-to-restore.** Since the controls are gone, tapping anywhere in the reading area brings them back (the same tap toggles nothing when controls are already visible, so it never interferes with normal reading/scrolling). This is the same convention used by video players and e-readers.
3. Safe-area insets (notch/home-indicator) are preserved on the text container itself once the header/controls that normally carried that padding are hidden. Preference persists in localStorage, same pattern as the subtitle-view toggle, and works independently of it — any combination of full/subtitle × fullscreen/normal is supported.
Verified live in the browser: entering fullscreen from both full-text and subtitle view correctly hides all chrome and the text re-flows to fill the screen; tapping the text restores the header and controls in both modes. 341 tests pass; deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 播放器新增真正的全屏阅读模式，与此前的整文/字幕切换相互独立。

1. **新增 ⛶ 切换按钮**，位于播放器页头。点击后隐藏页头（返回/字幕模式/章节列表按钮、书名章节名）和底部控制栏（进度条、播放、倍速、上下章），无论当前是整文视图还是字幕视图，文字区域都会通过 flex 布局自动撑满整个屏幕。
2. **点按恢复。** 控制栏消失后，点按阅读区域任意位置即可恢复（控制栏已显示时点击不会有任何多余动作，不干扰正常阅读/滚动），与视频播放器、电子书阅读器的通用交互一致。
3. 隐藏页头/控制栏后，原本由它们承担的安全区域内边距（刘海屏/home 指示条）改为直接加在文字容器上，避免贴边。切换状态存入 localStorage，与字幕视图开关同样的做法，且两者相互独立——整文/字幕与全屏/普通可任意组合。
已在浏览器线上验证：整文视图和字幕视图下点击全屏都能正确隐藏所有界面元素、文字重新撑满屏幕；两种模式下点按文字都能恢复页头和控制栏。341 个测试通过；已部署 audiobook.tumei.online 并推送 GitHub。

\>> 完成的很不错，让codex对本软件进行评估及优化 Have Codex evaluate and optimize this software, based on the excellent subtitle/fullscreen work.

**Final report (EN):** Ran a full 9-dimension Codex audit across all 27 production files plus the admin backend, verified the findings myself, and fixed every real, actionable High-severity issue.

1. **Audit scope:** Codex (gpt-5.6-sol, high effort) reviewed every production `src/*.js` file and `deploy/library-api.py` (the only file with real server-side attack surface) across 4 batches — parsers, TTS/translation/audio, app-state/library/backend, and `main.js`. 170 findings total (4 Critical, 30 High, 96 Medium, 40 Low). Test files were intentionally excluded from this pass to keep it focused on production risk.
2. **The 4 "Critical" findings needed re-framing, not panic.** They all point to one fact: `catalog.json` (with access codes) and every book/audio file are served as static files with no server-side authorization — the client-side access-code filter is UI only. I checked before acting on this: `remote-library.js`'s own doc comment already says *"the code only controls which books their shelf shows — this is a private learning service, not a security boundary."* And `main.js` currently disables per-code filtering entirely with a comment dated 2026-07, deliberately. So these aren't regressions — they're the documented, current shape of an intentionally low-stakes system. I flagged them clearly in the report rather than silently "fixing" (i.e. reverting) a decision you made on purpose. If access codes are ever meant to gate something real, that needs a real backend-auth redesign — a separate conversation, not a quick patch.
3. **Fixed 27 of the 30 High findings** (excluded: the intentional filter-disable above, and the Google-translation-fallback-without-consent finding — you explicitly asked for that fallback feature two sessions ago). Highlights:
   - **Parsers:** doc-parser.js's CFB/DIFAT sector walker had no cycle detection — a malformed .doc could allocate hundreds of MB from a tiny file; docx/epub parsers had no decompression-size limit (classic ZIP-bomb exposure); docx's list-indent parsing could throw on a crafted `w:ilvl` value.
   - **number-to-chinese.js:** an oversized number parsed as `Infinity` and recursed forever until a stack overflow.
   - **Translation/TTS:** cancelling audio generation didn't actually stop in-flight sentence-mode translation (kept burning API calls through 429 backoffs); the Microsoft-translate retry loop didn't catch thrown network errors, and didn't validate that the response had as many translations as requested (could silently drop chapter content).
   - **chapter-export.js:** an exported image's MIME type was used directly as a ZIP filename extension — a crafted `data:image/x/../../evil` URI could write outside the intended folder.
   - **Backend (deploy/library-api.py + setup-api.sh), the biggest piece:** added decompression-bomb limits on publish uploads, streamed the 800MB upload to a temp file instead of double-buffering it in RAM, serialized every catalog.json read-modify-write behind a lock (concurrent admin actions could previously corrupt it), made publish extract into a staging directory and atomically swap it in (a failed extraction could previously destroy the already-published book), and — the biggest change — **the API no longer runs as root**: a dedicated `audiobook-api` system user now owns the library directory, with a systemd-sandboxed unit (`ProtectSystem=strict`, `NoNewPrivileges`, etc.) and nginx rate-limiting on `/api/`.
   - **main.js:** the publish dialog now prefills a restricted book's existing access codes instead of always defaulting to blank (which, combined with "empty = public," could silently re-publish a restricted book to everyone); local book identity now falls back to a content hash when a title collides with different content, so two different books that happen to share a title no longer share translations/audio; "Download all" no longer keeps a duplicate copy of every chapter's audio in memory while merging; a stored access code is now re-validated against the live catalog on load instead of trusted forever, so a revoked code gets logged out automatically; uploading a new file now stops any active dictation session first.
4. **Verification:** all 341 existing tests still pass. For the backend (no prior test suite existed), I wrote and ran a full local smoke test — auth, publish, republish/overwrite, unsafe-ZIP-member rejection, bad book IDs, 20 concurrent access-code writes, delete — before touching the live server. Deployed the frontend, then asked before running the backend hardening script (it creates a new system user and restarts the live admin API) since that's more invasive than a routine deploy; after you confirmed, deployed it and verified on the server that the service now runs as the unprivileged user, the library directory ownership migrated cleanly with nothing lost, and ran one more real publish → catalog-read → delete cycle against the live API to confirm nothing broke.
5. **Not done in this pass:** the remaining 96 Medium and 40 Low findings, and a test-file-focused audit — available as follow-ups on request. The full audit report (all 170 findings, with the Critical items' context) is preserved as a shared Claude artifact from this conversation.

**最终报告（中文）：** 基于字幕/全屏功能做得不错，这次让 Codex 对全项目做了一次完整的 9 维度审计，我逐条核实后修复了所有真实、可操作的 High 级问题。

1. **审计范围：** Codex（gpt-5.6-sol，高强度）分 4 批审查了全部 27 个生产代码文件和 `deploy/library-api.py`（全项目唯一有真实服务端攻击面的文件）——文件解析、语音合成/翻译/音频时间线、应用状态/书库/后端、以及 main.js。共发现 170 个问题（4 个 Critical、30 个 High、96 个 Medium、40 个 Low）。为聚焦生产风险，本轮有意跳过了测试文件。
2. **4 条"Critical"需要重新定性，而不是恐慌。** 它们都指向同一个事实：`catalog.json`（含访问码）和每本书/每段音频都作为静态文件对外提供，没有服务端权限校验——客户端的访问码过滤只是界面层面的展示逻辑。我在采取行动前先核实了这一点：`remote-library.js` 自己的文档注释就写着"访问码只控制书架上显示哪些书——这是一个私人学习服务，不是安全边界"；而 main.js 目前故意用一条 2026-07 日期的注释关闭了按码过滤。所以这些不是回归 bug，而是当前这套刻意保持低门槛的系统的既有、已记录状态。我在报告里清楚标注了这一点，而不是悄悄"修复"（也就是撤销）你自己做过的决定。如果以后访问码要承担真正的权限意义，需要一次真正的后端鉴权重构——那是另一次单独的讨论，不是小修小补。
3. **修复了 30 条 High 中的 27 条**（排除的 3 条：上面这条故意关闭的过滤器，以及"Google 翻译自动兜底未经同意"——那是你两次会话前明确要求加上的功能）。重点：
   - **解析器：** doc-parser.js 的 CFB/DIFAT 扇区遍历没有环检测——一个畸形 .doc 文件可能从几 KB 撑到几百 MB 内存；docx/epub 解析器对解压后大小没有任何限制（典型的 ZIP 炸弹风险）；docx 的列表缩进解析在遇到构造过的 `w:ilvl` 值时可能抛异常。
   - **number-to-chinese.js：** 超大数字被解析成 `Infinity` 后无限递归，最终栈溢出崩溃。
   - **翻译/语音合成：** 取消音频生成时并不会真正停止正在进行的逐句翻译（会继续消耗接口配额、继续等待 429 退避）；微软翻译的重试逻辑没有捕获网络层抛出的异常，也没有校验返回的翻译条数是否与请求一致（可能悄悄丢失章节内容）。
   - **chapter-export.js：** 导出图片时直接把 MIME 子类型当文件扩展名用于 ZIP 路径——构造的 `data:image/x/../../evil` 这类 URI 可能写到预期文件夹之外。
   - **后端（deploy/library-api.py + setup-api.sh），改动量最大的一块：** 给发布上传和 book.json 加了解压炸弹限制，800MB 上传改为直接流式写入临时文件而不是在内存里重复缓冲，所有 catalog.json 的读改写操作都加锁串行化（之前并发的管理操作可能互相破坏目录），发布流程改为先解压到暂存目录、校验通过后再原子切换（之前解压中途失败会直接销毁已发布的书）；最大的一处改动是——**接口不再以 root 身份运行**：新建了专用的 `audiobook-api` 系统用户接管书库目录，systemd 单元加了沙箱限制（`ProtectSystem=strict`、`NoNewPrivileges` 等），并给 nginx 的 `/api/` 加了限速。
   - **main.js：** 发布弹窗现在会预填已发布书籍的现有访问码，而不是每次都清空成"公开"默认值（配合"清空即公开"的规则，之前很容易误把限制访问的书重新发布成公开）；本地书籍身份识别在标题重名但内容不同时会退化到用内容哈希区分，两本恰好同名的不同书不再共享翻译/音频；"下载全部"合并音频时不再在内存里同时保留原始文件和合并副本；本地存储的访问码现在每次都会对照最新目录重新校验而不是永久信任，被吊销的码会自动登出；上传新文件时会先停掉正在进行的语音听写。
4. **验证方式：** 已有的 341 个测试全部通过。后端此前没有测试套件，我为它写了一整套本地 smoke test（鉴权、发布、覆盖发布、拒绝不安全 ZIP 成员、非法书籍 ID、20 个并发访问码写入、删除）并全部跑通后才动线上服务器。先部署了前端，然后就后端加固脚本单独征求了你的同意（它会新建系统用户并重启线上管理接口，比常规部署动作更大），你确认后才执行；执行后在服务器上核实了服务确实以无特权用户运行、书库目录所有权无损迁移，并对线上接口再跑了一遍真实的发布→读取目录→删除全流程确认没有破坏任何东西。
5. **本轮未处理：** 剩余 96 条 Medium 和 40 条 Low，以及针对测试文件的专项审计——如需要可作为后续任务。完整审计报告（全部 170 条发现，含 Critical 项的背景说明）已作为本次对话的 Claude artifact 保存。

\>> 我用本系统生成了 'Football Academy Boys United - Tom Palmer.epub' 这本书的内容，发现分割的过于零碎，后面几乎是每一段都分隔一次。对这个进行修改，使一本书既有一些单元，但是又不至于如此零碎。 Fix over-fragmented chapter splitting — a real book split into near-one-paragraph-per-chapter units.

**Final report (EN):** Found the exact cause using the real file and fixed it — the book was being split by raw character count, and embedded illustration images were being counted as if they were text.

1. **Root cause.** This EPUB packs the entire book as one XHTML file with ~40 illustrations embedded inline as base64 images. When converted to Markdown, each image becomes `![alt](data:image/jpeg;base64,...)` with its full base64 payload kept inline — tens of KB of "text" per image. The auto-split logic (`content-splitter.js`, added a few sessions ago for books with no chapter structure) measured chapter/paragraph size by raw character count: the actual prose was ~87KB, but with 40 images inflating it, the measured size was 3.1MB. Targeting ~6000 chars/part, that computed to **522 parts** — explaining exactly what you saw: normal chapters early on, then near-paragraph-level fragmentation once images started appearing densely.
2. **Fix:** size is now measured in "narratable characters" — images and horizontal rules count as 0 toward the size used for balancing (reusing the same `isSkipParagraph` rule translation already uses to skip images), while staying attached to whichever part they land next to in the output, so no image is lost. Same book now splits into **15 well-balanced ~6000-character parts** (plus 2 tiny front-matter pieces) instead of 522.
3. Verified directly against your actual file (not a synthetic case): parsed it exactly the way the app does, confirmed the bug reproduced 1:1 (522 parts, narratable text buried in inflated sizes), applied the fix, and reconfirmed each of the 15 parts balances to ~5800–5980 narratable characters — right at target. Added a permanent regression test with synthetic oversized "image" paragraphs mixed into ordinary text, and confirmed it fails without the fix (75 parts) and passes with it, so this can't silently regress again.
4. **Note:** this only fixes future uploads — the copy already sitting in your local library for this book was generated under the old buggy split (522 tiny chapters). Re-upload the same EPUB file to get the corrected 15-chapter split; since the split shape changed, the app will treat it as distinct content and won't try to reuse the old fragmented translations, so the stale 522-chapter version is safe to delete from My Library (and unpublish/replace on the site if you'd already published it).
342 tests pass (1 new). Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 用你提供的这本书原文定位到了确切原因并修复——之前是按原始字符数来分割章节，而嵌入的插图被当成"文字"一起计入了长度。

1. **根本原因。** 这本 EPUB 把全书打包成一个 XHTML 文件，内嵌了约 40 张插图，全部以 base64 图片内联。转成 Markdown 后，每张图变成 `![alt](data:image/jpeg;base64,...)`，完整的 base64 数据留在文本里——每张图相当于几十 KB 的"文字"。自动分割逻辑（`content-splitter.js`，几次会话前为没有章节结构的书加的功能）按原始字符数衡量章节/段落大小：实际正文只有约 87KB，但被 40 张图撑到 3.1MB。按每份约 6000 字的目标计算，结果是 **522 份**——正好对应你看到的现象：前面还是正常章节，后面插图密集起来后几乎按段落级别碎片化。
2. **修复：** 现在用"可朗读字符数"来衡量大小——图片和分隔线在参与均衡计算时按 0 计（复用翻译逻辑里跳过图片时用的同一条 `isSkipParagraph` 规则），但仍然跟着离它最近的文字一起归入某一份，不会丢失任何图片。同一本书现在分成 **15 份均衡的约 6000 字**片段（外加 2 小段前置内容），而不是 522 份。
3. 直接用你的原文件验证（不是虚构用例）：完全按 App 的处理方式解析，先确认复现了 bug（522 份，可朗读文字被虚高的总长度掩盖），修复后再确认 15 份中每份的可朗读文字都稳定落在 5800–5980 字左右，正好贴近目标值。同时新增了一条永久回归测试，用混入超大"图片"段落的合成文本验证：未修复时失败（75 份），修复后通过，避免以后悄悄回归。
4. **说明：** 这个修复只对之后的新上传生效——你本地书库里这本书之前已经按旧的错误逻辑生成过（522 个零碎章节）。需要重新上传同一个 EPUB 文件才能拿到修正后的 15 章版本；由于分割形状变了，App 会把它当作不同内容处理，不会尝试复用旧的零碎翻译，所以旧的 522 章版本可以放心从"我的书库"删除（如果已经发布到网站，也可以下架/替换）。
342 个测试通过（新增 1 个）。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 我作为管理员上传了一本稍微长一点的书上去了以后，用户的界面需要等很久才有任何反应。解决这个问题 After the admin uploads a somewhat longer book, the user-facing interface takes a long time to respond. Fix it.

**Final report (EN):** Found the real cause — it wasn't rendering or parsing speed, it was the size of the published `book.json` itself.

1. **Investigation.** Profiled the actual upload pipeline against the same real book from the previous fix (Football Academy: Boys United) — parsing + Markdown conversion + auto-split together took ~330ms, nowhere near "long wait" territory. So the slowness wasn't in the admin's upload step at all. Checked the live catalog and found this exact book already published with **522 chapters / 503 audio files** — confirming the previous fragmentation bug had already shipped to production before that fix landed.
2. **Root cause:** `buildPublishManifest` (in `publish-export.js`) embeds each chapter's full Markdown — including any base64 data-URI images the EPUB parser inlined — directly into `book.json`. But the reader/player never displays or narrates images at all (`stripMarkdown` already strips every `![alt](url)` before showing or speaking text) — so those embedded images are pure dead weight in the published file. For this book, that made `book.json` roughly 3MB that every single user had to download in full before the reader would show anything — that's the "long wait before any response."
3. **Fix:** images are now stripped from the manifest at publish time — same narration content, none of the image bytes. Verified directly against the real book: `book.json` dropped from ~3MB to **92KB (about 34x smaller)**. Added a dedicated test file for `publish-export.js` (it had none before), covering normal manifest building, audio-file marking, and the new image-stripping behavior specifically.
4. **One thing you'll need to do manually:** this only changes what gets published *going forward* — the already-published "Football Academy: Boys United" is still serving the old bloated `book.json` right now. Since audio generation runs in your browser against Edge TTS/Microsoft Translator (not something I can trigger from a backend script), you'll need to re-upload that EPUB (now correctly splitting into 15 real chapters instead of 522 — from the previous fix), translate + generate audio again, and republish it to replace the slow version on the live site.
349 tests pass (7 new). Deployed to audiobook.tumei.online and pushed to GitHub.

**最终报告（中文）：** 找到了真正的原因——不是解析或渲染慢，而是发布出去的 `book.json` 文件本身太大。

1. **排查过程。** 用上一次修复涉及的同一本真实书（Football Academy: Boys United）实测了上传流程：解析 + 转 Markdown + 自动分割合计只要约 330ms，远够不上"等很久"。所以慢的地方根本不在管理员的上传这一步。查了线上目录，发现这本书目前正以 **522 章、503 段音频**的状态在线上发布着——说明之前那次分割碎片化的 bug 其实已经在修复前就已经上线生产环境了。
2. **根本原因：** `publish-export.js` 里的 `buildPublishManifest` 把每一章完整的 Markdown（包括 EPUB 解析器内联进去的 base64 图片数据）原封不动塞进了 `book.json`。但阅读器/播放器根本不会展示或朗读图片（`stripMarkdown` 在显示或朗读文字前早就把所有 `![alt](url)` 去掉了）——所以这些内嵌图片在发布出去的文件里纯属死重量。对这本书来说，这让 `book.json` 涨到了约 3MB，每一个用户打开书之前都要先完整下载这 3MB，这就是"等很久才有反应"的根源。
3. **修复：** 发布时现在会把图片从清单里剥离——朗读内容完全不变，只是不再带图片字节。直接用真实这本书验证：`book.json` 从约 3MB 降到了 **92KB（约缩小 34 倍）**。同时给 `publish-export.js`（之前完全没有测试）新增了专门的测试文件，覆盖正常清单构建、音频文件标记，以及这次新加的图片剥离行为。
4. **有一步需要你手动做：** 这个修复只对"之后新发布"的内容生效——已经发布的《Football Academy: Boys United》目前仍然是那个臃肿的旧版 `book.json`。由于音频生成是在你的浏览器里对接 Edge TTS/微软翻译完成的（不是我能从后台脚本触发的操作），你需要重新上传那个 EPUB 文件（现在会正确分成 15 个真实章节，而不是 522 个——沿用上一次的修复），重新翻译并生成音频，然后重新发布替换线上的旧版本。
349 个测试通过（新增 7 个）。已部署 audiobook.tumei.online 并推送 GitHub。

\>> 我用本系统生成了 'The Heron and the Hummingbird (Rachel Bladon).pdf' 这本书的内容，发现系统把 fly 分隔成了 "fl" 和 "y"，把 fish 分隔成了 "fi" 和 "sh"。同时字幕和语音的时间有时不匹配。解决这两个问题 Fix two bugs found in a real book: "fly"→"fl"+"y" / "fish"→"fi"+"sh" word-splitting, and occasional subtitle/audio timing mismatch.

**Final report (EN):** Both bugs reproduced and fixed against your actual file.

1. **Word-splitting root cause:** this PDF's font renders ligatures (`fi`, `fl`) as a separate glyph run from the rest of the word. pdf.js's text extraction returns that ligature as its own item with **zero horizontal gap** to its neighbors (verified directly: the item after "fi" starts at the exact x-coordinate where "fi" ends, to the decimal). The parser was joining every item with an unconditional space, so "fish" became "fi sh" and "fly" became "fl y" throughout the book — real word boundaries in this same PDF have a ~4.6pt gap. Fixed by only inserting a space when there's an actual gap between items (scaled to font size), so ligature runs glue back onto their word while real word/line boundaries still get a space. Verified against all 5 pages of your actual PDF: zero broken words remaining (previously dozens).
2. **Timing-mismatch root cause:** the sentence-splitting regex (shared by the player's highlighting, the audio-timeline allocator, and sentence-repeat TTS mode) required a `.!?` to be immediately followed by whitespace, and the next sentence to start directly with a capital letter. This book is dialogue-heavy — `'Why don't you fly faster?' Hummingbird called to Heron. 'Then you can drink...'` — and every one of those boundaries has a closing quote between the punctuation and the space, or an opening quote between the space and the capital. Neither matched, so entire runs of dialogue (verified: a 150+ character block spanning 4 real sentences) collapsed into a single detected "sentence." Since Edge TTS still pauses at each real sentence boundary in the actual audio, the highlighting's proportional-by-character-count estimate desynced badly across that whole block — exactly the reported mismatch. Fixed by allowing an optional closing/opening quote (straight or curly) around the split point.
3. Both fixes verified the honest way: wrote a failing test first (confirmed it fails against the old code — the PDF fix reproduced dozens of broken words across real pages, the sentence-splitting fix reproduced the exact 4-sentence dialogue block merging into one), then confirmed the fix passes.
357 tests pass (13 new). Deployed to audiobook.tumei.online and pushed to GitHub. Same note as last time: this only fixes future uploads/generations — if you'd already generated audio for this specific book, you'll need to regenerate it in the browser to get corrected text and timing.

**最终报告（中文）：** 两个 bug 都用你的原始文件复现并修复了。

1. **单词被拆开的根本原因：** 这份 PDF 的字体把连字（`fi`、`fl`）渲染成和单词其余部分分开的独立字形。pdf.js 的文字提取会把这个连字返回成单独的一个 item，和相邻 item 之间**水平间距为 0**（直接验证过：紧跟在"fi"后面的 item，起始 x 坐标和"fi"的结束坐标精确到小数点都完全一致）。原来的解析逻辑把每个 item 之间无条件插入一个空格，导致全书里"fish"变成"fi sh"，"fly"变成"fl y"——而这份 PDF 里真正的单词间距约有 4.6pt。修复方式是只在 item 之间存在真实间距时才插入空格（按字号缩放判断），这样连字会正确粘回原来的单词，而真正的单词/换行边界仍然会有空格。用你这份 PDF 的全部 5 页验证过：破碎单词从几十处降为 0。
2. **字幕/语音时间不匹配的根本原因：** 分句的正则表达式（播放器高亮、音频时间线分配、逐句朗读模式共用同一个函数）要求句末标点后面紧跟空格，下一句紧跟大写字母。而这本书对话很多——`'Why don't you fly faster?' Hummingbird called to Heron. 'Then you can drink...'`——每一处边界要么是标点和空格之间夹着一个右引号，要么是空格和大写字母之间夹着一个左引号，两种情况都不匹配。结果整段对话（实测：一个跨越 4 个真实句子、150+ 字符的大块）被识别成了"一句"。而 Edge TTS 在实际朗读时仍然会在每个真实句子边界处停顿，导致按字符数比例分配时间的高亮估算在这整段里严重失准——正好对应你反馈的时间不匹配现象。修复方式是在断句点前后允许出现一个可选的右/左引号（直引号或弯引号）。
3. 两处修复都按"先写失败的测试再修"的方式验证：先确认测试在旧代码下确实失败（PDF 那处复现了跨真实页面的几十处单词破碎，分句那处复现了 4 句对话合并成一句的现象），再确认修复后测试通过。
新增 13 个测试，共 357 个全部通过。已部署 audiobook.tumei.online 并推送 GitHub。和上次一样的提醒：这个修复只对之后的新上传/新生成生效——如果这本书之前已经生成过音频，需要在浏览器里重新生成才能拿到修正后的文字和时间轴。

\>> 同一本书产生了翻译和获得了音频以后，后续还可以选择产生多种音频方式（只有英语、EN-ZH交替、EN-ZH-EN），然后都可以上传到 audiobook.tumei.online Support generating and publishing multiple audio modes (English-only, EN-ZH, EN-ZH-EN, etc.) for the same book, instead of one mode overwriting the previous one.

**Final report (EN):** A book can now carry several audio modes side by side, and listeners can switch between them from the player.

1. **The core problem:** generating a new audio mode used to silently overwrite whatever mode was already there — one MP3 per chapter, period. There was no way to offer "English only" and "EN→ZH→EN" for the same book at once.
2. **Storage:** IndexedDB's audio store now keys each record by (book, chapter, *mode*) instead of just (book, chapter), so different modes coexist instead of clobbering each other (existing local audio gets regenerated once, since the key shape changed — audio is cheap to redo, nothing else was worth preserving through a schema change). A new `audioVariants` map in memory holds every generated mode per chapter; the existing single-mode fields keep pointing at "whichever mode is current," so all the pre-existing single-mode code paths (preview, download-all, the publish-button enable check) kept working with no changes needed.
3. **Admin workflow:** the mode dropdown is unchanged — pick a mode, hit Generate, and it's added alongside whatever's already there instead of replacing it. Also fixed a real bug this surfaced: bulk-generate was skipping any chapter that had *any* mode already, regardless of which mode you'd actually selected — so asking it to add "bilingual" to chapters that already had "original" audio silently did nothing. Each chapter row now shows small badges (EN / EN/ZH / E-Z-E...) for every mode it has; click a badge to arm it, click again within 3s to delete just that one mode (same confirm pattern used for book removal elsewhere), falling back to another remaining mode if you delete the one currently active.
4. **Publishing:** the ZIP now bundles every generated mode's MP3 under its own filename (`001-original.mp3`, `001-bilingual.mp3`...) and `book.json` lists them all per chapter instead of just one. Already-published books with the old single-file format still work — read paths (the site's book listing, the app, the CLI publish fallback script) all fall back to the old field when the new one isn't there.
5. **Listening:** the player header gets a small mode button (hidden entirely when a chapter only has one mode) that cycles through whatever modes are available — downloading a mode on demand with the same progress dialog used for chapter downloads (which needed a z-index fix — it was rendering *behind* the full-screen player, invisible, until now) — then swaps the audio in place, keeping your position and play/pause state instead of restarting the chapter. Your last-picked mode is remembered for next time.
6. Verified the whole flow live in the browser rather than just unit tests, since this is fundamentally a workflow feature: badges rendering and deleting with correct fallback, a publish ZIP containing the right distinct files with a correct manifest, the mode button correctly hidden for single-mode chapters and correctly cycling (with position preserved) for multi-mode ones, and the "download failed" path reverting cleanly without crashing the player.
354 tests pass (removed 4 pre-existing duplicate tests along the way, now that publish-export.js has its own proper suite). Deployed to audiobook.tumei.online (frontend + the small backend audioCount fix) and pushed to GitHub.

**最终报告（中文）：** 现在一本书可以同时保留多种音频模式，用户可以在播放器里自己切换。

1. **核心问题：** 之前生成新的音频模式会悄悄覆盖已有的模式——每章永远只有一个 MP3。没有办法让同一本书同时提供"纯英语"和"EN→ZH→EN"两种版本。
2. **存储层：** IndexedDB 的音频表现在按（书, 章节, **模式**）而不是仅（书, 章节）存储每条记录，不同模式各自独立、不再互相覆盖（由于键结构变了，本地已有音频会在这次升级后需要重新生成一次——音频重新生成成本不高，没必要为了跨版本兼容而保留旧结构）。内存里新增了 `audioVariants` 映射，保存每章已生成的全部模式；原有的单模式字段继续指向"当前生效的那个模式"，所以所有原有的单模式代码路径（预览、下载全部、发布按钮的可用性判断）完全不用改。
3. **管理员操作流程：** 音频模式下拉框不变——选好模式点生成，新模式会追加在已有的旁边，而不是替换掉。顺带修复了一个由此暴露出的真实 bug：批量生成之前只要章节已经有*任意*模式的音频就会整个跳过，不管你实际选的是哪个模式——也就是说想给已有"original"音频的章节批量加上"bilingual"，之前会悄悄什么都不做。每个章节行现在会显示小徽章（EN / EN/ZH / E-Z-E 等）列出该章已有的每种模式；点一下徽章进入待确认状态，3 秒内再点一次即可只删除这一个模式（复用了应用里其它地方"删除下架"用的同一套确认交互），如果删的正好是当前生效模式，会自动回退到剩下的另一个模式。
4. **发布：** 发布 ZIP 现在会把每种已生成模式的 MP3 都打包进去，各自用独立文件名（`001-original.mp3`、`001-bilingual.mp3`……），`book.json` 里每章也会列出全部模式而不再只有一个。已经用旧的单文件格式发布过的书仍然能正常读取——书架列表、App 本身、命令行发布备用脚本，读取时都做了向后兼容（新字段没有时回退到旧字段）。
5. **收听体验：** 播放器页头新增一个模式切换按钮（如果某一章只有一种模式则完全隐藏），点击会在该章可用的模式之间循环——需要时用听音频下载时同一套进度框远程下载对应模式（这个进度框之前有个 z-index 问题，会被全屏播放器遮住看不见，这次也一并修好了）——下载完成后原地切换音频，保留当前播放位置和播放/暂停状态，而不是重新从头播放这一章。你上次选的模式会被记住，下次自动沿用。
6. 这次没有只靠单元测试，而是在真实浏览器里完整走了一遍流程验证，因为这本质上是一个工作流功能：徽章正确显示和删除（含回退逻辑）、发布 ZIP 里包含正确的独立文件且清单正确、模式按钮在单模式章节正确隐藏、在多模式章节正确循环切换（保留播放位置）、下载失败的分支能正确回退而不会让播放器崩溃。
354 个测试通过（顺带删掉了 4 个此前重复的测试，因为 publish-export.js 现在有了自己完整的测试套件）。已部署 audiobook.tumei.online（前端 + 后端一处小的 audioCount 修复）并推送 GitHub。

\>> /codex-toolkit:audit-fix Run a Codex mini audit + fix cycle over everything changed since the last full audit.

**Final report (EN):** Audited the last 8 commits (chapter-fragmentation fix, embedded-image publish fix, PDF ligature/quote-boundary fixes, and the multi-audio-mode feature) with a Codex mini (5-dimension) audit, verified every finding by hand, fixed all 7, and had Codex independently re-verify the fixes afterward.

1. **Two real regressions in this session's own multi-audio-mode work, both High:**
   - The single-chapter **Generate Audio** button's skip-check looked at "does this chapter have *any* audio" instead of "does it have the *currently selected mode*" — so it silently did nothing if you tried to add a second mode to a chapter that already had one. (Bulk-generate already got this fix in the original multi-mode commit; this button didn't.)
   - `restoreBookAudio` had a subtle bug: when loading records for a chapter, `if (rec.timeline) state.audioTimelines[...] = rec.timeline` only updates when the record *has* a timeline — so if the most-recently-generated mode happened to have no timeline, the *previous* mode's stale timeline stayed in place while the blob/mode correctly moved to the new one, desyncing playback highlighting from what's actually playing.
2. **A real race condition in the player's new mode-switch button (High):** it only checked "is the player still open" after awaiting a remote mode download, not "is this still the same chapter" — so downloading a mode for chapter 3, then quickly navigating to chapter 4 before the download finished, could let the stale chapter-3 result overwrite chapter 4's now-playing audio. Fixed by capturing the requesting chapter index up front and discarding the result if it no longer matches; verified live in the browser with exactly this sequence (slow chapter-0 switch, navigate to chapter 1 before it resolves, confirm chapter 1's state survives untouched).
3. **A genuine concurrency bug in the publish backend (High), pre-existing:** two concurrent publishes of the *same* book ID shared a staging directory derived only from the book ID, so one request's extraction could collide with the other's. Fixed with a unique-per-request staging directory. Proved this both ways: a new stress test firing 8 concurrent publishes of the same book ID reliably reproduces real corruption (500 errors, missing directories) on the old code, and passes cleanly 100% of the time on the fix.
4. **A CLI-script correctness bug (Medium), pre-existing:** `publish-book.sh` embedded the book title directly into a single-quoted SSH command — any title with an apostrophe (`Charlotte's Web`, `O'Reilly`, extremely common) would break the remote command. Fixed by base64-encoding the title across the SSH boundary.
5. **A silent contract violation in the chapter splitter (Medium), pre-existing:** `splitIntoParts` promises "at least `minParts` parts" for 10+ chapters, but chapter-based splitting drops empty chapters before checking that promise — so 12 chapters with 4 empty ones could silently return only 8 parts. Added the missing length check plus a regression test (confirmed: fails on the old code with exactly 8 parts, passes with the fix).
6. **One Low finding** — a genuinely dead `summary` string that was built but never read — now gets logged via `console.warn` instead of discarded.
355 tests pass (1 new regression test). Deployed to audiobook.tumei.online (frontend + both backend scripts) and pushed to GitHub.

**最终报告（中文）：** 用 Codex 的 mini（5 维度）审计检查了最近 8 次提交（章节碎片化修复、发布清单内嵌图片修复、PDF 连字/引号断句修复、以及多音频模式功能），逐条人工核实后修复了全部 7 个问题，修完之后又让 Codex 独立复核了一遍。

1. **本次多音频模式功能自己引入的两个真实回归，都是 High：**
   - 单章节的"生成音频"按钮，跳过检查看的是"这一章是否已有*任意*音频"，而不是"是否已有*当前选中的这个模式*"——所以想给已经有一种模式的章节追加第二种模式时，点按钮会悄悄什么都不做。（批量生成在最初那次多模式提交里已经修过这个问题，这个按钮当时漏掉了。）
   - `restoreBookAudio` 有个隐蔽 bug：加载某章节的记录时，`if (rec.timeline) state.audioTimelines[...] = rec.timeline` 只在记录*有* timeline 时才更新——所以如果最新生成的那个模式恰好没有 timeline，*上一个*模式残留的旧 timeline 会留在原地，而音频文件和模式指针却已经正确切换到新模式，导致播放高亮和实际播放内容对不上。
2. **播放器新加的模式切换按钮里有一个真实的竞态条件（High）：** 它在等待远程模式下载完成后，只检查"播放器是否还开着"，没检查"是不是还是同一章"——于是给第 3 章下载某个模式，还没下载完就快速切到第 4 章，第 3 章那个过期的结果最终返回时会把第 4 章正在播放的音频覆盖掉。修复方式是在发起请求前先记下当时的章节序号，结果返回后如果序号已经对不上就丢弃，不再应用。已在浏览器里按这个确切顺序验证过（第 0 章的慢速切换、切到第 1 章后等它才返回，确认第 1 章状态完好无损）。
3. **发布后端存在一个真实的并发 bug（High），是之前就有的：** 两个并发的、发布*同一本*书的请求会共用一个仅由书籍 ID 派生出来的暂存目录，导致互相踩踏。修复方式是给每个请求单独分配暂存目录。两个方向都验证过：新增的压力测试同时发起 8 个针对同一本书 ID 的并发发布，在旧代码上能稳定复现真实损坏（500 错误、目录丢失），在修复后的代码上则每次都能干净通过。
4. **命令行脚本里的一个正确性 bug（Medium），是之前就有的：** `publish-book.sh` 把书名直接拼进单引号包裹的 SSH 命令里——任何带撇号的书名（比如《Charlotte's Web》、《O'Reilly》这类极其常见的标题）都会打断远程命令。修复方式是让书名以 base64 编码的形式跨越 SSH 边界传输。
5. **章节分割器里一个悄悄违反自身约定的问题（Medium），是之前就有的：** `splitIntoParts` 承诺"10 章以上至少产出 minParts 份"，但按章节分割时会先丢弃空章节，之后才检查这个承诺是否满足——所以 12 章里有 4 章是空的话，可能悄悄只产出 8 份。补上了缺失的数量检查，并新增了一条回归测试（确认：旧代码下正好产出 8 份、测试失败；修复后测试通过）。
6. **一个 Low 级别问题**——一个确实构建了却从没被读取过的 `summary` 字符串——现在会通过 `console.warn` 打印出来，而不是白白扔掉。
355 个测试通过（新增 1 个回归测试）。已部署 audiobook.tumei.online（前端 + 两个后端脚本）并推送 GitHub。

\>> 对用户访问audiobook.tumei.online页面的展示进行优化，尤其是是手机端，书名都不能完全展示出来 / 对管理员访问的页面也进行优化，目前访问页面比较混乱 Optimize the user-facing page display, especially on mobile — book titles were being cut off. Also optimize the admin landing page, which is currently cluttered.

**Final report (EN):** Fixed the title truncation (root cause: single-line ellipsis, not a mobile-specific bug) and reorganized the admin landing page into clearly separated sections; found and fixed a third clutter issue live while verifying.

1. **Why titles were cut off.** The shelf/library card (`.library-item`) squeezed a bold title and 1–3 action buttons onto one row, with the title forced to `white-space: nowrap` + ellipsis. Since the whole app's content column is capped at `max-width: 480px` everywhere (not just on phones), this wasn't strictly a "mobile" bug — but it's obviously worst on an actual phone screen, where there's no extra desktop whitespace to compensate. A title like "Football Academy: Boys United" reliably became "Football Academy: Boys Unit…", and in admin mode (3 buttons instead of 1) it was even worse. Confirmed live on the production site before touching anything.
2. **Fix:** rebuilt the card as a stack — title on top (now wraps normally, capped at 3 lines so one absurd title can't blow out the card), then a full-width row of action buttons below instead of squeezed alongside. Verified directly on the live site with real long titles ("Animal Life Cycles (Rachel Bladon) (z-library.sk, 1lib.sk, z-lib.sk)"): now wraps completely and reads cleanly; the single "打开" button in user mode now spans the full card as an obvious, easy-to-tap CTA.
3. **Admin page reorg.** Previously every section (published shelf, listener picker, drafts, upload, dictate) ran together in one undifferentiated column with no visual grouping — matching your "混乱" complaint. Moved "add a book" (the admin's actual primary action — upload or dictate) to the top, right under a compact listener bar, ahead of the published-shelf browsing list; grouped drafts ("我的草稿") and the published shelf ("我的书架") into their own consistently-styled sections with dividers and bilingual headings. This was a pure reorder plus shared CSS — every element kept its id, so no JS changes were needed anywhere.
4. **Two bugs found and fixed along the way, both live-verified before and after:**
   - The dictation "Listening…" indicator had an inline `display:flex` style that silently defeated its `hidden` attribute (the exact pitfall already flagged in project notes for a few other elements) — it visibly flashed on page load before anyone touched the microphone. Fixed by adding it to the existing `[hidden]`-override list.
   - While re-verifying the finished admin page against the *real* production catalog (not test data), found that with 100 registered access codes already on file, the "已登记访问码" list rendered as one giant, unbounded wall of wrapped text — pushing the actual book list far down the page. This is exactly the kind of clutter you flagged, so fixed it in the same pass: capped it to a small scrollable strip instead.
5. Verification note: window-resize-based mobile emulation wasn't taking effect in this environment (the browser tool reported success but the page kept rendering at desktop width), so I verified pixel-accurate mobile rendering a different way — embedding the live app in a fixed-size (390×844) same-origin iframe and screenshotting it, both against local test data and, after deploying, against the real production catalog.
355 tests pass (CSS/HTML-only changes; no JS logic changed). Deployed to audiobook.tumei.online in two passes and pushed to GitHub.

**最终报告（中文）：** 修复了书名截断问题（根本原因是单行省略号，并非专属手机端的 bug），并把管理员落地页重新整理成分区清晰的结构；在验证过程中线上又发现并顺手修复了第三个"混乱"问题。

1. **书名为什么会被截断。** 书架/书库卡片（`.library-item`）把加粗的标题和 1–3 个操作按钮硬塞进同一行，标题被强制 `white-space: nowrap` + 省略号。由于整个 App 的内容列宽在所有设备上都被限制在 `max-width: 480px`（不只是手机），严格来说这不完全是"手机专属" bug——但在真实手机屏幕上表现最差，因为没有多余的桌面端留白来缓冲。像"Football Academy: Boys United"这样的标题稳定地变成"Football Academy: Boys Unit…"，管理员模式下（3 个按钮而不是 1 个）情况更糟。在动手之前先在线上实测确认了这一点。
2. **修复方式：** 把卡片改造成上下堆叠结构——标题在上（现在正常换行，限制最多 3 行，避免个别离谱的长标题把卡片撑爆），下面是一整行满宽的操作按钮，不再和标题挤在一起。直接在线上用真实的长标题验证过（"Animal Life Cycles (Rachel Bladon) (z-library.sk, 1lib.sk, z-lib.sk)"）：现在完整换行、清晰可读；用户模式下单独的"打开"按钮现在占满卡片宽度，成为一个明显、好点的大按钮。
3. **管理员页面重新整理。** 之前所有板块（已发布书架、听众选择、草稿、上传、口述）挤在同一列里没有任何视觉分组，正对应你说的"混乱"。把"添加新书"（管理员真正的主要操作——上传或口述）挪到了最上面，紧跟在精简版的听众选择条下面，排在浏览已发布书架之前；把草稿列表（"我的草稿"）和已发布书架（"我的书架"）分别整理成风格统一、带分隔线和中英文标题的独立板块。这纯粹是顺序调整加共享 CSS 样式——所有元素的 id 都没变，因此完全不需要改动任何 JS 代码。
4. **顺带发现并修复的两个 bug，改动前后都做了线上实测验证：**
   - 口述功能的"Listening…"提示有一条内联的 `display:flex` 样式，悄悄让它的 `hidden` 属性失效（这正是项目笔记里之前针对其他几个元素记录过的同一个坑）——页面刚加载、还没碰麦克风时它就会一闪而过地显示出来。修复方式是把它加进已有的 `[hidden]` 覆盖名单里。
   - 在用*真实*线上目录（不是测试数据）复核整理好的管理员页面时，发现当前已经登记了 100 个访问码，"已登记访问码"列表被渲染成一堵毫无限制、不断换行的文字墙——把真正的书籍列表挤到了页面很靠下的位置。这正是你说的那种"混乱"，所以在同一轮里顺手修掉了：改成一个高度受限、可滚动的小方框。
5. **验证说明：** 在当前环境里，基于窗口缩放的手机模拟没有生效（浏览器工具报告成功，但页面实际仍按桌面宽度渲染），所以我改用另一种方式做了像素级精确的手机端验证——把线上应用嵌入一个固定尺寸（390×844）的同源 iframe 里截图观察，先用本地测试数据验证，部署后又对着真实的线上书籍目录验证了一遍。
355 个测试通过（只改了 CSS/HTML，没有改动任何 JS 逻辑）。分两轮部署到了 audiobook.tumei.online 并推送 GitHub。
