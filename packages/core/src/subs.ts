import { readFile } from "node:fs/promises";
import { EditorStore } from "./store.js";
import { addTrack as mkTrack, createSequence } from "./model.js";

export interface SubCue { startSec: number; endSec: number; text: string }
export function parseSubs(raw: string): SubCue[] {
  const lines = raw.split(/\r?\n/);
  const cues: SubCue[] = [];
  const ts = "(\\d+:)?\\d{1,2}:\\d{1,2}[,.]\\d{1,3}";
  const re = new RegExp("^\\s*(" + ts + ")\\s*-->\\s*(" + ts + ")(.*)$");
  const toSec = (s: string): number => {
    const m = s.replace(",", ".").split(":");
    const sec = Number(m.pop());
    const min = Number(m.pop() ?? 0);
    const hr = Number(m.pop() ?? 0);
    return hr * 3600 + min * 60 + sec;
  };
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(re);
    if (!m) { i++; continue; }
    const startSec = toSec(m[1]), endSec = toSec(m[3]);
    i++;
    const buf: string[] = [m[5] ?? ""];
    while (i < lines.length && lines[i].trim() !== "") { buf.push(lines[i]); i++; }
    const text = buf.join("\n").replace(/<[^>]*>/g, "").trim();
    if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec && text) {
      cues.push({ startSec, endSec, text });
    }
  }
  return cues;
}
export async function importSubtitles(store: EditorStore, path: string): Promise<string[]> {
  const raw = await readFile(path, "utf8").catch(() => { throw new Error("missing subtitle file: " + path); });
  const cues = parseSubs(raw.replace(/^﻿/, ""));
  if (!cues.length) throw new Error("no cues found: " + path);
  const p = store.project;
  let seq = p.sequences.find((s) => s.id === p.activeSequenceId) ?? p.sequences[0];
  if (!seq) seq = createSequence(p, "Sequence 1", { num: 30, den: 1 }, 1280, 720);
  const track = mkTrack(seq, "video", "Subtitles " + (seq.tracks.filter((x) => x.kind === "video").length + 1));
  const fpsN = seq.fps.num / seq.fps.den;
  const ids: string[] = [];
  for (const c of cues) {
    const startFrame = Math.round(c.startSec * fpsN);
    const durationFrames = Math.max(1, Math.round((c.endSec - c.startSec) * fpsN));
    const r = store.placeClip(seq.id, track.id, { kind: "text", startFrame, durationFrames, name: c.text.split("\n")[0].slice(0, 40), text: c.text });
    if (!r.ok) throw new Error("subtitle place failed: " + (r.error ?? "overlap"));
    ids.push(...r.ids);
  }
  return ids;
}

