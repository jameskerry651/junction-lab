import fs from "node:fs/promises";
import path from "node:path";
// Keep the editor runtime on the same origin; no CDN dependency for private drafts.
const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "public/vendor/vditor");
await fs.mkdir(target, { recursive: true });
for (const entry of [
  "dist/js/lute",
  "dist/js/i18n",
  "dist/js/icons",
  "dist/js/katex",
  "dist/js/highlight.js",
  "dist/css",
  "dist/images",
]) {
  await fs.cp(
    path.join(root, "node_modules/vditor", entry),
    path.join(target, entry),
    { recursive: true },
  );
}
await fs.copyFile(
  path.join(root, "node_modules/vditor/LICENSE"),
  path.join(target, "LICENSE"),
);
console.log("Vditor editor runtime copied locally.");
