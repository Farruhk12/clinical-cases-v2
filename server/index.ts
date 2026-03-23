import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createApiApp } from "./createApiApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createApiApp();
const port = Number(process.env.PORT ?? 3001);

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(dist, "index.html"));
});

const server = app.listen(port, () => {
  console.log(`API http://localhost:${port}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Порт ${port} уже занят. Закройте другой процесс или задайте в .env другой PORT=… и снова npm run dev.`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
