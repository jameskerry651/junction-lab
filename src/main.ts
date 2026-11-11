import "./style.css";
import "katex/dist/katex.min.css";
import { connectSite, getSiteTitle } from "./site";
import {
  records,
  archiveColumns,
  escapeHtml,
  type ArchiveRecord,
} from "./data";
import { renderPost, cleanupReader } from "./reader";

const STORAGE_KEY = "junction-academic-theme";

const categoryDescriptions: Record<string, string> = {
  工程实践: "芯片、嵌入式与性能优化。把原理拆开，再装回去。",
  算法与数据: "强化学习、信息论与数据处理。公式背后的直觉与工程折中。",
  系统与网络: "工具链、服务器与网络配置。能复现的实践记录。",
  论文研读: "论文精读与研究笔记。保留推导，也保留疑问。",
  生活随记: "城市、季节与日常。与技术无关，但同样需要记录。",
};

const formatDate = (val: string) => val.slice(5).replace("-", ".");

/* ---------- 主题模式 ---------- */
const themeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-theme-set]"),
);
const themeMeta = document.querySelector<HTMLMetaElement>(
  'meta[name="theme-color"]',
);

function applyTheme(theme: "light" | "dark", persist: boolean) {
  document.documentElement.dataset.theme = theme;
  themeButtons.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeSet === theme));
  });
  if (themeMeta) {
    themeMeta.setAttribute("content", theme === "dark" ? "#151410" : "#faf8f3");
  }
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // LocalStorage unavailable
    }
  }
}

themeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const t = btn.dataset.themeSet as "light" | "dark";
    if (t) applyTheme(t, true);
  });
});

const systemDarkQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;
systemDarkQuery?.addEventListener?.("change", (e) => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (!saved) applyTheme(e.matches ? "dark" : "light", false);
});

// Initial theme
let initialSavedTheme: string | null = null;
try {
  initialSavedTheme = localStorage.getItem(STORAGE_KEY);
} catch {
  initialSavedTheme = null;
}
applyTheme(
  initialSavedTheme === "dark" ||
    (!initialSavedTheme && systemDarkQuery?.matches)
    ? "dark"
    : "light",
  false,
);

/* ---------- DOM 引用 ---------- */
const pageSections = Array.from(
  document.querySelectorAll<HTMLElement>("[data-page]"),
);
const navLinks = Array.from(
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]"),
);
const searchShell = document.getElementById("searchShell")!;
const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const searchClear = document.getElementById("searchClear") as HTMLButtonElement;
const searchCount = document.getElementById("searchCount")!;
const timeline = document.getElementById("timeline")!;
const emptyState = document.getElementById("emptyState")!;
const emptyClear = document.getElementById("emptyClear") as HTMLButtonElement;
const listingPage = document.getElementById("listingPage")!;
const listingKicker = document.getElementById("listingKicker")!;
const listingTitle = document.getElementById("listingTitle")!;
const listingDesc = document.getElementById("listingDesc")!;
const listingMeta = document.getElementById("listingMeta")!;
const categoryArchive = document.getElementById("categoryArchive")!;
const catEmpty = document.getElementById("catEmpty")!;
const catEmptyClear = document.getElementById(
  "catEmptyClear",
) as HTMLButtonElement;
const catKicker = document.getElementById("catKicker")!;
const catTitle = document.getElementById("catTitle")!;
const catDesc = document.getElementById("catDesc")!;
const catMeta = document.getElementById("catMeta")!;

type Route =
  | { name: "timeline" }
  | { name: "categories" }
  | { name: "category"; category: string }
  | { name: "about" }
  | { name: "post"; slug: string };

const state = {
  route: { name: "timeline" } as Route,
  query: "",
  lastListing: { name: "timeline" } as { name: string; category?: string },
};

