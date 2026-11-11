import { defineConfig } from "vite";
import { createAdmin } from "./server/admin.mjs";
import { buildContent } from "./scripts/export-records.mjs";
import { contentSecurityPolicy, cspHeaderName } from "./server/security.mjs";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin/index.html",
        editor: "admin/editor.html",
      },
    },
  },
  server: {
    watch: {
      ignored: [
        "**/.junction/**",
        "**/public/posts/**",
        "**/public/blog-images/**",
        "**/src/generated/**",
      ],
    },
    fs: {
      deny: [
        "**/blog_data/**",
        "**/.junction/**",
        "**/server/**",
        "**/content/**",
        "**/content/local/**",
        "**/vanblog/**",
        "**/.env*",
        "**/.git/**",
      ],
    },
  },
  plugins: [
    {
      name: "junction-dev-security",
      // Report-Only keeps the production policy visible in the dev console
      // without blocking HMR, which needs inline styles and a websocket.
      configureServer(server) {
        if (process.env.JUNCTION_CSP === "off") return;
        const header = cspHeaderName({ JUNCTION_CSP_REPORT_ONLY: "1" });
        server.middlewares.use((_, res, next) => {
          res.setHeader(header, contentSecurityPolicy);
          next();
        });
      },
    },
    {
      name: "junction-markdown",
      async configureServer(server) {
        let pending;
        let chain = Promise.resolve();
        const rebuild = () => {
          const task = chain
            .then(() => buildContent())
            .then(() => {
              server.moduleGraph.invalidateAll();
              server.ws.send({ type: "full-reload", path: "/index.html" });
            });
          chain = task.catch(() => {});
          return task;
        };
        const admin = await createAdmin({ root: import.meta.dirname, rebuild });
        server.middlewares.use(admin);
        server.watcher.add(new URL("./content", import.meta.url).pathname);
        server.watcher.on("all", (_, file) => {
          if (!file.includes("/content/") || file.includes("/content/local/"))
            return;
          clearTimeout(pending);
          pending = setTimeout(() => {
            rebuild().catch((error) =>
              server.config.logger.error(String(error)),
            );
          }, 180);
        });
      },
    },
  ],
});
