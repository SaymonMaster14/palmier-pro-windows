import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';

test('sequences add/rename/switch with undo', () => {
  const st = new EditorStore(createProject('sq'));
  const r = st.addSequence();
  assert.ok(r.ok);
  const q = st.project.sequences[0];
  assert.equal(q.tracks.length, 2);
  assert.equal(st.project.activeSequenceId, q.id);
  const r2 = st.addSequence('B');
  assert.ok(r2.ok);
  assert.equal(st.project.sequences.length, 2);
  assert.equal(st.project.activeSequenceId, r2.ids[0]);
  assert.ok(st.renameSequence(r2.ids[0], 'Cut').ok);
  assert.equal(st.project.sequences[1].name, 'Cut');
  assert.ok(!st.renameSequence(r2.ids[0], '   ').ok);
  assert.ok(st.setActiveSequence(q.id).ok);
  assert.equal(st.project.activeSequenceId, q.id);
  assert.ok(st.setActiveSequence(q.id).noop);
  assert.ok(!st.setActiveSequence('nope').ok);
  assert.ok(st.undo());
  assert.equal(st.project.activeSequenceId, r2.ids[0]);
});
