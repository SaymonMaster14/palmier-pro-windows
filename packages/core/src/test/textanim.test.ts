import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProject, createSequence, addTrack } from "../model.js";
import { EditorStore } from "../store.js";
import { buildFfmpegArgs, exportSequence, validateExport } from "../export.js";
const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "tests", "fixtures", n);
const shot = (file: string, ss: number): Buffer => spawnSync("ffmpeg", ["-v", "error", "-ss", String(ss), "-i", file, "-frames:v", "1", "-vf", "scale=64:48", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: 1e7 }).stdout as Buffer;
const pdiff = (a: Buffer, b: Buffer): number => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d; };
function buildBase() {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject("ta"));
  const seq = createSequence(st.project, "s", fps, 320, 240);
  const v1 = addTrack(seq, "video", "V1");
  const v2 = addTrack(seq, "video", "V2");
  st.addMedia({ path: fix("sample-img.png"), kind: "image", name: "img", durationFrames: 90, fps });
  st.placeClip(seq.id, v1.id, { kind: "image", assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, name: "bg" });
  const id = st.placeClip(seq.id, v2.id, { kind: "text", startFrame: 0, durationFrames: 90, name: "t", text: "Hello" }).ids[0];
  return { st, seq, id };
}
test("text anim validated, noop-aware, undoable", async () => {
  const { st, seq, id } = buildBase();
  const vclip = st.project.sequences[0].clips[0].id;
  assert.ok(!st.setTextAnim(seq.id, vclip, "slideUp").ok);
  assert.ok(!st.setTextAnim(seq.id, id, "spin").ok);
  assert.ok(st.setTextAnim(seq.id, id, "slideUp").ok);
  assert.ok(st.setTextAnim(seq.id, id, "slideUp").noop);
  assert.equal(st.project.sequences[0].clips.find((c) => c.id === id)!.textAnim, "slideUp");
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips.find((c) => c.id === id)!.textAnim, undefined);
  assert.ok(st.redo());
});
test("text anim entrance moves pixels in export", async () => {
  for (const anim of ["slideUp", "popIn"]) {
    const { st, seq, id } = buildBase();
    assert.ok(st.setTextAnim(seq.id, id, anim).ok);
    const dir = mkdtempSync(join(tmpdir(), "palm-ta-"));
    const plan = await buildFfmpegArgs(st.project, seq, join(dir, "o.mp4"));
    const fc: string = plan.args[plan.args.indexOf("-filter_complex") + 1];
    if (anim === "slideUp") assert.ok(fc.indexOf("max(0,1-(t-") >= 0, "slide expr in graph");
    else assert.ok(fc.indexOf(":alpha=") >= 0, "alpha expr in graph");
    const out = join(dir, "a.mp4");
    const ex = await exportSequence(st.project, seq.id, out);
    assert.ok((await validateExport(out, ex.durationSec, false)).ok);
    const dAnim = pdiff(shot(out, 0.1), shot(out, 2.0));
    const b2 = buildBase();
    const dir2 = mkdtempSync(join(tmpdir(), "palm-ta0-"));
    const out2 = join(dir2, "b.mp4");
    const ex2 = await exportSequence(b2.st.project, b2.seq.id, out2);
    assert.ok((await validateExport(out2, ex2.durationSec, false)).ok);
    const dCtl = pdiff(shot(out2, 0.1), shot(out2, 2.0));
    assert.ok(dAnim > dCtl * 5 + 500, anim + " moves pixels: anim=" + dAnim + " ctl=" + dCtl);
  }
});
