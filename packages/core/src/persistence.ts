import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PROJECT_VERSION, type Project } from './model.js';

export class ProjectLoadError extends Error { constructor(msg: string) { super(msg); this.name = 'ProjectLoadError'; } }
// Atomic safe writes: stage tmp on destination volume, then rename. No UI state serialized.
export async function saveProject(p: Project, filePath: string): Promise<void> {
  const abs = resolve(filePath);
  await mkdir(dirname(abs), { recursive: true });
  const data = JSON.stringify({ ...p, version: PROJECT_VERSION }, null, 2);
  const tmp = abs + `.tmp-${process.pid}`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, abs);
}
export async function loadProject(filePath: string): Promise<Project> {
  const abs = resolve(filePath);
  let raw: string;
  try { raw = await readFile(abs, 'utf8'); } catch { throw new ProjectLoadError(`cannot read project file: ${abs}`); }
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { throw new ProjectLoadError(`corrupt project JSON: ${abs}`); }
  const p = obj as Project;
  if (typeof p !== 'object' || p === null) throw new ProjectLoadError('corrupt project: not an object');
  if (p.version !== PROJECT_VERSION) throw new ProjectLoadError(`unsupported project version ${String((p as {version?: unknown}).version)} (want ${PROJECT_VERSION})`);
  if (!Array.isArray(p.sequences) || !Array.isArray(p.media)) throw new ProjectLoadError('corrupt project: missing sequences/media');
  return p;
}
