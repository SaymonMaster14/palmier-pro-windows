"use strict";
// Main owns the single EditorStore. UI (renderer) and MCP operate on this same store.
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.env.PALM_HEADLESS) app.commandLine.appendSwitch("mute-audio");
let win = null;
let store = null;
let core = null;
let mcpServer = null;
let projectPath = null;
let notify = () => {};
  const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
  const readSettings = () => { let s = {}; try { s = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch (e) {} return { mcpPort: 19789, exportDir: "", ...s }; };

const OPS = ["placeClip", "moveClip", "trimEnd", "trimStart", "slipClip", "splitClip", "deleteClip", "setText", "setVolume", "setTransform", "setOpacity", "addTrack", "addSequence", "setActiveSequence", "renameSequence", "renameTrack", "renameClip", "removeSequence", "duplicateSequence", "rippleDelete", "addMarker", "removeMarker", "updateMarker", "setFade", "overwritePlace", "setKeyframe", "removeKeyframe", "setTransition", "setSpeed", "setCrop", "setBlend", "setTrackFlags", "deleteClips", "moveClips", "setTextStyle", "setTextAnim", "moveKeyframe", "duplicateClips", "linkClips", "unlinkClips"];

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
  ipcMain.handle("thumbAt", async (_e, assetId, atSec) => { const m = store.project.media.find((x) => x.id === assetId); if (!m) throw new Error("media not found"); return core.thumbnail(m.path, path.join(app.getPath("userData"), "thumbs"), atSec, 120); });
  ipcMain.handle("thumb", async (_e, assetId) => { const m = store.project.media.find((x) => x.id === assetId); if (!m) throw new Error("media not found"); return core.thumbnail(m.path, path.join(app.getPath("userData"), "thumbs")); });
  ipcMain.handle("audioAt", (_e, seqId, frame) => {
    const s = store.project.sequences.find((x) => x.id === seqId);
    if (!s) throw new Error("sequence not found");
    const muted = new Set(s.tracks.filter((x) => x.muted).map((x) => x.id));
    const hit = s.clips.find((c) => (c.kind === "audio" || c.kind === "video") && !muted.has(c.trackId) && frame >= c.startFrame && frame < c.startFrame + c.durationFrames && c.assetId);
    if (!hit) return null;
    const media = store.project.media.find((x) => x.id === hit.assetId);
    if (!media) return null;
    return { path: media.path, atSec: (hit.sourceInFrame + (frame - hit.startFrame) * (hit.speed || 1)) / (s.fps.num / s.fps.den) };
  });
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
  const expJobs = new Map();
  let expN = 0;
  ipcMain.handle("exportStart", async (_e, outPath, quality) => {
    const seq = store.project.sequences.find((x) => x.id === store.project.activeSequenceId) || store.project.sequences[0];
    if (!seq) throw new Error("no sequence");
    const fp = outPath || defaultExportPath();
    const id = "exp" + (++expN);
    const ctrl = new AbortController();
    const job = { id, outPath: fp, status: "running", progress: 0 };
    job.ctrl = ctrl;
    expJobs.set(id, job);
    const say = () => { try { if (win) win.webContents.send("export-progress", { id, status: job.status, progress: job.progress }); } catch (e) {} };
    core.exportSequence(store.project, seq.id, fp, ctrl.signal, { onProgress: (fr) => { job.progress = fr; say(); }, quality })
      .then(async (r) => { const v = await core.validateExport(fp, r.durationSec, true).catch((e) => ({ ok: false, details: String(e) })); Object.assign(job, { status: v.ok ? "done" : "error", progress: 1, result: { ...r, validation: v } }); say(); })
      .catch((e) => { Object.assign(job, { status: ctrl.signal.aborted ? "cancelled" : "error", error: String((e && e.message) || e) }); say(); });
    return { id, outPath: fp };
  });
  ipcMain.handle("exportStatus", async (_e, id) => { const j = expJobs.get(id); if (!j) throw new Error("unknown job"); const { ctrl, ...rest } = j; return rest; });
  const thumbDir = () => path.join(app.getPath("userData"), "thumbs");
  const dirSize = (d) => { let n = 0, c = 0; try { for (const f of fs.readdirSync(d)) { try { const st = fs.statSync(path.join(d, f)); if (st.isFile()) { n += st.size; c++; } } catch (e) {} } } catch (e) {} return { bytes: n, files: c }; };
  ipcMain.handle("cacheInfo", async () => ({ thumbs: dirSize(thumbDir()) }));
  ipcMain.handle("cacheClear", async () => { const d = thumbDir(); let n = 0; try { for (const f of fs.readdirSync(d)) { try { fs.rmSync(path.join(d, f), { force: true }); n++; } catch (e) {} } } catch (e) {} return { cleared: n }; });
  ipcMain.handle("exportCancel", async (_e, id) => { const j = expJobs.get(id); if (!j) throw new Error("unknown job"); try { j.ctrl.abort(); } catch (e) {} return { cancelled: id }; });
  ipcMain.handle("exportActive", async (_e, outPath, quality) => {
    const seq = store.project.sequences.find((s) => s.id === store.project.activeSequenceId) || store.project.sequences[0];
    if (!seq) throw new Error("no sequence");
    const fp = outPath || defaultExportPath();
    const r = await core.exportSequence(store.project, seq.id, fp, undefined, { quality });
    let v = await core.validateExport(fp, r.durationSec, true).catch((e) => ({ ok: false, details: String((e && e.message) || e) }));
    if (!v.ok && /no audio stream/.test(v.details)) v = { ...(await core.validateExport(fp, r.durationSec, false)), audioNote: "timeline sources carry no audio" };
    return { ...r, validation: v };
  });
  ipcMain.handle("transcribe", async (_e, assetId) => {
    const m = store.project.media.find((x) => x.id === assetId);
    if (!m) throw new Error("media not found");
    if (m.kind !== "audio" && m.kind !== "video") throw new Error("transcribe needs audio or video");
    const key = readSettings().groqKey;
    if (!key || typeof key !== "string" || !key.trim()) throw new Error("groq key missing: set it in Settings");
    const st = fs.statSync(m.path);
    if (st.size > 25 * 1024 * 1024) throw new Error("file over 25MB groq limit; split it first");
    const buf = fs.readFileSync(m.path);
    const ext = ((m.path.split(".").pop() || "wav").toLowerCase());
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "audio/" + ext }), "audio." + ext);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "verbose_json");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + key.trim() }, body: form });
    if (!r.ok) throw new Error("groq " + r.status + ": " + (await r.text()).slice(0, 200));
    const cues = core.segmentsToCues(await r.json());
    if (!cues.length) throw new Error("groq returned no segments");
    const dir = path.join(app.getPath("userData"), "transcripts");
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, assetId + ".srt");
    fs.writeFileSync(fp, core.cuesToSrt(cues));
    const ids = await core.importSubtitles(store, fp);
    return { assetId, srtPath: fp, cueCount: cues.length, clipIds: ids };
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
  ipcMain.handle("getSettings", async () => ({ ...readSettings(), deps: checkDeps() }));
  ipcMain.handle("setSettings", async (_e, patch) => { const s = { ...readSettings(), ...patch }; if (s.mcpPort !== undefined && (!Number.isInteger(s.mcpPort) || s.mcpPort < 1024 || s.mcpPort > 65535)) throw new Error("bad port"); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); return { ...s, note: "mcpPort applies on restart" }; });
  ipcMain.handle("op", (_e, name, args) => {
    if (name === "undo") return { undone: store.undo() };
    if (name === "redo") return { redone: store.redo() };
    if (!OPS.includes(name)) throw new Error("unknown op " + name);
    return store[name](...args);
  });
}

