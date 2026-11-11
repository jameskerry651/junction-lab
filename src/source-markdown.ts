import { Lexer } from "marked";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const span = (kind: string, raw: string) =>
  `<span class="hljs-${kind}">${escape(raw)}</span>`;

function inline(source: string): string {
  // Require complete inline constructs on this line. In-progress delimiters
  // must never recolor the rest of the document. Marked also respects escapes
  // and intraword underscores (file_name, variable_name).
  return Lexer.lexInline(source)
    .map((token) => {
      const kind = (
        {
          strong: "strong",
          em: "emphasis",
          codespan: "code",
          link: "link",
          image: "link",
        } as Record<string, string>
      )[token.type];
      return kind ? span(kind, token.raw) : escape(token.raw);
    })
    .join("");
}

export function highlightSource(source: string): string {
  let fence: { char: string; length: number } | undefined;
  let math = false;
  return source
    .split("\n")
    .map((line) => {
      if (fence) {
        const end = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
        if (end && end[1][0] === fence.char && end[1].length >= fence.length)
          fence = undefined;
        return span("code", line);
      }
      const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!math && start && !(start[1][0] === "`" && start[2].includes("`"))) {
        fence = { char: start[1][0], length: start[1].length };
        return span("code", line);
      }
      if (/^\s*\$\$\s*$/.test(line)) {
        math = !math;
        return escape(line);
      }
      // Leave formulas neutral: LaTeX subscripts are not Markdown emphasis.
      if (math || /(^|[^\\])\$/.test(line)) return escape(line);
      if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) return span("section", line);
      if (/^ {0,3}>/.test(line)) return span("quote", line);
      if (/^(?: {4}|\t)/.test(line)) return span("code", line);
      const bullet = /^(\s*(?:[-+*]|\d+[.)])\s+)(.*)$/.exec(line);
      if (bullet) return span("bullet", bullet[1]) + inline(bullet[2]);
      return inline(line);
    })
    .join("\n");
}
