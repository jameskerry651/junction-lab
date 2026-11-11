import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createAdmin } from "./admin.mjs";
import { buildContent } from "../scripts/export-records.mjs";
import { securityHeaders } from "./security.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".glb": "model/gltf-binary",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

// Read-only static file serving for the built site. Every response carries the
// shared security headers so the CSP cannot be skipped by an early return.
export function staticHandler({ dist }) {
  return async function serve(req, res) {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, {
          "X-Content-Type-Options": "nosniff",
          ...securityHeaders(),
        });
        return res.end();
      }
      const url = new URL(req.url, "http://localhost");
      let route;
      try {
        route = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400, {
          "X-Content-Type-Options": "nosniff",
          ...securityHeaders(),
        });
        return res.end("Bad request");
      }
      if (route === "/admin") {
        res.writeHead(302, { Location: "/admin/", ...securityHeaders() });
        return res.end();
      }
      if (route.endsWith("/")) route += "index.html";
      if (route.split("/").some((part) => part.startsWith("."))) {
        res.writeHead(404, {
          "X-Content-Type-Options": "nosniff",
          ...securityHeaders(),
        });
        return res.end();
      }
      const file = path.resolve(dist, "." + route);
      if (!file.startsWith(dist + path.sep)) {
        res.writeHead(404, {
          "X-Content-Type-Options": "nosniff",
          ...securityHeaders(),
        });
        return res.end();
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "SAMEORIGIN",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        ...securityHeaders(),
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404, {
        "X-Content-Type-Options": "nosniff",
        ...securityHeaders(),
      });
      res.end("Not found");
    }
  };
}

// Publish the current Markdown by building into a staging directory and then
// swapping it into place, so a failed build never replaces a working site.
async function rebuildSite(root, dist) {
  await buildContent(root);
  const next = path.join(root, ".junction/site-next"),
    previous = path.join(root, ".junction/site-previous");
  await run(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "build",
      "--outDir",
      next,
      "--emptyOutDir",
    ],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  await fs.rm(previous, { recursive: true, force: true });
  await fs.rename(dist, previous);
  try {
    await fs.rename(next, dist);
  } catch (e) {
    await fs.rename(previous, dist);
    throw e;
  }
  await fs.rm(previous, { recursive: true, force: true });
}

export async function createApp({
  root = projectRoot,
  dist = path.join(root, "dist"),
  rebuild,
} = {}) {
  const serve = staticHandler({ dist });
  const handler = await createAdmin({
    root,
    rebuild: rebuild || (() => rebuildSite(root, dist)),
  });
  return (req, res) => handler(req, res, () => serve(req, res));
}

export async function start({
  root = projectRoot,
  dist = path.join(root, "dist"),
} = {}) {
  await fs.access(path.join(dist, "index.html")).catch(() => {
    throw new Error("请先执行 npm run build");
  });
  const server = http.createServer(await createApp({ root, dist }));
  server.requestTimeout = 30000;
  server.headersTimeout = 20000;
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT) || 3000;
  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log(`Junction Lab: http://${host}:${port} · 后台 /admin/`);
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await start();
