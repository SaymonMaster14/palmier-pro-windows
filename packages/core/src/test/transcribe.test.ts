import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentsToCues, cuesToSrt } from '../transcribe.js';
import { parseSubs } from '../subs.js';

const sample = { text: 'hello world', segments: [{ start: 0.0, end: 1.2, text: 'hello' }, { start: 1.2, end: 2.5, text: 'world' }, { start: 9, end: 5, text: 'backwards' }, { start: 3, end: 4, text: '   ' }] };
test('groq segments become cues, bad ones skipped', () => {
  const cues = segmentsToCues(sample);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'hello');
  assert.equal(cues[1].endSec, 2.5);
  assert.deepEqual(segmentsToCues({}), []);
  assert.deepEqual(segmentsToCues({ segments: 'nope' as never }), []);
});
test('cues round-trip through srt', () => {
  const cues = segmentsToCues(sample);
  const back = parseSubs(cuesToSrt(cues));
  assert.equal(back.length, 2);
  assert.equal(back[0].text, 'hello');
  assert.ok(Math.abs(back[1].endSec - 2.5) < 0.001);
});
