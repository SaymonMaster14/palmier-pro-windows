import { PROJECT_VERSION, activeSequence, rangeOverlaps, trackClips, uid, defaultTransform, type Clip, type MediaAsset, type Project, type Sequence, type Track } from './model.js';
import type { RationalFps } from './time.js';

export interface Receipt { ok: boolean; ids: string[]; ranges?: Array<{ startFrame: number; durationFrames: number }>; warnings: string[]; noop?: boolean; error?: string; label: string }
// One authoritative owner for mutable state. UI and Agent/MCP must use these ops.
export class EditorStore {
  project: Project;
  private past: Project[] = []; private future: Project[] = [];
  constructor(project: Project) { this.project = project; }
  private snap(): Project { return structuredClone(this.project); }
  // Validate before mutate; failed/no-op ops create no history. One coherent action = one undo unit.
  exec(label: string, fn: (p: Project) => Receipt | { noop: true }): Receipt {
    const before = JSON.stringify(this.project);
    let r: Receipt | { noop: true };
    try { r = fn(this.project); } catch (e) {
      return { ok: false, ids: [], warnings: [], error: String((e as Error)?.message ?? e), label };
    }
    if ((r as { noop?: boolean }).noop) return { ok: true, ids: [], warnings: [], noop: true, label };
    const rec = r as Receipt;
    if (!rec.ok) return { ...rec, label };
    if (JSON.stringify(this.project) === before) return { ok: true, ids: rec.ids ?? [], warnings: rec.warnings ?? [], noop: true, label };
    this.past.push(JSON.parse(before)); this.future = [];
    return { ...rec, label };
  }
  transaction(label: string, fns: Array<(p: Project) => void>): Receipt {
    return this.exec(label, (p) => { fns.forEach(f => f(p)); return { ok: true, ids: [], warnings: [], label }; });
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo(): boolean { if (!this.past.length) return false; this.future.push(this.snap()); this.project = this.past.pop()!; return true; }
  redo(): boolean { if (!this.future.length) return false; this.past.push(this.snap()); this.project = this.future.pop()!; return true; }

  addMedia(a: Omit<MediaAsset, 'id'>): Receipt {
    return this.exec('addMedia', (p) => {
      if (!a.path) throw new Error('media path required');
      if (p.media.some(m => m.path === a.path)) return { noop: true };
      const m: MediaAsset = { ...a, id: uid() };
      p.media.push(m); return { ok: true, ids: [m.id], warnings: [], label: 'addMedia' };
    });
  }
  placeClip(seqId: string, trackId: string, o: { kind: Clip['kind']; assetId?: string; startFrame: number; durationFrames: number; sourceInFrame?: number; name: string; text?: string }): Receipt {
    return this.exec('placeClip', (p) => {
      const s = p.sequences.find(x => x.id === seqId); if (!s) throw new Error('sequence not found');
      const t = s.tracks.find(x => x.id === trackId); if (!t) throw new Error('track not found');
      if (t.locked) throw new Error('track locked');
      if (!Number.isInteger(o.startFrame) || o.startFrame < 0) throw new Error('bad startFrame');
      if (!Number.isInteger(o.durationFrames) || o.durationFrames <= 0) throw new Error('bad durationFrames');
      for (const c of trackClips(s, trackId))
        if (rangeOverlaps(o.startFrame, o.startFrame + o.durationFrames, c.startFrame, c.startFrame + c.durationFrames))
          throw new Error(`overlap with clip ${c.id}`);
      const c: Clip = { id: uid(), trackId, kind: o.kind, name: o.name, assetId: o.assetId, startFrame: o.startFrame, durationFrames: o.durationFrames, sourceInFrame: o.sourceInFrame ?? 0, speed: 1, opacity: 1, volume: 1, muted: false, transform: defaultTransform(), text: o.text };
      s.clips.push(c);
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }], warnings: [], label: 'placeClip' };
    });
  }
  moveClip(seqId: string, clipId: string, toTrackId: string, toStart: number): Receipt {
    return this.exec('moveClip', (p) => {
      const s = req_seq(p, seqId); const c = req_clip(s, clipId);
      const t = s.tracks.find(x => x.id === toTrackId); if (!t) throw new Error('target track not found');
      if (t.locked) throw new Error('target track locked');
      if (!Number.isInteger(toStart) || toStart < 0) throw new Error('bad startFrame');
      if (toTrackId === c.trackId && toStart === c.startFrame) return { noop: true };
      for (const o of trackClips(s, toTrackId).filter(x => x.id !== c.id))
        if (rangeOverlaps(toStart, toStart + c.durationFrames, o.startFrame, o.startFrame + o.durationFrames)) throw new Error(`overlap with clip ${o.id}`);
      c.trackId = toTrackId; c.startFrame = toStart;
      return { ok: true, ids: [c.id], ranges: [{ startFrame: toStart, durationFrames: c.durationFrames }], warnings: [], label: 'moveClip' };
    });
  }
  trimEnd(seqId: string, clipId: string, newDuration: number): Receipt {
    return this.exec('trimEnd', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isInteger(newDuration) || newDuration <= 0) throw new Error('bad duration');
      if (newDuration === c.durationFrames) return { noop: true };
      c.durationFrames = newDuration;
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: newDuration }], warnings: [], label: 'trimEnd' };
    });
  }
  trimStart(seqId: string, clipId: string, deltaFrames: number): Receipt {
    return this.exec('trimStart', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isInteger(deltaFrames) || deltaFrames === 0) return { noop: true };
      if (c.startFrame + deltaFrames < 0 || c.durationFrames - deltaFrames <= 0) throw new Error('trim out of range');
      c.startFrame += deltaFrames; c.durationFrames -= deltaFrames; c.sourceInFrame += deltaFrames;
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }], warnings: [], label: 'trimStart' };
    });
  }
  splitClip(seqId: string, clipId: string, atFrame: number): Receipt {
    return this.exec('splitClip', (p) => {
      const s = req_seq(p, seqId); const c = req_clip(s, clipId);
      if (!Number.isInteger(atFrame) || atFrame <= c.startFrame || atFrame >= c.startFrame + c.durationFrames) throw new Error('split point outside clip');
      const right: Clip = { ...structuredClone(c), id: uid(), startFrame: atFrame, durationFrames: c.startFrame + c.durationFrames - atFrame, sourceInFrame: c.sourceInFrame + (atFrame - c.startFrame) };
      c.durationFrames = atFrame - c.startFrame;
      s.clips.push(right);
      return { ok: true, ids: [c.id, right.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }, { startFrame: right.startFrame, durationFrames: right.durationFrames }], warnings: [], label: 'splitClip' };
    });
  }
  deleteClip(seqId: string, clipId: string): Receipt {
    return this.exec('deleteClip', (p) => {
      const s = req_seq(p, seqId); const i = s.clips.findIndex(x => x.id === clipId);
      if (i < 0) throw new Error('clip not found');
      const [c] = s.clips.splice(i, 1);
      return { ok: true, ids: [c.id], warnings: [], label: 'deleteClip' };
    });
  }
  setText(seqId: string, clipId: string, text: string): Receipt {
    return this.exec('setText', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (c.kind !== 'text') throw new Error('not a text clip');
      if (c.text === text) return { noop: true };
      c.text = text; return { ok: true, ids: [c.id], warnings: [], label: 'setText' };
    });
  }
  setVolume(seqId: string, clipId: string, volume: number, muted?: boolean): Receipt {
    return this.exec('setVolume', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!(volume >= 0 && volume <= 4) || !Number.isFinite(volume)) throw new Error('bad volume');
      if (c.volume === volume && (muted === undefined || c.muted === muted)) return { noop: true };
      c.volume = volume; if (muted !== undefined) c.muted = muted;
      return { ok: true, ids: [c.id], warnings: [], label: 'setVolume' };
    });
  }
}
function req_seq(p: Project, id: string): Sequence {
  const s = p.sequences.find(x => x.id === id); if (!s) throw new Error('sequence not found'); return s;
}
function req_clip(s: Sequence, id: string): Clip {
  const c = s.clips.find(x => x.id === id); if (!c) throw new Error('clip not found'); return c;
}
export { activeSequence };
export type { Track };

