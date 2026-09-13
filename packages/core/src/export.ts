import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { framesToSeconds } from './time.js';
import { sequenceDurationFrames, type Clip, type Project, type Sequence } from './model.js';
import { probeMedia } from './media.js';

export interface ExportResult { outPath: string; durationSec: number; bytes: number; warnings: string[] }
interface InputInfo { idx: number; path: string; loop: boolean; hasVideo: boolean; hasAudio: boolean }
// Export resolves the same start/duration/sourceIn math as preview (videoClipAt).
// Timeline gaps are rendered as black/silence so export duration matches the model.
export async function buildFfmpegArgs(p: Project, s: Sequence, outPath: string): Promise<{ args: string[]; expectSec: number; expectAudio: boolean; warnings: string[] }> {
  const durFrames = sequenceDurationFrames(s);
  if (durFrames <= 0) throw new Error('empty timeline: nothing to export');
  const warnings: string[] = [];
  const expectSec = framesToSeconds(durFrames, s.fps);
  const byAsset = new Map(p.media.map(m => [m.id, m.path]));
  const W = s.width, H = s.height;
  const fpsStr = `${s.fps.num}/${s.fps.den}`;
  const t = (f: number) => framesToSeconds(f, s.fps).toFixed(6);
  const vf = (c: Clip): string => { const fi = (c.fadeInFrames ?? 0) > 0 ? `,fade=t=in:st=0:d=${t(c.fadeInFrames ?? 0)}:alpha=1` : ""; const fo = (c.fadeOutFrames ?? 0) > 0 ? `,fade=t=out:st=${t(c.durationFrames - (c.fadeOutFrames ?? 0))}:d=${t(c.fadeOutFrames ?? 0)}:alpha=1` : ""; return fi + fo; };
  const af = (c: Clip): string => { const fi = (c.fadeInFrames ?? 0) > 0 ? `,afade=t=in:st=0:d=${t(c.fadeInFrames ?? 0)}` : ""; const fo = (c.fadeOutFrames ?? 0) > 0 ? `,afade=t=out:st=${t(c.durationFrames - (c.fadeOutFrames ?? 0))}:d=${t(c.fadeOutFrames ?? 0)}` : ""; return fi + fo; };

  // Distinct file inputs (probed once). Images loop; AV files plain.
  const inputs: InputInfo[] = [];
  const forAsset = async (assetId: string | undefined, loop: boolean): Promise<InputInfo> => {
    const path = assetId ? byAsset.get(assetId) : undefined;
    if (!path) throw new Error('clip references missing media');
    const hit = inputs.find(i => i.path === path && i.loop === loop);
    if (hit) return hit;
    const pr = await probeMedia(path);
    const info: InputInfo = { idx: inputs.length, path, loop, hasVideo: pr.hasVideo, hasAudio: pr.hasAudio };
    inputs.push(info);
    return info;
  };

  const order = new Map(s.tracks.map((x, i) => [x.id, i]));
  const lowestVideo = Math.min(...s.tracks.filter(x => x.kind === 'video').map(x => order.get(x.id) ?? 0));
  const videoClips = s.clips.filter(c => c.kind === 'video').sort((a, b) => a.startFrame - b.startFrame);
  const imageClips = s.clips.filter(c => c.kind === 'image').sort((a, b) => a.startFrame - b.startFrame);
  // Base layer: video clips + lowest-track images that do not overlap video. Others overlay.
  const base: Clip[] = [...videoClips];
  const overlays: Clip[] = [];
  for (const c of imageClips) {
    const onLowest = (order.get(c.trackId) ?? 99) === lowestVideo;
    const overlapsVideo = videoClips.some(v => v.startFrame < c.startFrame + c.durationFrames && c.startFrame < v.startFrame + v.durationFrames);
    if (onLowest && !overlapsVideo) base.push(c); else overlays.push(c);
  }
  base.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 1; i < base.length; i++)
    if (base[i].startFrame < base[i - 1].startFrame + base[i - 1].durationFrames)
      throw new Error('overlapping base-layer clips: put PiP content on a higher track');
  if (!base.length) throw new Error('no video/image clips');

  const filters: string[] = [];
  // Base video walk with black gap fill.
  const vsegs: string[] = [];
  let cursor = 0, n = 0;
  const black = (frames: number): string => {
    const l = `[blk${n++}]`;
    filters.push(`color=c=black:s=${W}x${H}:r=${fpsStr}:d=${t(frames)}${l}`);
    return l;
  };
  for (const c of base) {
    if (c.startFrame > cursor) vsegs.push(black(c.startFrame - cursor));
    const inp = await forAsset(c.assetId, c.kind === 'image');
    if (!inp.hasVideo) throw new Error(`asset has no video stream: ${inp.path}`);
    const l = `[vs${n++}]`;
    if (c.kind === 'image') {
      const sc = c.transform.scaleX !== 1 || c.transform.scaleY !== 1 ? `,scale=iw*${c.transform.scaleX}:ih*${c.transform.scaleY}` : '';
      filters.push(`[${inp.idx}:v]trim=start=0:end=${t(c.durationFrames)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${sc}${vf(c)}${l}`);
    } else {
      const ss = t(c.sourceInFrame), to = t(c.sourceInFrame + c.durationFrames);
      filters.push(`[${inp.idx}:v]trim=start=${ss}:end=${to},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${vf(c)}${l}`);
    }
    vsegs.push(l);
    cursor = c.startFrame + c.durationFrames;
  }
  if (cursor < durFrames) vsegs.push(black(durFrames - cursor));
  filters.push(`${vsegs.join('')}concat=n=${vsegs.length}:v=1:a=0,setsar=1[vbase]`);

  // Higher-track image overlays.

  let vlabel = '[vbase]';
  let k = 0;
  for (const c of overlays) {
    const inp = await forAsset(c.assetId, true);
    const sc = `scale=iw*${c.transform.scaleX}:ih*${c.transform.scaleY}`;
    const op = c.opacity < 1 ? `,format=rgba,colorchannelmixer=aa=${c.opacity}` : '';
    filters.push(`[${inp.idx}:v]${sc}${op}${vf(c)},setsar=1[ov${k}]`);
    const x = `${W}/2-w/2+(${c.transform.x})`, y = `${H}/2-h/2+(${c.transform.y})`;
    const out = `[vtmp${k}]`;
    filters.push(`${vlabel}[ov${k}]overlay=x='${x}':y='${y}':enable='between(t,${t(c.startFrame)},${t(c.startFrame + c.durationFrames)})'${out}`);
    vlabel = out; k++;
  }
  // Text burn-in.
  for (const c of s.clips.filter(c => c.kind === 'text' && (c.text ?? '').length)) {
    const txt = (c.text ?? '').replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const fs = c.fontSize ?? 48;
    const fc = (c.color ?? 'white').replace(/^#/, '0x');
    filters.push(`${vlabel}drawtext=text='${txt}':fontsize=${fs}:fontcolor=${fc}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${t(c.startFrame)},${t(c.startFrame + c.durationFrames)})'[vtxt${k}]`);
    vlabel = `[vtxt${k}]`; k++;
  }
  // Audio walk with silence gap fill (uniform 48kHz stereo for concat).
  const aclips = s.clips.filter(c => (c.kind === 'video' || c.kind === 'audio') && c.assetId).sort((a, b) => a.startFrame - b.startFrame);
  let alabel = '';
  if (aclips.length) {
    const asegs: string[] = [];
    let ac = 0, an = 0;
    const silence = (frames: number): string => {
      const l = `[as${an++}]`;
      filters.push(`anullsrc=r=48000:cl=stereo:d=${t(frames)}${l}`);
      return l;
    };
    for (const c of aclips) {
      const inp = await forAsset(c.assetId, false);
      if (!inp.hasAudio) { warnings.push(`clip ${c.id} skipped in audio mix (no audio stream)`); continue; }
      if (c.startFrame > ac) asegs.push(silence(c.startFrame - ac));
      const ss = t(c.sourceInFrame), to = t(c.sourceInFrame + c.durationFrames);
      const vol = c.muted ? 0 : c.volume;
      const l = `[as${an++}]`;
      filters.push(`[${inp.idx}:a]atrim=start=${ss}:end=${to},asetpts=PTS-STARTPTS,volume=${vol},aresample=48000,aformat=channel_layouts=stereo${af(c)}${l}`);
      asegs.push(l);
      ac = Math.max(ac, c.startFrame + c.durationFrames);
    }
    const tailTarget = Math.max(durFrames, ac);
    if (ac < tailTarget) asegs.push(silence(tailTarget - ac));
    if (asegs.length === 1) alabel = asegs[0];
    else if (asegs.length > 1) { filters.push(`${asegs.join('')}concat=n=${asegs.length}:v=0:a=1[amix]`); alabel = '[amix]'; }
    if (alabel) { filters.push(`${alabel}atrim=0:${expectSec.toFixed(6)},asetpts=PTS-STARTPTS[aout]`); alabel = '[aout]'; }
  }
  const expectAudio = !!alabel;
  const inArgs: string[] = []; for (const i of inputs) inArgs.push(...(i.loop ? ["-loop", "1", "-t", expectSec.toFixed(3)] : []), "-i", i.path); const finalArgs = [...inArgs, "-filter_complex", filters.join(";"), "-map", vlabel, ...(expectAudio ? ["-map", alabel] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', fpsStr,
    ...(expectAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-movflags', '+faststart', '-y', outPath];
  return { args: finalArgs, expectSec, expectAudio, warnings };
}

export async function exportSequence(p: Project, seqId: string, outPath: string, signal?: AbortSignal): Promise<ExportResult> {
  const s = p.sequences.find(x => x.id === seqId);
  if (!s) throw new Error('sequence not found');
  const { args, expectSec, warnings } = await buildFfmpegArgs(p, s, outPath);
  for (const w of warnings) console.warn('export-warn', w);
  await new Promise<void>((res, rej) => {
    let child: ChildProcess;
    try { child = spawn('ffmpeg', ['-v', 'error', ...args], { windowsHide: true }); }
    catch (e) { rej(e); return; }
    const onAbort = () => { try { child.kill(); } catch { /* noop */ } rej(new Error('export cancelled')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    let err = '';
    child.stderr?.on('data', (d: Buffer) => err += d);
    child.on('error', (e: Error) => { signal?.removeEventListener('abort', onAbort); rej(e); });
    child.on('close', (code: number) => {
      signal?.removeEventListener('abort', onAbort);
      if (code !== 0) { rej(new Error(`ffmpeg exit ${code}: ${err.slice(0, 800)}`)); return; }
      res();
    });
  });
  const st = await stat(outPath);
  return { outPath, durationSec: expectSec, bytes: st.size, warnings };
}
// ffprobe validation: file exists, nonzero, duration tolerance, streams present.
export async function validateExport(outPath: string, expectSec: number, expectAudio: boolean): Promise<{ ok: boolean; details: string }> {
  const st = await stat(outPath).catch(() => undefined);
  if (!st || st.size <= 0) return { ok: false, details: 'missing or empty output' };
  const pr = await probeMedia(outPath).catch((e: unknown) => ({ error: String(e) }) as unknown as { error: string });
  if ('error' in (pr as object)) return { ok: false, details: `ffprobe failed: ${(pr as { error: string }).error}` };
  const got = (pr as { durationSec: number }).durationSec;
  if (Math.abs(got - expectSec) > 0.35) return { ok: false, details: `duration mismatch: got ${got.toFixed(3)}s want ${expectSec.toFixed(3)}s` };
  const hAV = pr as { hasVideo: boolean; hasAudio: boolean };
  if (!hAV.hasVideo) return { ok: false, details: 'no video stream' };
  if (expectAudio && !hAV.hasAudio) return { ok: false, details: 'no audio stream (expected audio)' };
  return { ok: true, details: `ok bytes=${st.size} dur=${got.toFixed(3)}s` };
}