function defaultExportPath() { try { const d = readSettings().exportDir; if (d && typeof d === "string" && d.trim()) { try { fs.mkdirSync(d.trim(), { recursive: true }); } catch (e) {} return path.join(d.trim(), "export.mp4"); } } catch (e) {} return path.join(app.getPath("userData"), "export.mp4"); }
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
  if (process.env.PALM_PROBE_JS) { await new Promise((r) => setTimeout(r, 2500)); try { console.log(await win.webContents.executeJavaScript(fs.readFileSync(process.env.PALM_PROBE_JS, "utf8"))); } catch (e) { console.log("PROBE-FAIL " + e.message); } app.quit(); }

  if (process.env.PALM_SMOKE) {
    const n = await win.webContents.executeJavaScript("window.palmier.state().then(s => s.sequences.length)");
    console.log("SMOKE-STATE-SEQ", n);
    const ui = await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; if (!q || !q.clips[0]) return 'no-clip'; const c = q.clips[0]; const r = await window.palmier.op('splitClip', [q.id, c.id, 45]); const s2 = await window.palmier.state(); return r.ok + ':' + s2.sequences[0].clips.length; })()");
    console.log("SMOKE-UI-OP", ui);
    console.log("SMOKE-GEOM", await win.webContents.executeJavaScript("typeof (window.palmier.geom() || {}).pxToFrame"));
    console.log('SMOKE-SNAP', await win.webContents.executeJavaScript(`(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const t = q.tracks.find(x => x.kind === 'video'); const m = s.media[0]; const end = q.clips.reduce((a, c) => Math.max(a, c.startFrame + c.durationFrames), 0); const pl = await window.palmier.op('placeClip', [q.id, t.id, { kind: 'video', assetId: m.id, startFrame: end, durationFrames: 30, name: 'snap-b' }]); if (!pl.ok) return 'place-fail'; const b = (await window.palmier.state()).sequences[0].clips.find(c => c.name === 'snap-b'); return window.palmier.snapMove(q.id, b.id, end + 3, 0); })()`));
    if (process.env.PALM_SMOKE_IO) {
      const fix = (n) => path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", n);
      const im = await win.webContents.executeJavaScript(`(async () => { const r = await window.palmier.importMedia(${JSON.stringify([fix("sample-av.mp4"), fix("sample-img.png"), fix("sample-audio.wav")]).replace(/\\\\/g, "\\\\\\\\")}); const s = await window.palmier.state(); return r.length + ":" + s.media.length + ":" + s.sequences[0].clips.length; })()`);
      console.log("SMOKE-IO-IMPORT", im);
      const ex = await win.webContents.executeJavaScript(`(async () => { const j = await window.palmier.exportStart("C:\\\\Users\\\\PCTRAB~1\\\\AppData\\\\Local\\\\Temp/smoke-export.mp4", "draft"); let st = null; for (let i = 0; i < 90; i++) { await new Promise(r => setTimeout(r, 500)); st = await window.palmier.exportStatus(j.id); if (st.status !== "running") break; } return JSON.stringify(st).slice(0, 400); })()`);
      console.log("SMOKE-IO-EXPORT", ex);
    console.log('SMOKE-QCANCEL', await win.webContents.executeJavaScript(`(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const t = q.tracks.find(x => x.kind === 'video'); const m = s.media[0]; let at = q.clips.reduce((a, c) => Math.max(a, c.startFrame + c.durationFrames), 0); for (let k = 0; k < 8; k++) { const r = await window.palmier.op('placeClip', [q.id, t.id, { kind: 'video', assetId: m.id, startFrame: at, durationFrames: 90, name: 'pad' }]); if (!r.ok) return 'pad-fail'; at += 90; } const j = await window.palmier.exportStart(); await new Promise(r => setTimeout(r, 1500)); await window.palmier.exportCancel(j.id); await new Promise(r => setTimeout(r, 800)); const st = await window.palmier.exportStatus(j.id); return st.status; })()`));
    }
    console.log('SMOKE-TH', await win.webContents.executeJavaScript(`(async () => { const ims = [...document.querySelectorAll('#media img')]; return ims.length + ':' + ims.filter(x => x.src && x.naturalWidth > 0).length; })()`));
    console.log('SMOKE-STRIP', await win.webContents.executeJavaScript(`(async () => { await new Promise(r => setTimeout(r, 2500)); const ims = [...document.querySelectorAll('.strip')]; return ims.length + ':' + ims.filter(x => x.src && x.naturalWidth > 0).length; })()`));
    console.log("SMOKE-SEARCH", await win.webContents.executeJavaScript("(async () => { const q = document.querySelector('#q'); q.value = 'sample'; q.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 50)); const n = document.querySelectorAll('#media div').length; const h = document.querySelector('#hits').textContent; return n + '|' + h; })()"));
    console.log("SMOKE-PROJ", await win.webContents.executeJavaScript("(async () => { const sv = await window.palmier.saveProject(); const rs = await window.palmier.listRecents(); const hasRec = rs.includes(sv.saved); await window.palmier.newProject('fresh'); const empty = (await window.palmier.state()).sequences.length; await window.palmier.openProject(sv.saved); const back = (await window.palmier.state()).sequences[0].clips.length; return hasRec + ':' + empty + ':' + back; })()"));
    console.log("SMOKE-HOME", await win.webContents.executeJavaScript("(async () => { await window.palmier.newProject('tmp-home'); await new Promise(function(r){ setTimeout(r, 600); }); var h0 = getComputedStyle(document.querySelector('#home')).display; var recs = await window.palmier.listRecents(); var rows = document.querySelectorAll('#hrec a').length; var back = 'skipped'; if (recs.length) { await window.palmier.openProject(recs[0]); await new Promise(function(r){ setTimeout(r, 600); }); var s1 = await window.palmier.state(); back = (s1.sequences[0] ? s1.sequences[0].clips.length : -1) + ':' + getComputedStyle(document.querySelector('#home')).display; } return 'home=' + h0 + ' recents=' + recs.length + '/' + rows + ' back=' + back; })()"));
    console.log("SMOKE-SETS", await win.webContents.executeJavaScript("(async () => { const a = await window.palmier.getSettings(); const bad = await window.palmier.setSettings({ mcpPort: 80 }).then(() => 'nothrow').catch(e => 'threw'); const ok = await window.palmier.setSettings({ mcpPort: a.mcpPort }); return (!!a.deps.ffmpeg) + ':' + bad + ':' + (ok.mcpPort === a.mcpPort); })()"));
    console.log("SMOKE-RATE", await win.webContents.executeJavaScript("(async () => { const r = document.querySelector('#rate'); r.value = '2'; r.dispatchEvent(new Event('change')); return document.querySelector('#pv').playbackRate; })()"));
    console.log("SMOKE-AGENT", await win.webContents.executeJavaScript("(async () => { const el = document.querySelector('.clip'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(r => setTimeout(r, 200)); const q = (await window.palmier.state()).sequences[0]; const a = await window.palmier.agentRun('marker smoke-m', { sequenceId: q.id, playheadFrame: 20, selectedClipId: null }); const b = await window.palmier.agentRun('dance', { sequenceId: q.id, playheadFrame: 20, selectedClipId: null }); return a.slice(0, 8) + '|' + b.slice(0, 5); })()"));
    console.log("SMOKE-ERRS", JSON.stringify(await win.webContents.executeJavaScript("window.__errs.slice(-5)")));
    console.log("SMOKE-DOM", await win.webContents.executeJavaScript("(async () => { await new Promise(r => setTimeout(r, 500)); return document.querySelectorAll('.clip').length + ':' + document.querySelectorAll('#tracks button').length; })()"));
    console.log('SMOKE-MULTI', await win.webContents.executeJavaScript(`(async () => { const q = (s) => document.querySelectorAll(s); q('.clip')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); const waitSel = async (n) => { for (let k = 0; k < 40; k++) { if (q('.clip.sel').length === n) return true; await new Promise(r => setTimeout(r, 50)); } return false; }; await waitSel(1); const total = q('.clip').length; const out = [1]; for (let k = 1; k < total; k++) { q('.clip')[k].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await waitSel(k + 1); out.push(q('.clip.sel').length); } var stPre = await window.palmier.state(); var preMap = {}; stPre.sequences[0].clips.forEach(function(c){ preMap[c.id] = c.name; }); var stalePre = []; document.querySelectorAll('.clip').forEach(function(el){ if (!preMap[el.dataset.id]) stalePre.push(el.dataset.id); }); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await new Promise(r => setTimeout(r, 600)); const left = (await window.palmier.state()).sequences[0].clips.length; return total + ':' + out.join(',') + ':' + left + ':stalePre=' + stalePre.length + ':' + stalePre.join('|').slice(0, 160); })()`));
    console.log("SMOKE-KEYLANE", await win.webContents.executeJavaScript("(async () => { const s0 = await window.palmier.state(); const q0 = s0.sequences[0]; const t0 = q0.tracks.find(x => x.kind === 'video'); const m0 = s0.media[0]; const placed = await window.palmier.op('placeClip', [q0.id, t0.id, { kind: 'video', assetId: m0.id, startFrame: 0, durationFrames: 30, name: 'kl' }]); if (!placed.ok) return 'place-fail'; await new Promise(r => setTimeout(r, 400)); const el = [...document.querySelectorAll('.clip')].pop(); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await new Promise(r => setTimeout(r, 500)); const s = await window.palmier.state(); const c = s.sequences[0].clips.find(x => x.name === 'kl'); return c.opacityKeys.length + ':' + document.querySelectorAll('.kd').length; })()"));
    console.log("SMOKE-KEYUI", await win.webContents.executeJavaScript("(async () => { const el = document.querySelector('.clip'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(r => setTimeout(r, 200)); document.querySelector('#iKeyOp').click(); await new Promise(r => setTimeout(r, 400)); const s = await window.palmier.state(); return s.sequences[0].clips[0].opacityKeys.length; })()"));
    console.log("SMOKE-KEYDRAG", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var tr = q0.tracks.find(function(t){ return t.kind === 'video'; }); var m = s0.media[0]; var end = q0.clips.reduce(function(a, c){ return Math.max(a, c.startFrame + c.durationFrames); }, 0); var pl = await window.palmier.op('placeClip', [q0.id, tr.id, { kind: 'video', assetId: m.id, startFrame: end, durationFrames: 60, name: 'kdrag' }]); if (!pl.ok) return 'place-fail'; var sN = await window.palmier.state(); var cc = sN.sequences[0].clips.find(function(c){ return c.name === 'kdrag'; }); var k1 = await window.palmier.op('setKeyframe', [q0.id, cc.id, 'opacity', { frame: cc.startFrame + 10, value: 0.8 }]); if (!k1.ok) return 'key-fail'; await new Promise(function(r){ setTimeout(r, 700); }); var box = null, dot = null; document.querySelectorAll('.clip').forEach(function(el){ if (el.dataset && el.dataset.id === cc.id) { box = el; var ds = el.querySelectorAll('.kd'); if (ds.length) dot = ds[ds.length - 1]; } }); if (!box || !dot) return 'no-dot'; var cr = box.getBoundingClientRect(); if (!(cr.width > 0)) return 'no-layout'; var rc = dot.getBoundingClientRect(); var cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2; var dx = 30; var rawF = cc.startFrame + Math.round((cx + dx - cr.left) / cr.width * cc.durationFrames); var expF = Math.min(Math.max(rawF, cc.startFrame), cc.startFrame + cc.durationFrames); dot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy })); await new Promise(function(r){ setTimeout(r, 150); }); document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx + dx, clientY: cy })); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx + dx, clientY: cy })); await new Promise(function(r){ setTimeout(r, 700); }); var s1 = await window.palmier.state(); var c1 = s1.sequences[0].clips.find(function(x){ return x.id === cc.id; }); return 'expF=' + expF + ' keys=' + c1.opacityKeys.map(function(k){ return k.frame + '=' + k.value; }).join(',') + ' errs=' + window.__errs.length; })()"));
    console.log("SMOKE-ZOOM", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var D = q0.clips.reduce(function(a, c){ return Math.max(a, c.startFrame + c.durationFrames); }, 0) || 90; var s = Math.floor(D / 4), d = Math.floor(D / 2); await window.__setZoom(s, d); await new Promise(function(r){ setTimeout(r, 400); }); var first = null; document.querySelectorAll('.clip').forEach(function(el){ if (!first && el.dataset && el.dataset.id) first = el; }); if (!first) return 'no-clip'; var st1 = await window.palmier.state(); var c0 = st1.sequences[0].clips.find(function(c){ return c.id === first.dataset.id; }); var expL = (c0.startFrame - s) / d * 100, gotL = parseFloat(first.style.left); var sk = document.querySelector('#seek'); sk.value = s + Math.floor(d / 2); sk.dispatchEvent(new Event('input')); await new Promise(function(r){ setTimeout(r, 600); }); var ph = document.querySelector('#tl .ph'); var phL = ph ? parseFloat(ph.style.left) : NaN; var phVis = ph ? getComputedStyle(ph).display !== 'none' : false; await window.__setZoom(0, 0); await new Promise(function(r){ setTimeout(r, 300); }); return 'clip:' + (Math.abs(expL - gotL) < 0.05) + ' ph:' + (Math.abs(phL - 50) < 1.5 && phVis) + ' n=' + document.querySelectorAll('.clip').length; })()"));
    console.log("SMOKE-PLAY", await win.webContents.executeJavaScript("(async () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); var v = document.querySelector('#pv'); var p0 = v.paused; document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await new Promise(function(r){ setTimeout(r, 600); }); var p1 = v.paused; document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await new Promise(function(r){ setTimeout(r, 500); }); var p2 = v.paused; var sk = document.querySelector('#seek'); sk.value = 30; sk.dispatchEvent(new Event('input')); await new Promise(function(r){ setTimeout(r, 400); }); var f0 = Number(document.querySelector('#seek').value); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await new Promise(function(r){ setTimeout(r, 250); }); var f1 = Number(document.querySelector('#seek').value); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await new Promise(function(r){ setTimeout(r, 250); }); var f2 = Number(document.querySelector('#seek').value); return 'play:' + (p0 !== p1) + ' pause:' + (p2 === true) + ' fwd:' + (f1 === f0 + 1) + ' back:' + (f2 === f0); })()"));
    console.log("SMOKE-KEYS", await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const q = s.sequences[0]; const c = q.clips[0]; await window.palmier.op('setKeyframe', [q.id, c.id, 'opacity', { frame: 45, value: 0.2 }]); const r = await window.palmier.evalKeys(q.id, c.id, 45); return r.op; })()"));
    console.log("SMOKE-MIX", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var at = q0.tracks.find(function(t){ return t.kind === 'audio'; }); if (!at) return 'no-audio-track'; var r1 = await window.palmier.op('setTrackFlags', [q0.id, at.id, { volume: 0.5 }]); if (!r1.ok) return 'op-fail'; var s1 = await window.palmier.state(); var v1 = s1.sequences[0].tracks.find(function(t){ return t.id === at.id; }).volume; var sl = null; document.querySelectorAll('#tracks .trk input[type=range]').forEach(function(el){ if (!sl) sl = el; }); var wired = 'no-slider'; if (sl) { sl.value = 2; sl.dispatchEvent(new Event('input')); sl.dispatchEvent(new Event('change')); await new Promise(function(r){ setTimeout(r, 600); }); var s2 = await window.palmier.state(); wired = s2.sequences[0].tracks.find(function(t){ return t.id === at.id; }).volume; } await window.palmier.op('setTrackFlags', [q0.id, at.id, { volume: 1 }]); return 'op=' + v1 + ' slider=' + wired; })()"));
    console.log("SMOKE-METER", await win.webContents.executeJavaScript("(async () => { const cv = document.querySelector('#meter'); if (!cv) return 'no-canvas'; const v = document.querySelector('#pv'); try { await v.play(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); v.pause(); return (!!window.__meterOn) + ':' + cv.width; })()"));
    console.log('SMOKE-SCRUB', await win.webContents.executeJavaScript(`(async () => { const sk = document.querySelector('#seek'); sk.value = 10; sk.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 900)); const au = await window.palmier.audioAt((await window.palmier.state()).sequences[0].id, 10); const el = document.querySelector("#scrub"); return (window.__scrubbed || 0) + "|" + JSON.stringify(au) + "|" + !!el; })()`));
    console.log("SMOKE-WV", await win.webContents.executeJavaScript("(async () => { const s = await window.palmier.state(); const a = s.media.find(m => m.kind === 'audio'); if (!a) return 'no-audio'; const p = await window.palmier.waveform(a.id, 50); return p.length + ':' + (p.reduce((x,y) => x+y, 0) / p.length).toFixed(3); })()"));
    try { if (process.env.PALM_SMOKE_RESULT) fs.writeFileSync(process.env.PALM_SMOKE_RESULT, JSON.stringify({ boot: "ok" })); } catch (ee) {}
    console.log("SMOKE-FONT", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var tx = q0.clips.find(function(c){ return c.kind === 'text'; }); if (!tx) { var tr = q0.tracks.find(function(t){ return t.kind === 'video'; }); var end = q0.clips.reduce(function(a, c){ return Math.max(a, c.startFrame + c.durationFrames); }, 0); var pl = await window.palmier.op('placeClip', [q0.id, tr.id, { kind: 'text', startFrame: end, durationFrames: 30, name: 'font-t', text: 'Ff' }]); if (!pl.ok) return 'place-fail'; var sN = await window.palmier.state(); tx = sN.sequences[0].clips.find(function(c){ return c.name === 'font-t'; }); } await new Promise(function(r){ setTimeout(r, 600); }); var box = null; document.querySelectorAll('.clip').forEach(function(el){ if (el.dataset && el.dataset.id === tx.id) box = el; }); if (!box) return 'no-box'; box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 400); }); var b = document.querySelector('#iApply'); if (!b) return 'no-apply'; b.click(); await new Promise(function(r){ setTimeout(r, 800); }); var errs = window.__errs.length; var s1 = await window.palmier.state(); var c1 = s1.sequences[0].clips.find(function(x){ return x.id === tx.id; }); var setR = await window.palmier.op('setTextStyle', [q0.id, tx.id, { fontFamily: 'times' }]); var s2 = await window.palmier.state(); var c2 = s2.sequences[0].clips.find(function(x){ return x.id === tx.id; }); return errs + ':' + ((c1 && c1.fontFamily) || 'none') + ':' + ((c2 && c2.fontFamily) || 'none') + ':' + (setR.ok === true); })()"));
    console.log("SMOKE-INSP", await win.webContents.executeJavaScript("(async () => { var first = null; document.querySelectorAll('.clip').forEach(function(el){ if (!first && el.dataset && el.dataset.id) first = el; }); if (!first) return 'no-clip'; first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 400); }); var html = document.querySelector('#insp').innerHTML; var hasT = html.indexOf('>Transform</div>') >= 0, hasX = html.indexOf('>Text</div>') >= 0; var b = document.querySelector('#iApply'); if (!b) return 'no-apply'; b.click(); await new Promise(function(r){ setTimeout(r, 800); }); return 'transform=' + hasT + ' text=' + hasX + ' errs=' + window.__errs.length; })()"));
    console.log("SMOKE-TEXTOV", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var tx = q0.clips.find(function(c){ return c.kind === 'text'; }); if (!tx) { var tr = q0.tracks.find(function(t){ return t.kind === 'video'; }); var end = q0.clips.reduce(function(a, c){ return Math.max(a, c.startFrame + c.durationFrames); }, 0); var pl = await window.palmier.op('placeClip', [q0.id, tr.id, { kind: 'text', startFrame: end, durationFrames: 60, name: 'ovl', text: 'OverlayProof' }]); if (!pl.ok) return 'place-fail'; var sN = await window.palmier.state(); tx = sN.sequences[0].clips.find(function(c){ return c.name === 'ovl'; }); } await window.palmier.op('setTextAnim', [q0.id, tx.id, 'slideUp']); await window.palmier.op('setTextStyle', [q0.id, tx.id, { textShadow: true, textOutline: true }]); var sk = document.querySelector('#seek'); sk.value = 0; sk.dispatchEvent(new Event('input')); await new Promise(function(r){ setTimeout(r, 400); }); sk.value = tx.startFrame + 5; sk.dispatchEvent(new Event('input')); await new Promise(function(r){ setTimeout(r, 900); }); var ov = document.querySelector('#textov'); var vis = ov && getComputedStyle(ov).display !== 'none'; var okt = ov && ov.textContent === tx.text; var an = ''; var sh = ''; var ol = ''; try { an = getComputedStyle(document.querySelector('#textovt')).animationName; sh = getComputedStyle(document.querySelector('#textovt')).textShadow; ol = getComputedStyle(document.querySelector('#textovt')).getPropertyValue('-webkit-text-stroke-width'); } catch {} return (vis ? 'vis' : 'hidden') + '|' + (okt ? 'text-ok' : 'text-mismatch') + '|anim=' + an + '|fx=' + (sh !== 'none') + ':' + ol; })()"));
    console.log("SMOKE-DUP", await win.webContents.executeJavaScript("(async () => { var clips = document.querySelectorAll('.clip'); if (!clips.length) return 'no-clip'; clips[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 300); }); var s0 = await window.palmier.state(); var n0 = s0.sequences[0].clips.length; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })); await new Promise(function(r){ setTimeout(r, 700); }); var s1 = await window.palmier.state(); var n1 = s1.sequences[0].clips.length; var ids = s1.sequences[0].clips.map(function(c){ return c.id; }); var uniq = ids.length === new Set(ids).size; return 'n0=' + n0 + ' n1=' + (n1 - n0) + ' uniq=' + uniq + ' errs=' + window.__errs.length; })()"));
    console.log("SMOKE-CTX", await win.webContents.executeJavaScript("(async () => { var box = null; document.querySelectorAll('.clip').forEach(function(el){ if (!box && el.dataset && el.dataset.id) box = el; }); if (!box) return 'no-clip'; var rc = box.getBoundingClientRect(); var cx = rc.left + rc.width / 2, cy = rc.top + Math.min(rc.height / 2, 10); box.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: cx, clientY: cy })); await new Promise(function(r){ setTimeout(r, 400); }); var menu = document.querySelector('#ctxmenu'); var vis = menu && getComputedStyle(menu).display !== 'none'; var btn = document.querySelector('#ctxmenu [data-act=split]'); if (!vis || !btn) return 'menu:' + vis + ':nosplit'; var s0 = await window.palmier.state(); var n0 = s0.sequences[0].clips.length; btn.click(); await new Promise(function(r){ setTimeout(r, 700); }); var s1 = await window.palmier.state(); var n1 = s1.sequences[0].clips.length; return 'menu:split n0=' + n0 + ' n1=' + n1 + ' errs=' + window.__errs.length; })()"));
    console.log("SMOKE-FX", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var v = q0.clips.find(function(c){ return c.kind === 'video'; }); if (!v) return 'no-video'; var sr = await window.palmier.op('setTransition', [q0.id, v.id, 10]); if (!sr.ok) return 'set-fail'; await new Promise(function(r){ setTimeout(r, 500); }); var s1 = await window.palmier.state(); var exp = s1.sequences[0].clips.filter(function(c){ return (c.transitionOutFrames || 0) > 0; }).length; var got = document.querySelectorAll('.clip .trout').length; await window.palmier.op('setTransition', [q0.id, v.id, 0]); return 'exp=' + exp + ' got=' + got + ' errs=' + window.__errs.length; })()"));
    console.log("SMOKE-VISUAL", await win.webContents.executeJavaScript("(async () => { var out = []; var css = getComputedStyle(document.documentElement); out.push('acc=' + css.getPropertyValue('--acc').trim()); var kinds = {}; document.querySelectorAll('.clip').forEach(function(el){ var k = 'none'; el.classList.forEach(function(c){ if (c.indexOf('k-') === 0) k = c; }); if (!kinds[k]) { var bg = getComputedStyle(el).backgroundImage + '|' + getComputedStyle(el).borderLeftColor; kinds[k] = bg.slice(0, 60); } }); out.push('kinds=' + Object.keys(kinds).join(',')); out.push('band=' + !!document.querySelector('#tlband') + '|ruler=' + document.querySelectorAll('#ruler span').length + '|tc=' + document.querySelector('#tc').textContent); var ap = document.querySelector('#iApply'); out.push('rail=' + document.querySelectorAll('#tracks .trk').length + '|applyCls=' + (ap ? ap.className : 'missing')); return out.join(' '); })()"));
    console.log("SMOKE-TRACK", await win.webContents.executeJavaScript("(async () => { var s0 = await window.palmier.state(); var n0 = s0.sequences[0].tracks.length; document.querySelector('#bAddV').click(); await new Promise(function(r){ setTimeout(r, 700); }); var s1 = await window.palmier.state(); var n1 = s1.sequences[0].tracks.length; return 'tracks=' + n0 + '>' + n1 + ' rail=' + document.querySelectorAll('#tracks .trk').length; })()"));
    console.log("BOOT-OK");
    app.quit();
  }
}

app.on("window-all-closed", () => { try { if (mcpServer) mcpServer.close(); } catch (e) {} if (process.platform !== "darwin") app.quit(); });
boot().catch((e) => { try { if (process.env.PALM_SMOKE_RESULT) fs.writeFileSync(process.env.PALM_SMOKE_RESULT, JSON.stringify({ boot: "fail", error: String((e && e.message) || e) })); } catch (ee) {}
console.error("BOOT-FAIL", e); app.exit(1); });




















































