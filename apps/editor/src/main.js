"use strict";
// Main owns the single EditorStore. UI (renderer) and MCP operate on this same store.
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let win = null;
let store = null;
let core = null;
let mcpServer = null;
let projectPath = null;
let notify = () => {};

const OPS = ["placeClip", "moveClip", "trimEnd", "trimStart", "splitClip", "deleteClip", "setText", "setVolume", "setTransform", "setOpacity", "addTrack", "rippleDelete", "addMarker", "removeMarker", "setFade", "overwritePlace", "setKeyframe", "removeKeyframe", "setTransition", "setSpeed", "setCrop", "setBlend", "setTrackFlags", "deleteClips", "moveClips"];

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
  ipcMain.handle("waveform", async (_e, assetId, buckets) => { const m = store.project.media.find((x) => x.id === assetId); if (!m) throw new Error("media not found"); return core.waveformPeaks(m.path, buckets || 200); });
  ipcMain.handle("evalKeys", (_e, seqId, clipId, frame) => { const s = store.project.sequences.find((x) => x.id === seqId); const c = s && s.clips.find((x) => x.id === clipId); if (!c) throw new Error("clip not found"); return { op: core.evaluateKeyframes(c.opacityKeys || [], frame, c.opacity), vol: core.evaluateKeyframes(c.volumeKeys || [], frame, c.volume) }; });
  ipcMain.handle("thumb", async (_e, assetId) => { const m = store.project.media.find((x) => x.id === assetId); if (!m) throw new Error("media not found"); return core.thumbnail(m.path, path.join(app.getPath("userData"), "thumbs")); });
  ipcMain.handle("clipAt", (_e, seqId, frame) => {
    const s = store.project.sequences.find((x) => x.id === seqId);
    if (!s) throw new Error("sequence not found");
    return core.videoClipAt(s, frame) || null;
  });
  ipcMain.on("geomSync", (e, kind, args) => { e.returnValue = (kind === "pxToFrame" || kind === "frameToPx") ? core[kind](...args) : null; });
  ipcMain.handle("snapMove", (_e, seqId, clipId, rawStart, ph) => { const s = store.project.sequences.find((x) => x.id === seqId); if (!s) throw new Error("sequence not found"); return core.snapClipStart(s.clips, clipId, rawStart, 6, { playheadFrame: ph, markerFrames: (s.markers || []).map((m) => m.startFrame) }); });
  ipcMain.handle("saveProject", async (_e, p) => { const fp = p || projectPath || path.join(app.getPath("userData"), "untitled.palmier.json"); await core.saveProject(store.project, fp); projectPath = fp; touchRecent(fp); return { saved: fp }; });
  const recentsFile = () => path.join(app.getPath("userData"), "recents.json");
  const readRecents = () => { try { return JSON.parse(fs.readFileSync(recentsFile(), "utf8")); } catch (e) { return []; } };
  const touchRecent = (fp) => { try { const l = [fp, ...readRecents().filter((x) => x !== fp)].slice(0, 10); fs.writeFileSync(recentsFile(), JSON.stringify(l)); } catch (e) {} };
  ipcMain.handle("newProject", async (_e, name) => { store.loadFrom(core.createProject(name || "Untitled")); projectPath = null; notify(); return { name: store.project.name }; });
  ipcMain.handle("listRecents", async () => readRecents().filter((fp) => { try { return fs.statSync(fp).isFile(); } catch (e) { return false; } }));
  ipcMain.handle("openProject", async (_e, p) => { if (!p) { const sel = await dialog.showOpenDialog(win, { properties: ["openFile"] }); if (sel.canceled) return { opened: null }; p = sel.filePaths[0]; } const loaded = await core.loadProject(p); store.loadFrom(loaded); projectPath = p; touchRecent(p); notify(); return { opened: p, clips: loaded.sequences.reduce((n, s) => n + s.clips.length, 0) }; });
  ipcMain.handle("importMedia", async (_e, paths) => {
    if (!paths || !paths.length) { const sel = await dialog.showOpenDialog(win, { properties: ["openFile", "multiSelections"] }); if (sel.canceled) return []; paths = sel.filePaths; }
    return core.importAndPlace(store, paths);
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
  ipcMain.handle("agentRun", async (_e, text, ctx) => {
    try {
      const it = core.parseAgentCommand(store.project, ctx, String(text));
      const seqId = ctx.sequenceId;
      switch (it.op) {
        case "splitClip": return "split: " + JSON.stringify(store.splitClip(seqId, it.clipId, it.atFrame));
        case "deleteClip": return "deleted: " + JSON.stringify(store.deleteClip(seqId, it.clipId));
        case "rippleDelete": return "ripple: " + JSON.stringify(store.rippleDelete(seqId, it.clipId));
        case "addMarker": return "marker: " + JSON.stringify(store.addMarker(seqId, { name: it.name, startFrame: it.atFrame }));
        case "addText": { const sq = store.project.sequences.find((x) => x.id === seqId); const tr = sq.tracks.find((x) => x.kind === "video") || core.addTrack(sq, "video", "V-text"); const r = store.placeClip(seqId, tr.id, { kind: "text", startFrame: it.atFrame, durationFrames: 60, name: "agent", text: it.text }); return "text: " + JSON.stringify(r); }
        case "setVolume": return "volume: " + JSON.stringify(store.setVolume(seqId, it.clipId, it.volume));
        case "undo": return "undo: " + store.undo();
        case "redo": return "redo: " + store.redo();
      }
    } catch (e) { return "error: " + String((e && e.message) || e); }
  });
  const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
  const readSettings = () => { let s = {}; try { s = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch (e) {} return { mcpPort: 19789, exportDir: "", ...s }; };
  ipcMain.handle("getSettings", async () => ({ ...readSettings(), deps: checkDeps() }));
  ipcMain.handle("setSettings", async (_e, patch) => { const s = { ...readSettings(), ...patch }; if (s.mcpPort !== undefined && (!Number.isInteger(s.mcpPort) || s.mcpPort < 1024 || s.mcpPort > 65535)) throw new Error("bad port"); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); return { ...s, note: "mcpPort applies on restart" }; });
  ipcMain.handle("op", (_e, name, args) => {
    if (name === "undo") return { undone: store.undo() };
    if (name === "redo") return { redone: store.redo() };
    if (!OPS.includes(name)) throw new Error("unknown op " + name);
    return store[name](...args);
  });
}

function checkDeps() {
  const out = {};
  for (const bin of ["ffmpeg", "ffprobe"]) {
    try { const r = spawnSync(bin, ["-version"], { encoding: "utf8", windowsHide: true }); out[bin] = r.status === 0 ? r.stdout.split("\n")[0] : "MISSING(exit " + r.status + ")"; }
    catch (e) { out[bin] = "MISSING(" + e.message + ")"; }
  }
  console.log("DEPS", JSON.stringify(out));
  if (/MISSING/.test(out.ffmpeg + out.ffprobe)) {
    const msg = "ffmpeg/ffprobe not found on PATH. Install FFmpeg and reopen. Import and export are disabled until then.";
    console.error("DEPS-FAIL", msg);
    try { dialog.showErrorBox("Missing dependency", msg); } catch (e) {}
  }
  return out;
}
async function boot() {
  checkDeps();
  core = await import("@palmier/core");
  store = new core.EditorStore(core.createProject("Untitled"));
  let rev = 0;
  const rawExec = store.exec.bind(store);
  notify = () => { if (win) { rev++; try { win.webContents.send("store-changed", rev); } catch (e) {} } };
  store.exec = (label, fn) => { const r = rawExec(label, fn); if (r.ok && !r.noop) notify(); return r; };
  projectPath = process.env.PALM_PROJECT || null;
  if (projectPath) { try { store.loadFrom(await core.loadProject(projectPath)); console.log("PROJECT-LOAD", projectPath); } catch (e) { console.warn("PROJECT-LOAD-FAIL", String((e && e.message) || e)); } }
  if (process.env.PALM_DEMO) await loadDemo();
  const port = Number(process.env.PALM_MCP_PORT || readSettings().mcpPort || 19789);
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
    const ui = await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; if (!q || !q.clips[0]) return 'no-clip'; const c = q.clips[0]; const r = await window.palmier.op('splitClip', [q.id, c.id, 45]); const s2 = await window.palmier.state(); return r.ok + ':' + s2.sequences[0].clips.length; })()");
    console.log("SMOKE-UI-OP", ui);
    console.log("SMOKE-GEOM", await win.webContents.executeJavaScript("typeof (window.palmier.geom() || {}).pxToFrame"));
    console.log("SMOKE-SNAP", await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const t = q.tracks.find(x => x.kind === 'video'); const m = s.media[0]; await window.palmier.op('placeClip', [q.id, t.id, { kind: 'video', assetId: m.id, startFrame: 120, durationFrames: 30, name: 'snap-b' }]); const b = (await window.palmier.state()).sequences[0].clips.find(c => c.startFrame === 120); return window.palmier.snapMove(q.id, b.id, 93, 0); })()"));
    if (process.env.PALM_SMOKE_IO) {
      const fix = (n) => path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", n);
      const im = await win.webContents.executeJavaScript(`(async () => { const r = await window.palmier.importMedia(${JSON.stringify([fix("sample-av.mp4"), fix("sample-img.png"), fix("sample-audio.wav")]).replace(/\\\\/g, "\\\\\\\\")}); const s = await window.palmier.state(); return r.length + ":" + s.media.length + ":" + s.sequences[0].clips.length; })()`);
      console.log("SMOKE-IO-IMPORT", im);
      const ex = await win.webContents.executeJavaScript(`(async () => { const r = await window.palmier.exportActive(${JSON.stringify(process.env.PALM_SMOKE_OUT || (process.env.TEMP + "/smoke-export.mp4"))}); return r.bytes + ":" + r.validation.ok; })()`);
      console.log("SMOKE-IO-EXPORT", ex);
    }
    console.log("SMOKE-TH", await win.webContents.executeJavaScript("(async () => { await new Promise(r => setTimeout(r, 1500)); const ims = [...document.querySelectorAll('#media img')]; return ims.map(i => (i.alt || '?') + '=' + (i.src ? 'y' : 'n') + (i.naturalWidth || 0)).join(','); })()"));
    console.log("SMOKE-SEARCH", await win.webContents.executeJavaScript("(async () => { const q = document.querySelector('#q'); q.value = 'sample'; q.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 50)); const n = document.querySelectorAll('#media div').length; const h = document.querySelector('#hits').textContent; return n + '|' + h; })()"));
    console.log("SMOKE-PROJ", await win.webContents.executeJavaScript("(async () => { const sv = await window.palmier.saveProject(); const rs = await window.palmier.listRecents(); const hasRec = rs.includes(sv.saved); await window.palmier.newProject('fresh'); const empty = (await window.palmier.state()).sequences.length; await window.palmier.openProject(sv.saved); const back = (await window.palmier.state()).sequences[0].clips.length; return hasRec + ':' + empty + ':' + back; })()"));
    console.log("SMOKE-SETS", await win.webContents.executeJavaScript("(async () => { const a = await window.palmier.getSettings(); const bad = await window.palmier.setSettings({ mcpPort: 80 }).then(() => 'nothrow').catch(e => 'threw'); const ok = await window.palmier.setSettings({ mcpPort: a.mcpPort }); return (!!a.deps.ffmpeg) + ':' + bad + ':' + (ok.mcpPort === a.mcpPort); })()"));
    console.log("SMOKE-RATE", await win.webContents.executeJavaScript("(async () => { const r = document.querySelector('#rate'); r.value = '2'; r.dispatchEvent(new Event('change')); return document.querySelector('#pv').playbackRate; })()"));
    console.log("SMOKE-AGENT", await win.webContents.executeJavaScript("(async () => { const el = document.querySelector('.clip'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(r => setTimeout(r, 200)); const q = (await window.palmier.state()).sequences[0]; const a = await window.palmier.agentRun('marker smoke-m', { sequenceId: q.id, playheadFrame: 20, selectedClipId: null }); const b = await window.palmier.agentRun('dance', { sequenceId: q.id, playheadFrame: 20, selectedClipId: null }); return a.slice(0, 8) + '|' + b.slice(0, 5); })()"));
    console.log("SMOKE-ERRS", JSON.stringify(await win.webContents.executeJavaScript("window.__errs.slice(-5)")));
    console.log("SMOKE-DOM", await win.webContents.executeJavaScript("(async () => { await new Promise(r => setTimeout(r, 500)); return document.querySelectorAll('.clip').length + ':' + document.querySelectorAll('#tracks button').length; })()"));
    console.log("SMOKE-MULTI", await win.webContents.executeJavaScript("(async () => { const q = (s) => document.querySelectorAll(s); q('.clip')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); const waitSel = async (n) => { for (let i = 0; i < 40; i++) { if (q('.clip.sel').length === n) return true; await new Promise(r => setTimeout(r, 50)); } return false; }; await waitSel(1); const total = q('.clip').length; const out = [1]; for (let i = 1; i < total; i++) { q('.clip')[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await waitSel(i + 1); out.push(q('.clip.sel').length); } document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await new Promise(r => setTimeout(r, 600)); const left = (await window.palmier.state()).sequences[0].clips.length; return total + ':' + out.join(',') + ':' + left; })()"));
    console.log("SMOKE-KEYLANE", await win.webContents.executeJavaScript("(async () => { const s0 = await window.palmier.state(); const q0 = s0.sequences[0]; const t0 = q0.tracks.find(x => x.kind === 'video'); const m0 = s0.media[0]; const placed = await window.palmier.op('placeClip', [q0.id, t0.id, { kind: 'video', assetId: m0.id, startFrame: 0, durationFrames: 30, name: 'kl' }]); if (!placed.ok) return 'place-fail'; await new Promise(r => setTimeout(r, 400)); const el = [...document.querySelectorAll('.clip')].pop(); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await new Promise(r => setTimeout(r, 500)); const s = await window.palmier.state(); const c = s.sequences[0].clips.find(x => x.name === 'kl'); return c.opacityKeys.length + ':' + document.querySelectorAll('.kd').length; })()"));
    console.log("SMOKE-KEYUI", await win.webContents.executeJavaScript("(async () => { const el = document.querySelector('.clip'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(r => setTimeout(r, 200)); document.querySelector('#iKeyOp').click(); await new Promise(r => setTimeout(r, 400)); const s = await window.palmier.state(); return s.sequences[0].clips[0].opacityKeys.length; })()"));
    console.log("SMOKE-KEYS", await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const c = q.clips[0]; await window.palmier.op('setKeyframe', [q.id, c.id, 'opacity', { frame: 45, value: 0.2 }]); const r = await window.palmier.evalKeys(q.id, c.id, 45); return r.op; })()"));
    console.log("SMOKE-METER", await win.webContents.executeJavaScript("(async () => { const cv = document.querySelector('#meter'); if (!cv) return 'no-canvas'; const v = document.querySelector('#pv'); try { await v.play(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); v.pause(); return (!!window.__meterOn) + ':' + cv.width; })()"));
    console.log("SMOKE-WV", await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const a = s.media.find(m => m.kind === 'audio'); if (!a) return 'no-audio'; const p = await window.palmier.waveform(a.id, 50); return p.length + ':' + (p.reduce((x,y) => x+y, 0) / p.length).toFixed(3); })()"));
    console.log("BOOT-OK");
    app.quit();
  }
}

app.on("window-all-closed", () => { try { if (mcpServer) mcpServer.close(); } catch (e) {} if (process.platform !== "darwin") app.quit(); });
boot().catch((e) => { console.error("BOOT-FAIL", e); app.exit(1); });



















































