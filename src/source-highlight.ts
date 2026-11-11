import { highlightSource } from "./source-markdown";

// Keep the native textarea responsible for editing, selection and IME. The
// inert mirror only colors its text; it never changes the Markdown document.
export function sourceHighlight(host: HTMLElement) {
  const input = host.querySelector<HTMLTextAreaElement>("textarea.vditor-sv")!;
  const content = input.parentElement!;
  const layer = document.createElement("div");
  layer.className = "source-highlight";
  layer.setAttribute("aria-hidden", "true");
  const text = document.createElement("pre");
  layer.append(text);
  content.append(layer);
  input.classList.add("source-highlight-input");
  let previous = "\0";
  let frame = 0;
  const render = () => {
    frame = 0;
    layer.hidden = input.offsetWidth === 0;
    if (layer.hidden) return;
    const style = getComputedStyle(input);
    const box = input.getBoundingClientRect();
    const parent = content.getBoundingClientRect();
    Object.assign(layer.style, {
      left: `${box.left - parent.left}px`,
      top: `${box.top - parent.top}px`,
      width: `${input.clientWidth}px`,
      height: `${input.clientHeight}px`,
    });
    for (const key of [
      "fontFamily",
      "fontSize",
      "lineHeight",
      "letterSpacing",
      "tabSize",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "wordBreak",
      "overflowWrap",
    ] as const) {
      text.style[key] = style[key];
    }
    text.style.width = `${input.clientWidth}px`;
    if (previous !== input.value) {
      previous = input.value;
      text.innerHTML = highlightSource(previous) + "\n";
    }
    text.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  };
  const refresh = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  input.addEventListener("input", refresh);
  input.addEventListener("scroll", refresh);
  const resize = new ResizeObserver(refresh);
  resize.observe(input);
  resize.observe(content);
  const observer = new MutationObserver(refresh);
  observer.observe(input, { attributes: true });
  refresh();
  return {
    refresh,
    destroy() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      input.removeEventListener("input", refresh);
      input.removeEventListener("scroll", refresh);
      input.classList.remove("source-highlight-input");
      layer.remove();
    },
  };
}
