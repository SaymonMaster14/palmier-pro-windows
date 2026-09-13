import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack } from '../model.js';
import { EditorStore } from '../store.js';
import { parseAgentCommand, AGENT_HELP } from '../agent.js';

test('agent parser intents and honest errors', () => {
  const p = createProject('a');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const v = addTrack(s, 'video', 'V1');
  const st = new EditorStore(p);
  const id = st.placeClip(s.id, v.id, { kind: 'video', startFrame: 0, durationFrames: 60, name: 'a' }).ids[0];
  const ctx = { sequenceId: s.id, playheadFrame: 20, selectedClipId: id };
  assert.deepEqual(parseAgentCommand(st.project, ctx, 'split here'), { op: 'splitClip', clipId: id, atFrame: 20 });
  assert.deepEqual(parseAgentCommand(st.project, ctx, 'marker intro'), { op: 'addMarker', name: 'intro', atFrame: 20 });
  assert.deepEqual(parseAgentCommand(st.project, ctx, 'volume 0.5'), { op: 'setVolume', clipId: id, volume: 0.5 });
  assert.throws(() => parseAgentCommand(st.project, { ...ctx, selectedClipId: null }, 'split here'), /no clip selected/);
  assert.throws(() => parseAgentCommand(st.project, { ...ctx, playheadFrame: 70 }, 'split here'), /not inside/);
  assert.throws(() => parseAgentCommand(st.project, ctx, 'dance'), /unknown command/);
  assert.ok(AGENT_HELP.includes('split here'));
});
