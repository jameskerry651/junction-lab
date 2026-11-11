import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import sanitize from "sanitize-html";

const projectRoot = path.resolve(import.meta.dirname, "..");
const parser = new Marked(
  markedKatex({
    throwOnError: false,
    strict: false,
    nonStandard: true,
    output: "html",
    trust: false,
  }),
  markedHighlight({
    langPrefix: "hljs language-",
    highlight: (code, lang) =>
      hljs.highlight(code, {
        language: hljs.getLanguage(lang) ? lang : "plaintext",
      }).value,
  }),
);
// VanBlog permits display formulas directly after prose as well as blank lines
// inside a formula. Give Marked an explicit block boundary for these cases.
parser.use({
  extensions: [
    {
      name: "blockKatex",
      level: "block",
      start(src) {
        const match = /(?:^|\n)\$\$[ \t]*\n/.exec(src);
        return match
          ? match.index + (src[match.index] === "\n" ? 1 : 0)
          : undefined;
      },
      tokenizer(src) {
        const match = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$[ \t]*(?:\n|$)/.exec(src);
        if (match)
          return {
            type: "blockKatex",
            raw: match[0],
            text: match[1].trim(),
            displayMode: true,
          };
      },
    },
  ],
});

// KaTeX positions atoms with a small, enumerable set of inline styles. Keep
// those, drop everything else (position/fixed overlays, url() exfiltration,
// arbitrary properties) instead of allowing the whole style attribute.
const SANITIZED_STYLE_VALUE =
  /^(?!.*(?:url|expression|javascript|@import))[-\w\s.,%#()+/'*]{1,80}$/i;
const KATEX_STYLE_PROPERTIES = Object.fromEntries(
  [
    "height",
    "width",
    "min-width",
    "max-width",
    "margin",
    "margin-left",
    "margin-right",
    "margin-top",
    "margin-bottom",
    "padding",
    "padding-left",
    "padding-right",
    "padding-top",
    "padding-bottom",
    "left",
    "right",
    "top",
    "bottom",
    "vertical-align",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "font-size",
    "text-align",
    "text-shadow",
    "white-space",
    "color",
    "background-color",
    "border-bottom-width",
    "border-top-width",
    "border-left-width",
    "border-right-width",
    "border-bottom-style",
    "border-top-style",
    "border-left-style",
    "border-right-style",
    "border-bottom-color",
    "border-top-color",
    "border-left-color",
    "border-right-color",
    "position",
    "display",
  ].map((property) => [property, [SANITIZED_STYLE_VALUE]]),
);
// KaTeX only ever uses these two values; anchoring them also keeps
// `position:fixed` and `display:none` tricks out of the allowlist.
KATEX_STYLE_PROPERTIES.position = [/^relative$/];
KATEX_STYLE_PROPERTIES.display = [/^(inline|inline-block|block|none)$/];

export function renderMarkdown(body) {
  return sanitize(parser.parse(body), {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "img",
      "input",
      "span",
      "svg",
      "path",
      "line",
    ],
    allowedAttributes: {
      ...sanitize.defaults.allowedAttributes,
      "*": ["class", "aria-hidden"],
      span: ["class", "style", "aria-hidden"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      input: ["type", "checked", "disabled"],
      svg: ["width", "height", "viewBox", "preserveAspectRatio"],
      path: ["d"],
      line: ["x1", "y1", "x2", "y2", "stroke-width"],
    },
    allowedStyles: { span: KATEX_STYLE_PROPERTIES },
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
      img: sanitize.simpleTransform("img", { loading: "lazy" }),
      input: sanitize.simpleTransform("input", {
        disabled: "disabled",
        type: "checkbox",
      }),
    },
  });
}

