"use strict";
// FINAL E2E (ladder N) against the PACKAGED app: real media in, validated video out.
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const EXE = process.env.PALM_EXE || path.join(ROOT, "apps", "editor", "dist", "win-unpacked", "PalmierProWindows.exe");
const PORT = Number(process.env.PALM_MCP_PORT || (19789 + Math.floor(Math.random() * 2000)));
process.env.PALM_MCP_PORT = String(PORT);
const BASE = "http://127.0.0.1:" + PORT + "/mcp";
const FIX = (n) => path.join(ROOT, "tests", "fixtures", n);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "palm-final-"));
const PROJ = path.join(DIR, "final.palmier.json");
const OUT = path.join(DIR, "final.mp4");
let id = 0;
async function call(method, params) {
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ++id, method, params }) });
  const j = await r.json();
  if (!j.ok || (j.result && j.result.ok === false)) throw new Error(method + " failed: " + (j.error || JSON.stringify(j.result)));
  return j.result;
}
function launch() {
  const extra = (process.env.PALM_ARGS || "").split(" ").filter(Boolean);
  return spawn(EXE, [...extra, "--no-sandbox"], { env: { ...process.env, PALM_HEADLESS: "1", PALM_PROJECT: PROJ }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}
async function waitHealth(app, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE.replace("/mcp", "/health")); if ((await r.json()).ok) return; } catch {}
    if (app.exitCode !== null) throw new Error("app exited early code " + app.exitCode);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("packaged app never healthy");
}
const kill = (app) => { try { app.kill(); } catch {} };
function ffprobe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffprobe failed");
  return JSON.parse(r.stdout);
}
const snap = (clips) => JSON.stringify(clips.map((c) => [c.id, c.trackId, c.startFrame, c.durationFrames]).sort());
async function main() {
  let app = launch();
  let log = "";
  app.stdout.on("data", (d) => { log += d; }); app.stderr.on("data", (d) => { log += d; });
  try {
    await waitHealth(app);
    const imp = await call("import", { paths: [FIX("sample-av.mp4"), FIX("sample-img.png"), FIX("sample-audio.wav")] });
    if (imp.length !== 3 || imp.some((x) => !x.placed.ok)) throw new Error("import failed: " + JSON.stringify(imp));
    let g = await call("getProject", {});
    const seq = g.sequences[0];
    const vclip = (await call("listClips", { sequenceId: seq.id })).find((c) => c.kind === "video");
    const sp = await call("splitClip", { sequenceId: seq.id, clipId: vclip.id, atFrame: 60 });
    await call("deleteClip", { sequenceId: seq.id, clipId: sp.ids[1] });
    let clips = await call("listClips", { sequenceId: seq.id });
    const img = clips.find((c) => c.kind === "image");
    await call("trimEnd", { sequenceId: seq.id, clipId: img.id, durationFrames: 30 });
    const v2 = (await call("addTrack", { sequenceId: seq.id, kind: "video", name: "V2" })).ids[0];
    await call("moveClip", { sequenceId: seq.id, clipId: img.id, toTrackId: v2, toStart: 30 });
    await call("setTransform", { sequenceId: seq.id, clipId: img.id, patch: { scaleX: 0.5, scaleY: 0.5 } });
    const v3 = (await call("addTrack", { sequenceId: seq.id, kind: "video", name: "V3" })).ids[0];
    await call("placeClip", { sequenceId: seq.id, trackId: v3, clip: { kind: "text", startFrame: 0, durationFrames: 60, name: "title", text: "Final Cut" } });
    const au = (await call("listClips", { sequenceId: seq.id })).find((c) => c.kind === "audio");
    await call("setVolume", { sequenceId: seq.id, clipId: au.id, volume: 0.7 });
    await call("saveProject", { path: PROJ });
    const before = snap(await call("listClips", { sequenceId: seq.id }));
    kill(app);
    await new Promise((r) => setTimeout(r, 2500));
    app = launch();
    app.stdout.on("data", (d) => { log += d; }); app.stderr.on("data", (d) => { log += d; });
    await waitHealth(app);
    g = await call("getProject", {});
    const seq2 = g.sequences[0];
    const after = snap(await call("listClips", { sequenceId: seq2.id }));
    if (before !== after) throw new Error("reopen mismatch");
    const img2 = (await call("listClips", { sequenceId: seq2.id })).find((c) => c.kind === "image");
    await call("setOpacity", { sequenceId: seq2.id, clipId: img2.id, opacity: 0.6 });
    const edited = (await call("listClips", { sequenceId: seq2.id })).find((c) => c.id === img2.id);
    if (edited.opacity !== 0.6) throw new Error("mcp edit not reflected");
    await call("undo", {});
    const und = (await call("listClips", { sequenceId: seq2.id })).find((c) => c.id === img2.id);
    if (und.opacity === 0.6) throw new Error("undo failed");
    await call("redo", {});
    const red = (await call("listClips", { sequenceId: seq2.id })).find((c) => c.id === img2.id);
    if (red.opacity !== 0.6) throw new Error("redo failed");
    const ex = await call("export", { sequenceId: seq2.id, outPath: OUT });
    if (!ex.validation || ex.validation.ok === false) throw new Error("export invalid: " + JSON.stringify(ex));
    const st = fs.statSync(OUT);
    const pb = ffprobe(OUT);
    const streams = pb.streams.map((s) => s.codec_type).sort().join(",");
    const dur = Number(pb.format.duration);
    if (!streams.includes("video")) throw new Error("no video stream");
    if (!streams.includes("audio")) throw new Error("no audio stream");
    if (Math.abs(dur - 3) > 0.4) throw new Error("duration off: " + dur + " (want 3: 2s video + 3s audio tail)");
    const dec = spawnSync("ffmpeg", ["-v", "error", "-ss", "1.2", "-i", OUT, "-frames:v", "1", "-f", "null", "-"]);
    if (dec.status !== 0) throw new Error("decode failed");
    console.log(`FINAL-E2E-PASS bytes=${st.size} dur=${dur.toFixed(3)} streams=${streams} clips=${JSON.parse(after).length}`);
  } catch (e) {
    console.error("FINAL-E2E-FAIL", e.message, "\n---app log---\n" + log.slice(-2500));
    process.exitCode = 1;
  } finally {
    kill(app);
    await new Promise((r) => setTimeout(r, 1500));
    try { require("child_process").execSync("taskkill /F /IM PalmierProWindows.exe"); } catch {}
    try { require("child_process").execSync("taskkill /F /IM electron.exe"); } catch {}
  }
}
main();



