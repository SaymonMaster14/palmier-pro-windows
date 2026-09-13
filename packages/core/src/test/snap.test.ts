import test from 'node:test';
import assert from 'node:assert/strict';
import { snapClipStart, collectSnapTargets, snapProbe } from '../model.js';

const clips = [
  { id: 'a', trackId: 'v', startFrame: 0, durationFrames: 30 },
  { id: 'b', trackId: 'v', startFrame: 60, durationFrames: 30 },
];
test('snap: edges, playhead, markers, threshold', () => {
  assert.equal(snapClipStart(clips, 'b', 33, 6), 30);
  assert.equal(snapClipStart(clips, 'b', 40, 6), 40);
  assert.equal(snapClipStart(clips, 'b', 52, 6, { playheadFrame: 50 }), 50);
  assert.equal(snapClipStart(clips, 'b', 71, 6, { markerFrames: [72] }), 72);
  assert.equal(snapClipStart(clips, 'b', 33, 6), 30);
  const noHit = snapProbe([100], collectSnapTargets(clips, {}), 6);
  assert.equal(noHit, null);
});