export async function buildContent(root = projectRoot) {
  const posts = [];
  const seen = new Set();
  const publicDir = path.join(root, "public/posts");
  const outputImages = path.join(root, "public/blog-images");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.mkdir(outputImages, { recursive: true });
  const imageNames = new Set();
  const writes = [];
  const files = (await fs.readdir(path.join(root, "content/posts"))).filter(
    (f) => f.endsWith(".md"),
  );
  for (const file of files) {
    const raw = await fs.readFile(
      path.join(root, "content/posts", file),
      "utf8",
    );
    const { data: d, content } = matter(raw);
    if (d.visibility !== "public" || d.private || d.hidden || d.password)
      continue;
    if (
      !Number.isInteger(d.id) ||
      d.id < 1 ||
      seen.has(d.id) ||
      !d.title ||
      !d.category
    )
      throw new Error(`Invalid/duplicate id, title or category in ${file}`);
    seen.add(d.id);
    for (const key of ["createdAt", "updatedAt"])
      if (!Number.isFinite(Date.parse(d[key])))
        throw new Error(`Invalid ${key} in ${file}`);
    const body = content.replace(/\.\.\/images\/([^\s)"<>]+)/g, (_, name) => {
      const decoded = decodeURIComponent(name);
      // Image paths become file names in public/blog-images, never directories.
      if (path.basename(decoded) !== decoded)
        throw new Error(`Invalid image path: ${decoded} in ${file}`);
      imageNames.add(decoded);
      return `/blog-images/${name}`;
    });
    const html = renderMarkdown(body);
    const text = sanitize(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, " ")
      .trim();
    const tags = Array.isArray(d.tags) ? d.tags.map(String) : [];
    posts.push({
      id: `X-${String(d.id).padStart(3, "0")}`,
      slug: String(d.id),
      title: String(d.title),
      en: tags.join(" / ") || "JUNCTION LAB JOURNAL",
      department: String(d.category),
      category: String(d.category),
      date: new Date(d.createdAt).toISOString().slice(0, 10),
      updatedAt: new Date(d.updatedAt).toISOString().slice(0, 10),
      lead: String(d.author || "James"),
      clearance: `${Math.max(1, Math.ceil(text.length / 500))} MIN READ`,
      abstract: text.slice(0, 180) + (text.length > 180 ? "…" : ""),
      tags,
      findings: tags,
      source: `#post/${d.id}`,
      htmlUrl: `/posts/${d.id}.html`,
      markdownUrl: `/posts/${d.id}.md`,
    });
    writes.push([path.join(publicDir, `${d.id}.html`), html]);
    writes.push([
      path.join(publicDir, `${d.id}.md`),
      matter.stringify(body, {
        id: d.id,
        title: String(d.title),
        category: String(d.category),
        tags,
        author: String(d.author || "James"),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        visibility: "public",
      }),
    ]);
  }
  if (!posts.length)
    throw new Error("At least one public Markdown article is required.");
  // Nothing is written until every public file has validated, so a failed
  // build cannot leave half-updated generated output behind.
  for (const [file, data] of writes) await fs.writeFile(file, data);
  // Remove stale generated articles and images after unpublishing or deleting a post.
  for (const file of await fs.readdir(publicDir))
    if (/^\d+\.(html|md)$/.test(file) && !seen.has(Number(file.split(".")[0])))
      await fs.unlink(path.join(publicDir, file));
  for (const name of imageNames) {
    await fs.copyFile(
      path.join(root, "content/images", name),
      path.join(outputImages, name),
    );
  }
  for (const name of await fs.readdir(outputImages))
    if (!imageNames.has(name)) await fs.unlink(path.join(outputImages, name));
  posts.sort(
    (a, b) => b.date.localeCompare(a.date) || Number(b.slug) - Number(a.slug),
  );
  const configured = JSON.parse(
    await fs.readFile(path.join(root, "content/categories.json"), "utf8"),
  );
  const archiveColumns = [
    ...new Set([...configured, ...posts.map((p) => p.category)]),
  ].filter((c) => posts.some((p) => p.category === c));
  await fs.mkdir(path.join(root, "src/generated"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src/generated/posts.json"),
    JSON.stringify({ records: posts, archiveColumns }, null, 2) + "\n",
  );
  console.log(
    `Junction Lab: ${posts.length} public posts, ${archiveColumns.length} categories, ${imageNames.size} images.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await buildContent();
