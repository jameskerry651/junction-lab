# Junction Lab（blog-starter）

本博客已切换为**学术极简风格（Academic Minimalism）**，站名为 **Junction Lab**。每篇文章拥有唯一数字编号与固定哈希地址 `/#post/<id>`。日常写作与运行方法见 `README.md`。

原 3D 卡带与终端模型资源保留在 `art/` 与 `public/assets/` 供复核。`vanblog/` 是旧博客开源系统的源码参考，不是本项目的实现目录，不要在那里修改本项目功能。

## 当前技术栈与目录

- TypeScript + Vite，纯原生 DOM/CSS，**不使用前端设计或动效 Skill**。
- 前端核心采用自托管学术极简排版体系：思源宋体（Noto Serif SC）、Source Serif 4、IBM Plex Mono 与 MiSans，完整适配桌面端与手机移动端。
- Markdown 构建使用 gray-matter、Marked、Highlight.js、KaTeX 和 sanitize-html。
- `npm run dev` / `npm run build` 先生成内容；构建随后执行 `tsc` 和 Vite。`vite.config.mjs` 负责内容变更监听与私密目录访问限制。

```text
index.html                  单页入口、语义化骨架与站名描述
content/posts/*.md          公开文章唯一编辑源
content/images/             公开文章原图
content/categories.json     分类顺序
content/local/              隐藏/私密文章与非公开图片，禁止发布
scripts/migrate-vanblog.mjs 一次性 VanBlog 导入，不覆盖同名 Markdown
scripts/export-records.mjs predev/prebuild：从 Markdown 生成公开数据
src/generated/posts.json   自动生成的公开元数据，不手动编辑
src/data.ts                 records 导出、ArchiveRecord 类型与查询适配
src/main.ts                 路由分发（时间轴/分类/关于/文章）、日夜模式切换、检索与状态
src/reader.ts               正文按需加载、大纲目录（TOC）与滚动高亮、代码块复制与相邻文章导航
src/site.ts                 站点设置与匿名访问统计
src/admin.ts, admin.css    后台管理界面与响应式样式
src/style.css               学术极简排版、日夜配色、KaTeX公式、代码高亮与全部前台样式
public/posts/               自动生成的公开 HTML 与 Markdown
public/blog-images/         自动复制的公开正文引用图片
public/fonts/               自托管字体（Noto Serif SC, Source Serif 4, IBM Plex Mono, MiSans）
design-studies/            独立静态风格参考稿，不参与构建
blog_data/                 原 VanBlog 导出备份，禁止提交或发布
vanblog/                   VanBlog 源码参考，不参与构建
```

## 内容与发布边界

- 已迁移 79 篇原文：74 篇公开文章、3 篇隐藏文章、2 篇私密文章。公开内容引用 84 张图片。这些是迁移时数量，不是后续增删文章的约束。
- 日常编辑 `content/posts/`，不要把 `src/data.ts` 改回手写文章数组，也不要编辑生成目录。`src/data.ts` 从生成 JSON 导出 `records`，`ArchiveRecord` 为推导类型。
- Front matter 使用唯一正整数 `id`、`title`、`category`、`tags` 数组、`author`、有效的 `createdAt` / `updatedAt`、`visibility`。`originalCategory` 为迁移参考字段。
- 构建仅接受 `visibility: public` 且无有效 `private`、`hidden`、`password` 标记的文章；隐藏/私密内容保留在 `content/local/`。不可将私密正文放进前端后再用界面遮挡。
- 图片使用 `../images/文件名`。构建只复制公开正文引用图片，改写为 `/blog-images/…`，并清理陈旧的正文及图片产物。
- 分类现为工程实践、算法与数据、系统与网络、论文研读、生活随记。对应旧分类分别为 DIY/硬件、算法/数据处理、计算机网络/环境配置、研究论文、生活。顺序由 `content/categories.json` 控制，空分类不显示。
- 文章地址为 `/#post/<id>`，不依赖文件名。修改 ID 会改变链接。公开 `.md` 仍随构建发布，但界面没有下载按钮。
- `blog_data/` 包含后台账号散列和 salt，不能提交到公开仓库或写入前端产物。禁止导入 `user` / `setting` 等账号数据。保留 `.gitignore` 和 Vite 的私密路径访问限制。
- 原始备份为 `blog_data/备份-2026-09-22.json` 与 `export-img-2026-09-22.zip`；VanBlog 原站名为 Code Create World，含 8 个分类。导入已完成，常规开发和构建不再依赖它们。
- 项目未接入 VanBlog 服务或评论，也未配置自动 GitHub 同步。已增加独立 Node.js 后台与登录保护、访问统计；私密文章仅允许后台访问，不能发布到前端再遮挡。

