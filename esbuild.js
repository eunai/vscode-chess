const esbuild = require("esbuild");

const minify = process.argv.includes("--minify");

esbuild
  .build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "dist/extension.js",
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    sourcemap: !minify,
    minify,
  })
  .catch(() => process.exit(1));
