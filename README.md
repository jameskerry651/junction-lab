# Junction Lab

James 的个人博客，采用自托管的**学术极简风格（Academic Minimalism）**。文章以本地 Markdown 文件维护，可随 Git 仓库同步；每篇文章拥有唯一的永久哈希地址 `/#post/<id>`。

## 运行与构建

使用 Node.js 22.19 或更新的兼容版本（当前验证环境为 22.19），以及 npm。

```sh
npm install
npm run dev
```

打开终端显示的本地地址，通常为 `http://127.0.0.1:5173/`。加载完成后直接呈现学术极简的时间轴主界面，无开场等待。

| 命令                     | 用途                                             |
| ------------------------ | ------------------------------------------------ |
| `npm run dev`            | 先生成公开内容，再启动本地开发服务器             |
| `npm run content:build`  | 从 Markdown 生成文章索引、正文与图片             |
| `npm run build`          | 生成内容、执行 TypeScript 检查，再构建到 `dist/` |
| `npm run preview`        | 预览已生成的 `dist/`，需先完成构建               |
| `npm run content:import` | 从原 VanBlog 备份导入，保留已有同名 Markdown     |
| `npm start`              | 启动生产前台与管理 API（先运行 build）           |
| `npm run test:admin`     | 在临时目录验证后台接口、发布边界与回滚           |
| `npm run format`         | 格式化源码及脚本等项目文件                       |

完整博客与后台使用 `npm run build` 后执行 `npm start`，默认监听 `http://127.0.0.1:3000`。需要保留项目源码、依赖、content、dist 和 .junction 数据目录。仅发布 `dist/` 仍可浏览静态前台，但不能使用后台和访问分析。当前按域名根路径部署；子路径部署尚未适配。不依赖 `blog_data/` 或 `vanblog/`。

### 生产部署与安全加固

若将博客发布至公网服务器，推荐使用反向代理（如 Nginx 或 Caddy）终结 HTTPS 并结合环境变量进行加固：

1. **核心环境变量**：
   - `JUNCTION_SECURE_COOKIE=1`：强制为登录 Session Cookie 标记 `Secure` 属性（服务亦会自动识别受信任反代传递的 HTTPS 协议或本地 TLS）。
   - `JUNCTION_TRUST_PROXY=1`：仅在前置反向代理已将真实客户端 IP 覆盖写入 `X-Real-IP` 请求头时启用，用于防爆破与匿名访问统计。
   - `JUNCTION_HSTS_MAX_AGE=31536000`：可选，生产开启 Strict-Transport-Security（1 年）。
   - `PORT=3000`：生产监听端口（默认 3000）。

2. **Nginx 反向代理配置示例**：
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       # SSL 证书配置...

       client_max_body_size 16M;
       server_tokens off;

       # 严格重写真实客户端 IP（防止客户端伪造请求头绕过防爆破限制）
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Host $host;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
       }
   }
   ```

## 浏览与阅读

- **日夜模式**：顶栏支持日间（暖米色纸质底）与夜间（深墨色底）一键切换，偏好存入 `localStorage`，同时响应系统级明暗偏好。
- **时间轴与检索**：首页按年份（2026、2025、2024…）倒序排列。顶部搜索栏支持输入即时过滤标题、标签、摘要与文章编号，按键盘 `/` 快速聚焦搜索框，按 `Esc` 退出或清空。
- **分类归档**：点击导航栏「分类」（`#/categories`）浏览按 5 个研究领域归档的条目；点击分类标题可直达该领域的独立时间轴（如 `#/category/算法与数据`）。
- **关于本站**：点击导航栏「关于」（`#/about`）查阅研究档案收录范围、建站约定与实时文章/分类统计数据。
- **文章详情页**：
  - 点击任何文章标题，直接以学术排版进入文章页面（地址为 `/#post/<id>`，支持刷新、分享和前进后退）。
  - 文章页顶部提供来源记忆返回链接（「← 返回时间轴」或「← 返回算法与数据」）。
  - 正文居中排版占据主要视觉焦点，右侧提供黏性大纲目录（TOC），自动解析 `h2, h3` 章节，配合 `IntersectionObserver` 随阅读滚动实时高亮当前章节，点击平滑滚动。不再显示冗余摘要框，直入正题。
  - 正文排版采用衬线字体排版，完整支持 KaTeX 行内与块级数学公式、图表居中和表格横向滚动。
  - 代码块顶部带有语言标签、状态反馈以及「复制代码」按钮（保留缩进换行，不复制行号或高亮标记）。
  - 正文尾部提供「较早记录」与「较新记录」的相邻文章快速切换。
