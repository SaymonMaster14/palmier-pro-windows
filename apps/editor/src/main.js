"use strict";
// Main owns the single EditorStore. UI (renderer) and MCP operate on this same store.
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");

let win = null;
let store = null;
let core = null;
let mcpServer = null;
let projectPath = null;

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
  ipcMain.on("geomSync", (e, kind, args) => { e.returnValue = (kind === "pxToFrame" || kind === "frameToPx") ? core[kind](...args) : null; });
  ipcMain.handle("saveProject", async (_e, p) => { const fp = p || projectPath || path.join(app.getPath("userData"), "untitled.palmier.json"); await core.saveProject(store.project, fp); projectPath = fp; return { saved: fp }; });
  ipcMain.handle("openProject", async (_e, p) => { const loaded = await core.loadProject(p); store.loadFrom(loaded); projectPath = p; changed(); return { opened: p, clips: loaded.sequences.reduce((n, s) => n + s.clips.length, 0) }; });
  ipcMain.handle("importMedia", async (_e, paths) => {
    if (!paths || !paths.length) { const sel = await dialog.showOpenDialog(win, { properties: ["openFile", "multiSelections"] }); if (sel.canceled) return []; paths = sel.filePaths; }
    const out = [];
    for (const fp of paths) {
      const pr = await core.probeMedia(fp);
      const kind = pr.still ? "image" : pr.hasVideo ? "video" : "audio";
      let seq = store.project.sequences.find((s) => s.id === store.project.activeSequenceId) || store.project.sequences[0];
      if (!seq) seq = core.createSequence(store.project, "Sequence 1", { num: 30, den: 1 }, 1280, 720);
      const fps = seq.fps;
      const durF = kind === "image" ? 90 : core.secondsToFrames(pr.durationSec, fps);
      const r = store.addMedia({ path: fp, kind, name: path.basename(fp), durationFrames: durF, fps, width: pr.width, height: pr.height, audioChannels: pr.audioChannels, sampleRate: pr.sampleRate });
      const assetId = r.ids[0] || store.project.media.find((m) => m.path === fp).id;
      const tk = kind === "audio" ? "audio" : "video";
      let track = seq.tracks.find((x) => x.kind === tk && !x.locked) || core.addTrack(seq, tk, (tk === "audio" ? "A" : "V") + (seq.tracks.filter((x) => x.kind === tk).length + 1));
      const start = seq.clips.filter((c) => c.trackId === track.id).reduce((m, c) => Math.max(m, c.startFrame + c.durationFrames), 0);
      const clipKind = kind === "image" ? "image" : kind === "audio" ? "audio" : "video";
      const placed = store.placeClip(seq.id, track.id, { kind: clipKind, assetId, startFrame: start, durationFrames: durF, name: path.basename(fp) });
      out.push({ path: fp, kind, assetId, placed });
    }
    return out;
  });
  ipcMain.handle("exportActive", async (_e, outPath) => {
    const seq = store.project.sequences.find((s) => s.id === store.project.activeSequenceId) || store.project.sequences[0];
    if (!seq) throw new Error("no sequence");
    const fp = outPath || path.join(app.getPath("userData"), "export.mp4");
    const r = await core.exportSequence(store.project, seq.id, fp);
    let v = await core.validateExport(fp, r.durationSec, true).catch((e) => ({ ok: false, details: String((e && e.message) || e) }));
    if (!v.ok && /no audio stream/.test(v.details)) v = { ...(await core.validateExport(fp, r.durationSec, false)), audioNote: "timeline sources carry no audio" };
    return { ...r, validation: v };
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
  let rev = 0;
  const rawExec = store.exec.bind(store);
  const changed = () => { if (win) { rev++; try { win.webContents.send("store-changed", rev); } catch (e) {} } };
  store.exec = (label, fn) => { const r = rawExec(label, fn); if (r.ok && !r.noop) changed(); return r; };
  projectPath = process.env.PALM_PROJECT || null;
  if (projectPath) { try { store.loadFrom(await core.loadProject(projectPath)); console.log("PROJECT-LOAD", projectPath); } catch (e) { console.warn("PROJECT-LOAD-FAIL", String((e && e.message) || e)); } }
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
    const ui = await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const c = q.clips[0]; if (!c) return 'no-clip'; const r = await window.palmier.op('splitClip', [q.id, c.id, 45]); const s2 = await window.palmier.state(); return r.ok + ':' + s2.sequences[0].clips.length; })()");
    console.log("SMOKE-UI-OP", ui);
    console.log("SMOKE-GEOM", await win.webContents.executeJavaScript("typeof (window.palmier.geom() || {}).pxToFrame"));
    if (process.env.PALM_SMOKE_IO) {
      const fix = (n) => path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", n);
      const im = await win.webContents.executeJavaScript(`(async () => { const r = await window.palmier.importMedia(${JSON.stringify([fix("sample-av.mp4"), fix("sample-img.png"), fix("sample-audio.wav")]).replace(/\\\\/g, "\\\\\\\\")}); const s = await window.palmier.state(); return r.length + ":" + s.media.length + ":" + s.sequences[0].clips.length; })()`);
      console.log("SMOKE-IO-IMPORT", im);
      const ex = await win.webContents.executeJavaScript(`(async () => { const r = await window.palmier.exportActive(${JSON.stringify(process.env.PALM_SMOKE_OUT || (process.env.TEMP + "/smoke-export.mp4"))}); return r.bytes + ":" + r.validation.ok; })()`);
      console.log("SMOKE-IO-EXPORT", ex);
    }
    console.log("BOOT-OK");
    app.quit();
  }
}

app.on("window-all-closed", () => { try { if (mcpServer) mcpServer.close(); } catch (e) {} if (process.platform !== "darwin") app.quit(); });
boot().catch((e) => { console.error("BOOT-FAIL", e); app.exit(1); });