## 当前界面约定

- **前台采用学术极简设计体系（Academic Minimalism）**：
  - 顶栏：左侧品牌（`Junction Lab · 学术与技术记录`）、中央搜索框（支持 `/` 快捷聚焦、`Esc` 清空或失焦）、右侧日间/夜间配色切换（持久化存储至 `localStorage`，跟随系统偏好联动变化）。
  - 站点主导航：时间轴（`#/`）、分类索引（`#/categories`）、关于本站（`#/about`）、后台管理入口（`/admin/`）与当前页面命中篇数统计。
  - 时间轴界面：按年份降序分组呈现（`year-group`），左侧黏性年份标签与计数；条目清晰展示撰写日期（`MM.DD`）、大纲标题、所属分类、编号（`X-082`）、阅读时长与标签；检索时展开摘要预览，无匹配时提供优雅的空状态与清空按钮。
  - 分类界面：展示全部公开分类的时间轴索引与篇数，点击分类标题可下钻至分类独立时间轴（`#/category/<分类>`）。
  - 关于界面：记录个人研究方向与收录范围、四项核心站点约定、动态统计总篇数、分类数与最新更新日期。
  - 正文阅读界面（`/#post/<id>` 或 `#/post/<id>`）：
    - 紧凑学术页头与居中正文：分类 / 日期 / 编号、学术级平衡换行大标题、作者姓名、阅读时长、最后修订日期与文章标签（已移除冗余摘要框，正文排版居中占据主要视觉焦点）。
    - 右侧边栏大纲（TOC）：置于正文右侧，随阅读滚动实现粘性高亮追踪；自动解析正文 `h2, h3` 标题层级，自动编号，支持平滑滚动跳转。
    - 正文排版：衬线体两端对齐排版，KaTeX 数学公式自适应水平居中与横向滚动，表格自带水平滚动保护包裹，暗色模式图片轻量滤镜保护。
    - 代码块工具栏：纯文本语言提示、复制代码状态反馈、复制代码按钮（优先使用原生 `Clipboard API`，提供安全的不可见 `textarea` 剪贴板降级机制，保持原代码缩进与换行，不复制行号或高亮 HTML）。
    - 相邻文章导航：正文底部居中自动生成「较早记录」与「较新记录」的切换链接，支持连续顺畅阅读。
    - 记忆上一级路径：正文顶部的「← 返回时间轴 / 分类」能记住用户是从哪个分类或列表进入的。
- 必须尊重系统「减少动态效果」偏好（`prefers-reduced-motion`）。
- 路由规范：文章地址保持 `/#post/<id>`，不依赖文件名或分类变动。同时兼容 `#/post/<id>`。

## 风格参考稿（design-studies/）

- `design-studies/` 下的四套页面（学术极简、瑞士网格、编辑杂志、档案卡片）是静态视觉参考，不接入 Vite 构建，也不改变现有终端界面。入口为 `design-studies/index.html`。
- 通过 `npm run dev` 后访问 `/design-studies/` 查看；`file://` 打开时本地字体可能被浏览器拦截。页面只读真实文章样本，不写回 `content/`。
- 若要采用其中一套，需另做数据、循环导航、阅读页与手机适配的完整改造；不要直接把参考稿样式批量覆盖到 `src/style.css`。

## 美术资源

- 三维资源必须通过 Blender MCP 制作，保留 `.blend` 源文件与可复现脚本（见 `art/`），导出为 `public/assets/*.glb` 供场景与查看器加载。
- 启动标志与档案标签必须复用 `src/brand.ts` 的同一组贝塞尔曲线，不要另画简笔版本。

## 需要沿用的交互与视觉不变量

这些参数是原项目反复修订的结果，二开时若不打算重做，请保持：

