import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waveformPeaks } from '../waveform.js';

test('waveform: tone vs silence contrast, cache, errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'palm-wv-'));
  const tone = join(dir, 'tone.wav');
  const sil = join(dir, 'sil.wav');
  const gen = (f: string, src: string): Promise<void> => new Promise<void>((res, rej) => {
    const ch = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', src, '-y', f], { windowsHide: true });
    ch.on('error', rej);
    ch.on('close', (c) => (c === 0 ? res() : rej(new Error('gen exit ' + c))));
  });
  await gen(tone, 'sine=frequency=440:duration=1');
  await gen(sil, 'anullsrc=r=8000:cl=mono:duration=1');
  const pt = await waveformPeaks(tone, 50);
  const ps = await waveformPeaks(sil, 50);
  assert.equal(pt.length, 50);
  const mean = (a: number[]): number => a.reduce((x: number, y: number) => x + y, 0) / a.length;
  assert.ok(mean(pt) > 5 * mean(ps) + 0.02, 'tone ' + mean(pt) + ' vs sil ' + mean(ps));
  assert.equal(mean(ps), 0);
  const again = await waveformPeaks(tone, 50);
  assert.ok(again === pt, 'cached instance');
  await assert.rejects(() => waveformPeaks(join(dir, 'nope.wav')));
  await assert.rejects(() => waveformPeaks(tone, 5));
});

