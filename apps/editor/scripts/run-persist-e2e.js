"use strict";
// App-restart persistence E2E: phase 1 edits + saves in a running app;
// phase 2 reboots the app from the saved file and verifies identical state.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", "electron.exe");
const PROJ = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "palm-persist-")), "p.palmier.json");
let id = 0;
const BASE = "http://127.0.0.1:19789/mcp";
async function call(method, params) {
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ++id, method, params }) });
  const j = await r.json();
  if (!j.ok) throw new Error(method + " failed: " + (j.error || JSON.stringify(j)));
  return j.result;
}
function launch(extraEnv) {
  return spawn(ELECTRON, [path.join(ROOT, "apps", "editor")], {
    env: { ...process.env, PALM_HEADLESS: "1", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
}
async function waitHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE.replace("/mcp", "/health")); if ((await r.json()).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("app never healthy");
}
const kill = (app) => { try { app.kill(); } catch {} };
async function main() {
  let app = launch({ PALM_DEMO: "1", PALM_PROJECT: PROJ });
  let log = "";
  app.stdout.on("data", (d) => { log += d; });
  try {
    await waitHealth();
    const g = await call("getProject", {});
    const seq = g.sequences[0];
    const track = seq.tracks.find((t) => t.kind === "video");
    const placed = await call("placeClip", { sequenceId: seq.id, trackId: track.id, clip: { kind: "video", assetId: g.media[0].id, startFrame: 90, durationFrames: 30, name: "persist-clip" } });
    if (!placed.ok) throw new Error("place failed");
    const saved = await call("saveProject", { path: PROJ });
    if (!saved.saved) throw new Error("save failed");
    const want = await call("listClips", { sequenceId: seq.id });
    kill(app);
    await new Promise((r) => setTimeout(r, 2000));
    app = launch({ PALM_PROJECT: PROJ });
    app.stdout.on("data", (d) => { log += d; });
    await waitHealth();
    const g2 = await call("getProject", {});
    const got = await call("listClips", { sequenceId: g2.sequences[0].id });
    const a = JSON.stringify(want.map((c) => [c.id, c.startFrame, c.durationFrames]).sort());
    const b = JSON.stringify(got.map((c) => [c.id, c.startFrame, c.durationFrames]).sort());
    if (a !== b) throw new Error(`state mismatch after reopen:\n${a}\n${b}`);
    console.log(`PERSIST-E2E-PASS clips=${got.length} path=${PROJ}`);
  } catch (e) {
    console.error("PERSIST-E2E-FAIL", e.message, "\n---app log---\n" + log.slice(-2000));
    process.exitCode = 1;
  } finally {
    kill(app);
    await new Promise((r) => setTimeout(r, 1500));
    try { require("child_process").execSync("taskkill /F /IM electron.exe"); } catch {}
  }
}
main();