/* ---------- 路由解析 ---------- */
function parseRoute(): Route {
  const hash = location.hash;
  const postMatch = /^#\/?post\/([^/?#]+)/.exec(hash);
  if (postMatch) {
    return { name: "post", slug: postMatch[1] };
  }

  const clean = hash.replace(/^#\/?/, "");
  const [firstRaw, ...rest] = clean.split("/").filter(Boolean);
  const first = firstRaw ? decodeURIComponent(firstRaw) : "";

  if (first === "about") return { name: "about" };
  if (first === "categories") return { name: "categories" };
  if (first === "category" && rest[0]) {
    const category = decodeURIComponent(rest[0]);
    return archiveColumns.includes(category)
      ? { name: "category", category }
      : { name: "timeline" };
  }
  return { name: "timeline" };
}

function setPage(name: string) {
  document.body.dataset.page = name;
  pageSections.forEach((sec) => {
    sec.hidden = sec.dataset.page !== name;
  });
}

function updateNav(route: Route) {
  navLinks.forEach((link) => {
    let active = false;
    if (link.dataset.nav === "timeline") active = route.name === "timeline";
    if (link.dataset.nav === "about") active = route.name === "about";
    if (link.dataset.nav === "categories") {
      active = route.name === "categories" || route.name === "category";
    }
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function clearSearch() {
  state.query = "";
  searchInput.value = "";
  searchClear.hidden = true;
}

/* ---------- 列表与过滤 ---------- */
function postsForRoute(): ArchiveRecord[] {
  const route = state.route;
  if (route.name === "category") {
    return records.filter((post) => post.category === route.category);
  }
  return records;
}

function matchingPosts(): ArchiveRecord[] {
  const base = postsForRoute();
  const q = state.query.trim().toLowerCase();
  if (!q) return base;
  return base.filter((post) => {
    const pool = [
      post.title,
      post.abstract,
      post.category,
      post.tags.join(" "),
      post.id,
      post.slug,
    ]
      .join(" ")
      .toLowerCase();
    return pool.includes(q);
  });
}

function renderTimeline(items: ArchiveRecord[]) {
  if (!items.length) {
    timeline.innerHTML = "";
    return;
  }

  const years: string[] = [];
  const grouped = new Map<string, ArchiveRecord[]>();

  items.forEach((post) => {
    const year = post.date.slice(0, 4);
    if (!grouped.has(year)) {
      grouped.set(year, []);
      years.push(year);
    }
    grouped.get(year)!.push(post);
  });

  timeline.innerHTML = years
    .map((year) => {
      const yearPosts = grouped.get(year)!;
      const rows = yearPosts
        .map((post) => {
          return `
            <li>
              <a class="entry" href="#post/${post.slug}">
                <time datetime="${post.date}">${formatDate(post.date)}</time>
                <span class="entry-body">
                  <span class="entry-title">${escapeHtml(post.title)}</span>
                  <span class="entry-meta">
                    <span class="entry-cat">${escapeHtml(post.category)}</span>
                    <span class="entry-id">${post.id}</span>
                    <span>${escapeHtml(post.clearance)}</span>
                    ${post.tags.map((t) => `<span class="entry-tag">#${escapeHtml(t)}</span>`).join("")}
                  </span>
                  <span class="entry-abstract">${escapeHtml(post.abstract)}</span>
                </span>
              </a>
            </li>`;
        })
        .join("");

      return `
        <div class="year-group">
          <h2 class="year-label">${year}<span>${yearPosts.length} 篇</span></h2>
          <ol class="entries">${rows}</ol>
        </div>`;
    })
    .join("");
}

function renderListing() {
  const route = state.route;
  const category = route.name === "category" ? route.category : null;
  state.lastListing = category
    ? { name: "category", category }
    : { name: "timeline" };
  const isCategory = Boolean(category);
  listingPage.classList.toggle("is-category", isCategory);

  const all = postsForRoute();
  const items = matchingPosts();
  const isSearching = state.query.trim().length > 0;

  if (isCategory && category) {
    const idx = archiveColumns.indexOf(category);
    listingKicker.textContent = `Category ${String(Math.max(idx, 0) + 1).padStart(2, "0")} / ${String(archiveColumns.length).padStart(2, "0")}`;
    listingTitle.textContent = category;
    listingDesc.textContent =
      categoryDescriptions[category] || "这一分类下的全部研究记录。";
    const newest = all.reduce(
      (latest, p) => (p.date > latest ? p.date : latest),
      "",
    );
    listingMeta.innerHTML = [
      newest ? `<span>最近更新 ${newest.replace(/-/g, ".")}</span>` : "",
      `<a href="#/categories">全部分类 →</a>`,
      `<a href="#/">全部时间轴 →</a>`,
    ]
      .filter(Boolean)
      .join("");
    searchInput.placeholder = `在「${category}」中搜索`;
    searchInput.setAttribute("aria-label", `在${category}中搜索文章`);
  } else {
    const years = records.map((r) => r.date.slice(0, 4)).sort();
    const minYear = years[0] || "2024";
    const maxYear = years[years.length - 1] || "2026";
    listingKicker.textContent = `Archive · ${minYear}—${maxYear}`;
    listingTitle.textContent = "时间轴";
    listingDesc.textContent =
      "按写作时间倒序排列的研究札记。点击标题阅读，或使用上方搜索框检索标题、标签与摘要。";
    listingMeta.innerHTML = [
      `<span>${archiveColumns.length} 个分类</span>`,
      `<a href="#/categories">分类索引 →</a>`,
      `<a href="#/about">关于本站 →</a>`,
    ].join("");
    searchInput.placeholder = "搜索标题、标签或摘要";
    searchInput.setAttribute("aria-label", "搜索文章标题、标签或摘要");
  }

  searchCount.textContent = isSearching
    ? `找到 ${items.length} 篇${isCategory ? ` / 共 ${all.length} 篇` : ""}`
    : `${items.length} 篇${isCategory ? ` / 共 ${records.length} 篇` : ""}`;

  timeline.classList.toggle("is-searching", isSearching);
  renderTimeline(items);

  timeline.hidden = items.length === 0;
  emptyState.hidden = items.length !== 0;
  emptyState.querySelector("p")!.textContent = isSearching
    ? "没有找到匹配的文章。"
    : "这一类还没有公开文章。";
  emptyClear.hidden = !isSearching;
  searchClear.hidden = !isSearching;

  document.title = isCategory
    ? `${category} · ${getSiteTitle()}`
    : `时间轴 · ${getSiteTitle()}`;
}

function renderCategories() {
  state.lastListing = { name: "categories" };
  const query = state.query.trim().toLowerCase();
  const isSearching = query.length > 0;

  const matches = (post: ArchiveRecord) => {
    if (!query) return true;
    return [
      post.title,
      post.abstract,
      post.category,
      post.tags.join(" "),
      post.id,
      post.slug,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  };

  const groups = archiveColumns
    .map((category) => {
      const all = records.filter((p) => p.category === category);
      return { category, all, items: all.filter(matches) };
    })
    .filter((g) => g.items.length > 0);

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  catKicker.textContent = "Index · Categories";
  catTitle.textContent = "分类";
  catDesc.textContent =
    "按类别归档的全部文章。每个分类标题可以进入该类的时间轴，日期与标题逐行排列。";
  catMeta.innerHTML = [
    `<span>${isSearching ? `${groups.length} 个分类命中` : "按分类归档"}</span>`,
    `<a href="#/">时间轴 →</a>`,
  ].join("");

  searchInput.placeholder = "搜索全部标题、标签或摘要";
  searchInput.setAttribute("aria-label", "搜索全部文章");
  searchCount.textContent = isSearching
    ? `找到 ${total} 篇`
    : `${archiveColumns.length} 个分类 / ${records.length} 篇`;
  searchClear.hidden = !isSearching;

  categoryArchive.innerHTML = groups
    .map((group) => {
      const rows = group.items
        .map(
          (post) => `
            <li class="cat-item">
              <time datetime="${post.date}">${post.date.replace(/-/g, ".")}</time>
              <a href="#post/${post.slug}">${escapeHtml(post.title)}</a>
            </li>`,
        )
        .join("");
      const count = isSearching
        ? `${group.items.length} / ${group.all.length} 篇`
        : `${group.all.length} 篇`;
      return `
        <section class="cat-group" aria-label="${escapeHtml(group.category)}">
          <h2 class="cat-head">
            <a href="#/category/${encodeURIComponent(group.category)}">${escapeHtml(group.category)}</a>
            <span class="cat-count">${count}</span>
          </h2>
          <ul class="cat-list">${rows}</ul>
        </section>`;
    })
    .join("");

  categoryArchive.hidden = groups.length === 0;
  catEmpty.hidden = groups.length !== 0;
  catEmptyClear.hidden = !isSearching;
  document.title = `分类 · ${getSiteTitle()}`;
}

function renderAbout() {
  const topicList = document.getElementById("topicList")!;
  topicList.innerHTML = archiveColumns
    .map((category) => {
      const count = records.filter((p) => p.category === category).length;
      return `
        <li>
          <a href="#/category/${encodeURIComponent(category)}">
            <span>${escapeHtml(category)}</span>
            <span class="count">${String(count).padStart(2, "0")} 篇</span>
          </a>
        </li>`;
    })
    .join("");

  const factPostCount = document.getElementById("factPostCount");
  if (factPostCount) factPostCount.textContent = `${records.length} 篇`;

  const factCatCount = document.getElementById("factCatCount");
  if (factCatCount) factCatCount.textContent = `${archiveColumns.length} 类`;

  const factLatestDate = document.getElementById("factLatestDate");
  if (factLatestDate && records.length) {
    const latest = records.reduce(
      (max, p) => (p.date > max ? p.date : max),
      "",
    );
    factLatestDate.textContent = latest.replace(/-/g, ".");
  }
}

/* ---------- 视图路由分发 ---------- */
async function renderRoute() {
  const route = parseRoute();
  state.route = route;
  updateNav(route);

  // If hash has search param (?q=...)
  const searchMatch = /[?&]q=([^&]+)/.exec(location.hash);
  if (searchMatch) {
    state.query = decodeURIComponent(searchMatch[1]);
    searchInput.value = state.query;
  }

  if (route.name === "about") {
    cleanupReader();
    setPage("about");
    searchShell.hidden = true;
    searchCount.hidden = true;
    renderAbout();
    document.title = `关于 · ${getSiteTitle()}`;
    window.scrollTo(0, 0);
    return;
  }

  if (route.name === "post") {
    setPage("post");
    searchShell.hidden = true;
    searchCount.hidden = true;
    window.scrollTo(0, 0);
    const found = await renderPost(route.slug, state.lastListing);
    if (!found) {
      // Fall back to timeline if article slug not found
      history.replaceState(null, "", "#/");
      renderRoute();
    }
    return;
  }

  cleanupReader();

  if (route.name === "categories") {
    setPage("categories");
    searchShell.hidden = false;
    searchCount.hidden = false;
    renderCategories();
    window.scrollTo(0, 0);
    return;
  }

  setPage("listing");
  searchShell.hidden = false;
  searchCount.hidden = false;
  renderListing();
  window.scrollTo(0, 0);
}

function refreshCurrentView() {
  if (state.route.name === "categories") renderCategories();
  else if (state.route.name === "timeline" || state.route.name === "category") {
    renderListing();
  }
}

/* ---------- 搜索输入事件 ---------- */
searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  refreshCurrentView();
});

searchClear.addEventListener("click", () => {
  clearSearch();
  refreshCurrentView();
  searchInput.focus();
});

emptyClear.addEventListener("click", () => {
  clearSearch();
  refreshCurrentView();
  searchInput.focus();
});

catEmptyClear.addEventListener("click", () => {
  clearSearch();
  refreshCurrentView();
  searchInput.focus();
});

document.addEventListener("keydown", (e) => {
  const target = e.target;
  const isTyping =
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

  if (e.key === "/" && !isTyping && !searchShell.hidden) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }

  if (e.key === "Escape" && document.activeElement === searchInput) {
    if (searchInput.value) {
      clearSearch();
      refreshCurrentView();
    } else {
      searchInput.blur();
    }
  }
});

/* ---------- 初始化 ---------- */
window.addEventListener("hashchange", renderRoute);
connectSite();
renderAbout();
renderRoute();
