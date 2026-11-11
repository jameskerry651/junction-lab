import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import matter from "gray-matter";
import { createAdmin, TRACK_EVENTS_PER_WINDOW } from "./admin.mjs";
import { buildContent } from "../scripts/export-records.mjs";
import { createApp } from "./index.mjs";
import {
  contentSecurityPolicy,
  cspHeaderName,
  hstsValue,
  securityHeaders,
} from "./security.mjs";

test("admin lifecycle, content isolation, transactions and security", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "junction-admin-"));
  for (const dir of [
    "content/posts",
    "content/local",
    "content/images",
    "content/local/images",
  ])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  await fs.writeFile(path.join(root, "content/categories.json"), '["测试"]');
  const sample = {
    title: "测试文章",
    category: "测试",
    tags: ["测试"],
    author: "Tester",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    visibility: "public",
    body: "# hello",
  };
  await fs.writeFile(
    path.join(root, "content/posts/1.md"),
    matter.stringify(sample.body, {
      id: 1,
      title: sample.title,
      category: sample.category,
      tags: sample.tags,
      author: sample.author,
      createdAt: sample.createdAt,
      updatedAt: sample.updatedAt,
      visibility: "public",
    }),
  );
  let setupToken,
    broken = false;
  const log = console.log;
  console.log = (message) => {
    setupToken = /：([a-f0-9]{64})/.exec(message)?.[1] || setupToken;
  };
  let handler;
  try {
    handler = await createAdmin({
      root,
      rebuild: async () => {
        if (broken) throw Error("simulated failure");
        await buildContent(root);
      },
    });
  } finally {
    console.log = log;
  }
  const server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "",
    csrf = "";
  async function req(route, method = "GET", data, headers = {}) {
    const res = await fetch(base + "/api/" + route, {
      method,
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": csrf,
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie"),
    };
  }
  await t.test("authentication, setup token and CSRF", async () => {
    assert.equal((await req("posts")).status, 401);
    assert.equal((await req("setup", "POST", { token: "bad" })).status, 403);
    const login = await req("setup", "POST", {
      token: setupToken,
      username: "tester",
      password: "correct-password-2026",
    });
    assert.equal(login.status, 200);
    cookie = login.cookie.split(";")[0];
    csrf = login.data.csrf;
    assert.match(login.cookie, /HttpOnly/);
    assert.match(login.cookie, /SameSite=Strict/);
    assert.equal(
      (
        await req(
          "categories",
          "PUT",
          { categories: ["x"] },
          { "x-csrf-token": "" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "categories",
          "PUT",
          { categories: ["x"] },
          { origin: "https://foreign.example" },
        )
      ).status,
      403,
    );
    const credentials = JSON.parse(
      await fs.readFile(path.join(root, ".junction/account.json"), "utf8"),
    );
    assert.ok(!JSON.stringify(credentials).includes("correct-password"));
  });
  let p;
  await t.test(
    "draft, publish, optimistic concurrency, private and cleanup",
    async () => {
      let result = await req("posts", "POST", {
        ...sample,
        title: "Private marker 9283",
        visibility: "draft",
      });
      assert.equal(result.status, 200);
      const id = result.data.id;
      assert.ok(
        !String(
          await fs.readFile(path.join(root, "src/generated/posts.json")),
        ).includes("Private marker"),
      );
      p = (await req("posts")).data.find((a) => a.id === id);
      assert.equal(
        (await req("posts", "POST", { ...p, revision: "stale" })).status,
        409,
      );
      assert.equal(
        (await req("posts", "POST", { ...p, visibility: "public" })).status,
        200,
      );
      assert.ok(
        String(
          await fs.readFile(path.join(root, "src/generated/posts.json")),
        ).includes("Private marker"),
      );
      p = (await req("posts")).data.find((a) => a.id === id);
      assert.equal(
        (await req("posts", "POST", { ...p, visibility: "private" })).status,
        200,
      );
      await assert.rejects(
        fs.access(path.join(root, `public/posts/${id}.html`)),
      );
      p = (await req("posts")).data.find((a) => a.id === id);
    },
  );
  await t.test("failed build restores original article", async () => {
    broken = true;
    assert.equal(
      (await req("posts", "POST", { ...p, title: "should roll back" })).status,
      422,
    );
    broken = false;
    assert.equal(
      (await req("posts")).data.find((a) => a.id === p.id).title,
      p.title,
    );
  });
  await t.test(
    "image validation, traversal and referenced deletion",
    async () => {
      assert.equal((await req("image?name=..%2Faccount.json")).status, 400);
      assert.equal(
        (
          await req("images", "POST", {
            name: "x.png",
            data: Buffer.from("<svg/>").toString("base64"),
          })
        ).status,
        400,
      );
      const image = await req("images", "POST", {
        name: "x.png",
        scope: "public",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7f8AAAAASUVORK5CYII=",
      });
      assert.equal(image.status, 200);
      const privateImage = await req("images", "POST", {
        name: "private.png",
        scope: "private",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7f8AAAAASUVORK5CYII=",
      });
      assert.equal(privateImage.status, 200);
      for (const name of [image.data.name, privateImage.data.name]) {
        assert.equal((await fetch(base + "/images/" + name)).status, 401);
        const response = await fetch(base + "/images/" + name, {
          headers: { cookie },
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/png");
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
      assert.equal(
        (
          await fetch(base + "/images/..%2Faccount.json", {
            headers: { cookie },
          })
        ).status,
        400,
      );
      await assert.rejects(
        fs.access(
          path.join(root, "public/blog-images", privateImage.data.name),
        ),
      );

      const first = (await req("posts")).data.find((a) => a.id === 1);
      assert.equal(
        (
          await req("posts", "POST", {
            ...first,
            body: `![x](../images/${image.data.name})`,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req("images", "DELETE", {
            name: image.data.name,
            scope: "public",
          })
        ).status,
        400,
      );
      assert.ok(
        (await fs.readdir(path.join(root, "public/blog-images"))).includes(
          image.data.name,
        ),
      );
    },
  );
  await t.test(
    "backup import validation, sanitization and settings",
    async () => {
      const backup = await req("backup");
      assert.equal(backup.status, 200);
      assert.ok(backup.data.files["content/local/2.md"]);
      assert.ok(!JSON.stringify(backup.data).includes("correct-password"));
      assert.equal((await req("import", "POST", backup.data)).status, 409);
      assert.equal(
        (
          await req("import", "POST", {
            format: "junction-backup-v1",
            files: { "../evil": "YQ==" },
          })
        ).status,
        400,
      );
      const html = (
        await req("preview", "POST", {
          body: "<script>alert(1)</script><img src=x onerror=alert(1)>",
        })
      ).data.html;
      assert.ok(!html.includes("script"));
      assert.ok(!html.includes("onerror"));
      assert.equal(
        (
          await req("settings", "PUT", {
            title: "New title",
            description: "test",
            author: "Author",
            analytics: true,
          })
        ).status,
        200,
      );
      assert.equal((await req("site")).data.title, "New title");
      assert.equal((await req("restore", "POST", backup.data)).status, 200);
      assert.equal((await req("site")).data.title, "JUNCTION LAB");
      assert.equal(
        (await fs.readdir(path.join(root, ".junction/backups"))).length,
        1,
      );
      p = (await req("posts")).data.find((a) => a.id === p.id);
    },
  );
  await t.test("real analytics, deletion and password revocation", async () => {
    assert.equal(
      (
        await req("track", "POST", {
          path: "/#post/1",
          referrer: "https://example.org/page",
        })
      ).status,
      200,
    );
    await req("track", "POST", { path: "/#post/1" });
    assert.equal((await req("analytics")).data.events.length, 1);
    assert.equal(
      (await req(`posts/${p.id}`, "DELETE", { revision: p.revision })).status,
      200,
    );
    assert.equal(
      (await fs.readdir(path.join(root, ".junction/trash"))).length,
      1,
    );
    const last = (await req("posts")).data[0];
    assert.equal(
      (await req("posts/" + last.id, "DELETE", { revision: last.revision }))
        .status,
      400,
    );
    assert.equal(
      (
        await req("password", "PUT", {
          current: "correct-password-2026",
          password: "new-correct-password-2026",
        })
      ).status,
      200,
    );
    assert.equal((await req("posts")).status, 401);
    assert.equal(
      (
        await req("login", "POST", {
          username: "tester",
          password: "correct-password-2026",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await req("login", "POST", {
          username: "tester",
          password: "new-correct-password-2026",
        })
      ).status,
      200,
    );
  });
  await t.test(
    "validation guards: session-only images, invalid ids, marked files",
    async () => {
      // The password change above revoked every session; start a fresh one.
      const login = await req("login", "POST", {
        username: "tester",
        password: "new-correct-password-2026",
      });
      assert.equal(login.status, 200);
      cookie = login.cookie.split(";")[0];
      csrf = login.data.csrf;

      const published = (await req("posts")).data[0];
      assert.equal(published.visibility, "public");
      for (const body of [
        "![x](/api/image?scope=private&name=secret.png)",
        "![x](/images/secret.png)",
        '<img src="../local/images/secret.png">',
      ])
        assert.equal(
          (await req("posts", "POST", { ...published, body })).status,
          400,
          `session-only image reference was accepted: ${body}`,
        );

      // A hand-written file without a numeric id must not produce "NaN.md".
      const broken = path.join(root, "content/posts/not-a-number.md");
      await fs.writeFile(
        broken,
        matter.stringify("# broken", {
          title: "编号缺失",
          category: "测试",
          visibility: "public",
        }),
      );
      const before = await fs.readdir(path.join(root, "content/posts"));
      assert.equal(
        (await req("posts", "POST", { ...sample, id: undefined })).status,
        409,
      );
      const after = await fs.readdir(path.join(root, "content/posts"));
      assert.deepEqual(after, before);
      assert.ok(!after.includes("NaN.md"));
      await fs.rm(broken);

      // private/hidden/password markers are respected outside the build too.
      const marked = path.join(root, "content/posts/900.md");
      await fs.writeFile(
        marked,
        matter.stringify("# marked", {
          id: 900,
          title: "标记未公开",
          category: "测试",
          tags: [],
          author: "Tester",
          createdAt: "2026-09-22T00:00:00.000Z",
          updatedAt: "2026-09-22T00:00:00.000Z",
          visibility: "public",
          private: true,
        }),
      );
      const all = (await req("posts")).data;
      assert.equal(all.find((a) => a.id === 900).visibility, "private");
      await fs.rm(marked);
    },
  );
});

test("response headers, static serving and anonymous limits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "junction-http-"));
  const dist = path.join(root, "dist");
  for (const dir of [
    "content/posts",
    "content/local",
    "content/images",
    "content/local/images",
    "dist/posts",
    "dist/admin",
  ])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  await fs.writeFile(path.join(root, "content/categories.json"), '["测试"]');
  await fs.writeFile(path.join(dist, "index.html"), "<h1>index</h1>");
  await fs.writeFile(path.join(dist, "admin/index.html"), "<h1>admin</h1>");
  await fs.writeFile(path.join(dist, "posts/1.html"), "<p>body</p>");
  await fs.writeFile(path.join(dist, ".secret"), "nope");
  await fs.writeFile(
    path.join(root, "content/posts/1.md"),
    matter.stringify("# hello", {
      id: 1,
      title: "公开",
      category: "测试",
      tags: [],
      author: "Tester",
      createdAt: "2026-09-22T00:00:00.000Z",
      updatedAt: "2026-09-22T00:00:00.000Z",
      visibility: "public",
    }),
  );
  const log = console.log;
  console.log = () => {};
  let app;
  try {
    app = await createApp({ root, dist, rebuild: async () => {} });
  } finally {
    console.log = log;
  }
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route, init) => fetch(base + route, init);

  await t.test("security headers on every static response", async () => {
    for (const route of ["/", "/admin/", "/posts/1.html"]) {
      const response = await get(route);
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-security-policy"),
        contentSecurityPolicy,
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.equal(response.headers.get("strict-transport-security"), null);
    }
    assert.match(
      contentSecurityPolicy,
      /script-src 'self'/,
      "inline scripts must stay blocked",
    );
    assert.match(contentSecurityPolicy, /frame-ancestors 'self'/);
    assert.equal(hstsValue({}), null);
    assert.equal(hstsValue({ JUNCTION_HSTS_MAX_AGE: "0" }), null);
    assert.equal(hstsValue({ JUNCTION_HSTS_MAX_AGE: "abc" }), null);
    assert.equal(
      hstsValue({
        JUNCTION_HSTS_MAX_AGE: "300",
        JUNCTION_HSTS_INCLUDE_SUBDOMAINS: "1",
        JUNCTION_HSTS_PRELOAD: "1",
      }),
      "max-age=300; includeSubDomains; preload",
    );
    assert.deepEqual(securityHeaders({ JUNCTION_CSP: "off" }), {});
    assert.ok(
      securityHeaders({ JUNCTION_CSP_REPORT_ONLY: "1" })[
        cspHeaderName({ JUNCTION_CSP_REPORT_ONLY: "1" })
      ] === contentSecurityPolicy,
    );
  });

  await t.test("static routing, traversal and methods", async () => {
    assert.equal((await get("/admin", { redirect: "manual" })).status, 302);
    assert.equal((await get("/.secret")).status, 404);
    assert.equal((await get("/%2e%2e/package.json")).status, 404);
    assert.equal(
      (await get("/posts/../../.junction/account.json")).status,
      404,
    );
    assert.equal((await get("/%ZZ")).status, 400);
    assert.equal((await get("/../package.json")).status, 404);
    assert.equal((await get("/", { method: "POST" })).status, 405);
    assert.equal((await get("/missing")).status, 404);
  });

  await t.test("anonymous analytics limits", async () => {
    const post = (body, headers = {}) =>
      fetch(base + "/api/track", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post({ path: "/" }, { "user-agent": "a" })).status,
      200,
    );
    assert.equal(
      (
        await post(
          { path: "/", padding: "x".repeat(20 * 1024) },
          { "user-agent": "a" },
        )
      ).status,
      413,
      "the anonymous endpoint must not accept 32MB bodies",
    );
    assert.equal((await post({ path: 17 }, { "user-agent": "b" })).status, 200);
    for (let i = 0; i < TRACK_EVENTS_PER_WINDOW + 5; i++)
      assert.equal(
        (await post({ path: "/" }, { "user-agent": `rotating-${i}` })).status,
        200,
      );
    const events = JSON.parse(
      await fs.readFile(path.join(root, ".junction/analytics.json"), "utf8"),
    );
    assert.equal(events.length, TRACK_EVENTS_PER_WINDOW);
    assert.ok(events.every((e) => typeof e.path === "string"));
  });

  await t.test("malformed image aliases fail closed", async () => {
    // fetch() escapes a bare "%", so send the raw request line instead.
    const raw = (route) =>
      new Promise((resolve, reject) => {
        const request = http.request(
          {
            host: "127.0.0.1",
            port: server.address().port,
            path: route,
            method: "GET",
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
          },
        );
        request.on("error", reject);
        request.end();
      });
    assert.equal(await raw("/images/%ZZ"), 400);
    assert.equal(await raw("/%ZZ"), 400);
    // Unauthenticated callers are turned away before any path is resolved.
    assert.equal(await raw("/images/..%2Faccount.json"), 401);
    assert.equal((await get("/api/image?name=x.png")).status, 401);
  });
});