- **管理后台**：顶栏与页脚保留 **管理 ↗** 入口，可直达 `/admin/` 登录管理系统。

## 写文章

`content/posts/` 是公开文章的唯一编辑源。直接在该目录新增或修改 `.md` 文件，开发服务器会在内容变更后重新生成并刷新。

```markdown
---
id: 100
title: 新文章
category: 工程实践
tags:
  - 实验
author: James
createdAt: "2026-09-22T08:00:00.000Z"
updatedAt: "2026-09-22T08:00:00.000Z"
visibility: public
---

这里写 Markdown 正文。

![实验图片](../images/example.webp)
```

`id` 必须为唯一正整数；标题、分类、创建时间和更新时间必须有效。`tags` 使用数组，`author` 缺省为 James。只有明确设置 `visibility: public` 且不带有效 `private`、`hidden`、`password` 标记的文章会被构建。至少需要一篇公开文章。

文件名建议为 `<id>.md`。文章地址取自 `id`，重命名文件不会改变地址；修改 `id` 会改变地址。生成索引按发布日期倒序排列，同日按 ID 倒序。直接编辑文件时 `updatedAt` 需自行维护；后台保存文章会自动更新时间。

图片放入 `content/images/`，正文使用 `../images/文件名.webp` 等相对路径，可在本地 Markdown 编辑器中查看。构建时会复制公开文章引用的图片并改写为 `/blog-images/…`；缺失的本地图片会导致生成失败。

不要直接修改 `src/generated/`、`public/posts/` 或 `public/blog-images/`，这些是生成文件。删除或取消公开文章后，下次成功生成会清理对应的正文产物和不再被公开文章引用的图片。界面虽已移除下载按钮，公开文章的 `.md` 副本仍会生成在 `public/posts/` 并随站点发布。

## 分类

`content/categories.json` 控制列的显示顺序；没有公开文章的分类不显示，文章使用的新分类会自动追加。修改文章的 `category` 即可调整归属，`originalCategory` 仅保存旧分类，不参与当前导航。

| 当前分类   | 合并的旧分类         | 迁移时公开文章数 |
| ---------- | -------------------- | ---------------: |
| 工程实践   | DIY、硬件            |                5 |
| 算法与数据 | 算法、数据处理       |               37 |
| 系统与网络 | 计算机网络、环境配置 |               24 |
| 论文研读   | 研究论文             |                7 |
| 生活随记   | 生活                 |                1 |

## 目录与内容流水线

```text
content/posts/             公开文章 Markdown（手动编辑）
content/images/            公开文章图片（手动维护）
content/categories.json    分类顺序
content/local/             本地隐藏/私密文章及专用图片，不提交、不构建
scripts/migrate-vanblog.mjs 一次性备份导入
scripts/export-records.mjs Markdown 渲染、索引及公开图片生成
src/generated/posts.json   生成的公开文章元数据
src/data.ts                元数据适配、分类查询与卡片索引
src/main.ts                主界面、摘要、搜索与设置
src/reader.ts              全文阅读页、目录与文章链接
src/admin.ts, admin.css    后台页面与响应式样式
src/site.ts               站点设置加载与匿名访问统计
admin/index.html          管理页面入口
server/admin.mjs          登录、文章、图片、备份、设置与统计 API
server/index.mjs          生产 HTTP 服务与发布构建切换
.junction/                账号、统计、回收原稿与恢复前备份（禁止发布）
src/scene.ts               三维卡带阵列与相机
src/style.css              界面和阅读页样式
vite.config.mjs            内容变更监听及开发服务器文件访问限制
public/posts/              生成的文章 HTML 与 Markdown 副本
public/blog-images/        生成的公开图片
public/assets/             三维模型
public/fonts/              MiSans 字体及许可
art/                       Blender 源文件与生成脚本
design-studies/            独立静态风格参考稿，不参与构建
blog_data/                 原 VanBlog 导出备份，仅本地保留
vanblog/                   VanBlog 源码参考，不参与构建
```

