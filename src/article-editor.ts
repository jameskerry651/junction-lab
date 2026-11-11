import Vditor from "vditor";
import { contextRange, type Scope, type Context } from "./ai-context";
import { sourceHighlight } from "./source-highlight";
import "vditor/dist/index.css";
import "./article-editor.css";

type Photo = { name: string; scope: string; size: number };
type Options = {
  value: string;
  api: (route: string, method?: string, data?: unknown) => Promise<any>;
  visibility: () => string;
  onChange: () => void;
  onSave: () => void;
  notify: (message: string, error?: boolean) => void;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const diagramLanguages = new Set([
  "abc",
  "mermaid",
  "smiles",
  "markmap",
  "flowchart",
  "echarts",
  "mindmap",
  "plantuml",
  "graphviz",
  "wavedrom",
]);
// Our publishing pipeline treats diagram fences as code. Do the same in previews,
// avoiding executable chart definitions and third-party diagram rendering services.
function safePreview(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("[class]").forEach((code) => {
    for (const name of code.classList)
      if (diagramLanguages.has(name.replace(/^language-/, "")))
        code.classList.remove(name);
  });
  return doc.body.innerHTML;
}
type EditorHandle = {
  getValue(): string;
  getContext(scope: Scope): Context;
  replaceMarkdown(expected: string, next: string): void;
  readonly ready: boolean;
  readonly uploading: boolean;
  preview(): void;
  lock(locked: boolean): void;
  destroy(): void;
};
// Returned when the view closes while the icon sprite is still loading, so the
// caller always receives a usable handle and no Vditor instance is leaked.
const inertEditor = (value: string): EditorHandle => ({
  getValue: () => value,
  getContext: (scope) => contextRange(value, scope),
  replaceMarkdown: () => {
    throw Error("编辑器已关闭");
  },
  ready: false,
  uploading: false,
  preview: () => {},
  lock: () => {},
  destroy: () => {},
});
// Vditor loads its SVG icon sprite with addScriptSync(), which runs the fetched
// file as an inline <script>. The production CSP forbids inline scripts, so the
// sprite is loaded here as a same-origin external script under the id Vditor
// checks; Vditor then skips its own injection and the <use> refs still resolve.
const ICON_SPRITE = "/vendor/vditor/dist/js/icons/ant.js";
function loadIconSprite() {
  if (document.getElementById("vditorIconScript")) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.id = "vditorIconScript";
    script.src = ICON_SPRITE;
    script.addEventListener("load", () => resolve(), { once: true });
    // On failure remove the stub so Vditor falls back to its own loader.
    script.addEventListener(
      "error",
      () => {
        script.remove();
        resolve();
      },
      { once: true },
    );
    document.head.append(script);
  });
}
export async function createArticleEditor(
  host: HTMLElement,
  options: Options,
): Promise<EditorHandle> {
  let alive = true,
    ready = false,
    changed = false,
    uploading = false,
    previewRequest = 0;
  let editor: Vditor;
  let highlighting: ReturnType<typeof sourceHighlight> | undefined;
  const dialogs = new Set<HTMLDialogElement>();
  const abort = new AbortController();
  const signal = abort.signal;
  let original = options.value;
  let locked = false;
  let selection: { body: string; start: number; end: number } | null = null;
  const value = () => (changed ? editor.getValue() : original);
  const guard = (fn: () => Promise<unknown>) => {
    void fn().catch((error) => {
      if (alive) options.notify(error.message, true);
    });
  };
  function modal(title: string, body: string) {
    const dialog = document.createElement("dialog");
    dialog.className = "editor-dialog";
    dialog.setAttribute("aria-label", title);
    dialog.innerHTML = `<div class="editor-dialog-head"><h2>${escape(title)}</h2><button type="button" data-dismiss aria-label="关闭">×</button></div>${body}`;
    document.body.append(dialog);
    dialogs.add(dialog);
    const previous = document.activeElement as HTMLElement | null;
    dialog
      .querySelector("[data-dismiss]")!
      .addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialogs.delete(dialog);
      dialog.remove();
      if (previous?.isConnected) previous.focus();
    });
    dialog.showModal();
    return dialog;
  }
  async function upload(files: File[]) {
    if (uploading) {
      options.notify("图片正在上传，请稍候", true);
      return null;
    }
    uploading = true;
    const scope = options.visibility() === "private" ? "private" : "public";
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw Error("图片不得超过 10MB");
        if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))
          throw Error("请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(Error("无法读取图片"));
          reader.readAsDataURL(file);
        });
        const result = await options.api("images", "POST", {
          name: file.name,
          scope,
          data,
        });
        if (!alive) return null;
        const alt = file.name.replace(/[\[\]\\\n]/g, " ");
        editor.insertValue(
          `\n![${alt}](../images/${encodeURIComponent(result.name)})\n`,
        );
        changed = true;
        options.onChange();
      }
      if (alive) options.notify(`已插入 ${files.length} 张图片`);
      return null;
    } catch (error) {
      const message = (error as Error).message;
      if (alive) options.notify(message, true);
      return null;
    } finally {
      uploading = false;
    }
  }
  async function library() {
    const dialog = modal(
      "插入图片",
      `<p class="muted">选择资源库中的图片。也可直接把图片粘贴或拖入正文。</p><label>搜索图片<input type="search" data-search placeholder="按文件名搜索"></label><div class="editor-library">正在加载图片…</div>`,
    );
    const photos: Photo[] = await options.api("images");
    if (!dialog.isConnected) return;
    const grid = dialog.querySelector<HTMLElement>(".editor-library")!;
    const show = (query = "") => {
      const visible = photos.filter(
        (p) =>
          (options.visibility() !== "public" || p.scope === "public") &&
          p.name.toLowerCase().includes(query.toLowerCase()),
      );
      grid.innerHTML =
        visible
          .map(
            (p) =>
              `<button type="button" data-image="${escape(p.name)}"><img loading="lazy" src="/api/image?scope=${p.scope}&name=${encodeURIComponent(p.name)}" alt="${escape(p.name)}"><span>${escape(p.name)}</span><small>${p.scope === "private" ? "私密图片" : "公开资源"} · ${(p.size / 1024).toFixed(0)} KB</small></button>`,
          )
          .join("") ||
        '<p class="empty">没有匹配的图片，请使用工具栏上传。</p>';
    };
    show();
    dialog
      .querySelector("input")!
      .addEventListener("input", (e) =>
        show((e.target as HTMLInputElement).value),
      );
    grid.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-image]",
      );
      if (!button) return;
      dialog.close();
      editor.insertValue(
        `\n![图片](../images/${encodeURIComponent(button.dataset.image!)})\n`,
      );
      changed = true;
      options.onChange();
    });
  }
  function formula() {
    const dialog = modal(
      "插入数学公式",
      `<form class="formula-form"><label>公式类型<select name="kind"><option value="block">独立公式块</option><option value="inline">行内公式</option></select></label><label>LaTeX 公式<textarea name="formula" rows="5" required placeholder="例如：E = mc^2" spellcheck="false"></textarea></label><button type="submit" class="primary">插入公式</button></form>`,
    );
    dialog.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget as HTMLFormElement);
      const formula = String(data.get("formula")).trim();
      if (!formula) return;
      dialog.close();
      editor.insertValue(
        data.get("kind") === "inline"
          ? `$${formula.replace(/\n/g, " ")}$`
          : `\n$$\n${formula}\n$$\n`,
      );
      changed = true;
      options.onChange();
    });
  }
  async function preview() {
    const request = ++previewRequest;
    const dialog = modal(
      "发布效果预览",
      '<div class="prose editor-publish-preview">正在生成预览…</div>',
    );
    const result = await options.api("preview", "POST", { body: value() });
    if (alive && dialog.isConnected && request === previewRequest)
      dialog.querySelector(".prose")!.innerHTML = result.html;
  }
  host.addEventListener(
    "input",
    () => {
      if (alive && ready) {
        changed = true;
        options.onChange();
      }
    },
    { signal },
  );
  const labelInputs = () =>
    host
      .querySelectorAll<HTMLElement>("[contenteditable=true]")
      .forEach((el) => {
        el.setAttribute("role", "textbox");
        el.setAttribute("aria-label", "文章正文");
        el.setAttribute("aria-multiline", "true");
      });
  const observer = new MutationObserver(labelInputs);
  observer.observe(host, { childList: true, subtree: true });
  // Must finish before Vditor mounts, otherwise its loader wins the race.
  await loadIconSprite();
  if (!host.isConnected) return inertEditor(options.value);
  host.replaceChildren();
  editor = new Vditor(host, {
    cdn: "/vendor/vditor",
    mode: "sv",
    lang: "zh_CN",
    value: original,
    height: "100%",
    minHeight: 360,
    cache: { enable: false },
    placeholder: "从这里开始写作… 选中文字排版，或直接粘贴、拖入图片。",
    toolbarConfig: { pin: true },
    outline: { enable: false, position: "right" },
    counter: { enable: true, type: "text" },
    link: { isOpen: false },
    hint: { emojiPath: "/vendor/vditor/dist/images/emoji" },
    preview: {
      delay: 250,
      mode: "both",
      maxWidth: 900,
      actions: [],
      theme: {
        current: "light",
        path: "/vendor/vditor/dist/css/content-theme",
      },
      markdown: {
        sanitize: true,
        codeBlockPreview: false,
        mathBlockPreview: true,
        footnotes: false,
        mark: false,
      },
      math: { engine: "KaTeX" },
      render: { media: { enable: false } },
      transform: safePreview,
    },
    toolbar: [
      "undo",
      "redo",
      "|",
      "headings",
      "bold",
      "italic",
      "strike",
      "|",
      "list",
      "ordered-list",
      "check",
      "outdent",
      "indent",
      "|",
      "quote",
      "line",
      "link",
      "inline-code",
      "code",
      "table",
      "|",
      {
        name: "formula",
        tip: "插入数学公式",
        icon: '<span class="editor-tool-symbol">∑</span>',
        click: formula,
      },
      "upload",
      {
        name: "library",
        tip: "图片资源库",
        icon: '<span class="editor-tool-symbol">▧</span>',
        click: () => guard(library),
      },
      "|",
      "edit-mode",
      "both",
      "outline",
      "fullscreen",
      {
        name: "publish-preview",
        tip: "查看实际发布效果",
        icon: '<span class="editor-tool-symbol">↗</span>',
        click: () => guard(preview),
      },
    ],
    upload: {
      accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
      max: 10 * 1024 * 1024,
      multiple: true,
      handler: upload,
    },
    after: () => {
      if (!alive) {
        editor.destroy();
        return;
      }
      highlighting = sourceHighlight(host);
      ready = true;
      host
        .querySelectorAll<HTMLElement>("[contenteditable=true]")
        .forEach((el) => {
          el.setAttribute("role", "textbox");
          el.setAttribute("aria-label", "文章正文");
          el.setAttribute("aria-multiline", "true");
        });
      host.dispatchEvent(new CustomEvent("editor-ready"));
    },
    input: () => {
      highlighting?.refresh();
      if (alive && ready) {
        changed = true;
        options.onChange();
      }
    },
  });
  // The toolbar/popup lives inside the metadata form; only the explicit Save
  // button may submit it. Vditor's built-in toolbar buttons already use type=button.
  const keydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (ready && !uploading) options.onSave();
    }
  };
  document.addEventListener("keydown", keydown, { signal });
  const captureSelection = () => {
    if (!ready || !alive) return;
    const body = value();
    const input = host.querySelector<HTMLTextAreaElement>("textarea.vditor-sv");
    if (editor.getCurrentMode() === "sv") {
      if (!input || document.activeElement !== input) return;
      if (input.value === body)
        selection = {
          body,
          start: input.selectionStart,
          end: input.selectionEnd,
        };
      else {
        const selected = input.value.slice(
          input.selectionStart,
          input.selectionEnd,
        );
        const start = selected ? body.indexOf(selected) : -1;
        selection =
          start >= 0 && body.indexOf(selected, start + 1) < 0
            ? { body, start, end: start + selected.length }
            : null;
      }
    } else {
      const range = window.getSelection();
      if (!range?.anchorNode || !host.contains(range.anchorNode)) return;
      if (!range.toString()) {
        selection = null;
        return;
      }
      const selected = editor.getSelection();
      const start = selected ? body.indexOf(selected) : -1;
      selection =
        start >= 0 && body.indexOf(selected, start + 1) < 0
          ? { body, start, end: start + selected.length }
          : null;
    }
  };
  for (const event of ["keyup", "mouseup", "select", "input", "focusout"])
    host.addEventListener(event, captureSelection, { signal });
  document.addEventListener("selectionchange", captureSelection, { signal });
  return {
    getValue: value,
    getContext(scope) {
      const body = value();
      if (scope === "document") return contextRange(body, scope);
      if (!selection || selection.body !== body)
        throw Error(
          "请在正文中重新选择文字或放置光标；复杂富文本选区请切换源码模式，或选择全文",
        );
      return contextRange(body, scope, selection.start, selection.end);
    },
    replaceMarkdown(expected, next) {
      if (!alive || !ready || locked || uploading)
        throw Error("编辑器正在保存或上传，请稍后重试");
      if (value() !== expected)
        throw Error(
          "正文已变化，未应用旧建议。请重新生成，或撤销后续编辑后再试。",
        );
      editor.setValue(next);
      original = next;
      changed = false;
      selection = null;
      highlighting?.refresh();
      options.onChange();
    },
    get ready() {
      return ready;
    },
    get uploading() {
      return uploading;
    },
    preview: () => guard(preview),
    lock(nextLocked: boolean) {
      locked = nextLocked;
      if (alive && ready) {
        if (locked) editor.disabled();
        else editor.enable();
      }
    },
    destroy() {
      alive = false;
      abort.abort();
      observer.disconnect();
      highlighting?.destroy();
      dialogs.forEach((d) => d.close());
      if (ready) editor.destroy();
    },
  };
}
export type ArticleEditor = EditorHandle;
