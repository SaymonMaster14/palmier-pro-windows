import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

test('multi delete/move are atomic single undo units', () => {
  const p = createProject('m');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const v1 = addTrack(s, 'video', 'V1');
  const v2 = addTrack(s, 'video', 'V2');
  const st = new EditorStore(p);
  const a = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 0, durationFrames: 30, name: 'a' }).ids[0];
  const b = st.placeClip(s.id, v1.id, { kind: 'video', startFrame: 30, durationFrames: 30, name: 'b' }).ids[0];
  const c = st.placeClip(s.id, v2.id, { kind: 'video', startFrame: 0, durationFrames: 30, name: 'c' }).ids[0];
  assert.ok(st.moveClips(s.id, [{ clipId: a, toTrackId: v1.id, toStart: 0 }]).noop);
  assert.ok(st.moveClips(s.id, [{ clipId: b, toTrackId: v2.id, toStart: 30 }]).ok);
  assert.ok(st.undo());
  const bad = st.moveClips(s.id, [{ clipId: a, toTrackId: v1.id, toStart: 0 }, { clipId: b, toTrackId: v1.id, toStart: 10 }]);
  assert.ok(!bad.ok);
  assert.equal(st.project.sequences[0].clips.find((x) => x.id === b)!.startFrame, 30);
  assert.ok(st.deleteClips(s.id, [a, b]).ok);
  assert.equal(st.project.sequences[0].clips.length, 1);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips.length, 3);
  void c;
});


