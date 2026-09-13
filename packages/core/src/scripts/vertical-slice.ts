import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createProject, createSequence, addTrack, sequenceDurationFrames } from '../model.js';
import { EditorStore } from '../store.js';
import { saveProject, loadProject } from '../persistence.js';
import { probeMedia } from '../media.js';
import { exportSequence, validateExport } from '../export.js';
import { secondsToFrames } from '../time.js';

// launch -> project -> import real media -> timeline -> preview-contract -> save/reopen -> export
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const fix = join(root, 'tests', 'fixtures');
const dir = mkdtempSync(join(tmpdir(), 'palm-slice-'));
const fps = { num: 30, den: 1 };
const store = new EditorStore(createProject('slice'));
const seq = createSequence(store.project, 'seq', fps, 640, 360);
const v1 = addTrack(seq, 'video', 'V1');
const v2 = addTrack(seq, 'video', 'V2');
const a1 = addTrack(seq, 'audio', 'A1');
const vPath = join(fix, 'sample-av.mp4');
const imgPath = join(fix, 'sample-img.png');
const vpr = await probeMedia(vPath);
assert.ok(vpr.hasVideo && vpr.hasAudio, 'fixture must have AV');
const vFrames = secondsToFrames(vpr.durationSec, fps);
store.addMedia({ path: vPath, kind: 'video', name: 'sample-av', durationFrames: vFrames, fps });
store.addMedia({ path: imgPath, kind: 'image', name: 'sample-img', durationFrames: 90, fps, width: 640, height: 360 });
const vId = store.project.media[0].id; const imgId = store.project.media[1].id;
let r = store.placeClip(seq.id, v1.id, { kind: 'video', assetId: vId, startFrame: 0, durationFrames: 150, sourceInFrame: 0, name: 'main' });
assert.ok(r.ok, JSON.stringify(r));
const clipId = r.ids[0];
r = store.splitClip(seq.id, clipId, 90); assert.ok(r.ok); // remove middle: delete right part, trim
assert.ok(store.deleteClip(seq.id, r.ids[1]).ok);
// overlay + text (preview contract: same math as export)
r = store.placeClip(seq.id, v2.id, { kind: 'image', assetId: imgId, startFrame: 30, durationFrames: 60, name: 'overlay' });
assert.ok(r.ok, JSON.stringify(r));
r = store.placeClip(seq.id, v2.id, { kind: 'text', startFrame: 0, durationFrames: 60, name: 'title', text: 'Hello Palmier' });
assert.ok(!r.ok, 'text must not overlap image on same track (expected guard)');
const v3 = addTrack(seq, 'video', 'V3');
r = store.placeClip(seq.id, v3.id, { kind: 'text', startFrame: 0, durationFrames: 60, name: 'title', text: 'Hello Palmier' });
assert.ok(r.ok, JSON.stringify(r));
// preview contract check: clip at frame 40 is overlay track content
const { videoClipAt } = await import('../model.js');
assert.ok(videoClipAt(seq, 40), 'preview must resolve a clip at f40');
// save/reopen
const projPath = join(dir, 'slice.palmier.json');
await saveProject(store.project, projPath);
const reopened = await loadProject(projPath);
assert.equal(sequenceDurationFrames(reopened.sequences[0]), sequenceDurationFrames(seq));
// export real timeline
const out = join(dir, 'slice.mp4');
const ex = await exportSequence(store.project, seq.id, out);
console.log(`exported bytes=${ex.bytes}`);
const v = await validateExport(out, ex.durationSec, true);
console.log(`validate: ${v.details}`);
assert.ok(v.ok, v.details);
console.log(`SLICE PASS dir=${dir} out=${out}`);
