import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

function setup() {
  const fps = { num: 30, den: 1 };
  const st = new EditorStore(createProject('slip'));
  const seq = createSequence(st.project, 's', fps, 640, 360);
  const v1 = addTrack(seq, 'video', 'V1');
  st.addMedia({ path: 'v.mp4', kind: 'video', name: 'v', durationFrames: 180, fps });
  const id = st.placeClip(seq.id, v1.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: 'v' }).ids[0];
  return { st, seq, id };
}
const srcIn = (st: EditorStore) => st.project.sequences[0].clips[0].sourceInFrame;
test('slip shifts source window and clamps at media bounds', () => {
  const { st, seq, id } = setup();
  assert.ok(st.slipClip(seq.id, id, 30).ok);
  assert.equal(srcIn(st), 30);
  assert.ok(st.slipClip(seq.id, id, 500).ok);
  assert.equal(srcIn(st), 90);
  assert.ok(st.slipClip(seq.id, id, -200).ok);
  assert.equal(srcIn(st), 0);
});
test('slip noops without asset and undoes cleanly', () => {
  const { st, seq } = setup();
  const t = st.placeClip(seq.id, seq.tracks[0].id, { kind: 'text', startFrame: 100, durationFrames: 30, name: 't', text: 'hi' });
  assert.ok(st.slipClip(seq.id, t.ids[0], 10).noop);
  const q = setup();
  q.st.slipClip(q.seq.id, q.id, 30);
  assert.ok(q.st.undo());
  assert.equal(srcIn(q.st), 0);
  assert.ok(q.st.redo());
  assert.equal(srcIn(q.st), 30);
});
