/**
 * Собирает api/_entry.ts + server/ + src/ в один api/index.js для Vercel.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["api/_entry.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
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
      "// Vercel — bundled API",
      'import { createRequire } from "module";',
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
});

console.log("✓ api/index.js");