- **构图由相机负责**：同一档案从阵列升起进入特写时只允许竖直升降，不得把模型向前或横向平移来重新构图；靠近与转向由摄像机完成。
- **高度层次**：预览抬起 0.4，交互详情升至 4.05（原片时间轴仍为 3.35），必须保留后方阵列的可见层次；背景卡片不随特写进度额外下沉让位。
- **拖拽顺序**：卡片获得净空后才允许拖拽旋转；收回时先转正再下降，被换选的旧卡片同样遵守。
- **循环阵列**：主界面上下切档案、左右切列均可持续循环，画面不出现队列尽头；按当前分类及各类真实文章数量循环复用，不得重新写死每类八份，切列保留该列的选择记忆。
- **连续过渡**：阵列与抽出卡片的材质、内部细节连续过渡；快速切回正在归位的卡片时保留当前升降状态，归位副本按实际循环位置区分。
- **色彩与光照**：生产场景与独立查看器默认使用 baseline 配置（`src/archive-lighting.ts`）。
- **Rolling Number**：档案序号与列编号保留两位数；`X-001` 形式的档案编号与悬停提示使用三位数滚动、`X-` 前缀固定；连续输入延续当前运动；减少动态效果时关闭滚动。
- **标题横条**：仅主档案标题；240ms 内连续变化触发闪动→黑色横条，横条宽度一轮输入内固定，停止输入 260ms 后闪动恢复最终标题；进入详情或减少动态效果时取消。
- **默认启动**：加载后直接进入 `archive`，等同于原先点击 ENTER SYSTEM 后的状态；重新初始化同样进入主界面。不得恢复自动开场动画。`boot.ts` / `boot-motion.ts` 和 `window.rhine.seek()` 仅保留为历史复核工具。
- **查看器过渡**：进入约 320ms 淡入、载入后约 380ms 轻微展开、退出约 220ms 淡出；退出结束前保留模型与模态焦点，结束后释放并返回原按钮；进入中途按 Esc 衔接退出。
- 必须支持系统「减少动态效果」偏好。

## 开发验证

- 改动内容生成、数据适配或应用逻辑后执行 `npm run build`。单独运行 TypeScript 检查前，需先生成 `src/generated/posts.json`。
- 导航改动应检查各类不同文章数量下的上下/左右循环、长分类列、切列记忆、快速切选和归位衔接；逻辑文章索引不能与固定物理池槽位混为一谈。
- 界面改动检查主界面、摘要和全文阅读，尤其长标题、手机阅读宽度、键盘焦点及减少动态效果；不得引入开场等待。
- 迁移或发布边界改动需核对正文完整性、图片存在性、隐藏/私密内容排除及陈旧产物清理。代码和 Markdown 中的 HTML 应经过转义或清理。
- 修改用户流程或目录结构后同步更新 `README.md` 与本文档。纯文档修改检查路径、命令与当前实现一致即可，无需运行应用测试。

## 后台管理（新增）

- 主界面右上角 ADMIN 按钮进入 `/admin/`，终端偏好设置继续保留。
- `src/admin.ts` / `src/admin.css` 为原生 DOM 响应式管理界面；`admin/index.html` 为 Vite 多页面入口。不使用前端设计或动效 Skill。
- `server/admin.mjs` 提供登录、CSRF 校验、文章 CRUD、图片、统计、分类、备份恢复和设置；`server/index.mjs` 为生产服务器。`npm run dev` 挂载同一套 API；`npm start` 需先 build。
- `.junction/` 存储账号 scrypt 散列、统计、单调递增文章编号、删除原稿和恢复前备份，禁止提交或静态发布。不得从旧 `blog_data/` 导入账号。
- 首次账号通过终端一次性令牌初始化，无默认密码；会话为 HttpOnly / SameSite Cookie，写操作需 CSRF 令牌。`JUNCTION_SECURE_COOKIE=1` 用于 HTTPS 代理。单进程运行，反向代理 IP 仅在显式 `JUNCTION_TRUST_PROXY=1` 时信任 `X-Real-IP`。
- 公开文章依旧保存在 `content/posts/`；草稿与私密文章保存在 `content/local/`。后台保存校验修订散列，失败恢复内容，生产构建成功后切换 dist；不手动编辑生成目录。
- 备份包含私密内容，不含账号和统计。完整恢复前在服务端备份原内容，遇校验或构建失败回滚。增量导入拒绝重复路径与 ID。删除图片必须检查引用。
- 后台功能改动执行 `npm run test:admin` 与 `npm run build`；浏览器验证使用临时内容副本，禁止在真实文章中留下测试内容。内容输出仍使用原渲染管线。

