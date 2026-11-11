import type { ArticleEditor } from "./article-editor";
import "./admin.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
type Post = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  author: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  revision: string;
};
type Photo = {
  name: string;
  scope: string;
  size: number;
  refs: { id: number; title: string }[];
};
type Event = { day: string; visitor: string; path: string; source: string };
const root = document.querySelector<HTMLDivElement>("#admin")!;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const standaloneEditor = location.pathname === "/admin/editor.html";
let updateThemeButtons = () => {};
function initTheme() {
  const getTheme = () =>
    document.documentElement.getAttribute("data-theme") ||
    (localStorage.getItem("junction_theme") === "dark" ||
    (!localStorage.getItem("junction_theme") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light");

  updateThemeButtons = () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    document
      .querySelectorAll<HTMLElement>("[data-theme-toggle]")
      .forEach((el) => {
        el.textContent = isDark ? "☼" : "☾";
        el.title = isDark ? "切换为日间模式" : "切换为夜间模式";
        el.setAttribute(
          "aria-label",
          isDark ? "切换为日间模式" : "切换为夜间模式",
        );
      });
  };

  const currentTheme = getTheme();
  document.documentElement.setAttribute("data-theme", currentTheme);

  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-theme-toggle]");
    if (btn) {
      e.preventDefault();
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("junction_theme", next);
      updateThemeButtons();
    }
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem("junction_theme")) {
        document.documentElement.setAttribute(
          "data-theme",
          e.matches ? "dark" : "light",
        );
        updateThemeButtons();
      }
    });

  updateThemeButtons();
}
initTheme();
let articleEditor: ArticleEditor | null = null;
let aiAssistant: { close(): void; destroy(): void } | null = null;
function disposeEditor() {
  aiAssistant?.destroy();
  aiAssistant = null;
  articleEditor?.destroy();
  articleEditor = null;
}
let csrf = "",
  page = "overview",
  dirty = false,
  posts: Post[] = [],
  filter = "",
  status = "all",
  category = "all",
  current: Partial<Post> | null = null,
  days = 30,
  listPage = 1;
