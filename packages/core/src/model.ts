import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RationalFps } from './time.js';

export const PROJECT_VERSION = 1;
export type MediaKind = 'video' | 'audio' | 'image' | 'subtitle';
export type ClipKind = 'video' | 'audio' | 'image' | 'text';
export interface MediaAsset {
  id: string; path: string; kind: MediaKind; name: string;
  durationFrames: number; fps: RationalFps; width?: number; height?: number;
  audioChannels?: number; sampleRate?: number; offline?: boolean;
}
export interface Transform { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number }
export type BlendMode = "normal" | "screen" | "multiply" | "overlay";
export const BLEND_MODES: BlendMode[] = ["normal", "screen", "multiply", "overlay"];
export const TEXT_ANIMS = ["none", "popIn", "slideUp"];
export const FONT_FAMILIES = ["sans", "serif", "mono", "arial", "times", "courier", "verdana"];
export const FONT_BASE: Record<string, string> = { sans: "arial", arial: "arial", helvetica: "arial", serif: "times", times: "times", mono: "cour", courier: "cour", verdana: "verdana" };
export const FONT_VARIANTS: Record<string, { regular: string; bold: string; italic: string; boldItalic: string }> = {
  arial: { regular: "arial.ttf", bold: "arialbd.ttf", italic: "ariali.ttf", boldItalic: "arialbi.ttf" },
  times: { regular: "times.ttf", bold: "timesbd.ttf", italic: "timesi.ttf", boldItalic: "timesbi.ttf" },
  cour: { regular: "cour.ttf", bold: "courbd.ttf", italic: "couri.ttf", boldItalic: "courbi.ttf" },
  verdana: { regular: "verdana.ttf", bold: "verdanab.ttf", italic: "verdanai.ttf", boldItalic: "verdanaz.ttf" },
};
export function resolveFontFile(family?: string, bold?: boolean, italic?: boolean): string | null {
  const key = String(family || "sans").toLowerCase();
  const base = FONT_BASE[key] || "arial";
  const set = FONT_VARIANTS[base] || FONT_VARIANTS.arial;
  const want = bold && italic ? set.boldItalic : bold ? set.bold : italic ? set.italic : set.regular;
  const dir = join(process.env.SystemRoot || "C:\\Windows", "Fonts");
  const pick = (f: string) => join(dir, f);
  try {
    if (existsSync(pick(want))) return pick(want);
    if (want !== set.regular && existsSync(pick(set.regular))) return pick(set.regular);
    return null;
  } catch { return null; }
}
export function fontFilterPath(fsPath: string): string {
  return fsPath.split("\\").join("/").split(":").join("\\:");
}
export interface CropBox { l: number; t: number; r: number; b: number }
export const noCrop = (): CropBox => ({ l: 0, t: 0, r: 0, b: 0 });
export function validateCrop(k: CropBox): void {
  for (const v of [k.l, k.t, k.r, k.b]) if (!Number.isFinite(v) || v < 0 || v > 0.9) throw new Error("bad crop");
  if (k.l + k.r >= 1 || k.t + k.b >= 1) throw new Error("crop removes frame");
}
export interface Clip {
  id: string; trackId: string; kind: ClipKind; name: string;
  assetId?: string; startFrame: number; durationFrames: number; sourceInFrame: number;
  speed: number; opacity: number; volume: number; muted: boolean; fadeInFrames: number; fadeOutFrames: number; transitionOutFrames: number; crop: CropBox; blend: BlendMode; opacityKeys: Keyframe[]; volumeKeys: Keyframe[];
  transform: Transform; text?: string; linkGroup?: string; fontSize?: number; color?: string; textAlign?: 'left' | 'center' | 'right'; textBg?: boolean; fontFamily?: string; fontBold?: boolean; fontItalic?: boolean; textAnim?: string; textShadow?: boolean; textOutline?: boolean;
}
export interface Track { id: string; kind: 'video' | 'audio'; name: string; locked?: boolean; hidden?: boolean; muted?: boolean; volume?: number }
export interface Sequence {
  id: string; name: string; fps: RationalFps; width: number; height: number;
  tracks: Track[]; clips: Clip[]; markers: TimelineMarker[];
}
export interface Project {
  version: number; id: string; name: string;
  sequences: Sequence[]; media: MediaAsset[]; activeSequenceId?: string;
}
export const uid = (): string => randomUUID();
export const defaultTransform = (): Transform => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 });

