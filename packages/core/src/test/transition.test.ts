import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { exportSequence, validateExport } from '../export.js';

const run = (args: string[]): Promise<void> => new Promise((res, rej) => {
  const ch = spawn('ffmpeg', args, { windowsHide: true });
  let err = '';
  ch.stderr.on('data', (d) => err += d);
  ch.on('error', rej);
  ch.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
});
function yavg(file: string, ss: number): Promise<number> {
  return new Promise((res, rej) => {
    const ch = spawn('ffmpeg', ['-v', 'error', '-ss', String(ss), '-i', file, '-frames:v', '1', '-vf', 'scale=32:32', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const chunks: Buffer[] = [];
    ch.stdout.on('data', (d) => chunks.push(d));
    ch.on('error', rej);
    ch.on('close', (c) => {
      if (c !== 0) { rej(new Error('decode exit ' + c)); return; }
      const b = Buffer.concat(chunks);
      let sum = 0;
      for (let i = 0; i < b.length; i += 3) sum += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
      res(sum / (32 * 32));
    });
  });
}
const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', n);

test('transition dissolve blends and shortens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'palm-tr-'));
  const red = join(dir, 'red.mp4'), blue = join(dir, 'blue.mp4');
  await run(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', red]);
  await run(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', blue]);
  const fps = { num: 30, den: 1 };
  const store = new EditorStore(createProject('tr'));
  const seq = createSequence(store.project, 's', fps, 320, 240);
  const v1 = addTrack(seq, 'video', 'V1');
  store.addMedia({ path: red, kind: 'video', name: 'red', durationFrames: 60, fps });
  store.addMedia({ path: blue, kind: 'video', name: 'blue', durationFrames: 60, fps });
  const [rId, bId] = store.project.media.map((m) => m.id);
  const r = store.placeClip(seq.id, v1.id, { kind: 'video', assetId: rId, startFrame: 0, durationFrames: 30, name: 'r' }).ids[0];
  store.placeClip(seq.id, v1.id, { kind: 'video', assetId: bId, startFrame: 30, durationFrames: 30, name: 'b' });
  assert.ok(!store.setTransition(seq.id, r, 31).ok);
  assert.ok(store.setTransition(seq.id, r, 15).ok);
  const out = join(dir, 'tr.mp4');
  const ex = await exportSequence(store.project, seq.id, out);
  assert.ok(Math.abs(ex.durationSec - 1.5) < 0.01, 'expect 1.5s, got ' + ex.durationSec);
  const v = await validateExport(out, 1.5, false);
  assert.ok(v.ok, v.details);
  const yR = await yavg(out, 0.25), yM = await yavg(out, 0.75), yB = await yavg(out, 1.25);
  assert.ok(yM > Math.min(yR, yB) && yM < Math.max(yR, yB), 'mid blend ' + [yR, yM, yB].join(','));
});
