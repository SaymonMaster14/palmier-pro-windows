import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

test('ripple closes gap on same track only', () => {
  const p = createProject('r');
  const fps = { num: 30, den: 1 };
  const s = createSequence(p, 's', fps);
  const v1 = addTrack(s, 'video', 'V1');
  const v2 = addTrack(s, 'video', 'V2');
  const st = new EditorStore(p);
  const a = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 0, durationFrames: 30, name: 'a' }).ids[0];
  const b = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 30, durationFrames: 30, name: 'b' }).ids[0];
  const c = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 60, durationFrames: 30, name: 'c' }).ids[0];
  const d = st.placeClip(s.id, v2.id, { kind: 'video', startFrame: 30, durationFrames: 30, name: 'd' }).ids[0];
  const r = st.rippleDelete(s.id, a);
  assert.ok(r.ok);
  const byId = new Map(st.project.sequences[0].clips.map((x) => [x.id, x]));
  assert.ok(!byId.has(a));
  assert.equal(byId.get(b)!.startFrame, 0);
  assert.equal(byId.get(c)!.startFrame, 30);
  assert.equal(byId.get(d)!.startFrame, 30);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips.length, 4);
});

