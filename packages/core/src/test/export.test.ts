import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { exportSequence, validateExport } from '../export.js';

const run = (args: string[]): Promise<void> => new Promise((res, rej) => {
  const ch = spawn('ffmpeg', args, { windowsHide: true });
  let err = '';
  ch.stderr.on('data', (d) => err += d);
  ch.on('error', rej);
  ch.on('close', (c) => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c + ': ' + err.slice(0, 300))));
});
// Mean luma of a frame: decode tiny rawvideo and average in JS (no filter-output parsing).
function yavg(file: string, ss: number): Promise<number> {
  return new Promise((res, rej) => {
    const ch = spawn('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-frames:v', '1', '-vf', 'scale=32:32', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const chunks: Buffer[] = [];
    ch.stdout.on('data', (d) => chunks.push(d));
    ch.on('error', rej);
    ch.on('close', (c) => {
      if (c !== 0) { rej(new Error('decode exit ' + c)); return; }
      const b = Buffer.concat(chunks);
      assert.equal(b.length, 32 * 32 * 3);
      let sum = 0;
      for (let i = 0; i < b.length; i += 3) sum += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
      res(sum / (32 * 32));
    });
  });
}

test('export: multi-source + gap fill + audio mix', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'palm-exp-'));
  const red = join(dir, 'red.mp4'), blue = join(dir, 'blue.mp4');
  await run(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', red]);
  await run(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', blue]);
  const fps = { num: 30, den: 1 };
  const store = new EditorStore(createProject('multi'));
  const seq = createSequence(store.project, 's', fps, 320, 240);
  const v1 = addTrack(seq, 'video', 'V1');
  store.addMedia({ path: red, kind: 'video', name: 'red', durationFrames: 60, fps });
  store.addMedia({ path: blue, kind: 'video', name: 'blue', durationFrames: 60, fps });
  const [rId, bId] = store.project.media.map((m) => m.id);
  assert.ok(store.placeClip(seq.id, v1.id, { kind: 'video', assetId: rId, startFrame: 0, durationFrames: 30, name: 'r' }).ok);
  assert.ok(store.placeClip(seq.id, v1.id, { kind: 'video', assetId: bId, startFrame: 60, durationFrames: 30, name: 'b' }).ok);
  const out = join(dir, 'multi.mp4');
  const ex = await exportSequence(store.project, seq.id, out);
  assert.equal(ex.warnings.length, 2);
  const v = await validateExport(out, 3, false);
  assert.ok(v.ok, v.details);
  const yRed = await yavg(out, 0.5), yGap = await yavg(out, 1.5), yBlue = await yavg(out, 2.5);
  assert.ok(yGap < 30, `gap should be near-black, got ${yGap}`);
  assert.ok(yRed > yGap + 20, `red ${yRed} vs gap ${yGap}`);
  assert.ok(yBlue > yGap + 20, `blue ${yBlue} vs gap ${yGap}`);
});
