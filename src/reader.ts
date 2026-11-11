import { records, escapeHtml, type ArchiveRecord } from "./data";
import { getSiteTitle } from "./site";

let currentRequest = 0;
let tocObserver: IntersectionObserver | null = null;

function onScrollProgress() {
  const progressEl = document.getElementById("readingProgress");
  if (!progressEl || progressEl.hidden) return;
  const docEl = document.documentElement;
  const total = docEl.scrollHeight - window.innerHeight;
  if (total <= 0) {
    progressEl.style.width = "0%";
    return;
  }
  const pct = Math.min(100, Math.max(0, (window.scrollY / total) * 100));
  progressEl.style.width = `${pct}%`;
}

async function copyCode(text: string, token: number): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back to execCommand for non-HTTPS or older browsers
  }
  if (token !== currentRequest) throw new Error("Article changed");
  const focused = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const field = document.createElement("textarea");
  field.value = text;
  field.className = "reader-copy-buffer";
  field.setAttribute("aria-label", "复制代码缓冲区");
  field.readOnly = true;
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("Copy unavailable");
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
    selection?.removeAllRanges();
    ranges.forEach((range) => selection?.addRange(range));
  }
}

function enhanceCodeBlocks(body: HTMLElement, token: number) {
  body.querySelectorAll<HTMLElement>("pre > code").forEach((code, i) => {
    const pre = code.parentElement;
    if (!pre) return;
    const block = document.createElement("div");
    block.className = "reader-code-block";

    const toolbar = document.createElement("div");
    toolbar.className = "reader-code-toolbar";

    const language = document.createElement("span");
    language.className = "code-lang";
    language.textContent =
      Array.from(code.classList)
        .find((name) => name.startsWith("language-") || name.startsWith("hljs"))
        ?.replace(/^(language-|hljs)/, "")
        .trim() || "纯文本";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "复制代码";
    button.setAttribute("aria-label", `复制第 ${i + 1} 个代码块`);

    const status = document.createElement("span");
    status.className = "reader-copy-status";
    status.setAttribute("role", "status");

    let copying = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    button.onclick = async () => {
      if (copying) return;
      copying = true;
      clearTimeout(resetTimer);
      button.setAttribute("aria-disabled", "true");
      try {
        await copyCode(code.textContent ?? "", token);
        if (token !== currentRequest) return;
        button.textContent = "已复制 ✓";
        button.classList.add("is-copied");
        status.textContent = "已复制";
      } catch {
        if (token !== currentRequest) return;
        button.textContent = "重试复制";
        status.textContent = "复制失败";
      } finally {
        copying = false;
        button.removeAttribute("aria-disabled");
      }
      resetTimer = setTimeout(() => {
        button.textContent = "复制代码";
        button.classList.remove("is-copied");
        status.textContent = "";
      }, 3000);
    };

    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `代码块 ${i + 1}，可横向滚动`);
    toolbar.append(language, status, button);
    pre.replaceWith(block);
    block.append(toolbar, pre);
  });
}

function buildToc(postBody: HTMLElement, tocList: HTMLElement) {
  tocObserver?.disconnect();
  const headings = Array.from(postBody.querySelectorAll<HTMLElement>("h2, h3"));
  if (!headings.length) {
    tocList.innerHTML = `<li style="padding: 8px 14px; color: var(--faint); font-size: 12px;">本文暂无章节标题</li>`;
    return;
  }

  let h2Count = 0;
  tocList.innerHTML = headings
    .map((heading, index) => {
      heading.id = heading.id || `section-${index + 1}`;
      const isH2 = heading.tagName === "H2";
      if (isH2) h2Count++;
      const secnumEl = heading.querySelector(".secnum");
      const num =
        secnumEl?.textContent?.trim() ||
        (isH2 ? String(h2Count).padStart(2, "0") : "·");
      const text =
        heading.textContent?.replace(secnumEl?.textContent || "", "").trim() ||
        "";
      const indentStyle = isH2
        ? ""
        : ' style="padding-left: 24px; font-size: 11.5px;"';
      return `
        <li>
          <a href="#${heading.id}" data-toc-link${indentStyle}>
            <span class="toc-num">${escapeHtml(num)}</span>
            <span>${escapeHtml(text)}</span>
          </a>
        </li>`;
    })
    .join("");

  // Smooth scroll handler without changing route hash
  tocList.onclick = (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      "[data-toc-link]",
    );
    if (!link) return;
    e.preventDefault();
    const targetId = link.getAttribute("href")?.slice(1);
    if (!targetId) return;
    const heading = document.getElementById(targetId);
    if (heading) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!("IntersectionObserver" in window)) return;

  tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        tocList
          .querySelectorAll<HTMLAnchorElement>("[data-toc-link]")
          .forEach((link) => {
            link.classList.toggle(
              "is-current",
              link.getAttribute("href") === `#${entry.target.id}`,
            );
          });
      });
    },
    { rootMargin: "-12% 0px -72% 0px" },
  );

  headings.forEach((heading) => tocObserver?.observe(heading));
}

export function cleanupReader() {
  currentRequest++;
  tocObserver?.disconnect();
  tocObserver = null;
  window.removeEventListener("scroll", onScrollProgress);
  const progressEl = document.getElementById("readingProgress");
  if (progressEl) {
    progressEl.hidden = true;
    progressEl.style.width = "0%";
  }
}

