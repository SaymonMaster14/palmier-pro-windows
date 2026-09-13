import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { exportSequence, validateExport } from '../export.js';

const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', n);
test('speed changes program duration', async () => {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject('sp'));
  const seq = createSequence(st.project, 's', fps, 640, 360);
  const v1 = addTrack(seq, 'video', 'V1');
  st.addMedia({ path: fix('sample-av.mp4'), kind: 'video', name: 'av', durationFrames: 180, fps });
  const id = st.placeClip(seq.id, v1.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: 'v' }).ids[0];
  assert.ok(!st.setSpeed(seq.id, id, 0.1).ok);
  assert.ok(st.setSpeed(seq.id, id, 2).ok);
  assert.ok(st.setSpeed(seq.id, id, 2).noop);
  const dir = mkdtempSync(join(tmpdir(), 'palm-sp-'));
  const out = join(dir, 'sp.mp4');
  const ex = await exportSequence(st.project, seq.id, out);
  assert.ok(Math.abs(ex.durationSec - 3) < 0.01, 'got ' + ex.durationSec);
  const v = await validateExport(out, 3, true);
  assert.ok(v.ok, v.details);
});
