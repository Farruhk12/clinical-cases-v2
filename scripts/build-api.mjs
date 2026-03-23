/**
 * Собирает api/index.ts + все server/ и src/ зависимости
 * в один файл api/index.mjs, который Vercel запускает как серверлесс-функцию.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["api/_entry.ts"],
  outfile: "api/index.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
  // Node built-ins — не бандлить
  external: [
    "node:*",
    "crypto",
    "path",
    "url",
    "fs",
    "stream",
    "events",
    "util",
    "net",
    "tls",
    "http",
    "https",
    "os",
    "buffer",
    "string_decoder",
    "querystring",
    "zlib",
    "child_process",
    "worker_threads",
    "assert",
    "async_hooks",
    "perf_hooks",
    "diagnostics_channel",
  ],
  banner: {
    js: [
      '// Vercel serverless function — bundled by esbuild',
      'import { createRequire } from "module";',
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
});

console.log("✓ api/index.mjs built");