export function createProject(name: string): Project {
  if (!name.trim()) throw new Error('project name required');
  return { version: PROJECT_VERSION, id: uid(), name, sequences: [], media: [] };
}
export function createSequence(p: Project, name: string, fps: RationalFps, w = 1280, h = 720): Sequence {
  const s: Sequence = { id: uid(), name, fps, width: w, height: h, tracks: [], clips: [], markers: [] };
  p.sequences.push(s); p.activeSequenceId ??= s.id; return s;
}
export function addTrack(s: Sequence, kind: 'video' | 'audio', name: string): Track {
  const t: Track = { id: uid(), kind, name }; s.tracks.push(t); return t;
}
export const activeSequence = (p: Project): Sequence => {
  const s = p.sequences.find(x => x.id === p.activeSequenceId) ?? p.sequences[0];
  if (!s) throw new Error('no sequence');
  return s;
};
// Same-track overlap check (single source of truth for placement math).
export function rangeOverlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}
export function trackClips(s: Sequence, trackId: string): Clip[] {
  return s.clips.filter(c => c.trackId === trackId).sort((a, b) => a.startFrame - b.startFrame);
}
export function sequenceDurationFrames(s: Sequence): number {
  return s.clips.reduce((m, c) => Math.max(m, c.startFrame + c.durationFrames), 0);
}
// Preview contract shared by renderer and export: topmost visible video clip at frame.
export function videoClipAt(s: Sequence, frame: number): Clip | undefined {
  const hidden = new Set(s.tracks.filter((x) => x.hidden).map((x) => x.id));
  const vids = s.clips.filter(c => !hidden.has(c.trackId) && (c.kind === 'video' || c.kind === 'image' || c.kind === 'text') && frame >= c.startFrame && frame < c.startFrame + c.durationFrames);
  if (!vids.length) return undefined;
  const order = new Map(s.tracks.map((t, i) => [t.id, i]));
  return vids.sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0))[0];
}

// Timeline geometry (single source of truth; renderer and tests share this, no duplicates).
export function pxToFrame(xPx: number, widthPx: number, durationFrames: number): number {
  if (!(widthPx > 0) || !Number.isFinite(xPx)) throw new Error('bad geometry');
  const f = Math.round((xPx / widthPx) * durationFrames);
  return Math.min(Math.max(f, 0), Math.max(durationFrames, 0));
}
export function frameToPx(frame: number, widthPx: number, durationFrames: number): number {
  if (!(widthPx > 0) || !Number.isInteger(frame) || frame < 0) throw new Error('bad geometry');
  if (durationFrames <= 0) return 0;
  return (frame / durationFrames) * widthPx;
}


export function computeRippleShifts(clips: Array<{ id: string; startFrame: number; durationFrames: number }>, removedIds: Set<string>): Array<{ clipId: string; newStartFrame: number }> {
  const gone = clips.filter((c) => removedIds.has(c.id));
  return clips.filter((c) => !removedIds.has(c.id)).map((c) => ({ clipId: c.id, newStartFrame: c.startFrame - shiftBefore(c.startFrame, gone) }));
}
function shiftBefore(start: number, removed: Array<{ startFrame: number; durationFrames: number }>): number {
  return removed.filter((r) => r.startFrame + r.durationFrames <= start).reduce((a, r) => a + r.durationFrames, 0);
}
export type MarkerStatus = 'open' | 'review' | 'resolved';
export interface TimelineMarker { id: string; name: string; startFrame: number; durationFrames: number; color: { r: number; g: number; b: number; a: number }; comment: string; status: MarkerStatus }
export const MARKER_NAME_MAX = 120;
export const MARKER_COMMENT_MAX = 4000;
export const markerDefaultColor = () => ({ r: 0, g: 0.478, b: 1, a: 1 });
export function validateMarker(m: { name: string; startFrame: number; durationFrames?: number; comment?: string }): void {
  if (!m.name.trim() || m.name.length > MARKER_NAME_MAX) throw new Error('bad marker name');
  if (!Number.isInteger(m.startFrame) || m.startFrame < 0) throw new Error('bad marker frame');
  if (m.durationFrames !== undefined && (!Number.isInteger(m.durationFrames) || m.durationFrames < 0)) throw new Error('bad marker range');
  if ((m.comment ?? '').length > MARKER_COMMENT_MAX) throw new Error('marker comment too long');
}