流水线为 `content/posts/*.md` → `scripts/export-records.mjs` → 文章索引与公开正文 → Vite 构建。开发服务器监听公开内容、图片和分类文件；`content/local/` 不参与生成。

## 风格参考稿

`design-studies/` 存放四套独立的静态界面参考：学术极简（日间 / 夜间、搜索、时间轴、分类归档与关于页）、瑞士网格、编辑杂志、档案卡片。它们用真实文章样本填充，包含目录与文章页切换、分类筛选和检索，但**不接入构建，也不改变现有终端界面**。启动 `npm run dev` 后访问 `http://127.0.0.1:5173/design-studies/` 对照查看；直接以 `file://` 打开时本地字体可能被浏览器拦截，建议使用开发服务器。学术极简版使用 `#/`、`#/categories`、`#/category/<分类>`、`#/about`、`#/post` 路由；分类归档参考 ArthurChiao 的 categories 页，按类别分组、日期与标题逐行排列，日间 / 夜间偏好保存在浏览器本地。学术极简使用自托管的 Noto Serif SC、Source Serif 4 与 IBM Plex Mono 子集，界面标签继续使用 MiSans。

```text
design-studies/index.html       四套风格总览与对比
design-studies/academic.html    学术极简
design-studies/swiss.html       瑞士网格（可切换栅格辅助线）
design-studies/editorial.html   编辑杂志
design-studies/archive-cards.html 档案卡片（检索可用）
design-studies/demo-data.js     参考稿共用的真实文章样本
design-studies/preview.js       视图切换、目录与提示
design-studies/media/           参考稿使用的公开图片副本
design-studies/fonts/           自托管字体子集与 OFL 许可
```

这些页面只读，不写回 `content/`；若要推进其中某一套，再决定是局部借鉴还是落到真实数据与阅读页。

## 迁移、隐私与 Git 同步

截至本次迁移，原站 79 篇文章均已保留：74 篇公开文章在 `content/posts/`，3 篇隐藏文章和 2 篇私密文章在 `content/local/`。正文保留原文，仅改写本地图片路径。公开输出引用 84 张图片，非公开或未被公开正文使用的原图保存在 `content/local/images/`。

`blog_data/` 的原备份含后台账号口令散列和 salt，不应提交或发布。该目录、`content/local/` 和 `vanblog/` 已被 Git 忽略，开发服务器也禁止直接访问。导入脚本只提取文章字段，不导出账号或密码。

可以在后台编辑文章并将可见性改为「已发布」。也可手动将本地隐藏或私密文章移至 `content/posts/`，将所需图片移至或复用 `content/images/`，修正相对路径，并设置 `visibility: public`。私密文章仅能在已登录的管理后台查看，没有对读者开放的文章密码入口。取消公开只会清理下一次构建的产物，不会清除 Git 历史或已发布的缓存。

Git 同步时提交源码、`content/posts/`、`content/images/`、`content/categories.json`、依赖锁文件及必要模型资源。生成目录、备份和私密内容保持忽略。项目没有配置自动 GitHub 同步；需自行初始化 Git、关联远程仓库并提交推送。不要强制添加被忽略的本地内容。

`npm run content:import` 仅用于初次或补充导入，依赖原备份和系统 `unzip` 命令。它不会覆盖已有同名 Markdown；若已重命名或移动导入文件，再运行可能生成原 ID 的副本。日常写作不需要重新导入。

原项目参考资料位于 `../RhineLabUI`。保留 MiSans 字体许可与三维源资源；共享标志曲线、卡带抽取和 baseline 光照继续沿用原设计。

## 管理后台

主界面右上角 **ADMIN ↗** 打开 `/admin/`；原有终端偏好设置入口保留。

