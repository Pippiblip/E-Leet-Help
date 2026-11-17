import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { context, build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(root, "dist");
const baseUrl = process.env.FLASK_BASE_URL || "http://127.0.0.1:5000";
let parsedBase;

try {
  parsedBase = new URL(baseUrl);
} catch {
  throw new Error("FLASK_BASE_URL must be a valid absolute URL.");
}
if (!["http:", "https:"].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password) {
  throw new Error("FLASK_BASE_URL must use HTTP or HTTPS and must not contain credentials.");
}

const production = parsedBase.protocol === "https:";
if (!production && parsedBase.hostname !== "127.0.0.1" && parsedBase.hostname !== "localhost") {
  throw new Error("Non-local Flask endpoints must use HTTPS.");
}

const entries = {
  hook: path.join(root, "src", "hook", "hook.ts"),
  content: path.join(root, "src", "content", "content.ts"),
  background: path.join(root, "src", "background", "service-worker.ts"),
};

async function prepare() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  const flaskPermission = `${parsedBase.origin}/*`;
  manifest.host_permissions = [
    "https://leetcode.com/*",
    flaskPermission,
  ].filter((permission, index, list) => list.indexOf(permission) === index);
  await writeFile(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const options = {
  entryPoints: entries,
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
  define: {
    __FLASK_BASE_URL__: JSON.stringify(parsedBase.origin),
  },
  logLevel: "info",
};

await prepare();
if (process.argv.includes("--watch")) {
  const watcher = await context(options);
  await watcher.watch();
  console.log(`Watching extension sources; Flask endpoint: ${parsedBase.origin}`);
} else {
  await build(options);
  console.log(`Built extension into ${outdir}; Flask endpoint: ${parsedBase.origin}`);
}
