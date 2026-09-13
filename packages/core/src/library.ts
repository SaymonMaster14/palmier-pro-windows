import { basename } from 'node:path';
import { importSubtitles } from './subs.js';
import { EditorStore, type Receipt } from './store.js';
import { addTrack as mkTrack, createSequence, type MediaKind } from './model.js';
import { probeMedia } from './media.js';
import { secondsToFrames } from './time.js';

export interface ImportResult { path: string; kind: MediaKind; assetId: string; placed: Receipt }
// Shared by UI import and MCP import: probe real files, add media, place at track end.
export async function importAndPlace(store: EditorStore, paths: string[]): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const fp of paths) {
    if (/\.srt$/i.test(fp) || /\.vtt$/i.test(fp)) {
      const p0 = store.project;
      let seq0 = p0.sequences.find((x) => x.id === p0.activeSequenceId) ?? p0.sequences[0];
      if (!seq0) seq0 = createSequence(p0, 'Sequence 1', { num: 30, den: 1 }, 1280, 720);
      const am = store.addMedia({ path: fp, kind: 'subtitle', name: fp.split(/[\\/]/).pop() ?? fp, durationFrames: 0, fps: seq0.fps });
      const assetId = am.ids[0] ?? p0.media.find((x) => x.path === fp)!.id;
      const ids = await importSubtitles(store, fp);
      out.push({ path: fp, kind: 'subtitle', assetId, placed: { ok: true, ids, warnings: [], label: 'importSubtitles' } });
      continue;
    }
    const pr = await probeMedia(fp);
    const kind: MediaKind = pr.still ? 'image' : pr.hasVideo ? 'video' : 'audio';
    const p = store.project;
    let seq = p.sequences.find((s) => s.id === p.activeSequenceId) ?? p.sequences[0];
    if (!seq) seq = createSequence(p, 'Sequence 1', { num: 30, den: 1 }, 1280, 720);
    const durF = kind === 'image' ? 90 : secondsToFrames(pr.durationSec, seq.fps);
    const r = store.addMedia({ path: fp, kind, name: basename(fp), durationFrames: durF, fps: seq.fps, width: pr.width, height: pr.height, audioChannels: pr.audioChannels, sampleRate: pr.sampleRate });
    const assetId = r.ids[0] ?? p.media.find((m) => m.path === fp)!.id;
    const tk = kind === 'audio' ? 'audio' : 'video';
    const track = seq.tracks.find((x) => x.kind === tk && !x.locked) ?? mkTrack(seq, tk, (tk === 'audio' ? 'A' : 'V') + (seq.tracks.filter((x) => x.kind === tk).length + 1));
    const start = seq.clips.filter((c) => c.trackId === track.id).reduce((m, c) => Math.max(m, c.startFrame + c.durationFrames), 0);
    const clipKind = kind === 'image' ? 'image' as const : kind === 'audio' ? 'audio' as const : 'video' as const;
    const placed = store.placeClip(seq.id, track.id, { kind: clipKind, assetId, startFrame: start, durationFrames: durF, name: basename(fp) });
    out.push({ path: fp, kind, assetId, placed });
  }
  return out;
}
