import { mkdirSync } from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";

const databasePath = path.resolve(
  process.env.DATABASE_PATH ?? "data/emi.sqlite",
);
mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
process.umask(0o077);
const { app, db } = createApp(databasePath);
const port = Number(process.env.PORT ?? 3100);
const host = process.env.APP_HOST ?? "127.0.0.1";
let vite: { close(): Promise<void> } | undefined;
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const dev = await createServer({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.HMR_PORT ?? 24679) },
    },
    appType: "spa",
  });
  vite = dev;
  app.use(dev.middlewares);
} else {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
const server = app.listen(port, host, () =>
  console.log(`EMI Tracker is ready at http://${host}:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    server.close(() => {
      db.close();
      void vite?.close().finally(() => process.exit(0));
      if (!vite) process.exit(0);
    });
  });
