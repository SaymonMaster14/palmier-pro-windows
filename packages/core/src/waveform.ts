import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

// Waveform peaks for timeline display. Decodes mono 8kHz s16 and buckets peak
// amplitude in [0,1]. Bounded: 8kHz * duration samples max, single job at a time.
let active = 0;
const cache = new Map<string, { mtime: number; peaks: number[] }>();
export async function waveformPeaks(path: string, buckets = 200): Promise<number[]> {
  if (!Number.isInteger(buckets) || buckets < 16 || buckets > 2000) throw new Error('bad buckets');
  const st = await stat(path).catch(() => undefined);
  if (!st) throw new Error(`missing media file: ${path}`);
  const hit = cache.get(path);
  if (hit && hit.mtime === st.mtimeMs && hit.peaks.length === buckets) return hit.peaks;
  while (active > 0) await new Promise((r) => setTimeout(r, 50));
  active++;
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      const ch = spawn('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], { windowsHide: true });
      ch.stdout.on('data', (d) => chunks.push(d));
      ch.on('error', rej);
      ch.on('close', (c) => (c === 0 ? res() : rej(new Error('waveform decode exit ' + c))));
    });
    const raw = Buffer.concat(chunks);
    const n = Math.floor(raw.length / 2);
    const peaks = new Array(buckets).fill(0);
    if (n > 0) {
      const per = n / buckets;
      for (let b = 0; b < buckets; b++) {
        const s0 = Math.floor(b * per), s1 = Math.max(s0 + 1, Math.floor((b + 1) * per));
        let m = 0;
        for (let i = s0; i < s1 && i < n; i++) {
          const v = Math.abs(raw.readInt16LE(i * 2)) / 32768;
          if (v > m) m = v;
        }
        peaks[b] = Math.round(m * 1000) / 1000;
      }
    }
    cache.set(path, { mtime: st.mtimeMs, peaks });
    return peaks;
  } finally {
    active--;
  }
}