export async function renderPost(
  slug: string,
  lastListing: { name: string; category?: string },
): Promise<boolean> {
  const token = ++currentRequest;
  const post = records.find(
    (p) =>
      p.slug === slug || p.id === slug || p.id === `X-${slug.padStart(3, "0")}`,
  );

  if (!post) {
    return false;
  }

  // Show and reset reading progress gauge
  const progressEl = document.getElementById("readingProgress");
  if (progressEl) {
    progressEl.hidden = false;
    progressEl.style.width = "0%";
  }
  window.removeEventListener("scroll", onScrollProgress);
  window.addEventListener("scroll", onScrollProgress, { passive: true });

  // Populate metadata
  const postCategory = document.getElementById("postCategory")!;
  const postDate = document.getElementById("postDate")!;
  const postId = document.getElementById("postId")!;
  const postTitle = document.getElementById("postTitle")!;
  const postAuthor = document.getElementById("postAuthor")!;
  const postRead = document.getElementById("postRead")!;
  const postUpdated = document.getElementById("postUpdated")!;
  const postTags = document.getElementById("postTags")!;
  const backLink = document.getElementById("backLink") as HTMLAnchorElement;
  const postBody = document.getElementById("postBody")!;
  const tocList = document.getElementById("tocList")!;

  postCategory.textContent = post.category;
  postDate.textContent = post.date.replace(/-/g, ".");
  postId.textContent = post.id;
  postTitle.textContent = post.title;
  postAuthor.textContent = post.lead || "James";
  postRead.textContent = post.clearance;
  postUpdated.textContent = `修订 ${(post.updatedAt || post.date).replace(/-/g, ".")}`;

  if (post.tags && post.tags.length) {
    postTags.innerHTML = post.tags
      .map(
        (t) =>
          `<a href="#/?q=${encodeURIComponent(t)}" class="post-tag">#${escapeHtml(t)}</a>`,
      )
      .join("");
    postTags.hidden = false;
  } else {
    postTags.innerHTML = "";
    postTags.hidden = true;
  }

  // Back link
  if (lastListing.name === "category" && lastListing.category) {
    backLink.textContent = `← 返回${lastListing.category}`;
    backLink.href = `#/category/${encodeURIComponent(lastListing.category)}`;
  } else if (lastListing.name === "categories") {
    backLink.textContent = "← 返回分类";
    backLink.href = "#/categories";
  } else {
    backLink.textContent = "← 返回时间轴";
    backLink.href = "#/";
  }

  // Prev / Next article
  const currentIndex = records.findIndex((r) => r.id === post.id);
  const newer = currentIndex > 0 ? records[currentIndex - 1] : null;
  const older =
    currentIndex >= 0 && currentIndex < records.length - 1
      ? records[currentIndex + 1]
      : null;

  let postNav = document.getElementById("postNav");
  if (!postNav) {
    postNav = document.createElement("nav");
    postNav.id = "postNav";
    postNav.className = "post-nav";
    postNav.setAttribute("aria-label", "相邻文章");
    postBody.parentElement?.append(postNav);
  }

  postNav.innerHTML = `
    ${
      older
        ? `<a class="post-nav-item older" href="#post/${older.slug}">
             <span class="post-nav-dir">← 较早记录</span>
             <span class="post-nav-title">${escapeHtml(older.title)}</span>
           </a>`
        : `<span class="post-nav-item disabled"></span>`
    }
    ${
      newer
        ? `<a class="post-nav-item newer" href="#post/${newer.slug}">
             <span class="post-nav-dir">较新记录 →</span>
             <span class="post-nav-title">${escapeHtml(newer.title)}</span>
           </a>`
        : `<span class="post-nav-item disabled"></span>`
    }
  `;

  document.title = `${post.title} · ${getSiteTitle()}`;
  window.dispatchEvent(new Event("junction:read"));

  postBody.innerHTML = `<p style="color: var(--muted); padding: 40px 0;">正在加载正文…</p>`;
  tocList.innerHTML = `<li style="padding: 8px 14px; color: var(--faint); font-size: 12px;">正在读取目录…</li>`;

  try {
    const response = await fetch(post.htmlUrl);
    if (!response.ok) throw new Error("Article unavailable");
    const html = await response.text();
    if (token !== currentRequest) return true;

    postBody.innerHTML = html;

    // Wrap tables
    postBody.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
      if (!table.parentElement?.classList.contains("table-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        table.replaceWith(wrap);
        wrap.append(table);
      }
    });

    // Handle external links
    postBody.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
      if (a.origin !== location.origin) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });

    // Enhance code blocks
    enhanceCodeBlocks(postBody, token);

    // Build TOC
    buildToc(postBody, tocList);

    // Initial progress computation
    onScrollProgress();
  } catch {
    if (token === currentRequest) {
      postBody.innerHTML = `<p style="color: var(--accent); padding: 40px 0;">文章内容暂时无法读取，请稍后刷新重试。</p>`;
      tocList.innerHTML = `<li style="padding: 8px 14px; color: var(--faint); font-size: 12px;">目录不可用</li>`;
    }
  }

  return true;
}