1. 执行 `npm run dev`（开发）或 `npm run build && npm start`（生产）。
2. 首次启动时，终端输出一次性初始化令牌。在后台输入令牌、3–64 位账号名与至少 12 位密码创建管理员。
3. 初始化后使用账号密码登录。令牌不存入前端、不提供默认密码。登录有效期 8 小时，服务重启或修改密码会使已有会话失效。

后台包含：

- **分析概览**：7 / 30 / 90 天 PV 趋势、今日 UV、文章数量、热门内容及来源域名。数据从启用后开始记录，没有历史模拟数据。按 UTC 日期聚合；同一匿名访客同一页面 30 秒内去重。UV 使用每日加盐网络特征估算，不是精确人数，不保存原始 IP。遵从浏览器 Do Not Track；统计最多保留最近 90 天、10 万条记录，新事件写入时清理过期数据。匿名上报接口本身不要求登录，因此单个客户端 10 分钟内最多记录 120 条事件、请求体上限 16KB，超出部分直接丢弃，避免被轮换 User-Agent 放大写入。
- **文章管理**：搜索、状态和分类筛选，新建、可视化富文本编辑、安全预览、发布、草稿、私密、删除。预览与前台复用同一渲染器，支持 KaTeX、代码高亮与 HTML 清理。编辑冲突会拒绝覆盖；离开未保存编辑器时提醒。删除原稿保存在 `.junction/trash/`，可由管理员从服务器取回。必须保留至少一篇公开文章。公开正文不能引用 `/api/`、`/images/` 或 `../local/` 这类需要登录的图片地址（保存时直接拒绝）；`content/posts/` 中带 `private`、`hidden`、`password` 标记或非 `public` 可见性的文件与构建保持一致，后台同样显示为非公开。
- **图片管理**：公开/私密图片上传、浏览、引用情况、复制 Markdown 地址与删除；单张最大 10MB，支持 PNG/JPEG/WebP/GIF/AVIF。已引用图片禁止删除；私密图片不会自动转为公开图片，发布对应文章前需把所用图片上传到公开库并更新引用。
- **数据管理**：分类排序、标签使用索引、JSON 完整内容备份、增量导入与完整恢复。备份包含全部文章和图片（含私密内容）、分类、站点设置，不包含账号凭据和统计。增量导入不覆盖文件或文章 ID；完整恢复会替换全部内容及设置，并先备份原内容到 `.junction/backups/`，需要输入「恢复」确认。单次导入不超过 32MB。
- **系统设置**：站点名称、描述、默认作者、统计开关及管理员密码。站点名称与描述在客户端加载时应用；管理员界面品牌保持 Junction Lab。

文章仍以 `content/posts/` 和 `content/local/` 的 Markdown 为源，账号密码以 scrypt 加盐散列存储于 `.junction/account.json`。后台写操作要求登录、同源校验与 CSRF 令牌，登录有限速。生产保存后自动构建新站点，再切换 `dist/`；失败恢复原内容。开发时自动生成并更新前台。运行期间不要同时执行手动构建、迁移或启动多个管理进程。

### 生产运行

```sh
npm ci
npm run build
HOST=127.0.0.1 PORT=3000 JUNCTION_SECURE_COOKIE=1 npm start
```

上述安全 Cookie 配置用于 **HTTPS 反向代理**；本机 HTTP 调试不要设置 `JUNCTION_SECURE_COOKIE=1`。反向代理保留原 Host，上传请求大小至少允许 32MB，并为发布构建留出足够超时。使用进程管理器保持单实例运行，项目与 `.junction/` 必须使用持久化磁盘、授予进程写权限，并安排服务器级备份。

### 安全响应头

生产服务（`server/index.mjs`）为每条静态响应附带由 `server/security.mjs` 统一生成的响应头：`Content-Security-Policy`、`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`。CSP 默认是第二道防线，与正文的 sanitize-html 白名单互补：`script-src 'self'` 禁止一切内联脚本，`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'self'`、`form-action 'self'` 收窄攻击面；KaTeX 需要的行内样式由 `style-src 'unsafe-inline'` 放行。

