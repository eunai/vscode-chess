const esbuild = require("esbuild");

const minify = process.argv.includes("--minify");

/** Node extension host bundle. */
const host = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  sourcemap: !minify,
  minify,
};

/** Browser webview bundle. Imports chessground + CSS; esbuild emits a
 * dist/webview.css sidecar alongside the IIFE script. */
const webview = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  sourcemap: !minify,
  minify,
};

Promise.all([esbuild.build(host), esbuild.build(webview)]).catch(() => process.exit(1));
