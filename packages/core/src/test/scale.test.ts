import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { buildFfmpegArgs } from '../export.js';

const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', n);
test('export scale appends output scaler, default untouched', async () => {
  const st = new EditorStore(createProject('sc'));
  const seq = createSequence(st.project, 's', { num: 30, den: 1 }, 640, 360);
  const v1 = addTrack(seq, 'video', 'V1');
  st.addMedia({ path: fix('sample-av.mp4'), kind: 'video', name: 'av', durationFrames: 180, fps: seq.fps });
  st.placeClip(seq.id, v1.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: 'v' });
  const base = await buildFfmpegArgs(st.project, seq, 'out.mp4', 'balanced');
  assert.ok(!base.args.join(' ').includes('[vout]'));
  const h720 = await buildFfmpegArgs(st.project, seq, 'out.mp4', 'balanced', '720p');
  assert.ok(h720.args.join(' ').includes('scale=-2:720[vout]'));
  assert.ok(h720.args.includes('[vout]'));
  const h1080 = await buildFfmpegArgs(st.project, seq, 'out.mp4', 'balanced', '1080p');
  assert.ok(h1080.args.join(' ').includes('scale=-2:1080[vout]'));
  await assert.rejects(buildFfmpegArgs(st.project, seq, 'out.mp4', 'balanced', '4k' as never));
});