| 变量                               | 默认           | 说明                                                              |
| ---------------------------------- | -------------- | ----------------------------------------------------------------- |
| `JUNCTION_HSTS_MAX_AGE`            | 未设置（关闭） | 设置正整数秒数后下发 HSTS；建议先用 `300` 验证再逐级加大          |
| `JUNCTION_HSTS_INCLUDE_SUBDOMAINS` | `0`            | 为 `1` 时附加 `includeSubDomains`（确认所有子域都支持 HTTPS）     |
| `JUNCTION_HSTS_PRELOAD`            | `0`            | 为 `1` 时附加 `preload`                                           |
| `JUNCTION_CSP_REPORT_ONLY`         | `0`            | 为 `1` 时改为 `Content-Security-Policy-Report-Only`，只报告不拦截 |
| `JUNCTION_CSP`                     | 启用           | 设为 `off` 时完全不下发 CSP，供确有外部资源需求时应急使用         |

`npm run dev` 的 Vite 开发服务器只下发 Report-Only 版本，便于在控制台发现违规而不影响 HMR。若前台自行引入 CDN 资源（字体、图片、脚本），必须同步放宽对应指令，否则会被拦截。编辑器依赖的 Vditor 图标 sprite 由 `src/article-editor.ts` 以同源外部脚本预加载并沿用 Vditor 检查的元素 id，因此 `script-src 'self'` 下工具栏图标仍然完整。

若需要代理后的访客估算，显式设置 `JUNCTION_TRUST_PROXY=1`，让可信反向代理覆盖 `X-Real-IP` 为真实客户端 IP，并仅允许代理连接应用监听端口；默认忽略客户端提供的 IP 头。不要将开发 Vite 服务直接暴露为生产服务。`.junction/`、`content/local/`、`blog_data/` 和 `vanblog/` 始终不得作为静态目录发布。

忘记密码时，先停止服务并安全备份 `.junction/account.json`，再将该文件移出 `.junction/`；重启后使用新初始化令牌重新建立账号。其他内容不受影响。

### 可视化文章编辑器

进入文章「编辑」或「新建」后打开独立页面 `/admin/editor.html?id=<编号>`（新建不带编号），默认使用 **Markdown 编辑 / 实时预览分屏**，正文占满剩余窗口面积。发布设置默认收起，点击顶部按钮可展开；保存和返回列表始终在顶部，保存新文章后地址自动更新，刷新可继续编辑。仍可切换到所见即所得模式，直接输入正文、选中文字后点击工具栏排版。工具栏支持标题、粗体/斜体/删除线、列表与任务清单、引用、链接、表格、代码块、公式、撤销重做、大纲和全屏。点击「切换编辑模式」可以选即时渲染或 Markdown 分屏；手机分屏改为上下排列。

- 图片可从工具栏选择文件，也可粘贴或拖入正文，或通过「图片资源库」选择已有图片。草稿/公开文章的新上传图片进入公开资源库，但只有被公开文章引用后才会出现在公开输出；私密文章上传进入私密库。正文保存标准 `../images/文件名` 引用，不写入管理接口地址。
- 「发布预览」复用博客服务端渲染器，可以核对最终代码高亮、公式和表格效果。特殊图表语言按普通代码显示，与前台保持一致，不调用第三方图表服务。
- 点击保存或使用 **⌘/Ctrl+S** 后继续停留编辑，服务端修订信息同步更新；上传未结束时禁止保存。没有自动发布或自动保存，离开未保存内容时仍会提示。
- 底层继续保存 Markdown。只改标题等信息、不编辑正文时保留原始正文；实际编辑或转换模式后 Markdown 排版可能被规范化。
- 编辑器使用 Vditor，按需加载；脚本、字体、公式引擎、语言包等通过 `scripts/editor-assets.mjs` 从已安装依赖复制到本地，不依赖 CDN。禁用浏览器正文缓存，私密内容不进入 localStorage。

编辑器模块为 `src/article-editor.ts` / `src/article-editor.css`；`public/vendor/vditor/` 是生成资源，不手动编辑或提交。后台 `/images/<文件名>` 是兼容 Markdown 相对图片地址的登录保护读取入口，未登录不可访问；公开前台仍只使用构建生成的 `/blog-images/`。

