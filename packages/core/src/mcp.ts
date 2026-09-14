import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { EditorStore } from './store.js';
import { activeSequence, sequenceDurationFrames, type Project } from './model.js';
import { saveProject } from './persistence.js';
import { exportSequence, validateExport, type ExportQuality } from './export.js';
import { importAndPlace } from './library.js';
import { importSubtitles } from './subs.js';
import { searchProject } from './search.js';

export const DEFAULT_MCP_PORT = 19789;
export const DEFAULT_MCP_PATH = '/mcp';
// Minimal HTTP JSON-RPC surface over the LIVE store. No raw JS execution.
export function startMcpServer(store: EditorStore, opts: { port?: number; path?: string } = {}): Promise<{ server: Server; port: number }> {
  const port = opts.port ?? DEFAULT_MCP_PORT;
  const mcpPath = opts.path ?? DEFAULT_MCP_PATH;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/health') { res.end(JSON.stringify({ ok: true })); return; }
    if (req.method !== 'POST' || !req.url?.startsWith(mcpPath)) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
    let body = '';
    for await (const ch of req) body += ch;
    let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try { msg = JSON.parse(body); } catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'bad json' })); return; }
    try {
      const result = await dispatch(store, String(msg.method ?? ''), msg.params ?? {});
      res.end(JSON.stringify({ id: msg.id ?? null, ok: true, result }));
    } catch (e) {
      res.end(JSON.stringify({ id: msg.id ?? null, ok: false, error: String((e as Error)?.message ?? e) }));
    }
  });
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, '127.0.0.1', () => res({ server, port }));
  });
}
async function dispatch(store: EditorStore, method: string, q: Record<string, unknown>): Promise<unknown> {
  const p: Project = store.project;
  const seqId = (q['sequenceId'] as string | undefined) ?? p.activeSequenceId;
  const seq = p.sequences.find(s => s.id === seqId);
  switch (method) {
    case 'getProject': return { id: p.id, name: p.name, sequences: p.sequences.map(s => ({ id: s.id, name: s.name, tracks: s.tracks, clipCount: s.clips.length, durationFrames: sequenceDurationFrames(s) })), media: p.media.map(m => ({ id: m.id, name: m.name, path: m.path, kind: m.kind })) };
    case 'listClips': {
      if (!seq) throw new Error('sequence not found');
      return seq.clips.filter(c => !q['trackId'] || c.trackId === q['trackId']);
    }
    case 'timelineContext': {
      if (!seq) throw new Error('sequence not found');
      return { sequenceId: seq.id, fps: seq.fps, durationFrames: sequenceDurationFrames(seq), tracks: seq.tracks, active: activeSequence(p).id };
    }
    case 'search': return searchProject(store.project, q['query'] as string);
case 'importSubs': return importSubtitles(store, q['path'] as string);
    case 'import': return importAndPlace(store, q['paths'] as string[]);
    case 'addTrack': return store.addTrack(seqId as string, q['kind'] as 'video' | 'audio', q['name'] as string);
    case 'overwritePlace': return store.overwritePlace(seqId as string, q['trackId'] as string, q['clip'] as never);
    case 'placeClip': return store.placeClip(seqId as string, q['trackId'] as string, q['clip'] as never);
    case 'moveClip': return store.moveClip(seqId as string, q['clipId'] as string, q['toTrackId'] as string, q['toStart'] as number);
    case 'trimEnd': return store.trimEnd(seqId as string, q['clipId'] as string, q['durationFrames'] as number);
    case 'trimStart': return store.trimStart(seqId as string, q['clipId'] as string, q['deltaFrames'] as number);
    case 'slipClip': return store.slipClip(seqId as string, q['clipId'] as string, q['deltaFrames'] as number);
    case 'deleteClips': return store.deleteClips(seqId as string, q['clipIds'] as string[]);
    case 'moveClips': return store.moveClips(seqId as string, q['moves'] as never);
    case 'splitClip': return store.splitClip(seqId as string, q['clipId'] as string, q['atFrame'] as number);
    case 'rippleDelete': return store.rippleDelete(seqId as string, q['clipId'] as string);
    case 'addMarker': return store.addMarker(seqId as string, q['marker'] as never);
    case 'removeMarker': return store.removeMarker(seqId as string, q['markerId'] as string);
    case 'updateMarker': return store.updateMarker(seqId as string, q['markerId'] as string, q['patch'] as never);
    case 'listMarkers': { if (!seq) throw new Error('sequence not found'); return seq.markers ?? []; }
    case 'setFade': return store.setFade(seqId as string, q['clipId'] as string, q['fadeInFrames'] as number, q['fadeOutFrames'] as number);
    case 'setKeyframe': return store.setKeyframe(seqId as string, q['clipId'] as string, q['track'] as 'opacity' | 'volume', q['kf'] as never);
    case 'removeKeyframe': return store.removeKeyframe(seqId as string, q['clipId'] as string, q['track'] as 'opacity' | 'volume', q['frame'] as number);
    case 'setTransition': return store.setTransition(seqId as string, q['clipId'] as string, q['outFrames'] as number);
    case 'setSpeed': return store.setSpeed(seqId as string, q['clipId'] as string, q['speed'] as number);
    case 'setCrop': return store.setCrop(seqId as string, q['clipId'] as string, q['crop'] as never);
    case 'setBlend': return store.setBlend(seqId as string, q['clipId'] as string, q['blend'] as string);
    case 'setTrackFlags': return store.setTrackFlags(seqId as string, q['trackId'] as string, q['patch'] as never);
    case 'linkClips': return store.linkClips(seqId as string, q['clipIds'] as string[]);
    case 'unlinkClips': return store.unlinkClips(seqId as string, q['clipIds'] as string[]);
    case 'setTextStyle': return store.setTextStyle(seqId as string, q['clipId'] as string, q['patch'] as never);
    case 'setTextAnim': return store.setTextAnim(seqId as string, q['clipId'] as string, q['anim'] as string);
    case 'moveKeyframe': return store.moveKeyframe(seqId as string, q['clipId'] as string, q['track'] as 'opacity' | 'volume', q['fromFrame'] as number, q['kf'] as never);
    case 'duplicateClips': return store.duplicateClips(seqId as string, q['clipIds'] as string[]);
    case 'deleteClip': return store.deleteClip(seqId as string, q['clipId'] as string);
    case 'setText': return store.setText(seqId as string, q['clipId'] as string, q['text'] as string);
    case 'setTransform': return store.setTransform(seqId as string, q['clipId'] as string, q['patch'] as never);
    case 'setOpacity': return store.setOpacity(seqId as string, q['clipId'] as string, q['opacity'] as number);
    case 'setVolume': return store.setVolume(seqId as string, q['clipId'] as string, q['volume'] as number, q['muted'] as boolean | undefined);
    case 'undo': return { undone: store.undo() };
    case 'redo': return { redone: store.redo() };
    case 'saveProject': await saveProject(p, q['path'] as string); return { saved: q['path'] };
    case 'export': {
      const out = q['outPath'] as string;
      const r = await exportSequence(p, seqId as string, out, undefined, { quality: q['quality'] as ExportQuality | undefined });
      const v = await validateExport(out, r.durationSec, true).catch(() => ({ ok: true as const, details: 'unvalidated' }));
      return { ...r, validation: v };
    }
    default: throw new Error(`unknown method ${method}`);
  }
}















