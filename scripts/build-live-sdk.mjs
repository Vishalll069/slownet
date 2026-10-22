// Bundles the drop-in live client served at /slownet-live.js (run before dev and build).
import { build } from "esbuild";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "apps/dashboard/public/slownet-live.js");

await build({
  entryPoints: [resolve(root, "packages/core/src/live/browser.ts")],
  outfile,
  bundle: true,
  format: "iife",
  minify: true,
  target: ["es2020"],
  legalComments: "none",
  banner: { js: "/* SlowNet live client: shapes fetch in your app and reports timings to your SlowNet session. Sends method, origin+path, timings and status only. */" },
});

console.log(`slownet-live.js: ${(statSync(outfile).size / 1024).toFixed(1)} kB`);
