import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

export interface ProbeResult {
  durationSec: number; width?: number; height?: number; fps?: number;
  audioChannels?: number; sampleRate?: number; rotation?: number;
  hasVideo: boolean; hasAudio: boolean;
}
const run = (cmd: string, args: string[]): Promise<string> => new Promise((res, rej) => {
  const ch = spawn(cmd, args, { windowsHide: true });
  let out = '', err = '';
  ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
  ch.on('error', rej); ch.on('close', code => code === 0 ? res(out) : rej(new Error(`${cmd} exit ${code}: ${err.slice(0, 500)}`)));
});
export async function probeMedia(path: string): Promise<ProbeResult> {
  try { await stat(path); } catch { throw new Error(`missing media file: ${path}`); }
  const raw = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]);
  let j: { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  try { j = JSON.parse(raw); } catch { throw new Error(`unreadable probe output: ${path}`); }
  const streams = j.streams ?? [];
  const v = streams.find(s => s['codec_type'] === 'video');
  const a = streams.find(s => s['codec_type'] === 'audio');
  const dur = Number((j.format as { duration?: unknown } | undefined)?.duration ?? (v?.['duration'] ?? a?.['duration'] ?? NaN));
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`invalid/corrupt media (no duration): ${path}`);
  let fps: number | undefined;
  const afps = v?.['avg_frame_rate'] as string | undefined;
  if (afps && afps.includes('/')) { const [n, d] = afps.split('/').map(Number); if (d > 0) fps = n / d; }
  const rotTags = (v?.['tags'] as Record<string, string> | undefined);
  return {
    durationSec: dur,
    width: v?.['width'] as number | undefined, height: v?.['height'] as number | undefined,
    fps: fps && Number.isFinite(fps) && fps > 0 ? fps : undefined,
    audioChannels: a?.['channels'] as number | undefined, sampleRate: Number(a?.['sample_rate'] ?? NaN) || undefined,
    rotation: rotTags?.['rotate'] ? Number(rotTags['rotate']) : undefined,
    hasVideo: !!v, hasAudio: !!a,
  };
}
