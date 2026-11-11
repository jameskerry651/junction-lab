import fs from "node:fs/promises";
import { createAiService } from "./ai.mjs";
import { isIP } from "node:net";
import path from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import matter from "gray-matter";
import { renderMarkdown } from "../scripts/export-records.mjs";
import { securityHeaders } from "./security.mjs";

const defaults = {
  title: "JUNCTION LAB",
  description: "James 的个人博客",
  author: "James",
  analytics: true,
};
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const token = () => randomBytes(32).toString("hex");
const digest = (password, salt) =>
  scryptSync(password, salt, 64).toString("hex");
const safe = (name) =>
  typeof name === "string" &&
  name === path.basename(name) &&
  !name.startsWith(".") &&
  !/[\\/\x00-\x1f]/.test(name);
// One client-address helper so the login limiter and the analytics anonymiser
// cannot disagree about who the caller is behind a reverse proxy.
const clientAddress = (req) => {
  const forwarded = req.headers["x-real-ip"];
  return process.env.JUNCTION_TRUST_PROXY === "1" &&
    typeof forwarded === "string" &&
    isIP(forwarded.trim())
    ? forwarded.trim()
    : req.socket?.remoteAddress || "local";
};
const isSecure = (req) => {
  if (process.env.JUNCTION_SECURE_COOKIE === "0") return false;
  return (
    process.env.JUNCTION_SECURE_COOKIE === "1" ||
    Boolean(req.socket?.encrypted) ||
    (process.env.JUNCTION_TRUST_PROXY === "1" &&
      req.headers["x-forwarded-proto"] === "https")
  );
};
const limitLabel = (limit) =>
  limit >= 1048576
    ? `${limit / 1048576}MB`
    : `${Math.max(1, Math.round(limit / 1024))}KB`;
