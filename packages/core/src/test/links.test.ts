import test from "node:test";
import assert from "node:assert/strict";
import { createProject, createSequence, addTrack } from "../model.js";
import { EditorStore } from "../store.js";

test("linked clips move and delete together", () => {
  const p = createProject("l");
  const s = createSequence(p, "s", { num: 30, den: 1 });
  const v1 = addTrack(s, "video", "V1");
  const a1 = addTrack(s, "audio", "A1");
  const st = new EditorStore(p);
  const v = st.placeClip(s.id, v1.id, { kind: "video", startFrame: 0, durationFrames: 60, name: "v" }).ids[0];
  const a = st.placeClip(s.id, a1.id, { kind: "audio", startFrame: 0, durationFrames: 60, name: "a" }).ids[0];
  const c = st.placeClip(s.id, v1.id, { kind: "video", startFrame: 60, durationFrames: 30, name: "c" }).ids[0];
  assert.ok(!st.linkClips(s.id, [v]).ok);
  assert.ok(st.linkClips(s.id, [v, a]).ok);
  assert.ok(st.moveClip(s.id, v, v1.id, 30).ok === false);
  const byId = () => new Map(st.project.sequences[0].clips.map((x) => [x.id, x]));
  const r = st.moveClip(s.id, v, v1.id, 90);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(byId().get(v)!.startFrame, 90);
  assert.equal(byId().get(a)!.startFrame, 90);
  assert.ok(st.deleteClip(s.id, v).ok);
  assert.ok(!byId().has(v) && !byId().has(a) && byId().has(c));
  assert.ok(st.undo());
  assert.ok(st.unlinkClips(s.id, [v, a]).ok);
  assert.ok(st.moveClip(s.id, v, v1.id, 0).ok);
  assert.equal(byId().get(a)!.startFrame, 90);
});

