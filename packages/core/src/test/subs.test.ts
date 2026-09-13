import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject } from "../model.js";
import { EditorStore } from "../store.js";
import { parseSubs, importSubtitles } from "../subs.js";
const SRT = "1\n00:00:01,000 --> 00:00:02,500 Hello <b>world</b>\n\n2\n00:00:03,000 --> 00:00:04,000 Second line\n";
test("srt parse strips tags, keeps timing", () => {
  const cues = parseSubs(SRT);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSec, 1);
  assert.equal(cues[0].endSec, 2.5);
  assert.equal(cues[0].text, "Hello world");
  assert.deepEqual(parseSubs("nothing here"), []);
});
test("subtitle import places text clips", async () => {
  const dir = mkdtempSync(join(tmpdir(), "palm-sub-"));
  const fp = join(dir, "a.srt");
  writeFileSync(fp, SRT);
  const st = new EditorStore(createProject("s"));
  const ids = await importSubtitles(st, fp);
  assert.equal(ids.length, 2);
  const clips = st.project.sequences[0].clips;
  assert.equal(clips[0].startFrame, 30);
  assert.equal(clips[0].durationFrames, 45);
  await assert.rejects(() => importSubtitles(st, join(dir, "nope.srt")));
});
