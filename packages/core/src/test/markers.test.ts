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

test('markers update validated with undo', () => {
  const p = createProject('mu');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const st = new EditorStore(p);
  const r = st.addMarker(s.id, { name: 'a', startFrame: 10 });
  assert.ok(st.updateMarker(s.id, r.ids[0], { name: 'b', comment: 'hi', status: 'review', startFrame: 20, color: { r: 1, g: 0, b: 0, a: 1 } }).ok);
  const m = st.project.sequences[0].markers[0];
  assert.equal(m.name, 'b');
  assert.equal(m.comment, 'hi');
  assert.equal(m.status, 'review');
  assert.equal(m.startFrame, 20);
  assert.equal(m.color.r, 1);
  assert.ok(!st.updateMarker(s.id, r.ids[0], { name: '' }).ok);
  assert.ok(!st.updateMarker(s.id, r.ids[0], { status: 'bogus' as never }).ok);
  assert.ok(!st.updateMarker(s.id, 'nope', { name: 'x' }).ok);
  assert.ok(st.updateMarker(s.id, r.ids[0], { name: 'b' }).noop);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].markers[0].name, 'a');
});
