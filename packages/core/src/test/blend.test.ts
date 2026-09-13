import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProject, createSequence, addTrack } from "../model.js";
import { EditorStore } from "../store.js";
import { buildFfmpegArgs, exportSequence, validateExport } from "../export.js";
const run = (args: string[]): Promise<void> => new Promise((res, rej) => { const ch = spawn("ffmpeg", args, { windowsHide: true }); let e = ""; ch.stderr.on("data", (d) => e += d); ch.on("error", rej); ch.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c + ": " + e.slice(0,200))))); });
function luma(file: string, ss: number): Promise<number> { return new Promise((res, rej) => { const ch = spawn("ffmpeg", ["-v", "error", "-ss", String(ss), "-i", file, "-frames:v", "1", "-vf", "scale=32:32", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { windowsHide: true }); const bufs: Buffer[] = []; ch.stdout.on("data", (d) => bufs.push(d)); ch.on("error", rej); ch.on("close", (c) => { if (c !== 0) { rej(new Error("dec")); return; } const b = Buffer.concat(bufs); let s = 0; for (let i = 0; i < b.length; i += 3) s += 0.299*b[i]+0.587*b[i+1]+0.114*b[i+2]; res(s / 1024); }); }); }
async function renderWith(mode: string): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "palm-bl-"));
  const gray = join(dir, "gray.mp4"), white = join(dir, "white.png");
  await run(["-v", "error", "-f", "lavfi", "-i", "color=c=0x808080:size=320x240:rate=30:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", gray]);
  await run(["-v", "error", "-f", "lavfi", "-i", "color=c=white:size=320x240:duration=1", "-frames:v", "1", "-y", white]);
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject("bl"));
  const seq = createSequence(st.project, "s", fps, 320, 240);
  const v1 = addTrack(seq, "video", "V1");
  const v2 = addTrack(seq, "video", "V2");
  st.addMedia({ path: gray, kind: "video", name: "g", durationFrames: 60, fps });
  st.addMedia({ path: white, kind: "image", name: "w", durationFrames: 60, fps, width: 320, height: 240 });
  const [gId, wId] = st.project.media.map((m) => m.id);
  st.placeClip(seq.id, v1.id, { kind: "video", assetId: gId, startFrame: 0, durationFrames: 60, name: "g" });
  const ov = st.placeClip(seq.id, v2.id, { kind: "image", assetId: wId, startFrame: 0, durationFrames: 60, name: "o" }).ids[0];
  if (mode !== "normal") st.setBlend(seq.id, ov, mode);
  const out = join(dir, "o.mp4");
  const ex = await exportSequence(st.project, seq.id, out);
  const v = await validateExport(out, ex.durationSec, false);
  assert.ok(v.ok, v.details);
  return luma(out, 1);
}
test("blend screen brightens, multiply darkens vs normal", async () => {
  const n = await renderWith("normal");
  const sc = await renderWith("screen");
  const mu = await renderWith("multiply");
  assert.ok(sc >= 250, "screen white " + sc);
  assert.ok(mu < n - 20, "multiply " + mu + " vs normal " + n);
});

