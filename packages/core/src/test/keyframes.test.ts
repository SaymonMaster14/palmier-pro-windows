import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack, evaluateKeyframes, type Keyframe } from '../model.js';
import { EditorStore } from '../store.js';

test('keyframes eval + store ops with undo', () => {
  assert.equal(evaluateKeyframes([], 10, 0.5), 0.5);
  assert.equal(evaluateKeyframes([{ frame: 10, value: 1, interpolation: 'linear' }], 0, 0), 1);
  const kfs: Keyframe[] = [{ frame: 0, value: 0, interpolation: 'linear' }, { frame: 10, value: 1, interpolation: 'linear' }];
  assert.equal(evaluateKeyframes(kfs, 5, 0), 0.5);
  const kh: Keyframe[] = [{ frame: 0, value: 7, interpolation: 'hold' }, { frame: 10, value: 9, interpolation: 'hold' }];
  assert.equal(evaluateKeyframes(kh, 9, 0), 7);
  assert.equal(evaluateKeyframes(kh, 10, 0), 9);
  const p = createProject('k');
  const s = createSequence(p, 's', { num: 30, den: 1 });
  const v = addTrack(s, 'video', 'V1');
  const st = new EditorStore(p);
  const id = st.placeClip(s.id, v.id, { kind: 'video', startFrame: 0, durationFrames: 60, name: 'a' }).ids[0];
  assert.ok(st.setKeyframe(s.id, id, 'opacity', { frame: 30, value: 0.2 }).ok);
  assert.ok(st.setKeyframe(s.id, id, 'opacity', { frame: 30, value: 0.2 }).noop);
  assert.ok(!st.setKeyframe(s.id, id, 'opacity', { frame: 5, value: 9 }).ok);
  assert.ok(st.removeKeyframe(s.id, id, 'opacity', 30).ok);
  assert.ok(st.removeKeyframe(s.id, id, 'opacity', 30).noop);
  assert.ok(st.undo());
  assert.equal(st.project.sequences[0].clips[0].opacityKeys.length, 1);
});