- 独立编辑页采用紧凑顶栏：返回、可直接编辑的文章标题、保存状态、发布预览、发布设置与保存集中排列；不再单列标题标签与正文说明，桌面工具栏紧接顶栏，手机顶栏分两行。

- 源码区使用 14px 等宽字体和 Markdown 语法高亮，标题、引用、强调、链接与代码分色；预览字号为 15px。高亮仅用于显示，不改变保存的 Markdown。

## 编辑器 AI 写作助手

独立文章编辑页顶部的「AI 助手」打开右侧面板，暂时隐藏实时预览以保留正文空间；关闭后恢复预览。手机上以独立浮层显示，支持 Esc 关闭并返回入口。发布设置与助手互斥展开。

- 「问答」支持解释内容、连续追问及标题 / 摘要 / 标签建议，回答可选择插入文末；「修改正文」支持润色、精简、扩写、翻译，以及自由输入的修改要求。
- 发送范围可选选中内容、当前章节、全文。章节以光标所在 Markdown `#` 标题层级划分（代码围栏内标题忽略）；复杂富文本选区无法准确映射时，请切换源码模式重新选中。新文章起草可选择全文。
- 发送使用**当前未保存的 Markdown**。每次请求最多 60,000 字符上下文，同时包含标题、写作偏好及最多 8 条最近对话。点击发送会把这些内容传给配置的模型服务，包括选择的草稿或私密内容。切换工作模式、发送范围或清空对话会清除发送用的对话历史。
- 修改先显示原文 / 建议对照和原因，逐项采纳或放弃；采纳只更新编辑器，不自动保存或发布。若正文自请求以来发生变化，旧建议不会覆盖新文字。支持撤销最近 10 次采纳 / 插入，后续有手动修改时先撤销那些修改，或重新生成建议。
- 回答流式显示，结构化修改在完整验证后展示；支持停止和重试，关闭助手会停止未完成请求。对话和偏好仅保留在当前页面，不写入文章、浏览器缓存或服务端备份。

### 配置模型

当前后端使用 **Responses API**；模型需要支持流式输出及 Structured Outputs。通过运行服务的环境变量配置（开发与生产一致），不会自动读取 `.env`。密钥只在服务端使用，不要设置 `VITE_` 前缀，也不要写入文章或前端代码。

| 环境变量 | 用途 |
| --- | --- |
| `JUNCTION_AI_API_KEY` | 模型 API 密钥；未设置时使用 `OPENAI_API_KEY` |
| `JUNCTION_AI_MODEL` | 你的服务提供的模型 ID，必填，无硬编码默认模型 |
| `JUNCTION_AI_ENDPOINT` | 完整 Responses 地址，默认 `https://api.openai.com/v1/responses`；兼容服务需提供相同流式与结构化输出协议 |

将变量设置到终端环境或进程管理器后，开发运行 `npm run dev`；生产运行 `npm run build` 后 `npm start`。修改环境配置需重启服务器，再在助手中点击「刷新连接状态」。未配置时助手显示原因，编辑和保存不受影响。兼容地址只允许 HTTPS；本机调试允许 loopback HTTP，地址不接受凭据、查询参数或重定向。

模型请求设置 `store: false`；这不等同于供应商零留存，供应商侧数据处理仍由所选服务政策决定。助手不具备文件访问、联网检索、自动发布或跨文章检索工具。服务端限制每会话每 10 分钟 20 次请求、全局同时 2 次、单次 120 秒和 12,000 输出 token。长文章建议按章节处理。反向代理需允许 120 秒响应时间并关闭该接口的响应缓冲。

代码入口为 `src/ai-assistant.ts` / `.css`（交互）、`src/ai-context.ts`（上下文与局部修改）、`server/ai.mjs`（模型适配），由现有 `/api/` 登录及 CSRF 保护。验证运行 `npm run test:ai`、`npm run test:admin` 和 `npm run build`；端到端验证使用临时内容与模拟模型，不向供应商发送真实私密正文。
