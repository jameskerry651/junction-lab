import type { ArticleEditor } from "./article-editor";
import { applyEdits, type Context, type Edit, type Scope } from "./ai-context";
import "./ai-assistant.css";
type Options = {
  editor: ArticleEditor;
  workspace: HTMLElement;
  toggle: HTMLButtonElement;
  csrf: () => string;
  title: () => string;
  visibility: () => string;
  notify: (message: string, error?: boolean) => void;
  onOpen: () => void;
};
type Result = {
  type: string;
  mode?: string;
  text?: string;
  explanation?: string;
  edits?: Edit[];
  message?: string;
};
export function createAiAssistant(options: Options) {
  const panel = document.createElement("aside");
  panel.id = "ai-assistant";
  panel.className = "ai-assistant";
  panel.hidden = true;
  panel.setAttribute("aria-label", "AI 写作助手");
  panel.innerHTML = `<header class="ai-head"><div><strong>AI 写作助手</strong><small>讨论思路 · 审阅修改</small></div><button type="button" data-close aria-label="关闭 AI 助手">×</button></header>
    <div class="ai-controls"><div class="ai-row"><label>工作模式<select data-mode aria-label="工作模式"><option value="ask">问答</option><option value="edit">修改正文</option></select></label><label>发送范围<select data-scope aria-label="发送范围"><option value="selection">选中内容</option><option value="chapter">当前章节</option><option value="document">全文</option></select></label></div>
    <p class="ai-privacy"></p><p class="ai-connection" role="status">正在检查模型配置…</p><button type="button" data-refresh>刷新连接状态</button>
    <details class="ai-preferences"><summary>写作偏好</summary><textarea data-preferences rows="3" maxlength="1000" aria-label="写作偏好">保留我的语气，表达简洁，不擅自改变技术结论，保留代码、公式和图片链接。</textarea></details>
    <div class="ai-shortcuts"><button type="button" data-preset="polish">润色</button><button type="button" data-preset="shorten">精简</button><button type="button" data-preset="expand">扩写</button><button type="button" data-preset="translate">翻译</button><button type="button" data-preset="explain">解释</button><button type="button" data-preset="metadata">标题 / 摘要 / 标签</button></div></div>
    <div class="ai-messages" aria-label="助手对话"><p class="ai-empty">选中一段正文，再提出问题或修改要求。修改会先显示对照，采纳后仍需保存。</p></div>
    <div class="ai-composer"><label for="ai-prompt">你的要求</label><textarea id="ai-prompt" rows="3" maxlength="2000" placeholder="例如：让这段更易懂，保留技术细节"></textarea><div class="ai-row ai-actions"><button type="button" data-clear>清空对话</button><button type="button" data-undo disabled>撤销上次采纳</button><button type="button" data-stop hidden>停止</button><button type="button" class="primary" data-send disabled>发送</button></div><p class="ai-status" role="status" aria-live="polite"></p></div>`;
  options.workspace.append(panel);
  const get = <T extends HTMLElement>(selector: string) =>
    panel.querySelector<T>(selector)!;
  const mode = get<HTMLSelectElement>("[data-mode]");
  const scope = get<HTMLSelectElement>("[data-scope]");
  const prompt = get<HTMLTextAreaElement>("#ai-prompt");
  const preferences = get<HTMLTextAreaElement>("[data-preferences]");
  const messages = get<HTMLDivElement>(".ai-messages");
  const status = get<HTMLParagraphElement>(".ai-status");
  const send = get<HTMLButtonElement>("[data-send]");
  const stop = get<HTMLButtonElement>("[data-stop]");
  const undo = get<HTMLButtonElement>("[data-undo]");
  let alive = true,
    configured = false,
    busy = false,
    turn = 0;
  let controller: AbortController | null = null;
  let activeMessage: HTMLElement | null = null;
  const lifecycle = new AbortController();
  let history: { role: string; content: string }[] = [];
  const undoStack: { before: string; after: string }[] = [];
  let lastRequest: {
    context: Context;
    mode: string;
    instruction: string;
    preferences: string;
  } | null = null;
  const privacy = () => {
    get(".ai-privacy").textContent =
      `${options.visibility() === "public" ? "" : "草稿 / 私密内容："}点击发送会将所选范围、标题、偏好及本篇最近对话发送到已配置的模型服务。对话仅保留在本页。`;
  };
  const setBusy = (value: boolean) => {
    busy = value;
    send.disabled = value || !configured;
    stop.hidden = !value;
    mode.disabled = value;
    scope.disabled = value;
    panel
      .querySelectorAll<HTMLButtonElement>(
        "[data-preset], [data-clear], [data-refresh]",
      )
      .forEach((button) => (button.disabled = value));
    undo.disabled = value || !undoStack.length;
    send.textContent = lastRequest ? "发送 / 重试" : "发送";
  };
  const stopGeneration = () => {
    if (!busy) return;
    turn++;
    if (activeMessage) {
      const note = document.createElement("p");
      note.className = "ai-error";
      note.textContent = "已停止生成，未完成的建议不可采纳。";
      activeMessage.append(note);
    }
    controller?.abort();
    controller = null;
    setBusy(false);
    status.textContent =
      "已停止，未完成的回复不会应用到正文。可点击发送 / 重试。";
  };
  const mobile = matchMedia("(max-width: 700px)");
  const syncInert = () => {
    const isolated = !panel.hidden && mobile.matches;
    options.workspace
      .querySelectorAll<HTMLElement>(":scope > :not(#ai-assistant)")
      .forEach((el) => (el.inert = isolated));
    const toolbar = document.querySelector<HTMLElement>(
      ".article-page-toolbar",
    );
    if (toolbar) toolbar.inert = isolated;
  };
  mobile.addEventListener("change", syncInert, { signal: lifecycle.signal });
  function show(open: boolean) {
    if (open) options.onOpen();
    else stopGeneration();
    panel.hidden = !open;
    syncInert();
    options.workspace.classList.toggle("ai-open", open);
    options.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      privacy();
      prompt.focus();
    } else options.toggle.focus();
  }
  async function refreshStatus() {
    get(".ai-connection").textContent = "正在检查模型配置…";
    configured = false;
    send.disabled = true;
    try {
      const res = await fetch("/api/ai/status", { signal: lifecycle.signal });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "无法读取 AI 配置");
      if (!alive) return;
      configured = data.ready;
      get(".ai-connection").textContent = data.ready
        ? `${data.model} · ${data.provider}`
        : data.message;
    } catch (e) {
      if (alive) get(".ai-connection").textContent = (e as Error).message;
    }
    if (alive) setBusy(busy);
  }
  function apply(expected: string, next: string) {
    options.editor.replaceMarkdown(expected, next);
    undoStack.push({ before: expected, after: next });
    if (undoStack.length > 10) undoStack.shift();
    undo.disabled = busy;
    status.textContent = "已写入正文，可撤销；点击保存后才会保存文章。";
  }
  function renderEdits(
    container: HTMLElement,
    context: Context,
    edits: Edit[],
  ) {
    // Validate before presenting any actionable button.
    applyEdits(context, edits, new Set());
    let expected = context.body;
    const accepted = new Set<number>();
    if (!edits.length) {
      const p = document.createElement("p");
      p.textContent = "没有需要应用的修改。";
      container.append(p);
    }
    edits.forEach((edit, index) => {
      const card = document.createElement("section");
      card.className = "ai-edit";
      const why = document.createElement("p");
      why.textContent = edit.reason;
      const diff = document.createElement("details");
      diff.open = true;
      const summary = document.createElement("summary");
      summary.textContent = `修改 ${index + 1} · 查看原文与建议`;
      const columns = document.createElement("div");
      columns.className = "ai-diff";
      for (const [label, content, className] of [
        ["原文", edit.original, "ai-before"],
        ["建议", edit.replacement, "ai-after"],
      ]) {
        const item = document.createElement("div");
        item.className = className;
        const title = document.createElement("small");
        title.textContent = label;
        const pre = document.createElement("pre");
        pre.textContent = content || "（空）";
        item.append(title, pre);
        columns.append(item);
      }
      diff.append(summary, columns);
      const actions = document.createElement("div");
      actions.className = "ai-row";
      const accept = document.createElement("button");
      accept.type = "button";
      accept.textContent = "采纳此项";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.textContent = "放弃";
      accept.onclick = () => {
        try {
          const nextAccepted = new Set(accepted).add(index);
          const next = applyEdits(context, edits, nextAccepted);
          apply(expected, next);
          expected = next;
          accepted.add(index);
          accept.disabled = true;
          discard.disabled = true;
          accept.textContent = "已采纳";
        } catch (e) {
          status.textContent = (e as Error).message;
        }
      };
      discard.onclick = () => {
        accept.disabled = true;
        discard.disabled = true;
        discard.textContent = "已放弃";
        diff.open = false;
      };
      actions.append(accept, discard);
      card.append(why, diff, actions);
      container.append(card);
    });
  }
  async function generate() {
    if (busy || !configured) return;
    let context: Context;
    const instruction = prompt.value.trim();
    if (!instruction) {
      status.textContent = "请先输入问题或修改要求";
      prompt.focus();
      return;
    }
    try {
      // Retrying a stopped/failed request is valid only while its snapshot is current.
      context =
        lastRequest &&
        lastRequest.instruction === instruction &&
        lastRequest.mode === mode.value &&
        lastRequest.context.body === options.editor.getValue()
          ? lastRequest.context
          : options.editor.getContext(scope.value as Scope);
      if (context.text.length > 60000)
        throw Error("上下文超过 60,000 字符，请选择段落或当前章节");
    } catch (e) {
      status.textContent = (e as Error).message;
      return;
    }
    lastRequest = {
      context,
      mode: mode.value,
      instruction,
      preferences: preferences.value,
    };
    const currentTurn = ++turn;
    controller = new AbortController();
    setBusy(true);
    privacy();
    status.textContent = `正在处理${scope.options[scope.selectedIndex].text}（${context.text.length.toLocaleString()} 字符）…`;
    messages.querySelector(".ai-empty")?.remove();
    const message = document.createElement("section");
    message.className = "ai-message";
    activeMessage = message;
    const question = document.createElement("p");
    question.className = "ai-question";
    question.textContent = instruction;
    const answer = document.createElement("div");
    answer.className = "ai-answer";
    answer.textContent = mode.value === "edit" ? "正在生成修改建议…" : "";
    const note = document.createElement("small");
    note.textContent = `${scope.options[scope.selectedIndex].text} · ${context.text.length.toLocaleString()} 字符`;
    message.append(question, note, answer);
    messages.append(message);
    message.scrollIntoView({ block: "nearest" });
    let finished = false;
    try {
      const response = await fetch("/api/ai/respond", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": options.csrf(),
        },
        body: JSON.stringify({
          mode: mode.value,
          scope: scope.value,
          context: context.text,
          title: options.title(),
          instruction,
          preferences: preferences.value,
          history,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "AI 请求失败");
      }
      if (!response.body) throw Error("浏览器不支持流式读取");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!alive || currentTurn !== turn) return;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line) continue;
            const event: Result = JSON.parse(line);
            if (event.type === "error")
              throw Error(event.message || "生成失败");
            if (event.type === "delta") answer.textContent += event.text || "";
            if (event.type === "result") {
              finished = true;
              const reply =
                event.mode === "edit"
                  ? event.explanation || ""
                  : event.text || "";
              answer.textContent = reply;
              if (event.mode === "edit")
                renderEdits(message, context, event.edits || []);
              else {
                const insert = document.createElement("button");
                insert.type = "button";
                insert.textContent = "插入文末";
                insert.onclick = () => {
                  try {
                    apply(
                      context.body,
                      context.body + (context.body ? "\n\n" : "") + reply,
                    );
                    insert.disabled = true;
                    insert.textContent = "已插入";
                  } catch (e) {
                    status.textContent = (e as Error).message;
                  }
                };
                message.append(insert);
              }
              history = [
                ...history,
                { role: "user", content: instruction },
                { role: "assistant", content: reply.slice(0, 4000) },
              ].slice(-8);
              status.textContent =
                event.mode === "edit"
                  ? "建议已生成，请逐项审阅后采纳。"
                  : "回答完成，可继续追问。";
              lastRequest = null;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!finished) throw Error("回复中断，未生成可采纳的结果，请重试");
    } catch (e) {
      if (alive && currentTurn === turn) {
        status.textContent =
          (e as Error).name === "AbortError"
            ? "已停止生成"
            : (e as Error).message;
        const error = document.createElement("p");
        error.className = "ai-error";
        error.textContent = "本次未完成，可重试；正文未被修改。";
        message.append(error);
      }
    } finally {
      if (alive && currentTurn === turn) {
        controller = null;
        setBusy(false);
      }
    }
  }
  options.toggle.onclick = () => show(panel.hidden);
  get("[data-close]").onclick = () => show(false);
  get("[data-refresh]").onclick = () => void refreshStatus();
  get("[data-stop]").onclick = stopGeneration;
  get("[data-send]").onclick = () => void generate();
  const resetHistory = () => {
    history = [];
    lastRequest = null;
    if (!busy) send.textContent = "发送";
  };
  mode.onchange = resetHistory;
  scope.onchange = resetHistory;
  get("[data-clear]").onclick = () => {
    resetHistory();
    messages.replaceChildren();
    status.textContent = "已清空对话；正文不变。";
  };
  undo.onclick = () => {
    const edit = undoStack.at(-1);
    if (!edit) return;
    try {
      options.editor.replaceMarkdown(edit.after, edit.before);
      undoStack.pop();
      undo.disabled = !undoStack.length;
      status.textContent = "已撤销上次采纳。";
    } catch (e) {
      status.textContent = (e as Error).message;
    }
  };
  const presets: Record<string, [string, string]> = {
    polish: ["edit", "润色这段文字，让表达自然流畅，保留我的语气和原意。"],
    shorten: ["edit", "精简这段文字，删除重复表达，保留关键细节。"],
    expand: ["edit", "扩写这段文字，解释推理过程；不编造事实或数据。"],
    translate: [
      "edit",
      "将这段文字翻译为英文，保留 Markdown、代码、公式和链接。",
    ],
    explain: ["ask", "解释这段内容的核心概念，并指出可能需要澄清的地方。"],
    metadata: [
      "ask",
      "根据提供的内容，建议 3 个文章标题、一段简短摘要和 3–5 个标签。",
    ],
  };
  panel.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(
    (button) =>
      (button.onclick = () => {
        const [nextMode, instruction] = presets[button.dataset.preset!];
        resetHistory();
        mode.value = nextMode;
        prompt.value = instruction;
        prompt.focus();
      }),
  );
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      show(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void generate();
    }
    if (e.key === "Tab" && matchMedia("(max-width: 700px)").matches) {
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]):not([hidden]),textarea,select,summary",
        ),
      ).filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  void refreshStatus();
  return {
    close: () => {
      if (!panel.hidden) show(false);
    },
    destroy() {
      alive = false;
      turn++;
      controller?.abort();
      lifecycle.abort();
      options.toggle.onclick = null;
      panel.hidden = true;
      syncInert();
      panel.remove();
      options.workspace.classList.remove("ai-open");
    },
  };
}
