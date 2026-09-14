import type { SubCue } from './subs.js';

export interface GroqSegment { start: number; end: number; text: string }
export interface GroqVerbose { segments?: GroqSegment[] }
// Groq verbose_json segments straight into subtitle cues. Bad segments are
// skipped, never fatal: an empty result means "no speech", reported upstream.
export function segmentsToCues(j: GroqVerbose): SubCue[] {
  const segs = j && Array.isArray(j.segments) ? j.segments : [];
  const out: SubCue[] = [];
  for (const s of segs) {
    if (!s || !Number.isFinite(s.start) || !Number.isFinite(s.end)) continue;
    const text = String(s.text ?? "").trim();
    if (!text || s.end <= s.start) continue;
    out.push({ startSec: s.start, endSec: s.end, text });
  }
  return out;
}
export function cuesToSrt(cues: SubCue[]): string {
  const ts = (t: number): string => {
    const ms = Math.max(0, Math.round(t * 1000));
    const p = (n: number, l: number): string => String(n).padStart(l, "0");
    return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor(ms % 3600000 / 60000), 2) + ":" + p(Math.floor(ms % 60000 / 1000), 2) + "," + p(ms % 1000, 3);
  };
  return cues.map((c, i) => (i + 1) + "\n" + ts(c.startSec) + " --> " + ts(c.endSec) + "\n" + c.text).join("\n\n") + "\n";
}
