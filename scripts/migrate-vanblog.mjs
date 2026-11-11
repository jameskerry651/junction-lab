import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "blog_data");
const backup = (await fs.readdir(source)).find((f) => f.endsWith(".json"));
const data = JSON.parse(await fs.readFile(path.join(source, backup), "utf8"));
// One-time, non-destructive import. Never export account data or passwords.
const imageZip = (await fs.readdir(source)).find((f) => f.endsWith(".zip"));
const imageDir = path.join(root, "content/images");
await fs.mkdir(imageDir, { recursive: true });
const publicImages = new Set(
  data.articles
    .filter((a) => !a.hidden && !a.private && !a.password)
    .flatMap((a) =>
      [...a.content.matchAll(/\/static\/img\/([^\s)"<>]+)/g)].map((m) => m[1]),
    ),
);
const localImageDir = path.join(root, "content/local/images");
await fs.mkdir(localImageDir, { recursive: true });
const images = execFileSync("unzip", ["-Z1", path.join(source, imageZip)], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((f) => /^img\/[^/]+\.(webp|png|jpe?g|gif)$/i.test(f));
for (const image of images) {
  try {
    await fs.writeFile(
      path.join(
        publicImages.has(path.basename(image)) ? imageDir : localImageDir,
        path.basename(image),
      ),
      execFileSync("unzip", ["-p", path.join(source, imageZip), image], {
        maxBuffer: 30 * 1024 * 1024,
      }),
      { flag: "wx" },
    );
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
let imported = 0;
for (const a of data.articles) {
  const visibility =
    a.private || a.password ? "private" : a.hidden ? "hidden" : "public";
  const dir = path.join(
    root,
    visibility === "public" ? "content/posts" : "content/local",
  );
  await fs.mkdir(dir, { recursive: true });
  const mapping = {
    DIY: "工程实践",
    硬件: "工程实践",
    算法: "算法与数据",
    数据处理: "算法与数据",
    计算机网络: "系统与网络",
    环境配置: "系统与网络",
    研究论文: "论文研读",
    生活: "生活随记",
  };
  const metadata = {
    id: a.id,
    title: a.title,
    category: mapping[a.category] || a.category || "未分类",
    originalCategory: a.category,
    tags: a.tags || [],
    author: a.author || "James",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    visibility,
  };
  const body = a.content.replace(
    /(?:https?:\/\/[^/\s)"<>]+)?\/static\/img\/([^\s)"<>]+)/g,
    (_, name) =>
      `${visibility !== "public" && !publicImages.has(name) ? "images/" : "../images/"}${name}`,
  );
  try {
    await fs.writeFile(
      path.join(dir, `${a.id}.md`),
      matter.stringify(body, metadata),
      { flag: "wx" },
    );
    imported++;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
await fs
  .writeFile(
    path.join(root, "content/categories.json"),
    JSON.stringify(
      ["工程实践", "算法与数据", "系统与网络", "论文研读", "生活随记"],
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  )
  .catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
console.log(
  `Imported ${imported} Markdown articles; existing files were preserved.`,
);
