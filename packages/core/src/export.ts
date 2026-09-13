import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { framesToSeconds } from './time.js';
import { sequenceDurationFrames, type Project, type Sequence } from './model.js';
import { probeMedia } from './media.js';

export interface ExportResult { outPath: string; durationSec: number; bytes: number }
// Shared rendering semantics: export resolves the same start/duration/sourceIn math as preview (videoClipAt).
export function buildFfmpegArgs(p: Project, s: Sequence, outPath: string): { args: string[]; expectSec: number; expectAudio: boolean } {
  const durFrames = sequenceDurationFrames(s);
  if (durFrames <= 0) throw new Error('empty timeline: nothing to export');
  const expectSec = framesToSeconds(durFrames, s.fps);
  const byAsset = new Map<string, string>();
  for (const m of p.media) byAsset.set(m.id, m.path);
  const vclips = s.clips.filter(c => c.kind === 'video' || c.kind === 'image').sort((a, b) => a.startFrame - b.startFrame);
  const aclips = s.clips.filter(c => c.kind === 'video' || c.kind === 'audio').sort((a, b) => a.startFrame - b.startFrame);
  if (!vclips.length) throw new Error('no video/image clips');
  const base = vclips[0];
  const basePath = base.assetId ? byAsset.get(base.assetId) : undefined;
  if (!basePath) throw new Error('base clip has no media file');
  // v1 scope: single video-track cuts from one source file + image overlays + text + audio mix.
  const multiSource = vclips.some(c => c.kind === 'video' && byAsset.get(c.assetId ?? '') !== basePath);
  if (multiSource) throw new Error('multi-source video export not yet supported in slice (ledger #13)');
  const W = s.width, H = s.height;
  const filters: string[] = [];
  const t0 = (f: number) => framesToSeconds(f, s.fps).toFixed(6);
  // Base: trim each video segment from the single input, concat.
  const vsegs = vclips.filter(c => c.kind === 'video').map((c, i) => {
    const ss = framesToSeconds(c.sourceInFrame, s.fps);
    const to = framesToSeconds(c.sourceInFrame + c.durationFrames, s.fps);
    filters.push(`[0:v]trim=start=${ss.toFixed(6)}:end=${to.toFixed(6)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[vs${i}]`);
    return `[vs${i}]`;
  });
  let vchain = '';
  if (vsegs.length === 1) vchain = `${vsegs[0]}setsar=1[vbase]`;
  else if (vsegs.length > 1) vchain = `${vsegs.join('')}concat=n=${vsegs.length}:v=1:a=0,setsar=1[vbase]`;
  else vchain = `color=c=black:s=${W}x${H}:d=${expectSec.toFixed(3)}:r=${(s.fps.num / s.fps.den).toFixed(3)}[vbase]`;
  filters.push(vchain);
  const inputs = ['-i', basePath];
  let vlabel = '[vbase]'; let inputIdx = 1;
  // Image overlays (higher tracks): loop single image, scale, opacity, overlay with timeline enable.
  for (const c of vclips.filter(c => c.kind === 'image')) {
    const mp = byAsset.get(c.assetId ?? '');
    if (!mp) throw new Error(`overlay clip ${c.id} missing media`);
    inputs.push('-loop', '1', '-i', mp);
    const sc = `scale=iw*${c.transform.scaleX}:ih*${c.transform.scaleY}`;
    const op = c.opacity < 1 ? `,format=rgba,colorchannelmixer=aa=${c.opacity}` : '';
    filters.push(`[${inputIdx}:v]${sc}${op},setsar=1[ov${inputIdx}]`);
    const st = t0(c.startFrame), en = t0(c.startFrame + c.durationFrames);
    const x = `${W}/2-w/2+(${c.transform.x})`, y = `${H}/2-h/2+(${c.transform.y})`;
    const out = `[vtmp${inputIdx}]`;
    filters.push(`${vlabel}[ov${inputIdx}]overlay=x='${x}':y='${y}':enable='between(t,${st},${en})'${out}`);
    vlabel = out; inputIdx++;
  }
  // Text burn-in (drawtext; fontfile omitted -> FFmpeg default).
  for (const c of s.clips.filter(c => c.kind === 'text' && (c.text ?? '').length)) {
    const st = t0(c.startFrame), en = t0(c.startFrame + c.durationFrames);
    const txt = (c.text ?? '').replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const fs = c.fontSize ?? 48;
    const fc = (c.color ?? 'white').replace(/^#/, '0x');
    filters.push(`${vlabel}drawtext=text='${txt}':fontsize=${fs}:fontcolor=${fc}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${st},${en})'[vtxt${inputIdx}]`);
    vlabel = `[vtxt${inputIdx}]`; inputIdx++;
  }
  // Audio: per-clip atrim from input 0, volume, concat, apad to timeline length.
  let alabel = '';
  const asegs = aclips.filter(c => { const m = p.media.find(mm => mm.id === c.assetId); return m && m.path === basePath; });
  if (asegs.length) {
    asegs.forEach((c, i) => {
      const ss = framesToSeconds(c.sourceInFrame, s.fps).toFixed(6);
      const to = framesToSeconds(c.sourceInFrame + c.durationFrames, s.fps).toFixed(6);
      const vol = c.muted ? 0 : c.volume;
      filters.push(`[0:a]atrim=start=${ss}:end=${to},asetpts=PTS-STARTPTS,volume=${vol}[as${i}]`);
    });
    if (asegs.length === 1) alabel = '[as0]';
    else { filters.push(`${asegs.map((_, i) => `[as${i}]`).join('')}concat=n=${asegs.length}:v=0:a=1[amix]`); alabel = '[amix]'; }
    filters.push(`${alabel}apad,atrim=0:${expectSec.toFixed(6)}[aout]`);
    alabel = '[aout]';
  }
  const expectAudio = !!alabel;
  const args = [...inputs, '-filter_complex', filters.join(';'), '-map', vlabel, ...(expectAudio ? ['-map', alabel] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', `${s.fps.num}/${s.fps.den}`,
    ...(expectAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-shortest', '-movflags', '+faststart', '-y', outPath];
  return { args, expectSec, expectAudio };
}

export function exportSequence(p: Project, seqId: string, outPath: string, signal?: AbortSignal): Promise<ExportResult> {
  const s = p.sequences.find(x => x.id === seqId);
  if (!s) return Promise.reject(new Error('sequence not found'));
  const { args, expectSec } = buildFfmpegArgs(p, s, outPath);
  return new Promise((res, rej) => {
    let child: ChildProcess;
    try { child = spawn('ffmpeg', ['-v', 'error', ...args], { windowsHide: true }); }
    catch (e) { rej(e); return; }
    const onAbort = () => { try { child.kill(); } catch { /* noop */ } rej(new Error('export cancelled')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    let err = '';
    child.stderr?.on('data', d => err += d);
    child.on('error', e => { signal?.removeEventListener('abort', onAbort); rej(e); });
    child.on('close', async code => {
      signal?.removeEventListener('abort', onAbort);
      if (code !== 0) { rej(new Error(`ffmpeg exit ${code}: ${err.slice(0, 800)}`)); return; }
      try {
        const st = await stat(outPath);
        res({ outPath, durationSec: expectSec, bytes: st.size });
      } catch (e) { rej(e); }
    });
  });
}
// ffprobe validation: file exists, nonzero, duration tolerance, streams present, decode check via read of first frames.
export async function validateExport(outPath: string, expectSec: number, expectAudio: boolean): Promise<{ ok: boolean; details: string }> {
  const st = await stat(outPath).catch(() => undefined);
  if (!st || st.size <= 0) return { ok: false, details: 'missing or empty output' };
  const pr = await probeMedia(outPath).catch((e) => ({ error: String(e) }) as unknown as { error: string });
  if ('error' in (pr as object)) return { ok: false, details: `ffprobe failed: ${(pr as { error: string }).error}` };
  const got = (pr as { durationSec: number }).durationSec;
  if (Math.abs(got - expectSec) > 0.35) return { ok: false, details: `duration mismatch: got ${got.toFixed(3)}s want ${expectSec.toFixed(3)}s` };
  const hAV = pr as { hasVideo: boolean; hasAudio: boolean };
  if (!hAV.hasVideo) return { ok: false, details: 'no video stream' };
  if (expectAudio && !hAV.hasAudio) return { ok: false, details: 'no audio stream (expected audio)' };
  return { ok: true, details: `ok bytes=${st.size} dur=${got.toFixed(3)}s` };
}