export type SnapKind = 'playhead' | 'clipEdge' | 'marker';
export interface SnapTarget { frame: number; kind: SnapKind }
// Snapping (mirrors upstream SnapEngine, clip/marker/playhead scope): pure target
// collection + nearest-probe resolution. Beats/nesting excluded for now.
export function collectSnapTargets(clips: Array<{ id: string; startFrame: number; durationFrames: number }>, opts: { excludeIds?: Set<string>; playheadFrame?: number; includePlayhead?: boolean; markerFrames?: number[] } = {}): SnapTarget[] {
  const out: SnapTarget[] = [];
  if (opts.includePlayhead && opts.playheadFrame !== undefined) out.push({ frame: opts.playheadFrame, kind: 'playhead' });
  for (const m of opts.markerFrames ?? []) out.push({ frame: m, kind: 'marker' });
  for (const c of clips) {
    if (opts.excludeIds?.has(c.id)) continue;
    out.push({ frame: c.startFrame, kind: 'clipEdge' });
    out.push({ frame: c.startFrame + c.durationFrames, kind: 'clipEdge' });
  }
  return out;
}
export function snapProbe(probeFrames: number[], targets: SnapTarget[], thresholdFrames: number): { frame: number; probeOffset: number } | null {
  let bf = -1; let bo = -1; let bd = Infinity;
  for (let i = 0; i < probeFrames.length; i++) {
    for (const t of targets) {
      const d = Math.abs(probeFrames[i] - t.frame);
      if (d <= thresholdFrames && d < bd) { bd = d; bf = t.frame; bo = i; }
    }
  }
  if (bf < 0) return null;
  return { frame: bf, probeOffset: bo };
}
export function snapClipStart(seqClips: Array<{ id: string; trackId: string; startFrame: number; durationFrames: number }>, clipId: string, rawStart: number, thresholdFrames: number, extra: { playheadFrame?: number; markerFrames?: number[] } = {}): number {
  const clip = seqClips.find((c) => c.id === clipId);
  if (!clip) throw new Error('clip not found');
  const targets = collectSnapTargets(seqClips, { excludeIds: new Set([clipId]), playheadFrame: extra.playheadFrame, includePlayhead: extra.playheadFrame !== undefined, markerFrames: extra.markerFrames });
  const hit = snapProbe([rawStart, rawStart + clip.durationFrames], targets, thresholdFrames);
  if (!hit) return Math.max(rawStart, 0);
  return Math.max(hit.probeOffset === 0 ? hit.frame : hit.frame - clip.durationFrames, 0);
}



export type OverwriteAction =
  | { type: 'remove'; clipId: string }
  | { type: 'trimEnd'; clipId: string; newDuration: number }
  | { type: 'trimStart'; clipId: string; newStartFrame: number; newSourceIn: number; newDuration: number }
  | { type: 'split'; clipId: string; leftDuration: number; rightStartFrame: number; rightSourceIn: number; rightDuration: number };
// Overwrite (mirrors upstream OverwriteEngine): pure plan to clear [regionStart, regionEnd).
export function computeOverwrite(clips: Array<{ id: string; startFrame: number; durationFrames: number; sourceInFrame: number }>, regionStart: number, regionEnd: number): OverwriteAction[] {
  if (regionEnd <= regionStart) return [];
  const out: OverwriteAction[] = [];
  for (const c of clips) {
    const cs = c.startFrame, ce = cs + c.durationFrames;
    if (ce <= regionStart || cs >= regionEnd) continue;
    if (cs >= regionStart && ce <= regionEnd) out.push({ type: 'remove', clipId: c.id });
    else if (cs < regionStart && ce > regionEnd) out.push({ type: 'split', clipId: c.id, leftDuration: regionStart - cs, rightStartFrame: regionEnd, rightSourceIn: c.sourceInFrame + (regionEnd - cs), rightDuration: ce - regionEnd });
    else if (cs < regionStart) out.push({ type: 'trimEnd', clipId: c.id, newDuration: regionStart - cs });
    else out.push({ type: 'trimStart', clipId: c.id, newStartFrame: regionEnd, newSourceIn: c.sourceInFrame + (regionEnd - cs), newDuration: ce - regionEnd });
  }
  return out;
}

// Keyframes (mirrors upstream KeyframeTrack, numeric scope): sorted upsert, linear/hold/smooth eval.
export type KeyInterp = "linear" | "hold" | "smooth";
export interface Keyframe { frame: number; value: number; interpolation: KeyInterp }
export function upsertKeyframe(kfs: Keyframe[], kf: Keyframe): Keyframe[] {
  if (!Number.isInteger(kf.frame) || kf.frame < 0 || !Number.isFinite(kf.value)) throw new Error("bad keyframe");
  const nx = kfs.filter((k) => k.frame !== kf.frame);
  const at = nx.findIndex((k) => k.frame > kf.frame);
  if (at < 0) nx.push(kf); else nx.splice(at, 0, kf);
  return nx;
}
export function evaluateKeyframes(kfs: Keyframe[], frame: number, base: number): number {
  if (!kfs.length) return base;
  const s = [...kfs].sort((a, b) => a.frame - b.frame);
  if (frame <= s[0].frame) return s[0].value;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if (frame < b.frame) {
      if (a.interpolation === "hold") return a.value;
      const u = (frame - a.frame) / (b.frame - a.frame);
      const w = a.interpolation === "smooth" ? u * u * (3 - 2 * u) : u;
      return a.value + (b.value - a.value) * w;
    }
  }
  return s[s.length - 1].value;
}