const titles: Record<string, string> = {
  overview: "分析概览",
  posts: "文章管理",
  images: "图片管理",
  data: "数据管理",
  settings: "系统设置",
};
async function api(url: string, method = "GET", data?: unknown) {
  const res = await fetch("/api/" + url, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await res.json();
  if (!res.ok) {
    if (res.status === 401 && page !== "login") {
      dirty = false;
      await start();
    }
    throw new Error(value.error || "请求失败");
  }
  return value;
}
function toast(message: string, error = false) {
  let el = document.querySelector("#notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "notice";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.className = error ? "error" : "";
  setTimeout(() => {
    if (el?.textContent === message) el.remove();
  }, 6000);
}
function bind(
  selector: string,
  fn: (e: globalThis.Event) => unknown,
  event = "click",
) {
  document.querySelectorAll(selector).forEach((el) =>
    el.addEventListener(event, (e) => {
      try {
        Promise.resolve(fn(e)).catch((err) => toast(err.message, true));
      } catch (err) {
        toast((err as Error).message, true);
      }
    }),
  );
}
function formData(e: globalThis.Event) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement));
}
function leave() {
  return !dirty || confirm("尚有未保存的修改，确定离开？");
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function start() {
  const s = await api("session");
  csrf = s.csrf || "";
  if (!s.authenticated) {
    disposeEditor();
    page = "login";
    root.innerHTML = `<div class="login"><button class="theme-toggle login-theme-toggle" data-theme-toggle title="切换日夜模式" aria-label="切换日间/夜间模式">☾</button><a href="/" class="wordmark">JUNCTION LAB <span>↗</span></a><div class="login-card"><p class="eyebrow">WORKSPACE / 01</p><h1>${s.initialized ? "欢迎回来" : "建立管理工作空间"}</h1><p class="muted">${s.initialized ? "登录以管理内容、资源与站点。" : "使用启动终端中的初始化令牌创建管理员。"}</p><form id="login">${!s.initialized ? '<label>初始化令牌<input name="token" required autocomplete="off"></label>' : ""}<label>管理员账号<input name="username" required minlength="3" autocomplete="username"></label><label>密码<input type="password" name="password" required ${!s.initialized ? 'minlength="12"' : ""} maxlength="256" autocomplete="${s.initialized ? "current-password" : "new-password"}"></label><button class="primary">${s.initialized ? "登录后台 →" : "创建管理员 →"}</button><p id="login-error" role="alert"></p></form></div><p class="muted">JUNCTION LAB · 内容管理终端</p></div>`;
    updateThemeButtons();
    bind(
      "#login",
      async (e) => {
        const data = formData(e);
        const button =
          document.querySelector<HTMLButtonElement>("#login button")!;
        button.disabled = true;
        try {
          await api(s.initialized ? "login" : "setup", "POST", data);
          page = "overview";
          await start();
        } catch (err) {
          document.querySelector("#login-error")!.textContent = (
            err as Error
          ).message;
          button.disabled = false;
        }
      },
      "submit",
    );
    return;
  }
  page = page === "login" ? "overview" : page;
  if (standaloneEditor) {
    page = "posts";
    root.innerHTML =
      '<main class="article-page"><div id="content"></div></main>';
    posts = await api("posts");
    const id = new URLSearchParams(location.search).get("id");
    const post =
      id === null ? undefined : posts.find((p) => String(p.id) === id);
    if (id !== null && !post) {
      set(
        '<section class="panel"><h1>文章不存在</h1><a href="/admin/?page=posts">返回文章列表</a></section>',
      );
      return;
    }
    await edit(post);
    return;
  }
  if (
    new URLSearchParams(location.search).get("page") === "posts" &&
    page === "overview"
  )
    page = "posts";
  await render();
}
function shell() {
  disposeEditor();
  root.innerHTML = `<aside><a class="wordmark" href="/">JUNCTION LAB <span>↗</span></a><div class="workspace">研究管理工作空间<small>ARCHIVE MANAGEMENT</small></div><nav>${Object.entries(
    titles,
  )
    .map(
      ([key, title], i) =>
        `<button data-page="${key}" class="${page === key ? "active" : ""}"><span>0${i + 1}</span>${title}<b>↗</b></button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-foot"><span class="dot"></span> 本地内容 · 服务端管理<br><button data-logout>退出登录 ↗</button></div></aside><main><header><div><p class="eyebrow">WORKSPACE / ${page.toUpperCase()}</p><h1>${titles[page]}</h1></div><div class="header-actions"><button class="theme-toggle" data-theme-toggle title="切换日夜模式" aria-label="切换日间/夜间模式">☾</button><a class="button" href="/" target="_blank" rel="noopener">查看博客 ↗</a><button class="mobile-logout" data-logout>退出</button></div></header><div id="content" aria-live="polite"><div class="panel">正在加载…</div></div><footer>JUNCTION LAB <span>ACADEMIC MINIMALISM ARCHIVE.</span></footer></main>`;
  updateThemeButtons();
  bind("[data-page]", async (e) => {
    if (!leave()) return;
    dirty = false;
    current = null;
    page = (e.currentTarget as HTMLElement).dataset.page!;
    await render();
  });
  bind("[data-logout]", async () => {
    if (!leave()) return;
    await api("logout", "POST", {});
    dirty = false;
    await start();
  });
}
function set(html: string) {
  disposeEditor();
  document.querySelector("#content")!.innerHTML = html;
}
function panel(title: string, body: string) {
  return `<section class="panel"><h2>${title}</h2>${body}</section>`;
}
async function render() {
  shell();
  if (page === "overview") await overview();
  if (page === "posts") {
    posts = await api("posts");
    if (page !== "posts") return;
    postList();
  }
  if (page === "images") await images();
  if (page === "data") await dataPage();
  if (page === "settings") await settingsPage();
}
async function overview() {
  const [result, all] = await Promise.all([
    api("analytics?days=" + days),
    api("posts"),
  ]);
  if (page !== "overview") return;
  const events: Event[] = result.events;
  const today = new Date().toISOString().slice(0, 10);
  const grouped = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
  ).map((day) => ({
    day,
    pv: events.filter((e) => e.day === day).length,
    uv: new Set(events.filter((e) => e.day === day).map((e) => e.visitor)).size,
  }));
  const max = Math.max(1, ...grouped.map((d) => d.pv));
  const rank = (field: "path" | "source") =>
    Object.entries(
      events.reduce<Record<string, number>>((acc, e) => {
        acc[e[field]] = (acc[e[field]] || 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  const rows = (field: "path" | "source") =>
    rank(field)
      .map(
        ([key, n], i) =>
          `<div class="rank"><span>${String(i + 1).padStart(2, "0")}</span><strong>${esc(field === "path" ? (key === "/" ? "博客首页" : all.find((p: Post) => key === `/#post/${p.id}`)?.title || key) : key)}</strong><b>${n}</b></div>`,
      )
      .join("") ||
    '<p class="empty">暂无访问记录。读者访问后会显示真实数据。</p>';
  set(
    `<div class="intro"><div><h2>每一篇记录，都在产生连接。</h2><p class="muted">内容与访问数据，一处掌握。</p></div><select id="days" aria-label="统计范围">${[7, 30, 90].map((n) => `<option value="${n}" ${days === n ? "selected" : ""}>最近 ${n} 天</option>`).join("")}</select></div><div class="metrics">${[
      ["浏览量 / PV", events.length],
      [
        "今日访客 / UV",
        new Set(events.filter((e) => e.day === today).map((e) => e.visitor))
          .size,
      ],
      ["公开文章", all.filter((p: Post) => p.visibility === "public").length],
      ["草稿与私密", all.filter((p: Post) => p.visibility !== "public").length],
    ]
      .map(
        ([label, n]) =>
          `<div class="metric"><span>${label}</span><strong>${n}</strong><small>● LIVE DATA</small></div>`,
      )
      .join(
        "",
      )}</div>${panel("访问趋势", `<div class="chart" role="img" aria-label="最近 ${days} 天每日浏览量">${grouped.map((d) => `<div title="${d.day} · PV ${d.pv} · UV ${d.uv}"><i style="height:${Math.max(2, (d.pv / max) * 160)}px"></i><small>${d.day.slice(5)}</small></div>`).join("")}</div><p class="muted">按 UTC 日期统计；PV 对同访客同页 30 秒内访问去重，UV 为当日匿名网络特征估算。保存最近 90 天、至多 10 万条记录。</p>`)}<div class="two">${panel("热门内容", rows("path"))}${panel("访问来源", rows("source"))}</div>`,
  );
  bind(
    "#days",
    async (e) => {
      days = Number((e.target as HTMLSelectElement).value);
      await overview();
    },
    "change",
  );
}
const stateName = (v: string) =>
  ({ public: "已发布", draft: "草稿", private: "私密" })[v] || v;
function postList() {
  const matching = posts.filter(
    (p) =>
      (status === "all" || p.visibility === status) &&
      (category === "all" || p.category === category) &&
      `${p.title} ${p.id} ${p.tags.join(" ")}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 20));
  listPage = Math.min(listPage, pageCount);
  set(
    `<div class="toolbar"><div class="tabs">${["all", "public", "draft", "private"].map((v) => `<button data-status="${v}" class="${status === v ? "selected" : ""}">${v === "all" ? "全部文章" : stateName(v)} <small>${posts.filter((p) => v === "all" || p.visibility === v).length}</small></button>`).join("")}</div><button class="primary" id="new">＋ 新建文章</button></div><section class="panel"><div class="filters"><input id="filter" aria-label="搜索文章" placeholder="搜索标题、编号或标签" value="${esc(filter)}"><select id="category" aria-label="分类筛选"><option value="all">全部分类</option>${[...new Set(posts.map((p) => p.category))].map((c) => `<option ${category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><span class="muted">${matching.length} 篇文章</span></div><div class="table-wrap"><table><thead><tr><th>文章 / TITLE</th><th>分类</th><th>状态</th><th>更新日期</th><th>操作</th></tr></thead><tbody>${
      matching
        .slice((listPage - 1) * 20, listPage * 20)
        .map(
          (p) =>
            `<tr><td><button class="text-link" data-edit="${p.id}">${esc(p.title)}</button><small>#${p.id} · ${esc(p.tags.join(" / ") || "无标签")}</small></td><td>${esc(p.category)}</td><td><span class="badge ${p.visibility}">${stateName(p.visibility)}</span></td><td>${esc(String(p.updatedAt).slice(0, 10))}</td><td class="actions"><button data-edit="${p.id}">编辑</button><button class="danger" data-delete="${p.id}">删除</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="empty">没有匹配的文章</td></tr>'
    }</tbody></table></div><div class="pagination"><span>第 ${listPage} / ${pageCount} 页 · 每页 20 篇</span><button id="prev-page" ${listPage === 1 ? "disabled" : ""}>← 上一页</button><button id="next-page" ${listPage === pageCount ? "disabled" : ""}>下一页 →</button></div></section>`,
  );
  bind("#prev-page", () => {
    listPage--;
    postList();
  });
  bind("#next-page", () => {
    listPage++;
    postList();
  });
  bind("#new", () => edit());
  bind("[data-edit]", (e) =>
    edit(
      posts.find(
        (p) => p.id === Number((e.currentTarget as HTMLElement).dataset.edit),
      ),
    ),
  );
  bind("[data-delete]", async (e) => {
    const p = posts.find(
      (p) => p.id === Number((e.currentTarget as HTMLElement).dataset.delete),
    )!;
    if (!confirm(`删除「${p.title}」？服务端会保留原稿到回收目录。`)) return;
    await api("posts/" + p.id, "DELETE", { revision: p.revision });
    toast("文章已删除");
    await render();
  });
  bind("[data-status]", (e) => {
    listPage = 1;
    status = (e.currentTarget as HTMLElement).dataset.status!;
    postList();
  });
  bind(
    "#category",
    (e) => {
      listPage = 1;
      category = (e.target as HTMLSelectElement).value;
      postList();
    },
    "change",
  );
  bind(
    "#filter",
    (e) => {
      listPage = 1;
      filter = (e.target as HTMLInputElement).value;
      postList();
      const input = document.querySelector<HTMLInputElement>("#filter")!;
      input.focus();
      input.setSelectionRange(filter.length, filter.length);
    },
    "input",
  );
}
async function edit(p?: Post) {
  if (!standaloneEditor) {
    location.href = "/admin/editor.html" + (p ? "?id=" + p.id : "");
    return;
  }
  document.title = (p?.title || "新建文章") + " · 文章编辑";
  current = p || {
    title: "",
    category: "工程实践",
    tags: [],
    author: (await api("settings")).author,
    visibility: "draft",
    createdAt: new Date().toISOString(),
    body: "",
  };
  const x = current;
  set(
    `<form id="editor"><div class="toolbar article-page-toolbar"><button id="back" type="button" title="返回文章列表" aria-label="返回文章列表">←</button><input aria-label="文章标题" name="title" value="${esc(x.title)}" required maxlength="250" placeholder="输入文章标题…" class="title-input"><span class="muted" id="article-identity">${p ? "编辑文章 #" + p.id : "新建文章 · 默认保存为草稿"}</span><div class="article-page-actions"><span id="save-status" role="status" title="⌘ / Ctrl + S 保存">加载中…</span><button type="button" class="theme-toggle" data-theme-toggle title="切换日夜模式" aria-label="切换日间/夜间模式">☾</button><button type="button" id="preview" title="查看实际发布效果">预览 ↗</button><button id="toggle-ai" type="button" aria-expanded="false" aria-controls="ai-assistant">AI 助手</button><button id="toggle-settings" type="button" aria-expanded="false" aria-controls="publish-settings">发布设置</button><button class="primary" id="save" form="editor" disabled>保存</button></div></div><div class="editor-grid editor-workspace"><section class="panel editor-writing-panel" aria-label="文章正文"><div id="rich-editor"><p class="muted">正在加载编辑器…</p></div></section><section class="panel metadata" id="publish-settings" hidden><h2>发布设置</h2><label>可见性<select name="visibility">${["draft", "public", "private"].map((v) => `<option value="${v}" ${x.visibility === v ? "selected" : ""}>${stateName(v)}</option>`).join("")}</select></label><label>分类<input name="category" required maxlength="80" value="${esc(x.category)}" list="category-list"><datalist id="category-list">${[...new Set(posts.map((p) => p.category))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label><label>标签（逗号分隔）<input name="tags" value="${esc(x.tags?.join(", "))}"></label><label>作者<input name="author" required value="${esc(x.author)}"></label><label>发布日期<input name="createdAt" type="datetime-local" required value="${new Date(new Date(x.createdAt!).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"></label><p class="muted">草稿与私密正文仅限登录后查看。公开文章保存后自动更新博客。</p><span class="editor-save-hint">⌘ / Ctrl + S 保存 · 保存后继续编辑</span></section></div></form>`,
  );
  updateThemeButtons();
  const initialDate =
    document.querySelector<HTMLInputElement>("[name=createdAt]")!.value;
  const originalDate = x.createdAt;
  const host = document.querySelector<HTMLElement>("#rich-editor")!;
  const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
  const saveStatus = document.querySelector<HTMLElement>("#save-status")!;
  const markChanged = () => {
    dirty = true;
    saveStatus.textContent = "有未保存的修改";
  };
  bind(
    "#editor",
    (e) => {
      if (!(e.target as HTMLElement).closest("#rich-editor, #ai-assistant"))
        markChanged();
    },
    "input",
  );
  bind("#back", () => {
    if (leave()) {
      dirty = false;
      current = null;
      location.href = "/admin/?page=posts";
    }
  });
  const settingsPanel =
    document.querySelector<HTMLElement>("#publish-settings")!;
  const settingsToggle =
    document.querySelector<HTMLButtonElement>("#toggle-settings")!;
  const showSettings = (show: boolean) => {
    if (show) aiAssistant?.close();
    settingsPanel.hidden = !show;
    settingsToggle.setAttribute("aria-expanded", String(show));
    document
      .querySelector(".editor-workspace")!
      .classList.toggle("settings-open", show);
  };
  bind("#toggle-settings", () => showSettings(settingsPanel.hidden));
  document
    .querySelector("#editor")!
    .addEventListener("invalid", () => showSettings(true), true);
  const { createArticleEditor } = await import("./article-editor");
  if (!host.isConnected) return;
  host.addEventListener(
    "editor-ready",
    () => {
      saveButton.disabled = false;
      saveStatus.textContent = p ? "已载入" : "新草稿";
    },
    { once: true },
  );
  const instance = await createArticleEditor(host, {
    value: x.body || "",
    api,
    visibility: () =>
      document.querySelector<HTMLSelectElement>("[name=visibility]")!.value,
    onChange: markChanged,
    onSave: () => {
      if (!saveButton.disabled)
        document.querySelector<HTMLFormElement>("#editor")!.requestSubmit();
    },
    notify: toast,
  });
  // The view may have been replaced while the editor runtime was loading.
  if (!host.isConnected) return;
  articleEditor = instance;
  const { createAiAssistant } = await import("./ai-assistant");
  if (!host.isConnected || articleEditor !== instance) return;
  aiAssistant = createAiAssistant({
    editor: instance,
    workspace: document.querySelector<HTMLElement>(".editor-workspace")!,
    toggle: document.querySelector<HTMLButtonElement>("#toggle-ai")!,
    csrf: () => csrf,
    title: () =>
      document.querySelector<HTMLInputElement>("[name=title]")!.value,
    visibility: () =>
      document.querySelector<HTMLSelectElement>("[name=visibility]")!.value,
    notify: toast,
    onOpen: () => showSettings(false),
  });
  bind("#preview", () => {
    if (instance.ready) instance.preview();
  });
  bind(
    "#editor",
    async (e) => {
      const data = formData(e);
      if (!instance.ready || saveButton.disabled) return;
      if (instance.uploading) {
        toast("请等待图片上传完成后保存", true);
        return;
      }
      const form = e.currentTarget as HTMLFormElement;
      const controls = Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "input, select",
        ),
      ).filter((el) => !el.closest("#ai-assistant"));
      saveButton.disabled = true;
      saveStatus.textContent = "正在保存并更新站点…";
      const body = instance.getValue();
      instance.lock(true);
      controls.forEach((el) => (el.disabled = true));
      let committed = false;
      try {
        const result = await api("posts", "POST", {
          ...x,
          ...data,
          body,
          tags: String(data.tags)
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          createdAt:
            data.createdAt === initialDate
              ? originalDate
              : new Date(String(data.createdAt)).toISOString(),
        });
        committed = true;
        const all: Post[] = await api("posts");
        const saved = all.find((p) => p.id === result.id);
        if (!saved)
          throw Error("文章已保存，但无法读取最新修订，请重新打开文章");
        Object.assign(x, saved);
        posts = all;
        if (articleEditor === instance) {
          dirty = false;
          history.replaceState(null, "", "/admin/editor.html?id=" + saved.id);
          document.title = saved.title + " · 文章编辑";
          document.querySelector("#article-identity")!.textContent =
            "编辑文章 #" + saved.id;
          saveStatus.textContent =
            "已保存 · " + new Date().toLocaleTimeString();
        }
        toast("文章已保存，可以继续编辑");
      } catch (error) {
        saveStatus.textContent = committed
          ? "已保存；获取修订失败，请返回列表重新打开"
          : "保存失败，编辑内容仍保留，请重试";
        // Prevent a retry with an outdated revision after a successful write.
        if (committed) saveButton.dataset.stale = "true";
        throw error;
      } finally {
        saveButton.disabled = saveButton.dataset.stale === "true";
        instance.lock(false);
        controls.forEach((el) => (el.disabled = false));
      }
    },
    "submit",
  );
}

async function images() {
  const photos: Photo[] = await api("images");
  if (page !== "images") return;
  set(
    `<div class="intro"><div><h2>图片资源库 <span class="muted">/ ${photos.length}</span></h2><p class="muted">上传后复制 Markdown 引用到文章；仅公开正文引用的图片会发布。</p></div></div><section class="panel upload"><form id="upload"><label>存储位置<select name="scope"><option value="public">公开图片</option><option value="private">私密图片</option></select></label><label>选择图片（单张最大 10MB）<input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" required></label><button class="primary">上传图片 ↑</button></form><p class="muted">PNG / JPEG / WEBP / GIF / AVIF · 文件名自动生成，避免覆盖原图</p></section><div class="image-grid">${photos.map((p, i) => `<article class="panel photo"><a href="/api/image?scope=${p.scope}&name=${encodeURIComponent(p.name)}" target="_blank" rel="noopener"><img loading="lazy" src="/api/image?scope=${p.scope}&name=${encodeURIComponent(p.name)}" alt="${esc(p.name)}"></a><strong title="${esc(p.name)}">${esc(p.name)}</strong><small>${(p.size / 1024).toFixed(1)} KB · ${p.scope === "public" ? "公开资源" : "私密资源"} · ${p.refs.length} 篇引用</small><details><summary>查看引用</summary>${p.refs.map((r) => `<p>#${r.id} ${esc(r.title)}</p>`).join("") || "未被引用"}</details><div class="actions"><button data-copy="${i}">复制引用</button><button class="danger" data-remove="${i}" ${p.refs.length ? "disabled" : ""}>删除</button></div></article>`).join("") || '<p class="empty">还没有图片，上传第一张图片开始写作。</p>'}</div>`,
  );
  bind(
    "#upload",
    async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const button = form.querySelector("button")!;
      button.disabled = true;
      try {
        const data = new FormData(form),
          file = data.get("file") as File;
        if (file.size > 10 * 1024 * 1024) throw Error("图片不得超过 10MB");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await api("images", "POST", {
          name: file.name,
          scope: data.get("scope"),
          data: base64,
        });
        toast("已上传：" + result.name);
        await images();
      } finally {
        button.disabled = false;
      }
    },
    "submit",
  );
  bind("[data-copy]", async (e) => {
    const p = photos[Number((e.currentTarget as HTMLElement).dataset.copy)];
    await navigator.clipboard.writeText(
      `![图片](../images/${encodeURIComponent(p.name)})`,
    );
    toast("Markdown 图片引用已复制");
  });
  bind("[data-remove]", async (e) => {
    const p = photos[Number((e.currentTarget as HTMLElement).dataset.remove)];
    if (confirm("永久删除未引用的图片 " + p.name + "？")) {
      await api("images", "DELETE", p);
      await images();
      toast("图片已删除");
    }
  });
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function dataPage() {
  const [categories, all] = await Promise.all([
    api("categories"),
    api("posts"),
  ]);
  if (page !== "data") return;
  const tags: Record<string, number> = {};
  all.forEach((p: Post) =>
    p.tags.forEach((t) => (tags[t] = (tags[t] || 0) + 1)),
  );
  set(
    `<div class="two">${panel("分类与显示顺序", `<p class="muted">每行一个分类，上方的分类在前台优先显示。文章使用的其他分类会自动追加；修改文章分类请进入编辑器。</p><form id="categories"><textarea name="categories" rows="8" aria-label="分类顺序">${esc(categories.join("\n"))}</textarea><button class="primary">保存分类顺序</button></form>`)}${panel(
      "标签索引",
      `<p class="muted">标签由文章维护，在文章编辑器中添加、修改或删除。</p><div class="tags">${
        Object.entries(tags)
          .map(([t, n]) => `<span>${esc(t)} <b>${n}</b></span>`)
          .join("") || "暂无标签"
      }</div>`,
    )}</div>${panel("备份与迁移", `<p>导出全部 Markdown 与图片，包含草稿、私密内容和站点配置。请妥善保存备份文件。</p><p class="muted">备份不包含管理员密码和访问统计。增量导入遇到同名文件或相同文章 ID 会拒绝；完整恢复将替换文章、图片、分类和站点设置，并先在服务端保存恢复前备份。单次上限 32MB。</p><button id="export" class="primary">下载完整内容备份 ↓</button><hr><form id="import"><label>恢复方式<select name="mode"><option value="import">增量导入（保留现有内容）</option><option value="restore">完整恢复（替换现有内容）</option></select></label><label>导入 Junction Lab 备份<input type="file" name="backup" accept="application/json,.json" required></label><button>导入新增内容 ↑</button></form>`)} `,
  );
  bind(
    "#categories",
    async (e) => {
      const data = formData(e);
      await api("categories", "PUT", {
        categories: String(data.categories)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      dirty = false;
      toast("分类顺序已更新");
    },
    "submit",
  );
  bind(
    "#categories",
    () => {
      dirty = true;
    },
    "input",
  );
  bind("#export", async () => {
    download(
      await api("backup"),
      "junction-backup-" + new Date().toISOString().slice(0, 10) + ".json",
    );
    toast("备份已生成");
  });
  bind(
    "#import",
    async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const file = new FormData(form).get("backup") as File;
      if (file.size > 32 * 1024 * 1024)
        throw Error("备份超过 32MB，请分批迁移");
      const value = JSON.parse(await file.text());
      const mode = String(new FormData(form).get("mode"));
      if (mode === "restore") {
        if (
          prompt(
            "完整恢复将替换全部文章、图片和站点配置。输入「恢复」确认：",
          ) !== "恢复"
        )
          return;
      } else if (!confirm("将导入备份中的新增内容，并重新生成站点，继续？"))
        return;
      const button = form.querySelector("button")!;
      button.disabled = true;
      try {
        const result = await api(mode, "POST", value);
        toast(`已导入 ${result.imported} 篇文章`);
        await dataPage();
      } finally {
        button.disabled = false;
      }
    },
    "submit",
  );
}
async function settingsPage() {
  const settings = await api("settings");
  if (page !== "settings") return;
  set(
    `<div class="two">${panel("站点信息", `<form id="settings"><label>站点名称<input name="title" maxlength="80" value="${esc(settings.title)}" required></label><label>站点描述<textarea name="description" rows="3" maxlength="300">${esc(settings.description)}</textarea></label><label>默认作者<input name="author" value="${esc(settings.author)}" required></label><label class="check"><input name="analytics" type="checkbox" ${settings.analytics ? "checked" : ""}>启用匿名访问分析</label><p class="muted">名称与描述在前台加载时应用。关闭统计后停止记录新访问，历史记录按保留期清理。</p><button class="primary">保存系统设置</button></form>`)}${panel("账号安全", `<form id="password"><label>当前密码<input type="password" name="current" required autocomplete="current-password"></label><label>新密码<input type="password" name="password" minlength="12" maxlength="256" required autocomplete="new-password"></label><label>确认新密码<input type="password" name="confirm" minlength="12" required autocomplete="new-password"></label><p class="muted">至少 12 位；修改后所有管理会话失效，需要重新登录。</p><button>更新密码</button></form>`)}</div>${panel("运行说明", '<p>内容存储：本地 Markdown + 图片文件。管理数据：服务端 .junction 目录。登录会话有效期 8 小时，重启服务后需重新登录。</p><p class="muted">生产使用 npm run build 后运行 npm start，并通过 HTTPS 反向代理访问。详情见项目 README。</p>')}`,
  );
  bind(
    "#settings",
    () => {
      dirty = true;
    },
    "input",
  );
  bind(
    "#settings",
    async (e) => {
      const data = formData(e);
      await api("settings", "PUT", {
        ...data,
        analytics: data.analytics === "on",
      });
      dirty = false;
      toast("系统设置已保存");
    },
    "submit",
  );
  bind(
    "#password",
    async (e) => {
      const data = formData(e);
      if (data.password !== data.confirm) throw Error("两次新密码不一致");
      await api("password", "PUT", data);
      dirty = false;
      toast("密码已更新，请重新登录");
      await start();
    },
    "submit",
  );
}
start().catch((err) => {
  root.innerHTML = `<div class="login"><h1>后台服务暂不可用</h1><p>${esc(err.message)}</p><p>请使用 npm run dev 或 npm start 启动带后台的服务。</p><a href="/">返回博客</a></div>`;
});
