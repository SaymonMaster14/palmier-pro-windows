"use strict";
// Scripted agentic editing task through real MCP transport:
// inspect -> transform clip -> add text -> adjust audio -> save -> export -> validate.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", "electron.exe");
const BASE = "http://127.0.0.1:" + (process.env.PALM_MCP_PORT || 19789) + "/mcp";
let id = 0;
async function call(method, params) {
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ++id, method, params }) });
  const j = await r.json();
  if (!j.ok || (j.result && j.result.ok === false)) throw new Error(method + " failed: " + (j.error || JSON.stringify(j.result)));
  return j.result;
}
async function waitHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE.replace("/mcp", "/health")); if ((await r.json()).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("app never healthy");
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "palm-agent-"));
  const app = spawn(ELECTRON, [path.join(ROOT, "apps", "editor")], {
    env: { ...process.env, PALM_DEMO: "1", PALM_HEADLESS: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let log = "";
  app.stdout.on("data", (d) => { log += d; });
  const kill = () => { try { app.kill(); } catch {} };
  try {
    await waitHealth();
    const g = await call("getProject", {});
    const seq = g.sequences[0];
    const clip = (await call("listClips", { sequenceId: seq.id }))[0];
    if (!clip) throw new Error("demo clip missing");
    await call("setTransform", { sequenceId: seq.id, clipId: clip.id, patch: { scaleX: 0.8, scaleY: 0.8 } });
    await call("setOpacity", { sequenceId: seq.id, clipId: clip.id, opacity: 0.9 });
    await call("setVolume", { sequenceId: seq.id, clipId: clip.id, volume: 0.5 });
    const v2id = (await call("addTrack", { sequenceId: seq.id, kind: "video", name: "V2" })).ids[0];
    const txt = await call("placeClip", { sequenceId: seq.id, trackId: v2id, clip: { kind: "text", startFrame: 0, durationFrames: 45, name: "agent-title", text: "Agent Cut" } });
    if (!txt.ok) throw new Error("text place failed: " + JSON.stringify(txt));
    await call("saveProject", { path: path.join(dir, "agent.palmier.json") });
    const out = path.join(dir, "agent.mp4");
    const ex = await call("export", { sequenceId: seq.id, outPath: out });
    if (!ex.validation || ex.validation.ok === false) throw new Error("export validation failed: " + JSON.stringify(ex));
    await call("undo", {});
    console.log(`AGENT-TASK-PASS clips=1+text export=${ex.bytes}b ${ex.validation.details}`);
  } catch (e) {
    console.error("AGENT-TASK-FAIL", e.message, "\n---app log---\n" + log.slice(-2000));
    process.exitCode = 1;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 1500));
    try { require("child_process").execSync("taskkill /F /IM electron.exe"); } catch {}
  }
}
main();

