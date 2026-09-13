import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, createSequence, addTrack, type Keyframe } from '../model.js';
import { EditorStore } from '../store.js';
import { volumeExpr } from '../keyexpr.js';
import { buildFfmpegArgs, exportSequence, validateExport } from '../export.js';

const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', n);
test('volume expression shape', () => {
  const k: Keyframe[] = [{ frame: 0, value: 0, interpolation: 'linear' }, { frame: 30, value: 1, interpolation: 'linear' }];
  const e = volumeExpr(k, 0, 30, 0.5);
  assert.ok(e.includes('if(lt(t,'));
  assert.ok(e.includes('0.500000'));
  assert.equal(volumeExpr([], 0, 30, 0.7), '0.7');
});
test('volume keys render in export', async () => {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject('vk'));
  const seq = createSequence(st.project, 's', fps, 320, 240);
  const v1 = addTrack(seq, 'video', 'V1');
  const a1 = addTrack(seq, 'audio', 'A1');
  st.addMedia({ path: fix('sample-av.mp4'), kind: 'video', name: 'v', durationFrames: 90, fps });
  st.addMedia({ path: fix('sample-audio.wav'), kind: 'audio', name: 'a', durationFrames: 90, fps });
  st.placeClip(seq.id, v1.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, name: 'v' });
  const id = st.placeClip(seq.id, a1.id, { kind: 'audio', assetId: st.project.media[1].id, startFrame: 0, durationFrames: 90, name: 'a' }).ids[0];
  st.setKeyframe(seq.id, id, 'volume', { frame: 0, value: 0 });
  st.setKeyframe(seq.id, id, 'volume', { frame: 90, value: 1 });
  const dir = mkdtempSync(join(tmpdir(), 'palm-vk-'));
  const plan = await buildFfmpegArgs(st.project, seq, join(dir, 'o.mp4'));
  const fc: string = plan.args[plan.args.indexOf('-filter_complex') + 1];
  assert.ok(fc.includes(String.fromCharCode(118, 111, 108, 117, 109, 101, 61, 39, 105, 102, 40, 108, 116, 40, 116, 44)), 'no keyed volume');
});


test('overlapping audio mixes instead of concatenating', async () => {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject('mx'));
  const seq = createSequence(st.project, 's', fps, 320, 240);
  const v1 = addTrack(seq, 'video', 'V1');
  const a1 = addTrack(seq, 'audio', 'A1');
  st.addMedia({ path: fix('sample-av.mp4'), kind: 'video', name: 'v', durationFrames: 90, fps });
  st.addMedia({ path: fix('sample-audio.wav'), kind: 'audio', name: 'a', durationFrames: 90, fps });
  st.placeClip(seq.id, v1.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, name: 'v' });
  st.placeClip(seq.id, a1.id, { kind: 'audio', assetId: st.project.media[1].id, startFrame: 0, durationFrames: 90, name: 'a' });
  const dir = mkdtempSync(join(tmpdir(), 'palm-mx-'));
  const out = join(dir, 'mx.mp4');
  const ex = await exportSequence(st.project, seq.id, out);
  assert.ok(Math.abs(ex.durationSec - 3) < 0.01, 'mixed overlap stays 3s, got ' + ex.durationSec);
  const v = await validateExport(out, 3, true);
  assert.ok(v.ok, v.details);
});
