import test from "node:test";
import assert from "node:assert/strict";
import { highlightSource } from "./source-markdown.ts";

test("unmatched emphasis and variable underscores cannot spill into later paragraphs", () => {
  for (const source of [
    "未闭合 *强调\n\n普通正文\n\n# 标题",
    "file_name\n\n普通段落\nother_name",
    "未闭合 **加粗\n\n普通正文",
  ]) {
    const result = highlightSource(source);
    assert.doesNotMatch(result, /hljs-emphasis|hljs-strong/);
    assert.match(result, /普通/);
  }
});
test("complete emphasis is colored while escapes and math stay neutral", () => {
  const result = highlightSource(
    "**加粗** 和 *斜体*\n\\*普通\\*\n$x_i + y_j$\n$$\na_b + c_d\n$$",
  );
  assert.match(result, /hljs-strong/);
  assert.equal((result.match(/hljs-emphasis/g) || []).length, 1);
  assert.match(result, /\$x_i \+ y_j\$/);
});
test("fences protect underscores and stars; headings resume after matching fence", () => {
  const result = highlightSource(
    '````js\nconst a_b = "*text";\n```\n*still code*\n````\n# 标题',
  );
  assert.doesNotMatch(result, /hljs-emphasis/);
  assert.match(result, /hljs-section/);
});
test("highlighting escapes HTML and preserves source characters and newlines", () => {
  const source = "# 标题\n\n<img src=x onerror=alert(1)>\n**重点** file_name\n";
  const result = highlightSource(source);
  assert.doesNotMatch(result, /<img/);
  const restored = result
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  assert.equal(restored, source);
});
