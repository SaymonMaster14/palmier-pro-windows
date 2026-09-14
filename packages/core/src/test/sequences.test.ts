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

test('sequences remove with active fallback', () => {
  const st = new EditorStore(createProject('sqd'));
  const a = st.addSequence('A');
  assert.ok(!st.removeSequence(a.ids[0]).ok);
  const b = st.addSequence('B');
  assert.equal(st.project.activeSequenceId, b.ids[0]);
  assert.ok(st.removeSequence(a.ids[0]).ok);
  assert.equal(st.project.sequences.length, 1);
  assert.equal(st.project.activeSequenceId, b.ids[0]);
  assert.ok(!st.removeSequence(b.ids[0]).ok);
  assert.ok(!st.removeSequence('nope').ok);
  assert.ok(st.undo());
  assert.equal(st.project.sequences.length, 2);
});

test('sequences duplicate carries tracks clips and markers', () => {
  const st = new EditorStore(createProject('sqc'));
  const a = st.addSequence('A');
  const q = st.project.sequences[0];
  st.addMedia({ path: 'v.mp4', kind: 'video', name: 'v', durationFrames: 180, fps: q.fps });
  st.placeClip(q.id, q.tracks[0].id, { kind: 'video', assetId: st.project.media[0].id, startFrame: 0, durationFrames: 90, sourceInFrame: 0, name: 'v' });
  st.addMarker(q.id, { name: 'm', startFrame: 10 });
  const d = st.addSequence;
  const r = st.duplicateSequence(a.ids[0]);
  assert.ok(r.ok);
  assert.equal(st.project.sequences.length, 2);
  const cp = st.project.sequences[1];
  assert.equal(cp.name, 'A copy');
  assert.equal(cp.clips.length, 1);
  assert.equal(cp.markers.length, 1);
  assert.ok(cp.id !== a.ids[0] && cp.tracks[0].id !== q.tracks[0].id && cp.clips[0].id !== st.project.sequences[0].clips[0].id);
  assert.equal(cp.clips[0].trackId, cp.tracks[0].id);
  assert.equal(st.project.activeSequenceId, cp.id);
  assert.ok(!st.duplicateSequence('nope').ok);
  assert.ok(st.undo());
  assert.equal(st.project.sequences.length, 1);
});
