"use strict";
// Spawns the real editor, drives it through real MCP HTTP, shuts it down.
const { spawn } = require("node:child_process");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", "electron.exe");
async function waitHealth(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); const j = await r.json(); if (j.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("app never healthy");
}
async function main() {
  const app = spawn(ELECTRON, [path.join(ROOT, "apps", "editor")], {
    env: { ...process.env, PALM_DEMO: "1", PALM_HEADLESS: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let log = "";
  app.stdout.on("data", (d) => { log += d; });
  app.stderr.on("data", (d) => { log += d; });
  const kill = () => { try { app.kill(); } catch {} };
  try {
    await waitHealth("http://127.0.0.1:19789/health");
    const code = await new Promise((res) => {
      const c = spawn(process.execPath, [path.join(__dirname, "mcp-e2e.js")], { stdio: "inherit" });
      c.on("close", res);
    });
    if (code !== 0) throw new Error("client exit " + code);
    console.log("RUN-MCP-E2E-PASS");
  } catch (e) {
    console.error("RUN-MCP-E2E-FAIL", e.message, "\n---app log---\n" + log.slice(-2000));
    process.exitCode = 1;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 1500));
    try { require("child_process").execSync("taskkill /F /IM electron.exe"); } catch {}
  }
}
main();
