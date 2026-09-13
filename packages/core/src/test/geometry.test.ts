import test from 'node:test';
import assert from 'node:assert/strict';
import { pxToFrame, frameToPx } from '../model.js';

test('geometry: px<->frame roundtrip + clamp', () => {
  assert.equal(pxToFrame(50, 200, 90), 23);
  assert.equal(pxToFrame(-5, 200, 90), 0);
  assert.equal(pxToFrame(999, 200, 90), 90);
  assert.equal(frameToPx(45, 200, 90), 100);
  assert.throws(() => pxToFrame(0, 0, 90));
});
