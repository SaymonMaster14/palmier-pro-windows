import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { framesToSeconds } from './time.js';
import { sequenceDurationFrames, type Clip, type Project, type Sequence } from './model.js';
import { volumeExpr } from './keyexpr.js';
import { evaluateKeyframes } from './model.js';
import { probeMedia } from './media.js';

export interface ExportResult { outPath: string; durationSec: number; bytes: number; warnings: string[] }
interface InputInfo { idx: number; path: string; loop: boolean; hasVideo: boolean; hasAudio: boolean }
// Export resolves the same start/duration/sourceIn math as preview (videoClipAt).
// Timeline gaps are rendered as black/silence so export duration matches the model.
export async function buildFfmpegArgs(p: Project, s: Sequence, outPath: string): Promise<{ args: string[]; expectSec: number; expectAudio: boolean; warnings: string[] }> {
  const durFrames = sequenceDurationFrames(s);
  if (durFrames <= 0) throw new Error('empty timeline: nothing to export');
  const warnings: string[] = [];
  let expectSec = framesToSeconds(durFrames, s.fps);
  const byAsset = new Map(p.media.map(m => [m.id, m.path]));
  const W = s.width, H = s.height;
  const fpsStr = `${s.fps.num}/${s.fps.den}`;
  const t = (f: number) => framesToSeconds(f, s.fps).toFixed(6);
  const cropF = (c: Clip): string => { const k = c.crop ?? { l: 0, t: 0, r: 0, b: 0 }; if (!k.l && !k.t && !k.r && !k.b) return ""; return `,crop=w=iw*${1 - k.l - k.r}:h=ih*${1 - k.t - k.b}:x=iw*${k.l}:y=ih*${k.t},scale=${W}:${H}`; };
  const rot = (c: Clip): string => { const a = c.transform.rotationDeg ?? 0; if (!a) return ""; return `,rotate=${(a * Math.PI / 180).toFixed(6)}:fillcolor=black`; };
  const vf = (c: Clip): string => { const fi = (c.fadeInFrames ?? 0) > 0 ? `,fade=t=in:st=0:d=${t(c.fadeInFrames ?? 0)}:alpha=1` : ""; const fo = (c.fadeOutFrames ?? 0) > 0 ? `,fade=t=out:st=${t(c.durationFrames - (c.fadeOutFrames ?? 0))}:d=${t(c.fadeOutFrames ?? 0)}:alpha=1` : ""; return fi + fo; };
  const volExpr = (c: Clip, base: number): string => (c.volumeKeys && c.volumeKeys.length ? volumeExpr(c.volumeKeys, c.startFrame, s.fps.num / s.fps.den, c.muted ? 0 : base) : String(c.muted ? 0 : base));
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
  const hidden = new Set(s.tracks.filter((x) => x.hidden).map((x) => x.id));
  const muted = new Set(s.tracks.filter((x) => x.muted).map((x) => x.id));
  const videoClips = s.clips.filter(c => !hidden.has(c.trackId) && c.kind === 'video').sort((a, b) => a.startFrame - b.startFrame);
  const imageClips = s.clips.filter(c => !hidden.has(c.trackId) && c.kind === 'image').sort((a, b) => a.startFrame - b.startFrame);
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
  const vsegs: Array<{ l: string; d: number; tr: number }> = [];
  let cursor = 0, n = 0;
  const black = (frames: number): string => {
    const l = `[blk${n++}]`;
    filters.push(`color=c=black:s=${W}x${H}:r=${fpsStr}:d=${t(frames)},format=yuv420p,settb=AVTB${l}`);
    return l;
  };
  for (const c of base) {
    if (c.startFrame > cursor) { const bf = c.startFrame - cursor; vsegs.push({ l: black(bf), d: Number(t(bf)), tr: 0 }); }
    const inp = await forAsset(c.assetId, c.kind === 'image');
    if (!inp.hasVideo) throw new Error(`asset has no video stream: ${inp.path}`);
    const l = `[vs${n++}]`;
    if (c.kind === 'image') {
      const sc = c.transform.scaleX !== 1 || c.transform.scaleY !== 1 ? `,scale=iw*${c.transform.scaleX}:ih*${c.transform.scaleY}` : '';
      filters.push(`[${inp.idx}:v]trim=start=0:end=${t(c.durationFrames)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${sc}${cropF(c)}${vf(c)}${rot(c)},format=yuv420p,settb=AVTB${l}`);
    } else {
      const spd = c.speed ?? 1;
      const ss = t(c.sourceInFrame), to = t(c.sourceInFrame + Math.round(c.durationFrames * spd));
      const sts = spd === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${spd}`;
      filters.push(`[${inp.idx}:v]trim=start=${ss}:end=${to},${sts},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${cropF(c)}${vf(c)}${rot(c)},format=yuv420p,settb=AVTB${l}`);
    }
    vsegs.push({ l, d: Number(t(c.durationFrames)), tr: Number(t(Math.min(c.transitionOutFrames ?? 0, c.durationFrames))) });
    cursor = c.startFrame + c.durationFrames;
  }
  if (cursor < durFrames) { const bf = durFrames - cursor; vsegs.push({ l: black(bf), d: Number(t(bf)), tr: 0 }); }
  let vacc = vsegs[0].l, acc = vsegs[0].d;
  for (let vi = 1; vi < vsegs.length; vi++) {
    const f = Math.min(vsegs[vi - 1].tr, acc, vsegs[vi].d);
    if (f > 1e-9) { filters.push(`${vacc}${vsegs[vi].l}xfade=transition=fade:duration=${f.toFixed(6)}:offset=${(acc - f).toFixed(6)}[vx${n}]`); vacc = `[vx${n}]`; n++; acc = acc + vsegs[vi].d - f; }
    else { filters.push(`${vacc}${vsegs[vi].l}concat=n=2:v=1:a=0[vc${n}]`); vacc = `[vc${n}]`; n++; acc = acc + vsegs[vi].d; }
  }
  filters.push(`${vacc}setsar=1[vbase]`);
  const videoAcc = acc;
  expectSec = videoAcc;

  // Higher-track image overlays.

  let vlabel = '[vbase]';
  let k = 0;
  for (const c of overlays) {
    const keys = (c.opacityKeys ?? []).filter((kf) => kf.frame >= c.startFrame && kf.frame <= c.startFrame + c.durationFrames);
    const spans: Array<{ from: number; to: number; aa: number }> = keys.length ? (() => { const cuts = [c.startFrame, ...keys.map((kf) => kf.frame), c.startFrame + c.durationFrames].filter((v, ix, a) => a.indexOf(v) === ix).sort((a, b) => a - b); const r: Array<{ from: number; to: number; aa: number }> = []; for (let si = 0; si < cuts.length - 1; si++) { if (cuts[si + 1] <= cuts[si]) continue; r.push({ from: cuts[si], to: cuts[si + 1], aa: evaluateKeyframes(c.opacityKeys ?? [], cuts[si], c.opacity) }); } return r; })() : [{ from: c.startFrame, to: c.startFrame + c.durationFrames, aa: c.opacity }];
    const inp = await forAsset(c.assetId, true);
    const sc = `scale=iw*${c.transform.scaleX}:ih*${c.transform.scaleY}`;
    const x = `${W}/2-w/2+(${c.transform.x})`, y = `${H}/2-h/2+(${c.transform.y})`;
    const full = c.transform.x === 0 && c.transform.y === 0 && c.transform.scaleX === 1 && c.transform.scaleY === 1;
    const mode = (c.blend ?? "normal") === "normal" || !full ? "normal" : (c.blend as string);
    if (mode !== "normal") warnings.push(`clip ${c.id} blend applies full-frame (transform ignored)`);
    for (const sp of spans) {
      if (mode === "normal") {
      const oo = sp.aa < 1 ? `,format=rgba,colorchannelmixer=aa=${sp.aa}` : '';
      filters.push(`[${inp.idx}:v]${sc}${oo}${vf(c)},setsar=1[ov${k}]`);
      const out = `[vtmp${k}]`;
      filters.push(vlabel + '[ov' + k + ']overlay=x=' + String.fromCharCode(39) + x + String.fromCharCode(39) + ':y=' + String.fromCharCode(39) + y + String.fromCharCode(39) + ':enable=' + String.fromCharCode(39) + 'between(t,' + t(sp.from) + ',' + t(sp.to) + ')' + String.fromCharCode(39) + out);
      vlabel = out; k++;
      } else {
        filters.push(`${vlabel}split=2[vk${k}][vcut${k}]`);
        filters.push(`[vcut${k}]trim=start=${t(sp.from)}:end=${t(sp.to)},setpts=PTS-STARTPTS[vseg${k}]`);
        filters.push(`[${inp.idx}:v]trim=start=${t(sp.from)}:end=${t(sp.to)},setpts=PTS-STARTPTS,scale=${W}:${H},setsar=1[ovt${k}]`);
        filters.push(`[vseg${k}]format=gbrp[vg${k}];[ovt${k}]format=gbrp[og${k}];[vg${k}][og${k}]blend=all_mode='${mode}':all_opacity=${sp.aa},format=yuv420p[vbl${k}]`);
        filters.push(`[vk${k}][vbl${k}]overlay=0:0:enable='between(t,${t(sp.from)},${t(sp.to)})'[vtmp${k}]`);
        vlabel = `[vtmp${k}]`; k++;
      }
    }
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
  const aclips = s.clips.filter(c => !muted.has(c.trackId) && (c.kind === 'video' || c.kind === 'audio') && c.assetId).sort((a, b) => a.startFrame - b.startFrame);
  let alabel = '';
  if (aclips.length) {
    const asegs: Array<{ l: string; d: number; tr: number }> = [];
    let ac = 0, an = 0;
    const silence = (frames: number): string => {
      const atempo = (s: number): string => { const parts: string[] = []; let v = s; while (v < 0.5) { parts.push("atempo=0.5"); v *= 2; } parts.push(`atempo=${v}`); return parts.join(","); };
      const l = `[as${an++}]`;
      filters.push(`anullsrc=r=48000:cl=stereo:d=${t(frames)}${l}`);
      return l;
    };
    let cluster: Array<{ l: string; startF: number; endF: number; tr: number }> = [];
    const flushCluster = (): void => {
      if (!cluster.length) return;
      if (cluster.length === 1) { const m = cluster[0]; asegs.push({ l: m.l, d: Number(t(m.endF - m.startF)), tr: m.tr }); }
      else { const cs = cluster[0].startF; const ce = Math.max(...cluster.map((m) => m.endF));
        const ins = cluster.map((m) => { const dl = `[ad${an++}]`; const ms = Math.round(((m.startF - cs) / (s.fps.num / s.fps.den)) * 1000); filters.push(`${m.l}adelay=${ms}|${ms}${dl}`); return dl; }).join("");
        const mx = `[amx${an++}]`; filters.push(`${ins}amix=inputs=${cluster.length}:normalize=0${mx}`);
        asegs.push({ l: mx, d: Number(t(ce - cs)), tr: Math.max(...cluster.map((m) => m.tr)) }); }
      cluster = [];
    };
    const atempo = (sv: number): string => { const parts: string[] = []; let q = sv; while (q < 0.5) { parts.push("atempo=0.5"); q *= 2; } parts.push(`atempo=${q}`); return parts.join(","); };
    for (const c of aclips) {
      const inp = await forAsset(c.assetId, false);
      if (!inp.hasAudio) { warnings.push(`clip ${c.id} skipped in audio mix (no audio stream)`); continue; }
      if (cluster.length && c.startFrame >= Math.max(...cluster.map((m) => m.endF))) flushCluster();
      if (!cluster.length && c.startFrame > ac) { const gf = c.startFrame - ac; asegs.push({ l: silence(gf), d: Number(t(gf)), tr: 0 }); }
      const vol = c.muted ? 0 : c.volume;
      const aspd = c.speed ?? 1;
      const ass = t(c.sourceInFrame), ato = t(c.sourceInFrame + Math.round(c.durationFrames * aspd));
      const at = aspd === 1 ? "" : "," + atempo(aspd);
      const kk = `[as${an++}]`;
      filters.push(`[${inp.idx}:a]atrim=start=${ass}:end=${ato},asetpts=PTS-STARTPTS${at},volume='${volExpr(c, vol)}':eval=frame,aresample=48000,aformat=channel_layouts=stereo${af(c)}${kk}`);
      cluster.push({ l: kk, startF: c.startFrame, endF: c.startFrame + c.durationFrames, tr: Number(t(Math.min(c.transitionOutFrames ?? 0, c.durationFrames))) });
      ac = Math.max(ac, c.startFrame + c.durationFrames);
    }
    flushCluster();
    const tailTarget = Math.max(durFrames, ac);
    if (ac < tailTarget) { const gf = tailTarget - ac; asegs.push({ l: silence(gf), d: Number(t(gf)), tr: 0 }); }
    let aacc = 0;
    if (asegs.length) { let al = asegs[0].l; aacc = asegs[0].d;
      for (let ai = 1; ai < asegs.length; ai++) {
        const f = Math.min(asegs[ai - 1].tr, aacc, asegs[ai].d);
        if (f > 1e-9) { filters.push(`${al}${asegs[ai].l}acrossfade=d=${f.toFixed(6)}:curve=tri[ax${an}]`); al = `[ax${an}]`; an++; aacc = aacc + asegs[ai].d - f; }
        else { filters.push(`${al}${asegs[ai].l}concat=n=2:v=0:a=1[ac${an}]`); al = `[ac${an}]`; an++; aacc = aacc + asegs[ai].d; }
      }
      alabel = al;
    }
    if (alabel) { filters.push(`${alabel}atrim=0:${expectSec.toFixed(6)},asetpts=PTS-STARTPTS[aout]`); alabel = '[aout]'; }
  }
  const expectAudio = !!alabel;
  const inArgs: string[] = []; for (const i of inputs) inArgs.push(...(i.loop ? ["-loop", "1", "-t", expectSec.toFixed(3)] : []), "-i", i.path); const finalArgs = [...inArgs, "-filter_complex", filters.join(";"), "-map", vlabel, ...(expectAudio ? ["-map", alabel] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', fpsStr,
    ...(expectAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-movflags', '+faststart', '-y', outPath];
  return { args: finalArgs, expectSec, expectAudio, warnings };
}
export interface ExportOpts { signal?: AbortSignal; onProgress?: (frac: number) => void }
export async function exportSequence(p: Project, seqId: string, outPath: string, signal?: AbortSignal, opts: ExportOpts = {}): Promise<ExportResult> {
  const s = p.sequences.find(x => x.id === seqId);
  if (!s) throw new Error('sequence not found');
  const { args, expectSec, warnings } = await buildFfmpegArgs(p, s, outPath);
  for (const w of warnings) console.warn('export-warn', w);
  await new Promise<void>((res, rej) => {
    let child: ChildProcess;
    const wantProgress = !!opts.onProgress;
    try { child = spawn('ffmpeg', [...(wantProgress ? ['-progress', 'pipe:1', '-nostats'] : ['-v', 'error']), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { rej(e); return; }
    const onAbort = () => { try { child.kill(); } catch { /* noop */ } rej(new Error('export cancelled')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    let pbuf = '';
    let err = '';
    child.stdout?.on('data', (d: Buffer) => { pbuf += d.toString(); let ix; while ((ix = pbuf.indexOf(String.fromCharCode(10))) >= 0) { const line = pbuf.slice(0, ix); pbuf = pbuf.slice(ix + 1); if (line.startsWith('out_time_ms=')) { const ms = Number(line.slice(12)); if (Number.isFinite(ms) && expectSec > 0 && opts.onProgress) opts.onProgress(Math.min(1, Math.max(0, ms / 1000000 / expectSec))); } } });
    child.stderr?.on('data', (d: Buffer) => err += d);
    child.on('error', (e: Error) => { signal?.removeEventListener('abort', onAbort); rej(e); });
    child.on('close', (code: number) => {
      signal?.removeEventListener('abort', onAbort);
      if (code !== 0) { rej(new Error(`ffmpeg exit ${code}: ${err.slice(-800)}`)); return; }
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

