const sameSecret = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Anonymous analytics: cap how many events one client may create in a window so
// a rotating user agent cannot drive unbounded analytics rewrites.
export const TRACK_EVENTS_PER_WINDOW = 120;
const TRACK_WINDOW_MS = 10 * 60 * 1000;
export async function createAdmin({
  root,
  rebuild = async () => {},
  aiOptions,
}) {
  const ai = createAiService(aiOptions);
  const state = path.join(root, ".junction");
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  const read = async (name, fallback) => {
    try {
      return JSON.parse(await fs.readFile(path.join(state, name), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return fallback;
      throw e;
    }
  };
  const write = async (name, value) => {
    const file = path.join(state, name);
    await fs.writeFile(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    await fs.rename(file + ".tmp", file);
  };
  let account = await read("account.json", null),
    settings = { ...defaults, ...(await read("settings.json", {})) };
  const analyticsSalt = (await read("analytics-salt.json", null)) || token();
  await write("analytics-salt.json", analyticsSalt);
  let events = await read("analytics.json", []);
  const pruneMap = (map, maxSize) => {
    if (map.size <= maxSize) return;
    const toDelete = map.size - maxSize;
    let count = 0;
    for (const key of map.keys()) {
      map.delete(key);
      if (++count >= toDelete) break;
    }
  };
  const sessions = new Map(),
    attempts = new Map(),
    visits = new Map(),
    tracked = new Map();
  const sweep = (now = Date.now()) => {
    for (const [key, session] of sessions)
      if (session.expires <= now) sessions.delete(key);
    for (const [key, attempt] of attempts)
      if (attempt.until <= now) attempts.delete(key);
    for (const [key, bucket] of tracked)
      if (bucket.until <= now) tracked.delete(key);
    for (const [key, time] of visits)
      if (now - time > 30000) visits.delete(key);
    pruneMap(sessions, 1000);
    pruneMap(attempts, 5000);
    pruneMap(tracked, 5000);
    pruneMap(visits, 5000);
  };
  const sweepInterval = setInterval(() => sweep(), 5 * 60 * 1000);
  sweepInterval.unref?.();
  let chain = Promise.resolve();
  const exclusive = (fn) => {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  };
  let setupToken = "";
  if (!account) {
    setupToken = token();
    console.log(
      `\n后台首次初始化令牌（仅本机终端显示）：${setupToken}\n打开 /admin/ 创建管理员。\n`,
    );
  }
  const folders = ["content/posts", "content/local"];
  async function posts() {
    const all = [];
    for (const folder of folders) {
      await fs.mkdir(path.join(root, folder), { recursive: true });
      for (const file of await fs.readdir(path.join(root, folder))) {
        if (!file.endsWith(".md")) continue;
        const raw = await fs.readFile(path.join(root, folder, file), "utf8");
        const { data, content } = matter(raw);
        const published =
          folder === folders[0] &&
          data.visibility === "public" &&
          !data.private &&
          !data.hidden &&
          !data.password;
        all.push({
          ...data,
          visibility: published
            ? "public"
            : data.visibility === "draft"
              ? "draft"
              : "private",
          body: content,
          revision: createHash("sha256").update(raw).digest("hex"),
          file,
          folder,
        });
      }
    }
    return all.sort((a, b) => b.id - a.id);
  }
  function clean(p, id) {
    if (!Number.isSafeInteger(id) || id < 1) fail("文章编号无效");
    if (
      !p ||
      typeof p.title !== "string" ||
      !p.title.trim() ||
      p.title.length > 250 ||
      typeof p.category !== "string" ||
      !p.category.trim() ||
      p.category.length > 80 ||
      typeof p.body !== "string" ||
      p.body.length > 2000000 ||
      !["public", "draft", "private"].includes(p.visibility)
    )
      fail("文章字段无效");
    if (
      !Array.isArray(p.tags) ||
      p.tags.length > 30 ||
      p.tags.some((t) => typeof t !== "string" || t.length > 80)
    )
      fail("标签无效");
    if (!Number.isFinite(Date.parse(p.createdAt))) fail("发布日期无效");
    return {
      id,
      title: p.title.trim(),
      category: p.category.trim(),
      author: String(p.author || settings.author).slice(0, 100),
      tags: [...new Set(p.tags)],
      createdAt: new Date(p.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      visibility: p.visibility,
    };
  }
  async function transaction(changes) {
    const previous = await Promise.all(
      changes.map(async ([file]) => {
        try {
          return await fs.readFile(file);
        } catch (e) {
          if (e.code === "ENOENT") return null;
          throw e;
        }
      }),
    );
    try {
      for (const [file, data] of changes) {
        if (data === null) await fs.rm(file, { force: true });
        else await fs.writeFile(file, data);
      }
      await rebuild();
    } catch (error) {
      for (let i = 0; i < changes.length; i++) {
        if (previous[i] === null) await fs.rm(changes[i][0], { force: true });
        else await fs.writeFile(changes[i][0], previous[i]);
      }
      await rebuild().catch(console.error);
      throw Object.assign(
        new Error("保存或构建失败，已恢复原内容：" + error.message),
        { status: 422 },
      );
    }
  }
  async function body(req, limit = 32 * 1024 * 1024) {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit)
      fail(`请求超过 ${limitLabel(limit)}`, 413);
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) fail(`请求超过 ${limitLabel(limit)}`, 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      fail("JSON 格式错误");
    }
  }
  function send(res, data, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...securityHeaders(),
    });
    res.end(JSON.stringify(data));
  }
  return async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const editorImage = url.pathname.startsWith("/images/");
    const route = editorImage ? "/api/image" : url.pathname;
    if (editorImage) {
      let name;
      try {
        name = decodeURIComponent(url.pathname.slice(8));
      } catch {
        return send(res, { error: "图片地址编码无效" }, 400);
      }
      url.searchParams.set("name", name);
      url.searchParams.set("scope", "editor");
    }
    if (!route.startsWith("/api/")) return next();
    try {
      const mutating = !["GET", "HEAD"].includes(req.method);
      if (mutating && req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (
          origin.host !== req.headers.host ||
          !["http:", "https:"].includes(origin.protocol)
        )
          fail("请求来源不可信", 403);
      }
      if (
        mutating &&
        !String(req.headers["content-type"]).startsWith("application/json")
      )
        fail("仅接受 JSON", 415);
      const cookie = /(?:^|; )junction_session=([a-f0-9]+)/.exec(
        req.headers.cookie || "",
      )?.[1];
      const session = sessions.get(cookie);
      const auth = session && session.expires > Date.now();
      if (route === "/api/site" && req.method === "GET")
        return send(res, settings);
      if (route === "/api/session" && req.method === "GET")
        return send(res, {
          initialized: !!account,
          authenticated: !!auth,
          csrf: auth ? session.csrf : null,
          username: auth ? account.username : null,
        });
      if (route === "/api/track" && req.method === "POST") {
        const p = await body(req, 16 * 1024);
        const path_ = typeof p.path === "string" ? p.path : "";
        if (!settings.analytics || !/^\/(?:#post\/\d+)?$/.test(path_))
          return send(res, { ok: true });
        const address = clientAddress(req);
        const now = Date.now();
        const bucket = tracked.get(address) || {
          count: 0,
          until: now + TRACK_WINDOW_MS,
        };
        if (bucket.until <= now) {
          bucket.count = 0;
          bucket.until = now + TRACK_WINDOW_MS;
        }
        bucket.count++;
        tracked.set(address, bucket);
        sweep(now);
        if (bucket.count > TRACK_EVENTS_PER_WINDOW)
          return send(res, { ok: true });
        const day = new Date().toISOString().slice(0, 10),
          visitor = createHash("sha256")
            .update(
              analyticsSalt + day + address + (req.headers["user-agent"] || ""),
            )
            .digest("hex")
            .slice(0, 20);
        const key = visitor + path_;
        if (Date.now() - (visits.get(key) || 0) > 30000) {
          visits.set(key, Date.now());
          let source = "直接访问";
          try {
            source = new URL(typeof p.referrer === "string" ? p.referrer : "")
              .hostname;
          } catch {}
          await exclusive(async () => {
            events.push({ day, visitor, path: path_, source });
            events = events
              .filter(
                (e) =>
                  e.day >=
                  new Date(Date.now() - 90 * 86400000)
                    .toISOString()
                    .slice(0, 10),
              )
              .slice(-100000);
            await write("analytics.json", events);
          });
        }
        return send(res, { ok: true });
      }
      if (
        ["/api/setup", "/api/login"].includes(route) &&
        req.method === "POST"
      ) {
        const address = clientAddress(req);
        sweep();
        const attempt = attempts.get(address) || {
          count: 0,
          until: Date.now() + 900000,
        };
        if (attempt.until < Date.now()) {
          attempt.count = 0;
          attempt.until = Date.now() + 900000;
        }
        if (++attempt.count > 15) fail("尝试过多，请 15 分钟后重试", 429);
        pruneMap(attempts, 5000);
        attempts.set(address, attempt);
        const p = await body(req, 64 * 1024);
        await exclusive(async () => {
          if (route === "/api/setup") {
            if (account || p.token !== setupToken)
              fail("初始化令牌不正确或已完成初始化", 403);
            if (
              typeof p.username !== "string" ||
              !/^[\w.@-]{3,64}$/.test(p.username) ||
              typeof p.password !== "string" ||
              p.password.length < 12 ||
              p.password.length > 256
            )
              fail("用户名需 3–64 位；密码需 12–256 位");
            const salt = token();
            account = {
              username: p.username,
              salt,
              hash: digest(p.password, salt),
            };
            await write("account.json", account);
            setupToken = "";
          } else if (
            !account ||
            typeof p.password !== "string" ||
            p.password.length > 256 ||
            !sameSecret(p.username, account.username) ||
            !timingSafeEqual(
              Buffer.from(digest(p.password, account.salt), "hex"),
              Buffer.from(account.hash, "hex"),
            )
          )
            fail("用户名或密码错误", 401);
        });
        attempts.delete(address);
        sweep();
        const id = token(),
          csrf = token();
        sessions.set(id, { csrf, expires: Date.now() + 8 * 3600000 });
        const secureFlag = isSecure(req) ? "; Secure" : "";
        res.setHeader(
          "Set-Cookie",
          `junction_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureFlag}`,
        );
        return send(res, { ok: true, csrf });
      }
      if (!auth) fail("请先登录", 401);
      if (mutating && req.headers["x-csrf-token"] !== session.csrf)
        fail("会话校验失败，请重新登录", 403);
      if (route === "/api/ai/status" && req.method === "GET")
        return send(res, ai.status());
      if (route === "/api/ai/respond" && req.method === "POST")
        return await ai.run(await body(req, 512 * 1024), session, res);
      if (route === "/api/logout" && req.method === "POST") {
        sessions.delete(cookie);
        const secureFlag = isSecure(req) ? "; Secure" : "";
        res.setHeader(
          "Set-Cookie",
          `junction_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag}`,
        );
        return send(res, { ok: true });
      }
      if (route === "/api/posts" && req.method === "GET")
        return send(res, await posts());
      if (route === "/api/posts" && req.method === "POST") {
        const p = await body(req);
        return await exclusive(async () => {
          const all = await posts(),
            old = p.id ? all.find((a) => a.id === p.id) : null;
          if (p.id && !old) fail("文章不存在", 404);
          if (old && old.revision !== p.revision)
            fail("文章已被其他窗口修改，请重新打开", 409);
          if (all.some((a) => !Number.isSafeInteger(a.id) || a.id < 1))
            fail(
              "content/ 中存在编号无效的文章，请先修正其 front matter id",
              409,
            );
          const nextId = Math.max(
            await read("next-id.json", 1),
            Math.max(0, ...all.map((a) => a.id)) + 1,
          );
          const id = old?.id || nextId,
            data = clean(p, id);
          if (!old) await write("next-id.json", id + 1);
          if (data.visibility === "public")
            for (const match of p.body.matchAll(
              /\.\.\/images\/([^\s)"<>]+)/g,
            )) {
              const name = decodeURIComponent(match[1]);
              if (!safe(name)) fail("图片路径无效");
              try {
                await fs.access(path.join(root, "content/images", name));
              } catch {
                fail("缺少公开图片：" + name);
              }
            }
          // Published pages cannot reach images that require a session; reject
          // the reference instead of shipping a permanently broken image.
          if (
            data.visibility === "public" &&
            /!\[[^\]]*\]\(\s*<?(?:\/api\/|\/images\/|\.\.\/local\/)|<img[^>]+src\s*=\s*["']?(?:\/api\/|\/images\/|\.\.\/local\/)/i.test(
              p.body,
            )
          )
            fail("公开正文不能引用需要登录的图片地址，请改用 ../images/ 路径");
          if (
            old?.visibility === "public" &&
            data.visibility !== "public" &&
            all.filter((a) => a.visibility === "public").length <= 1
          )
            fail("至少保留一篇公开文章");
          const dest = path.join(
            root,
            data.visibility === "public" ? folders[0] : folders[1],
            old?.file || `${id}.md`,
          );
          const changes = [[dest, matter.stringify(p.body, data)]];
          if (old && path.join(root, old.folder, old.file) !== dest)
            changes.push([path.join(root, old.folder, old.file), null]);
          await transaction(changes);
          return send(res, { ok: true, id });
        });
      }
      if (/^\/api\/posts\/\d+$/.test(route) && req.method === "DELETE") {
        const p = await body(req);
        return await exclusive(async () => {
          const all = await posts(),
            old = all.find((a) => a.id === Number(route.split("/").pop()));
          if (!old) fail("文章不存在", 404);
          if (old.revision !== p.revision)
            fail("文章已变化，请刷新后重试", 409);
          if (
            old.visibility === "public" &&
            all.filter((a) => a.visibility === "public").length <= 1
          )
            fail("至少保留一篇公开文章");
          await fs.mkdir(path.join(state, "trash"), { recursive: true });
          await fs.copyFile(
            path.join(root, old.folder, old.file),
            path.join(state, "trash", `${old.id}-${Date.now()}.md`),
          );
          await transaction([[path.join(root, old.folder, old.file), null]]);
          return send(res, { ok: true });
        });
      }
      if (route === "/api/preview" && req.method === "POST") {
        const p = await body(req);
        return send(res, {
          html: renderMarkdown(String(p.body || "")),
        });
      }
      if (route === "/api/images" && req.method === "GET") {
        const all = await posts(),
          out = [];
        for (const folder of ["content/images", "content/local/images"]) {
          await fs.mkdir(path.join(root, folder), { recursive: true });
          for (const name of await fs.readdir(path.join(root, folder))) {
            const stat = await fs.stat(path.join(root, folder, name));
            if (!stat.isFile()) continue;
            out.push({
              name,
              scope: folder.includes("/local/") ? "private" : "public",
              size: stat.size,
              refs: all
                .filter((p) => p.body.includes(name))
                .map((p) => ({ id: p.id, title: p.title })),
            });
          }
        }
        return send(res, out);
      }
      if (route === "/api/image" && req.method === "GET") {
        const name = url.searchParams.get("name"),
          scope = url.searchParams.get("scope");
        if (!safe(name)) fail("文件名无效");
        const file = path.join(
          root,
          scope === "private" ? "content/local/images" : "content/images",
          name,
        );
        const bytes = await fs.readFile(file).catch((error) => {
          if (scope !== "editor" || error.code !== "ENOENT") throw error;
          return fs.readFile(path.join(root, "content/local/images", name));
        });
        const mime =
          {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".avif": "image/avif",
          }[path.extname(name).toLowerCase()] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ...securityHeaders(),
        });
        return res.end(bytes);
      }
      if (route === "/api/images" && req.method === "POST") {
        const p = await body(req);
        if (
          !safe(p.name) ||
          !/\.(png|jpe?g|webp|gif|avif)$/i.test(p.name) ||
          typeof p.data !== "string"
        )
          fail("支持 PNG、JPEG、WebP、GIF、AVIF");
        const bytes = Buffer.from(p.data, "base64");
        if (bytes.length > 10 * 1024 * 1024) fail("图片不得超过 10MB");
        const ext = path.extname(p.name).toLowerCase();
        const valid =
          ext === ".png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : [".jpg", ".jpeg"].includes(ext)
              ? bytes[0] === 255 && bytes[1] === 216
              : ext === ".gif"
                ? /^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))
                : ext === ".webp"
                  ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                    bytes.toString("ascii", 8, 12) === "WEBP"
                  : bytes.toString("ascii", 4, 8) === "ftyp" &&
                    bytes.toString("ascii", 8, 32).includes("avif");
        if (!valid) fail("图片内容与扩展名不一致");
        return await exclusive(async () => {
          const name = `${Date.now()}-${randomBytes(3).toString("hex")}${ext}`,
            folder =
              p.scope === "private" ? "content/local/images" : "content/images";
          await fs.mkdir(path.join(root, folder), { recursive: true });
          await fs.writeFile(path.join(root, folder, name), bytes, {
            flag: "wx",
          });
          return send(res, {
            name,
            markdown: `![${p.name}](../images/${name})`,
          });
        });
      }
      if (route === "/api/images" && req.method === "DELETE") {
        const p = await body(req);
        if (!safe(p.name)) fail("文件名无效");
        return await exclusive(async () => {
          if ((await posts()).some((a) => a.body.includes(p.name)))
            fail("图片仍被文章引用，请先移除引用");
          await fs.rm(
            path.join(
              root,
              p.scope === "private" ? "content/local/images" : "content/images",
              p.name,
            ),
          );
          return send(res, { ok: true });
        });
      }
      if (route === "/api/analytics" && req.method === "GET") {
        const days = Math.min(
          90,
          Math.max(1, Number(url.searchParams.get("days")) || 30),
        );
        return send(res, {
          events: events.filter(
            (e) =>
              e.day >=
              new Date(Date.now() - (days - 1) * 86400000)
                .toISOString()
                .slice(0, 10),
          ),
          retention: 90,
        });
      }
      if (route === "/api/settings" && req.method === "GET")
        return send(res, settings);
      if (route === "/api/settings" && req.method === "PUT") {
        const p = await body(req);
        if (
          !p.title?.trim() ||
          String(p.title).length > 80 ||
          String(p.description).length > 300 ||
          !p.author?.trim()
        )
          fail("站点信息无效");
        return await exclusive(async () => {
          const value = {
            title: String(p.title).trim(),
            description: String(p.description),
            author: String(p.author).slice(0, 100),
            analytics: !!p.analytics,
          };
          await write("settings.json", value);
          settings = value;
          return send(res, { ok: true });
        });
      }
      if (route === "/api/password" && req.method === "PUT") {
        const p = await body(req);
        return await exclusive(async () => {
          if (
            typeof p.current !== "string" ||
            p.current.length > 256 ||
            !sameSecret(digest(p.current, account.salt), account.hash)
          )
            fail("当前密码错误", 403);
          if (
            typeof p.password !== "string" ||
            p.password.length < 12 ||
            p.password.length > 256
          )
            fail("新密码需 12–256 位");
          const salt = token();
          const next = { ...account, salt, hash: digest(p.password, salt) };
          await write("account.json", next);
          account = next;
          sessions.clear();
          return send(res, { ok: true });
        });
      }
      if (route === "/api/categories" && req.method === "GET")
        return send(
          res,
          JSON.parse(
            await fs.readFile(
              path.join(root, "content/categories.json"),
              "utf8",
            ),
          ),
        );
      if (route === "/api/categories" && req.method === "PUT") {
        const p = await body(req);
        if (
          !Array.isArray(p.categories) ||
          p.categories.length > 100 ||
          p.categories.some(
            (c) => typeof c !== "string" || !c.trim() || c.length > 80,
          )
        )
          fail("分类格式无效");
        return await exclusive(async () => {
          await transaction([
            [
              path.join(root, "content/categories.json"),
              JSON.stringify(
                [...new Set(p.categories.map((c) => c.trim()))],
                null,
                2,
              ),
            ],
          ]);
          return send(res, { ok: true });
        });
      }
      if (route === "/api/backup" && req.method === "GET")
        return await exclusive(async () => {
          const files = {};
          for (const folder of [
            ...folders,
            "content/images",
            "content/local/images",
          ])
            for (const name of await fs.readdir(path.join(root, folder))) {
              if (!safe(name)) continue;
              const file = path.join(root, folder, name);
              if ((await fs.stat(file)).isFile())
                files[`${folder}/${name}`] = (await fs.readFile(file)).toString(
                  "base64",
                );
            }
          return send(res, {
            format: "junction-backup-v1",
            createdAt: new Date().toISOString(),
            files,
            categories: JSON.parse(
              await fs.readFile(
                path.join(root, "content/categories.json"),
                "utf8",
              ),
            ),
            settings,
          });
        });
      if (
        ["/api/import", "/api/restore"].includes(route) &&
        req.method === "POST"
      ) {
        const p = await body(req);
        if (
          p.format !== "junction-backup-v1" ||
          !p.files ||
          typeof p.files !== "object"
        )
          fail("请选择 Junction Lab 备份");
        return await exclusive(async () => {
          const restoring = route === "/api/restore";
          const all = await posts(),
            ids = new Set(restoring ? [] : all.map((p) => p.id)),
            changes = [];
          let imported = 0;
          if (restoring) {
            if (
              !Array.isArray(p.categories) ||
              p.categories.some(
                (c) => typeof c !== "string" || !c.trim() || c.length > 80,
              ) ||
              !p.settings ||
              typeof p.settings.title !== "string" ||
              !p.settings.title.trim() ||
              p.settings.title.length > 80 ||
              typeof p.settings.author !== "string" ||
              typeof p.settings.description !== "string" ||
              p.settings.description.length > 300
            )
              fail("备份配置无效");
            const snapshot = {};
            for (const folder of [
              ...folders,
              "content/images",
              "content/local/images",
            ])
              for (const name of await fs.readdir(path.join(root, folder))) {
                const file = path.join(root, folder, name);
                if ((await fs.stat(file)).isFile()) {
                  snapshot[`${folder}/${name}`] = (
                    await fs.readFile(file)
                  ).toString("base64");
                  if (!Object.hasOwn(p.files, `${folder}/${name}`))
                    changes.push([file, null]);
                }
              }
            await fs.mkdir(path.join(state, "backups"), { recursive: true });
            await write(`backups/before-restore-${Date.now()}.json`, {
              format: "junction-backup-v1",
              files: snapshot,
              categories: JSON.parse(
                await fs.readFile(
                  path.join(root, "content/categories.json"),
                  "utf8",
                ),
              ),
              settings,
            });
          }
          for (const [key, value] of Object.entries(p.files)) {
            const folder = path.posix.dirname(key),
              name = path.posix.basename(key);
            if (
              ![...folders, "content/images", "content/local/images"].includes(
                folder,
              ) ||
              !safe(name) ||
              typeof value !== "string"
            )
              fail("备份含非法路径");
            const dest = path.join(root, folder, name);
            if (!restoring)
              try {
                await fs.access(dest);
                fail("目标文件已存在：" + key, 409);
              } catch (e) {
                if (e.code !== "ENOENT") throw e;
              }
            const bytes = Buffer.from(value, "base64");
            if (folders.includes(folder)) {
              if (!name.endsWith(".md")) fail("文章格式错误");
              const { data, content } = matter(bytes.toString());
              if (
                !Number.isSafeInteger(data.id) ||
                data.id < 1 ||
                ids.has(data.id)
              )
                fail("文章 ID 重复或无效");
              const normalized = clean(
                {
                  ...data,
                  body: content,
                  visibility:
                    folder === folders[0]
                      ? "public"
                      : data.visibility === "draft"
                        ? "draft"
                        : "private",
                },
                data.id,
              );
              if (data.private || data.hidden || data.password) {
                if (folder === folders[0]) fail("禁止将私密文章导入公开目录");
              }
              ids.add(data.id);
              changes.push([dest, matter.stringify(content, normalized)]);
              imported++;
            } else {
              if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(name))
                fail("备份图片类型不支持");
              changes.push([dest, bytes]);
            }
          }
          if (restoring) {
            changes.push([
              path.join(root, "content/categories.json"),
              JSON.stringify(p.categories),
            ]);
            changes.push([
              path.join(state, "settings.json"),
              JSON.stringify({
                title: p.settings.title,
                description: p.settings.description,
                author: p.settings.author,
                analytics: !!p.settings.analytics,
              }),
            ]);
          }
          await transaction(changes);
          if (restoring) settings = await read("settings.json", defaults);
          return send(res, { ok: true, imported });
        });
      }
      fail("接口不存在", 404);
    } catch (error) {
      if (error.code === "ENOENT")
        return send(res, { error: "文件不存在" }, 404);
      console.error(error.message);
      if (!res.headersSent)
        send(
          res,
          {
            error: error.status
              ? error.message
              : "服务端操作失败，请检查终端日志",
          },
          error.status || 500,
        );
      else res.end();
    }
  };
}
