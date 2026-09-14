import { PROJECT_VERSION, activeSequence, BLEND_MODES, FONT_FAMILIES, TEXT_ANIMS, computeOverwrite, computeRippleShifts, noCrop, upsertKeyframe, validateCrop, markerDefaultColor, validateMarker, rangeOverlaps, trackClips, uid, defaultTransform, addTrack as mkTrack, createSequence, type Clip, type MediaAsset, type Project, type Sequence, type BlendMode, type ClipKind, type TimelineMarker, type Track } from './model.js';
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
  addSequence(name?: string): Receipt {
    return this.exec("addSequence", (p) => {
      const nm = ((name ?? "Sequence " + (p.sequences.length + 1)) + "").trim().slice(0, 120);
      if (!nm) throw new Error("sequence name required");
      const base = p.sequences.find((x) => x.id === p.activeSequenceId) ?? p.sequences[0];
      const seq = createSequence(p, nm, base ? base.fps : { num: 30, den: 1 }, base ? base.width : 1280, base ? base.height : 720);
      mkTrack(seq, "video", "V1"); mkTrack(seq, "audio", "A1");
      p.activeSequenceId = seq.id;
      return { ok: true, ids: [seq.id], warnings: [], label: "addSequence" };
    });
  }
  setActiveSequence(seqId: string): Receipt {
    return this.exec("setActiveSequence", (p) => {
      const q = p.sequences.find((x) => x.id === seqId); if (!q) throw new Error("sequence not found");
      if (p.activeSequenceId === seqId) return { noop: true };
      p.activeSequenceId = seqId;
      return { ok: true, ids: [seqId], warnings: [], label: "setActiveSequence" };
    });
  }
  renameTrack(seqId: string, trackId: string, name: string): Receipt {
    return this.exec("renameTrack", (p) => {
      const s = req_seq(p, seqId);
      const t = s.tracks.find((x) => x.id === trackId); if (!t) throw new Error("track not found");
      const nm = ((name ?? "") + "").trim().slice(0, 120);
      if (!nm) throw new Error("track name required");
      if (t.name === nm) return { noop: true };
      t.name = nm;
      return { ok: true, ids: [t.id], warnings: [], label: "renameTrack" };
    });
  }
  renameClip(seqId: string, clipId: string, name: string): Receipt {
    return this.exec("renameClip", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      const nm = ((name ?? "") + "").trim().slice(0, 120);
      if (!nm) throw new Error("clip name required");
      if (c.name === nm) return { noop: true };
      c.name = nm;
      return { ok: true, ids: [c.id], warnings: [], label: "renameClip" };
    });
  }
  renameSequence(seqId: string, name: string): Receipt {
    return this.exec("renameSequence", (p) => {
      const q = p.sequences.find((x) => x.id === seqId); if (!q) throw new Error("sequence not found");
      const nm = ((name ?? "") + "").trim().slice(0, 120);
      if (!nm) throw new Error("sequence name required");
      if (q.name === nm) return { noop: true };
      q.name = nm;
      return { ok: true, ids: [q.id], warnings: [], label: "renameSequence" };
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
﻿    return this.exec('moveClip', (p) => {
      const s = req_seq(p, seqId); const c = req_clip(s, clipId);
      const t = s.tracks.find(x => x.id === toTrackId); if (!t) throw new Error('target track not found');
      if (t.locked) throw new Error('target track locked');
      if (!Number.isInteger(toStart) || toStart < 0) throw new Error('bad startFrame');
      const members = linkedIds(s, [clipId]).filter((id) => id !== clipId);
      const delta = toStart - c.startFrame;
      const moves = [{ clipId, toTrackId, toStart }, ...members.map((id) => { const m = s.clips.find((x) => x.id === id)!; return { clipId: id, toTrackId: m.trackId, toStart: m.startFrame + delta }; })];
      const rr = applyMoves(s, moves, 'moveClip');
      rr.ranges = [{ startFrame: toStart, durationFrames: c.durationFrames }];
      return rr;
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
  slipClip(seqId: string, clipId: string, deltaFrames: number): Receipt {
    return this.exec('slipClip', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isInteger(deltaFrames) || deltaFrames === 0) return { noop: true };
      const m = p.media.find(x => x.id === c.assetId);
      if (!m || !Number.isFinite(m.durationFrames)) return { noop: true };
      const next = Math.min(Math.max(c.sourceInFrame + deltaFrames, 0), Math.max(m.durationFrames - c.durationFrames, 0));
      if (next === c.sourceInFrame) return { noop: true };
      c.sourceInFrame = next;
      return { ok: true, ids: [c.id], ranges: [{ startFrame: c.startFrame, durationFrames: c.durationFrames }], warnings: [], label: 'slipClip' };
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
  updateMarker(seqId: string, markerId: string, patch: { name?: string; startFrame?: number; comment?: string; status?: 'open' | 'review' | 'resolved'; color?: { r: number; g: number; b: number; a: number } }): Receipt {
    return this.exec('updateMarker', (p) => {
      const s = req_seq(p, seqId); s.markers ??= [];
      const m = s.markers.find(x => x.id === markerId); if (!m) throw new Error('marker not found');
      if (patch.name !== undefined || patch.comment !== undefined || patch.startFrame !== undefined) validateMarker({ name: patch.name ?? m.name, startFrame: patch.startFrame ?? m.startFrame, comment: patch.comment ?? m.comment });
      if (patch.status !== undefined && patch.status !== 'open' && patch.status !== 'review' && patch.status !== 'resolved') throw new Error('bad marker status');
      if (patch.color !== undefined) { const cc = patch.color; if (!Number.isFinite(cc.r) || !Number.isFinite(cc.g) || !Number.isFinite(cc.b) || !Number.isFinite(cc.a) || cc.r < 0 || cc.g < 0 || cc.b < 0 || cc.a < 0 || cc.r > 1 || cc.g > 1 || cc.b > 1 || cc.a > 1) throw new Error('bad marker color'); }
      let touched = false;
      if (patch.name !== undefined && patch.name !== m.name) { m.name = patch.name; touched = true; }
      if (patch.startFrame !== undefined && patch.startFrame !== m.startFrame) { m.startFrame = patch.startFrame; touched = true; }
      if (patch.comment !== undefined && patch.comment !== m.comment) { m.comment = patch.comment ?? ''; touched = true; }
      if (patch.status !== undefined && patch.status !== m.status) { m.status = patch.status; touched = true; }
      if (patch.color !== undefined) { m.color = { r: patch.color.r, g: patch.color.g, b: patch.color.b, a: patch.color.a }; touched = true; }
      if (!touched) return { noop: true };
      return { ok: true, ids: [m.id], warnings: [], label: 'updateMarker' };
    });
  }
  rippleDelete(seqId: string, clipId: string): Receipt {
﻿    return this.exec('rippleDelete', (p) => {
      const s = req_seq(p, seqId); const c = req_clip(s, clipId);
      const gone = linkedIds(s, [clipId]);
      for (const id of gone) req_clip(s, id);
      const sameTrack = new Set(gone.filter((id) => s.clips.find((x) => x.id === id)?.trackId === c.trackId));
      const shifts = computeRippleShifts(trackClips(s, c.trackId), sameTrack);
      s.clips = s.clips.filter((x) => gone.indexOf(x.id) < 0);
      for (const sh of shifts) req_clip(s, sh.clipId).startFrame = sh.newStartFrame;
      return { ok: true, ids: [...gone, ...shifts.map((x) => x.clipId)], warnings: [], label: 'rippleDelete' };
    });
  }
﻿  linkClips(seqId: string, clipIds: string[]): Receipt {
    return this.exec('linkClips', (p) => {
      const s = req_seq(p, seqId);
      if (new Set(clipIds).size < 2) throw new Error('link needs 2+ clips');
      for (const id of clipIds) req_clip(s, id);
      const g = uid();
      for (const id of clipIds) s.clips.find((x) => x.id === id)!.linkGroup = g;
      return { ok: true, ids: [...clipIds], warnings: [], label: 'linkClips' };
    });
  }
  unlinkClips(seqId: string, clipIds: string[]): Receipt {
    return this.exec('unlinkClips', (p) => {
      const s = req_seq(p, seqId);
      let n = 0;
      for (const id of clipIds) { const c = req_clip(s, id); if (c.linkGroup) { delete c.linkGroup; n++; } }
      if (!n) return { noop: true };
      return { ok: true, ids: [...clipIds], warnings: [], label: 'unlinkClips' };
    });
  }
  deleteClips(seqId: string, clipIds: string[]): Receipt {
    return this.exec("deleteClips", (p) => {
      const s = req_seq(p, seqId);
      const set = new Set(clipIds);
      for (const id of linkedIds(s, clipIds)) set.add(id);
      for (const id of set) req_clip(s, id);
      s.clips = s.clips.filter((x) => !set.has(x.id));
      return { ok: true, ids: [...set], warnings: [], label: "deleteClips" };
    });
  }
  moveClips(seqId: string, moves: Array<{ clipId: string; toTrackId: string; toStart: number }>): Receipt {
﻿    return this.exec('moveClips', (p) => {
      const s = req_seq(p, seqId);
      for (const m of moves) { req_clip(s, m.clipId);
        if (!s.tracks.some((x) => x.id === m.toTrackId)) throw new Error('target track not found');
        if (!Number.isInteger(m.toStart) || m.toStart < 0) throw new Error('bad startFrame'); }
      return applyMoves(s, moves, 'moveClips');
    });
  }
  deleteClip(seqId: string, clipId: string): Receipt {
﻿    return this.exec('deleteClip', (p) => {
      const s = req_seq(p, seqId);
      const ids = linkedIds(s, [clipId]);
      for (const id of ids) req_clip(s, id);
      s.clips = s.clips.filter((x) => ids.indexOf(x.id) < 0);
      return { ok: true, ids, warnings: [], label: 'deleteClip' };
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
  setTrackFlags(seqId: string, trackId: string, patch: { muted?: boolean; locked?: boolean; hidden?: boolean; volume?: number }): Receipt {
    return this.exec("setTrackFlags", (p) => {
      const s = req_seq(p, seqId);
      const tr = s.tracks.find((x) => x.id === trackId);
      if (!tr) throw new Error("track not found");
      for (const k of ["muted", "locked", "hidden"] as const) { const v = patch[k]; if (v === undefined) continue; if (typeof v !== "boolean") throw new Error("bad flag " + k); tr[k] = v; }
      if (patch.volume !== undefined) { if (!Number.isFinite(patch.volume) || patch.volume < 0 || patch.volume > 4) throw new Error("bad track volume"); tr.volume = patch.volume; }
      return { ok: true, ids: [tr.id], warnings: [], label: "setTrackFlags" };
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
  setTextStyle(seqId: string, clipId: string, patch: { fontSize?: number; color?: string; textAlign?: 'left' | 'center' | 'right'; textBg?: boolean; fontFamily?: string; fontBold?: boolean; fontItalic?: boolean; textShadow?: boolean; textOutline?: boolean }): Receipt {
    return this.exec('setTextStyle', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (c.kind !== 'text') throw new Error('not a text clip');
      if (patch.fontSize !== undefined && (!(patch.fontSize >= 8 && patch.fontSize <= 500) || !Number.isFinite(patch.fontSize))) throw new Error('bad font size');
      if (patch.textAlign !== undefined && ['left', 'center', 'right'].indexOf(patch.textAlign) < 0) throw new Error('bad align');
      if (patch.fontFamily !== undefined && FONT_FAMILIES.indexOf(patch.fontFamily) < 0) throw new Error('bad font family');
      if (patch.fontBold !== undefined && typeof patch.fontBold !== 'boolean') throw new Error('bad font bold');
      if (patch.fontItalic !== undefined && typeof patch.fontItalic !== 'boolean') throw new Error('bad font italic');
      if (patch.textShadow !== undefined && typeof patch.textShadow !== 'boolean') throw new Error('bad text shadow');
      if (patch.textOutline !== undefined && typeof patch.textOutline !== 'boolean') throw new Error('bad text outline');
      const nx = { fontSize: patch.fontSize ?? c.fontSize ?? 48, color: patch.color ?? c.color ?? 'white', textAlign: patch.textAlign ?? c.textAlign ?? 'center', textBg: patch.textBg ?? c.textBg ?? false, fontFamily: patch.fontFamily ?? c.fontFamily ?? 'sans', fontBold: patch.fontBold ?? c.fontBold ?? false, fontItalic: patch.fontItalic ?? c.fontItalic ?? false, textShadow: patch.textShadow ?? c.textShadow ?? false, textOutline: patch.textOutline ?? c.textOutline ?? false };
      if (JSON.stringify({ fontSize: c.fontSize, color: c.color, textAlign: c.textAlign, textBg: c.textBg, fontFamily: c.fontFamily, fontBold: c.fontBold, fontItalic: c.fontItalic, textShadow: c.textShadow, textOutline: c.textOutline }) === JSON.stringify({ fontSize: nx.fontSize, color: nx.color, textAlign: nx.textAlign, textBg: nx.textBg, fontFamily: nx.fontFamily, fontBold: nx.fontBold, fontItalic: nx.fontItalic, textShadow: nx.textShadow, textOutline: nx.textOutline })) return { noop: true };
      Object.assign(c, nx);
      return { ok: true, ids: [c.id], warnings: [], label: 'setTextStyle' };
    });
  }
  duplicateClips(seqId: string, clipIds: string[]): Receipt {
    return this.exec("duplicateClips", (p) => {
      const s = req_seq(p, seqId);
      if (!clipIds.length) throw new Error("nothing to duplicate");
      const src = clipIds.map((id) => req_clip(s, id));
      const gmap = new Map<string, string>();
      const gid = (old?: string): string | undefined => { if (!old) return undefined; let n = gmap.get(old); if (!n) { n = uid(); gmap.set(old, n); } return n; };
      const copies = src.map((c) => {
        const end = trackClips(s, c.trackId).reduce((m, x) => Math.max(m, x.startFrame + x.durationFrames), 0);
        const cp = { ...structuredClone(c), id: uid(), startFrame: end, linkGroup: gid(c.linkGroup) };
        s.clips.push(cp);
        return cp;
      });
      return { ok: true, ids: copies.map((c) => c.id), warnings: [], label: "duplicateClips" };
    });
  }
  setTextAnim(seqId: string, clipId: string, anim: string): Receipt {
    return this.exec('setTextAnim', (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (c.kind !== 'text') throw new Error('not a text clip');
      if (TEXT_ANIMS.indexOf(anim) < 0) throw new Error('bad text anim');
      if ((c.textAnim ?? 'none') === anim) return { noop: true };
      c.textAnim = anim;
      return { ok: true, ids: [c.id], warnings: [], label: 'setTextAnim' };
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
  moveKeyframe(seqId: string, clipId: string, track: "opacity" | "volume", fromFrame: number, kf: { frame: number; value: number; interpolation?: "linear" | "hold" | "smooth" }): Receipt {
    return this.exec("moveKeyframe", (p) => {
      const c = req_clip(req_seq(p, seqId), clipId);
      if (!Number.isInteger(fromFrame) || fromFrame < 0) throw new Error("bad keyframe");
      const arr = track === "opacity" ? (c.opacityKeys ?? []) : (c.volumeKeys ?? []);
      const old = arr.find((k) => k.frame === fromFrame);
      if (!old) throw new Error("key not found");
      if (track === "opacity" && (kf.value < 0 || kf.value > 1)) throw new Error("bad opacity key");
      if (track === "volume" && (!(kf.value >= 0 && kf.value <= 4) || !Number.isFinite(kf.value))) throw new Error("bad volume key");
      const full = { frame: kf.frame, value: kf.value, interpolation: kf.interpolation ?? old.interpolation ?? "linear" as const };
      const nx = upsertKeyframe(arr.filter((k) => k.frame !== fromFrame), full);
      if (JSON.stringify(nx) === JSON.stringify(arr)) return { noop: true };
      if (track === "opacity") c.opacityKeys = nx; else c.volumeKeys = nx;
      return { ok: true, ids: [c.id], warnings: [], label: "moveKeyframe" };
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
﻿function linkedIds(s: Sequence, ids: string[]): string[] {
  const g: string[] = [];
  for (const id of ids) { const c = s.clips.find((x) => x.id === id); if (c && c.linkGroup && g.indexOf(c.linkGroup) < 0) g.push(c.linkGroup); }
  const out = [...ids];
  for (const c of s.clips) { if (c.linkGroup && g.indexOf(c.linkGroup) >= 0 && out.indexOf(c.id) < 0) out.push(c.id); }
  return out;
}
function applyMoves(s: Sequence, moves: Array<{ clipId: string; toTrackId: string; toStart: number }>, label: string): Receipt {
  const moving = new Map(moves.map((m) => [m.clipId, m]));
  const laid = s.clips.map((x) => { const m = moving.get(x.id); return m ? { id: x.id, trackId: m.toTrackId, start: m.toStart, end: m.toStart + x.durationFrames } : { id: x.id, trackId: x.trackId, start: x.startFrame, end: x.startFrame + x.durationFrames }; });
  for (let ai = 0; ai < laid.length; ai++) for (let bi = ai + 1; bi < laid.length; bi++) { const A = laid[ai], B = laid[bi]; if (A.trackId === B.trackId && rangeOverlaps(A.start, A.end, B.start, B.end)) throw new Error('overlap after move: ' + A.id + ' vs ' + B.id); }
  for (const m of moves) { const c = s.clips.find((x) => x.id === m.clipId)!; c.trackId = m.toTrackId; c.startFrame = m.toStart; }
  return { ok: true, ids: moves.map((m) => m.clipId), warnings: [], label };
}
function req_seq(p: Project, id: string): Sequence {
  const s = p.sequences.find(x => x.id === id); if (!s) throw new Error('sequence not found'); return s;
}
function req_clip(s: Sequence, id: string): Clip {
  const c = s.clips.find(x => x.id === id); if (!c) throw new Error('clip not found');
  if (s.tracks.find((x) => x.id === c.trackId)?.locked) throw new Error("track locked");
  return c;
}
export { activeSequence };
export type { Track };





















