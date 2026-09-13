import { PROJECT_VERSION, activeSequence, BLEND_MODES, computeOverwrite, computeRippleShifts, noCrop, upsertKeyframe, validateCrop, markerDefaultColor, validateMarker, rangeOverlaps, trackClips, uid, defaultTransform, addTrack as mkTrack, type Clip, type MediaAsset, type Project, type Sequence, type BlendMode, type ClipKind, type TimelineMarker, type Track } from './model.js';
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
  loadFrom(p: Project): void { this.project = p; this.past = []; this.future = []; }
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
  addTrack(seqId: string, kind: Track["kind"], name: string): Receipt {
    return this.exec("addTrack", (p) => {
      const s = req_seq(p, seqId);
      if (!name.trim()) throw new Error("track name required");
      const tr = mkTrack(s, kind, name);
      return { ok: true, ids: [tr.id], warnings: [], label: "addTrack" };
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
      const c: Clip = { id: uid(), trackId, kind: o.kind, name: o.name, assetId: o.assetId, startFrame: o.startFrame, durationFrames: o.durationFrames, sourceInFrame: o.sourceInFrame ?? 0, speed: 1, opacity: 1, volume: 1, muted: false, fadeInFrames: 0, fadeOutFrames: 0, transitionOutFrames: 0, crop: noCrop(), blend: "normal", opacityKeys: [], volumeKeys: [], transform: defaultTransform(), text: o.text };
      s.clips.push(c);
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }], warnings: [], label: 'placeClip' };
    });
  }
  overwritePlace(seqId: string, trackId: string, o: { kind: ClipKind; assetId?: string; startFrame: number; durationFrames: number; sourceInFrame?: number; name: string; text?: string }): Receipt {
    return this.exec("overwritePlace", (p) => {
      const s = req_seq(p, seqId);
      if (!s.tracks.some((x) => x.id === trackId)) throw new Error("track not found");
      const regionEnd = o.startFrame + o.durationFrames;
      for (const a of computeOverwrite(trackClips(s, trackId), o.startFrame, regionEnd)) {
        const c = req_clip(s, a.clipId);
        if (a.type === "remove") s.clips = s.clips.filter((x) => x.id !== a.clipId);
        else if (a.type === "trimEnd") c.durationFrames = a.newDuration;
        else if (a.type === "trimStart") { c.startFrame = a.newStartFrame; c.sourceInFrame = a.newSourceIn; c.durationFrames = a.newDuration; }
        else { const right: Clip = { ...structuredClone(c), id: uid(), startFrame: a.rightStartFrame, durationFrames: a.rightDuration, sourceInFrame: a.rightSourceIn }; c.durationFrames = a.leftDuration; s.clips.push(right); }
      }
      const c: Clip = { id: uid(), trackId, kind: o.kind, name: o.name, assetId: o.assetId, startFrame: o.startFrame, durationFrames: o.durationFrames, sourceInFrame: o.sourceInFrame ?? 0, speed: 1, opacity: 1, volume: 1, muted: false, fadeInFrames: 0, fadeOutFrames: 0, transitionOutFrames: 0, crop: noCrop(), blend: "normal", opacityKeys: [], volumeKeys: [], transform: defaultTransform(), text: o.text };
      s.clips.push(c);
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }], warnings: [], label: "overwritePlace" };
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
  addMarker(seqId: string, o: { name: string; startFrame: number; durationFrames?: number; comment?: string }): Receipt {
    return this.exec("addMarker", (p) => {
      const s = req_seq(p, seqId); s.markers ??= [];
      validateMarker(o);
      const m: TimelineMarker = { id: uid(), name: o.name, startFrame: o.startFrame, durationFrames: o.durationFrames ?? 0, color: markerDefaultColor(), comment: o.comment ?? "", status: "open" };
      s.markers.push(m);
      return { ok: true, ids: [m.id], warnings: [], label: "addMarker" };
    });
  }
  removeMarker(seqId: string, markerId: string): Receipt {
    return this.exec("removeMarker", (p) => {
      const s = req_seq(p, seqId); s.markers ??= [];
      const i = s.markers.findIndex((x) => x.id === markerId);
      if (i < 0) throw new Error("marker not found");
      const [m] = s.markers.splice(i, 1);
      return { ok: true, ids: [m.id], warnings: [], label: "removeMarker" };
    });
  }
  rippleDelete(seqId: string, clipId: string): Receipt {
    return this.exec("rippleDelete", (p) => {
      const s = req_seq(p, seqId); const c = req_clip(s, clipId);
      const shifts = computeRippleShifts(trackClips(s, c.trackId), new Set([clipId]));
      s.clips = s.clips.filter((x) => x.id !== clipId);
      for (const sh of shifts) req_clip(s, sh.clipId).startFrame = sh.newStartFrame;
      return { ok: true, ids: [clipId, ...shifts.map((x) => x.clipId)], warnings: [], label: "rippleDelete" };
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
  setTransform(seqId: string, clipId: string, patch: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number }>): Receipt {
    return this.exec("setTransform", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      for (const [k, v] of Object.entries(patch)) {
        if (!Number.isFinite(v)) throw new Error(`bad transform ${k}`);
        if ((k === "scaleX" || k === "scaleY") && (v as number) <= 0) throw new Error(`bad scale ${k}`);
      }
      const next = { ...c.transform, ...patch };
      if (JSON.stringify(next) === JSON.stringify(c.transform)) return { noop: true };
      c.transform = next;
      return { ok: true, ids: [c.id], warnings: [], label: "setTransform" };
    });
  }
  setSpeed(seqId: string, clipId: string, speed: number): Receipt {
    return this.exec("setSpeed", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error("bad speed");
      if (c.speed === speed) return { noop: true };
      c.speed = speed;
      return { ok: true, ids: [c.id], warnings: [], label: "setSpeed" };
    });
  }
  setBlend(seqId: string, clipId: string, blend: string): Receipt {
    return this.exec("setBlend", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!(BLEND_MODES as string[]).includes(blend)) throw new Error("bad blend");
      if ((c.blend ?? "normal") === blend) return { noop: true };
      c.blend = blend as BlendMode;
      return { ok: true, ids: [c.id], warnings: [], label: "setBlend" };
    });
  }
  setCrop(seqId: string, clipId: string, crop: { l: number; t: number; r: number; b: number }): Receipt {
    return this.exec("setCrop", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      validateCrop(crop);
      if (JSON.stringify(c.crop ?? noCrop()) === JSON.stringify(crop)) return { noop: true };
      c.crop = crop;
      return { ok: true, ids: [c.id], warnings: [], label: "setCrop" };
    });
  }
  setTransition(seqId: string, clipId: string, outFrames: number): Receipt {
    return this.exec("setTransition", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isInteger(outFrames) || outFrames < 0 || outFrames > c.durationFrames) throw new Error("bad transition");
      if ((c.transitionOutFrames ?? 0) === outFrames) return { noop: true };
      c.transitionOutFrames = outFrames;
      return { ok: true, ids: [c.id], warnings: [], label: "setTransition" };
    });
  }
  setFade(seqId: string, clipId: string, fadeInFrames: number, fadeOutFrames: number): Receipt {
    return this.exec("setFade", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      for (const v of [fadeInFrames, fadeOutFrames]) if (!Number.isInteger(v) || v < 0) throw new Error("bad fade");
      if (fadeInFrames + fadeOutFrames > c.durationFrames) throw new Error("fades exceed clip duration");
      if ((c.fadeInFrames ?? 0) === fadeInFrames && (c.fadeOutFrames ?? 0) === fadeOutFrames) return { noop: true };
      c.fadeInFrames = fadeInFrames; c.fadeOutFrames = fadeOutFrames;
      return { ok: true, ids: [c.id], warnings: [], label: "setFade" };
    });
  }
  setKeyframe(seqId: string, clipId: string, track: "opacity" | "volume", kf: { frame: number; value: number; interpolation?: "linear" | "hold" | "smooth" }): Receipt {
    return this.exec("setKeyframe", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      const full = { frame: kf.frame, value: kf.value, interpolation: kf.interpolation ?? "linear" as const };
      if (track === "opacity" && (full.value < 0 || full.value > 1)) throw new Error("bad opacity key");
      if (track === "volume" && (!(full.value >= 0 && full.value <= 4) || !Number.isFinite(full.value))) throw new Error("bad volume key");
      const arr = track === "opacity" ? (c.opacityKeys ??= []) : (c.volumeKeys ??= []);
      const nx = upsertKeyframe(arr, full);
      if (JSON.stringify(nx) === JSON.stringify(arr)) return { noop: true };
      if (track === "opacity") c.opacityKeys = nx; else c.volumeKeys = nx;
      return { ok: true, ids: [c.id], warnings: [], label: "setKeyframe" };
    });
  }
  removeKeyframe(seqId: string, clipId: string, track: "opacity" | "volume", frame: number): Receipt {
    return this.exec("removeKeyframe", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      const arr = (track === "opacity" ? c.opacityKeys : c.volumeKeys) ?? [];
      if (!arr.some((k) => k.frame === frame)) return { noop: true };
      const nx = arr.filter((k) => k.frame !== frame);
      if (track === "opacity") c.opacityKeys = nx; else c.volumeKeys = nx;
      return { ok: true, ids: [c.id], warnings: [], label: "removeKeyframe" };
    });
  }
  setOpacity(seqId: string, clipId: string, opacity: number): Receipt {
    return this.exec("setOpacity", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!(opacity >= 0 && opacity <= 1) || !Number.isFinite(opacity)) throw new Error("bad opacity");
      if (c.opacity === opacity) return { noop: true };
      c.opacity = opacity;
      return { ok: true, ids: [c.id], warnings: [], label: "setOpacity" };
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

















