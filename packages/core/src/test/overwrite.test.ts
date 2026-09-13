import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack, computeOverwrite } from '../model.js';
import { EditorStore } from '../store.js';

test('overwrite plan covers remove/trim/split', () => {
  const clips = [{ id: 'a', startFrame: 0, durationFrames: 30, sourceInFrame: 0 }];
  assert.deepEqual(computeOverwrite(clips, 40, 50), []);
  assert.deepEqual(computeOverwrite(clips, 0, 30).map((x) => x.type), ['remove']);
  assert.deepEqual(computeOverwrite(clips, 10, 20).map((x) => x.type), ['split']);
  assert.deepEqual(computeOverwrite(clips, 20, 50).map((x) => x.type), ['trimEnd']);
  assert.deepEqual(computeOverwrite(clips, -10, 10).map((x) => x.type), ['trimStart']);
});

test('overwritePlace clears region and is one undo unit', () => {
  const p = createProject('o');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const v = addTrack(s, 'video', 'V1');
  const st = new EditorStore(p);
  st.placeClip(s.id, v.id, { kind: 'video', startFrame: 0, durationFrames: 30, name: 'a' });
  st.placeClip(s.id, v.id, { kind: 'video', startFrame: 30, durationFrames: 30, name: 'b' });
  st.placeClip(s.id, v.id, { kind: 'video', startFrame: 60, durationFrames: 30, name: 'c' });
  const r = st.overwritePlace(s.id, v.id, { kind: 'video', startFrame: 20, durationFrames: 50, name: 'n' });
  assert.ok(r.ok);
  const cs = st.project.sequences[0].clips.sort((x, y) => x.startFrame - y.startFrame);
  assert.deepEqual(cs.map((c) => [c.startFrame, c.durationFrames]), [[0, 20], [20, 50], [70, 20]]);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips.length, 3);
});
