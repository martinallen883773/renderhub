import { build } from "esbuild";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const isProduction = process.env.NODE_ENV === "production";

async function buildProject() {
  console.log("Building frontend with Vite...");
  execSync("npx vite build", { stdio: "inherit" });

  console.log("Building server with esbuild...");
  await build({
    entryPoints: [path.resolve("server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: path.resolve("dist/index.cjs"),
    format: "cjs",
    sourcemap: false,
    minify: isProduction,
    external: [
      "pg-native",
      "better-sqlite3",
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  console.log("Build complete!");
}

buildProject().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
