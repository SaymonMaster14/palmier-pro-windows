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

import { buildFfmpegArgs } from '../export.js';
import { statSync } from 'node:fs';
test('export quality presets change encoding and size', async () => {
  const fps = { num: 30, den: 1 };
  const mk = () => {
    const store = new EditorStore(createProject('xq'));
    const seq = createSequence(store.project, 's', fps, 320, 240);
    const v1 = addTrack(seq, 'video', 'V1');
    store.addMedia({ path: join(mkdtempSync(join(tmpdir(), 'palm-xqsrc-')) , 'x.mp4'), kind: 'video', name: 'v', durationFrames: 90, fps });
    return { store, seq, v1 };
  };
  const dir = mkdtempSync(join(tmpdir(), 'palm-xqgen-'));
  const src = join(dir, 'src.mp4');
  await run(['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', src]);
  const sizes: Record<string, number> = {};
  for (const q of ['draft', 'balanced', 'high'] as const) {
    const t = mk();
    t.store.project.media[0].path = src;
    t.store.placeClip(t.seq.id, t.v1.id, { kind: 'video', assetId: t.store.project.media[0].id, startFrame: 0, durationFrames: 90, name: 'v' });
    const plan = await buildFfmpegArgs(t.store.project, t.seq, join(dir, 'o.mp4'), q);
    const cx = plan.args.indexOf('-crf');
    if (q === 'draft') { assert.ok(plan.args.indexOf('-preset') >= 0 && plan.args[cx + 1] === '28', 'draft flags'); }
    else if (q === 'high') { assert.ok(plan.args.indexOf('-preset') >= 0 && plan.args[cx + 1] === '18', 'high flags'); }
    else assert.ok(plan.args.indexOf('-preset') < 0 && plan.args.indexOf('-crf') < 0, 'balanced default clean');
    const out = join(dir, q + '.mp4');
    const ex = await exportSequence(t.store.project, t.seq.id, out, undefined, { quality: q });
    const v = await validateExport(out, ex.durationSec, false);
    assert.ok(v.ok, v.details);
    sizes[q] = statSync(out).size;
  }
  assert.ok(sizes['draft'] < sizes['high'], 'draft smaller than high: ' + JSON.stringify(sizes));
  const tb = mk();
  tb.store.project.media[0].path = src;
  tb.store.placeClip(tb.seq.id, tb.v1.id, { kind: 'video', assetId: tb.store.project.media[0].id, startFrame: 0, durationFrames: 90, name: 'v' });
  await assert.rejects(buildFfmpegArgs(tb.store.project, tb.seq, join(dir, 'o.mp4'), 'ultra' as never), /bad export quality/);
});
