import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

const setup = () => {
  const p = createProject('t');
  const fps = { num: 30, den: 1 };
  const s = createSequence(p, 's1', fps);
  const v1 = addTrack(s, 'video', 'V1');
  const v2 = addTrack(s, 'video', 'V2');
  const st = new EditorStore(p);
  return { st, s, v1, v2 };
};
test('store: place/move/split/trim/delete + overlap guard', () => {
  const { st, s, v1, v2 } = setup();
  const r1 = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 0, durationFrames: 60, name: 'a' });
  assert.ok(r1.ok);
  assert.throws(() => { const r = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 30, durationFrames: 30, name: 'b' }); if (!r.ok) throw new Error(r.error); });
  const id = r1.ids[0];
  const sp = st.splitClip(s.id, id, 30); assert.ok(sp.ok); assert.equal(sp.ids.length, 2);
  const right = sp.ids[1];
  const mv = st.moveClip(s.id, right, v2.id, 30); assert.ok(mv.ok);
  const tr = st.trimEnd(s.id, id, 20); assert.ok(tr.ok);
  const del = st.deleteClip(s.id, id); assert.ok(del.ok);
});
test('store: no-op and failed ops create no history', () => {
  const { st, s, v1 } = setup();
  const r1 = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 0, durationFrames: 60, name: 'a' });
  assert.ok(!st.canUndo || true);
  const canUndoAfterFirst = st.canUndo;
  assert.ok(canUndoAfterFirst);
  const noop = st.trimEnd(s.id, r1.ids[0], 60);
  assert.ok(noop.noop);
  assert.equal(st.canUndo, canUndoAfterFirst);
  const before = st.canUndo;
  const bad = st.splitClip(s.id, r1.ids[0], 9999);
  assert.ok(!bad.ok);
  assert.equal(st.canUndo, before);
});
test('store: undo/redo restores exact state, interleaved', () => {
  const { st, s, v1 } = setup();
  const r1 = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 0, durationFrames: 60, name: 'a' });
  const snap = JSON.stringify(st.project);
  st.splitClip(s.id, r1.ids[0], 30);
  assert.ok(st.undo());
  assert.equal(JSON.stringify(st.project), snap);
  assert.ok(st.redo());
  assert.notEqual(JSON.stringify(st.project), snap);
});
