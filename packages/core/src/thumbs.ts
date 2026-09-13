import { spawn } from 'node:child_process';
import { mkdir, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Thumbnails for media panel / timeline (first slice of upstream MediaVisualCache):
// single-frame PNG into a caller-provided cache dir, keyed by path+mtime+size.
export async function thumbnail(path: string, cacheDir: string, atSeconds = 0.5, width = 160): Promise<string> {
  const st = await stat(path).catch(() => undefined);
  if (!st) throw new Error('missing media file: ' + path);
  await mkdir(cacheDir, { recursive: true });
  const key = createHash('sha1').update(path + '|' + st.mtimeMs + '|' + st.size + '|' + atSeconds + '|' + width).digest('hex');
  const out = join(cacheDir, key + '.png');
  if (await stat(out).then(() => true).catch(() => false)) return out;
  const tmp = out + '.tmp-' + process.pid + '.png';
  const grab = (ss: string | null): Promise<void> => new Promise<void>((res, rej) => {
    const ch = spawn('ffmpeg', ['-v', 'error', ...(ss === null ? [] : ['-ss', ss]), '-i', path, '-frames:v', '1', '-vf', 'scale=' + width + ':-1', '-y', tmp], { windowsHide: true });
    ch.on('error', rej);
    ch.on('close', async (c) => { if (c !== 0) { rej(new Error('thumb exit ' + c)); return; } const s = await stat(tmp).catch(() => undefined); if (!s || s.size === 0) rej(new Error('thumb empty')); else res(); });
  });
  try { await grab(String(atSeconds)); } catch { await grab(null); }
  const tst = await stat(tmp).catch(() => undefined);
  if (!tst || tst.size === 0) throw new Error('thumbnail decode produced nothing: ' + path);
  await rename(tmp, out);
  return out;
}



