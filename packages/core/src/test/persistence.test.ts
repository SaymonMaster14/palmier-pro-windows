import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../model.js';
import { saveProject, loadProject, ProjectLoadError } from '../persistence.js';
import { writeFileSync } from 'node:fs';

test('persistence: save/reopen roundtrip + corruption reporting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'palm-'));
  const fp = join(dir, 'proj.palmier.json');
  const p = createProject('round');
  await saveProject(p, fp);
  const q = await loadProject(fp);
  assert.equal(q.name, 'round');
  assert.equal(q.version, 1);
  writeFileSync(fp, '{nope');
  await assert.rejects(() => loadProject(fp), ProjectLoadError);
});