- 文章编辑器为 `src/article-editor.ts` / `src/article-editor.css`，使用 Vditor 的所见即所得、即时渲染和源码分屏模式；底层仍保存 Markdown。没有正文修改时保留原始 Markdown，保存后同步修订号并继续编辑。
- Vditor 资源由 `scripts/editor-assets.mjs` 在 predev/prebuild 复制至被忽略的 `public/vendor/vditor/`，必须本地加载、禁用正文 localStorage 缓存。图表代码不执行、不发送第三方渲染服务；发布预览仍用原服务端渲染器。
- `/images/<文件名>` 仅为编辑器读取原图的登录保护别名，必须经过会话校验；不能改成公开静态目录。上传/图片库插入仍保存 `../images/…`，私密图片不得随编辑器功能绕过发布边界。
- 编辑器改动应检查旧正文未编辑时保持原样、富文本/源码切换、表格/代码/公式/图片持久化、连续保存、快捷键、手机布局和组件离开时销毁。

- 文章新建/编辑使用独立入口 `admin/editor.html`，复用 `src/admin.ts` 登录与保存逻辑，通过 `?id=` 定位文章；默认 Vditor `sv` + `both` 分屏，手机上下排列。正文占满窗口，发布设置默认收起；新文章保存后更新 URL，返回 `/admin/?page=posts`，离开仍检查未保存内容。

- 独立编辑页采用紧凑顶栏：返回、可直接编辑的文章标题、保存状态、发布预览、发布设置与保存集中排列；不再单列标题标签与正文说明，桌面工具栏紧接顶栏，手机顶栏分两行。

- `src/source-highlight.ts` 为源码 textarea 提供只读 Markdown 高亮镜像，保持原生输入、选区与 IME；滚动、尺寸和模式变动需同步，离开编辑器销毁监听。镜像使用 `src/source-markdown.ts` 按行解析完整 Markdown 行内语法并转义 HTML；未闭合标记不得跨段染色，公式下标保持中性色。回归检查运行 `node --test src/source-markdown.test.mjs`。镜像仅用转义后的结果，不能向文章正文写入高亮 HTML。源码字号 14px、预览 15px。


- 阅读页使用紧凑页头（桌面标题最大 32px、手机 24px），样式限定 `.reader-heading > h1`，避免影响正文标题。顶部大纲按钮支持展开/收起并同步 `aria-expanded`，桌面默认展开且收起后正文居中；手机默认收起、以浮层展开，选择章节后收起并将焦点移至对应标题。同次浏览记住手动切换偏好。

- 阅读页代码块由 `src/reader.ts` 在载入后增强，工具栏置于 `pre` 外；复制仅使用 `code.textContent` 保留缩进和换行，不复制按钮或高亮 HTML。优先 Clipboard API，不可用时在阅读对话框内使用临时 textarea 回退，并恢复焦点与选区；结果需反馈，异步完成后不得影响后续文章。长代码保持块内横向滚动，复制按钮支持键盘和手机操作。

## 编辑器 AI 助手

- `src/ai-assistant.ts` / `.css` 提供原生侧栏，`src/ai-context.ts` 负责选区、章节和逐项修改；入口在独立编辑页顶栏。打开助手临时隐藏 Vditor 预览，关闭后恢复；与发布设置互斥，手机浮层约束焦点并隔离背景。
- `server/ai.mjs` 使用 Responses API 的流式输出与 JSON Schema，`/api/ai/status`、`/api/ai/respond` 均受现有登录保护，POST 需 CSRF。API 密钥仅从 `JUNCTION_AI_API_KEY` / `OPENAI_API_KEY` 服务端环境读取；`JUNCTION_AI_MODEL` 必填，`JUNCTION_AI_ENDPOINT` 可选，默认官方 Responses 地址。环境不自动加载 `.env`，禁止把密钥传给前端或公共设置接口。
- 每次只发送选择范围内的当前未保存 Markdown、标题、偏好和最多 8 条历史消息；清楚提示云端传输范围，包括草稿/私密内容。无文件、联网、跨文章或发布工具；不持久化对话或正文到 AI 日志、浏览器缓存。停止/关闭/销毁应取消上游请求。
- 修改返回原文、替换 Markdown 和原因，验证唯一匹配及不重叠后才展示。采纳/插入前校验完整编辑器快照，冲突不覆盖；只更新编辑器并标脏，由现有保存流程提交。Vditor 保存/上传期间禁止应用；保留未改内容和撤销，原文没有编辑时仍逐字保留。AI 控件输入不能把正文标脏或触发表单保存。
- AI 相关改动运行 `npm run test:ai`、`npm run test:admin`、`npm run build`，浏览器使用临时内容和模拟服务核对流式问答、选区、差异采纳、撤销、冲突、连续保存、停止、移动端与模式切换。没有真实模型凭据时明确说明仅通过模拟服务验证，不能宣称完成真实模型联调。
