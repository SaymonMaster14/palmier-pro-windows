"use strict";
// Main owns the single EditorStore. UI (renderer) and MCP operate on this same store.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

let win = null;
let store = null;
let core = null;
let mcpServer = null;

const OPS = ["placeClip", "moveClip", "trimEnd", "trimStart", "splitClip", "deleteClip", "setText", "setVolume"];

async function loadDemo() {
  try {
    const fix = path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", "sample-av.mp4");
    const pr = await core.probeMedia(fix);
    const fps = { num: 30, den: 1 };
    store.addMedia({ path: fix, kind: "video", name: "sample-av", durationFrames: core.secondsToFrames(pr.durationSec, fps), fps });
    const seq = core.createSequence(store.project, "Demo", fps, 640, 360);
    const v1 = core.addTrack(seq, "video", "V1");
    const r = store.placeClip(seq.id, v1.id, { kind: "video", assetId: store.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: "demo" });
    console.log("DEMO-LOAD", JSON.stringify(r));
  } catch (e) { console.warn("DEMO-SKIP", String((e && e.message) || e)); }
}

function registerIpc() {
  ipcMain.handle("state", () => store.project);
  ipcMain.handle("health", () => ({ ok: true, app: "palmier-pro-windows" }));
  ipcMain.handle("clipAt", (_e, seqId, frame) => {
    const s = store.project.sequences.find((x) => x.id === seqId);
    if (!s) throw new Error("sequence not found");
    return core.videoClipAt(s, frame) || null;
  });
  ipcMain.handle("op", (_e, name, args) => {
    if (name === "undo") return { undone: store.undo() };
    if (name === "redo") return { redone: store.redo() };
    if (!OPS.includes(name)) throw new Error("unknown op " + name);
    return store[name](...args);
  });
}

async function boot() {
  core = await import("@palmier/core");
  store = new core.EditorStore(core.createProject("Untitled"));
  if (process.env.PALM_DEMO) await loadDemo();
  const port = Number(process.env.PALM_MCP_PORT || 19789);
  try {
    const started = await core.startMcpServer(store, { port });
    mcpServer = started.server;
    console.log("MCP-LISTEN", port);
  } catch (e) { console.warn("MCP-SKIP", String((e && e.message) || e)); }

  await app.whenReady();
  registerIpc();
  win = new BrowserWindow({
    width: 1280, height: 800, show: !process.env.PALM_HEADLESS,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.on("closed", () => { win = null; });
  await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  if (process.env.PALM_SMOKE) {
    const n = await win.webContents.executeJavaScript("window.palmier.state().then(s => s.sequences.length)");
    console.log("SMOKE-STATE-SEQ", n);
    console.log("BOOT-OK");
    app.quit();
  }
}

app.on("window-all-closed", () => { try { if (mcpServer) mcpServer.close(); } catch (e) {} if (process.platform !== "darwin") app.quit(); });
boot().catch((e) => { console.error("BOOT-FAIL", e); app.exit(1); });
