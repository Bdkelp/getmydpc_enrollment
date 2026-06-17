import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
