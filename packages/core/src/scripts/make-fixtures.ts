import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const fixDir = join(root, 'tests', 'fixtures');
mkdirSync(fixDir, { recursive: true });
const run = (args: string[]) => new Promise<void>((res, rej) => {
  const ch = spawn('ffmpeg', args, { stdio: 'inherit', windowsHide: true });
  ch.on('error', rej); ch.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)));
});
// Deterministic local fixtures (no downloads): video+audio 6s 30fps 640x360, image, audio-only.
const V = join(fixDir, 'sample-av.mp4');
const IMG = join(fixDir, 'sample-img.png');
const AU = join(fixDir, 'sample-audio.wav');
await run(['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', V]);
await run(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x224488:size=640x360:duration=1', '-frames:v', '1', '-y', IMG]);
await run(['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', '-y', AU]);
console.log(`fixtures ok: ${V} ${IMG} ${AU}`);
