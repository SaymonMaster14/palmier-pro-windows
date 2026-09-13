import { randomUUID } from 'node:crypto';
import type { RationalFps } from './time.js';

export const PROJECT_VERSION = 1;
export type MediaKind = 'video' | 'audio' | 'image';
export type ClipKind = 'video' | 'audio' | 'image' | 'text';
export interface MediaAsset {
  id: string; path: string; kind: MediaKind; name: string;
  durationFrames: number; fps: RationalFps; width?: number; height?: number;
  audioChannels?: number; sampleRate?: number; offline?: boolean;
}
export interface Transform { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number }
export interface Clip {
  id: string; trackId: string; kind: ClipKind; name: string;
  assetId?: string; startFrame: number; durationFrames: number; sourceInFrame: number;
  speed: number; opacity: number; volume: number; muted: boolean;
  transform: Transform; text?: string; fontSize?: number; color?: string;
}
export interface Track { id: string; kind: 'video' | 'audio'; name: string; locked?: boolean; hidden?: boolean; muted?: boolean }
export interface Sequence {
  id: string; name: string; fps: RationalFps; width: number; height: number;
  tracks: Track[]; clips: Clip[];
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
  const s: Sequence = { id: uid(), name, fps, width: w, height: h, tracks: [], clips: [] };
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
  const vids = s.clips.filter(c => (c.kind === 'video' || c.kind === 'image' || c.kind === 'text') && frame >= c.startFrame && frame < c.startFrame + c.durationFrames);
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
