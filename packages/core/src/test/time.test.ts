import test from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames, framesToSeconds, fpsFromFloat } from '../time.js';

test('time: 30fps exact + rounding single source of truth', () => {
  const fps = { num: 30, den: 1 };
  assert.equal(secondsToFrames(1, fps), 30);
  assert.equal(framesToSeconds(30, fps), 1);
  assert.equal(secondsToFrames(1 + 0.4 / 30, fps), 30);
  assert.equal(secondsToFrames(1 + 0.6 / 30, fps), 31);
});
test('time: 29.97 family', () => {
  const fps = fpsFromFloat(29.97);
  assert.deepEqual(fps, { num: 30000, den: 1001 });
  assert.equal(secondsToFrames(10, fps), 300);
});
test('time: rejects bad input', () => {
  assert.throws(() => secondsToFrames(-1, { num: 30, den: 1 }));
  assert.throws(() => fpsFromFloat(0));
});

