import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { thumbnail } from '../thumbs.js';

const fix = (n: string): string => join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'tests', 'fixtures', n);
test('thumbs: png from video, cached, stills work', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'palm-th-'));
  const a = await thumbnail(fix('sample-av.mp4'), dir);
  const b = await thumbnail(fix('sample-av.mp4'), dir);
  assert.equal(a, b);
  assert.ok((await stat(a)).size > 0);
  const img = await thumbnail(fix('sample-img.png'), dir);
  assert.ok((await stat(img)).size > 0);
  await assert.rejects(() => thumbnail(join(dir, 'nope.mp4'), dir));
});

