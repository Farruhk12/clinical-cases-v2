import { build } from "esbuild";

await build({
  entryPoints: ["server/api-entry.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: {
    js: [
      'import { createRequire } from "module";',
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
  external: [
    // Node built-ins
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
    // Keep native/binary deps external — Vercel bundles them from node_modules
    "bcryptjs",
    "postgres",
    "pptxgenjs",
    "jszip",
    "sanitize-html",
  ],
  sourcemap: false,
  minify: false,
});

console.log("api/index.js built");
