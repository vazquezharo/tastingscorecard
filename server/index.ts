import { createApp } from "./app.js";
import express from "express";
import { resolve } from "node:path";
const app = createApp();
const base = process.env.BASE_PATH || "";
if (process.env.NODE_ENV === "production" || process.env.SERVE_BUILD === "1") {
  app.use(base, express.static(resolve("dist")));
  app.get(/.*/, (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`Tasting listening on port ${process.env.PORT || 3000}${base}`),
);
