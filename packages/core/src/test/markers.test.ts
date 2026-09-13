import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence } from '../model.js';
import { EditorStore } from '../store.js';

test('markers add/remove validated with undo', () => {
  const p = createProject('m');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const st = new EditorStore(p);
  const r = st.addMarker(s.id, { name: 'intro', startFrame: 30 });
  assert.ok(r.ok);
  assert.ok(!st.addMarker(s.id, { name: '', startFrame: 0 }).ok);
  assert.ok(!st.addMarker(s.id, { name: 'x'.repeat(121), startFrame: 0 }).ok);
  assert.ok(st.removeMarker(s.id, r.ids[0]).ok);
  assert.ok(!st.removeMarker(s.id, r.ids[0]).ok);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].markers.length, 1);
});
