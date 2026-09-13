import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { buildFfmpegArgs } from '../export.js';

test('fade validated and rendered into filter graph', async () => {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject('f'));
  const seq = createSequence(st.project, 's', fps, 320, 240);
  const v1 = addTrack(seq, 'video', 'V1');
  const a1 = addTrack(seq, 'audio', 'A1');
  st.addMedia({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', 'sample-av.mp4'), kind: 'video', name: 'a', durationFrames: 90, fps });
  st.addMedia({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', 'sample-audio.wav'), kind: 'audio', name: 'b', durationFrames: 90, fps });
  const [va, au] = st.project.media.map((m) => m.id);
  const vc = st.placeClip(seq.id, v1.id, { kind: 'video', assetId: va, startFrame: 0, durationFrames: 90, name: 'v' }).ids[0];
  const ac = st.placeClip(seq.id, a1.id, { kind: 'audio', assetId: au, startFrame: 0, durationFrames: 90, name: 'a' }).ids[0];
  assert.ok(!st.setFade(seq.id, vc, -1, 0).ok);
  assert.ok(!st.setFade(seq.id, vc, 60, 40).ok);
  assert.ok(st.setFade(seq.id, vc, 15, 15).ok);
  assert.ok(st.setFade(seq.id, vc, 15, 15).noop);
  assert.ok(st.setFade(seq.id, ac, 30, 0).ok);
  const dir = mkdtempSync(join(tmpdir(), 'palm-fd-'));
  const plan = await buildFfmpegArgs(st.project, seq, join(dir, 'o.mp4'));
  const fc = plan.args[plan.args.indexOf('-filter_complex') + 1];
  assert.ok(fc.includes('fade=t=in:st=0:d=0.500000'), 'video fade in');
  assert.ok(fc.includes('afade=t=in:st=0:d=1.000000'), 'audio fade in');
});




