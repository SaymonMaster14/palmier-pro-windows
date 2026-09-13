import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { searchProject } from '../search.js';

test('search ranks media/clips/markers, empty query empty', () => {
  const p = createProject('s');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const v = addTrack(s, 'video', 'V1');
  const st = new EditorStore(p);
  st.addMedia({ path: 'C:/v/intro.mp4', kind: 'video', name: 'intro.mp4', durationFrames: 60, fps: { num: 30, den: 1 } });
  st.placeClip(s.id, v.id, { kind: 'text', startFrame: 0, durationFrames: 30, name: 'title', text: 'Hello World' });
  st.addMarker(s.id, { name: 'intro beat', startFrame: 10 });
  assert.deepEqual(searchProject(st.project, ''), []);
  const hits = searchProject(st.project, 'intro');
  assert.ok(hits.some((h) => h.kind === 'media' && h.label === 'intro.mp4'));
  assert.ok(hits.some((h) => h.kind === 'marker'));
  const hw = searchProject(st.project, 'hello');
  assert.equal(hw.length, 1);
  assert.equal(hw[0].kind, 'clip');
  assert.deepEqual(searchProject(st.project, 'zzz-nope'), []);
});
