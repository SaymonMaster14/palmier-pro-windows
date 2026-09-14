import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

test('rename track and clip validated with undo', () => {
  const st = new EditorStore(createProject('rn'));
  const seq = createSequence(st.project, 's', { num: 30, den: 1 });
  const t = addTrack(seq, 'video', 'V1');
  assert.ok(st.renameTrack(seq.id, t.id, 'Hero').ok);
  assert.equal(st.project.sequences[0].tracks[0].name, 'Hero');
  assert.ok(!st.renameTrack(seq.id, t.id, '   ').ok);
  assert.ok(!st.renameTrack(seq.id, 'nope', 'x').ok);
  assert.ok(st.renameTrack(seq.id, t.id, 'Hero').noop);
  st.addMedia({ path: 'v.mp4', kind: 'video', name: 'v', durationFrames: 180, fps: seq.fps });
  const c = st.placeClip(seq.id, t.id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: 'v' }).ids[0];
  assert.ok(st.renameClip(seq.id, c, 'Lead').ok);
  assert.equal(st.project.sequences[0].clips[0].name, 'Lead');
  assert.ok(!st.renameClip(seq.id, c, '').ok);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips[0].name, 'v');
});
