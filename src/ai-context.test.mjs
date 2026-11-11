import test from "node:test";
import assert from "node:assert/strict";
import { contextRange, applyEdits } from "./ai-context.ts";
test("chapter respects parent hierarchy and ignores fenced pseudo-headings", () => {
  const body =
    "# A\nintro\n## B\nparagraph\n```md\n# fake\n```\n### C\nchild\n## D\nend";
  const context = contextRange(body, "chapter", body.indexOf("paragraph"));
  assert.equal(
    context.text,
    "## B\nparagraph\n```md\n# fake\n```\n### C\nchild\n",
  );
  assert.throws(() => contextRange(body, "selection", 0, 0));
});
test("selected duplicate paragraphs outside the range stay untouched; applying out of order preserves original bytes", () => {
  const body = "same\n\n# Block\nsame\nkeep\nold\n\n```js\n  x < y\n```\n";
  const start = body.indexOf("same", 5),
    end = body.indexOf("\n\n```");
  const context = contextRange(body, "selection", start, end);
  const edits = [
    { original: "same", replacement: "new paragraph", reason: "x" },
    { original: "old", replacement: "changed", reason: "y" },
  ];
  assert.equal(
    applyEdits(context, edits, new Set([1])),
    body.replace("old", "changed"),
  );
  assert.equal(
    applyEdits(context, edits, new Set([1, 0])),
    "same\n\n# Block\nnew paragraph\nkeep\nchanged\n\n```js\n  x < y\n```\n",
  );
  assert.throws(() =>
    applyEdits(
      context,
      [{ original: "missing", replacement: "x" }],
      new Set([0]),
    ),
  );
  assert.throws(() =>
    applyEdits(
      context,
      [
        { original: "same", replacement: "x" },
        { original: "same\nkeep", replacement: "y" },
      ],
      new Set(),
    ),
  );
});
test("empty new draft can be created but ambiguous originals are rejected", () => {
  assert.equal(
    applyEdits(
      contextRange("", "document"),
      [{ original: "", replacement: "# New" }],
      new Set([0]),
    ),
    "# New",
  );
  assert.throws(() =>
    applyEdits(
      contextRange("same same", "document"),
      [{ original: "same", replacement: "x" }],
      new Set([0]),
    ),
  );
});
