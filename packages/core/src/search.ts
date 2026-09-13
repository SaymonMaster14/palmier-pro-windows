import type { Project, Sequence } from './model.js';

export interface SearchHit { kind: 'media' | 'clip' | 'marker'; id: string; label: string; score: number }
// Project search (first slice of upstream Search parity: metadata + names +
// clip text + markers; visual/transcript indexes remain deferred per ledger).
export function searchProject(p: Project, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const m of p.media) {
    const name = m.name.toLowerCase();
    if (name.includes(q)) hits.push({ kind: 'media', id: m.id, label: m.name, score: scoreMatch(name, q) });
    else if (m.kind.toLowerCase() === q) hits.push({ kind: 'media', id: m.id, label: m.name, score: 0.5 });
  }
  for (const s of p.sequences) hits.push(...searchSequence(s, q));
  return hits.sort((a, b) => b.score - a.score).slice(0, 50);
}
export function searchSequence(s: Sequence, q: string): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits: SearchHit[] = [];
  for (const c of s.clips) {
    const hay = (c.name + ' ' + (c.text ?? '')).toLowerCase();
    if (hay.includes(query)) hits.push({ kind: 'clip', id: c.id, label: c.name, score: scoreMatch(hay, query) });
  }
  for (const m of s.markers ?? []) {
    if ((m.name + ' ' + (m.comment ?? '')).toLowerCase().includes(query)) {
      hits.push({ kind: 'marker', id: m.id, label: m.name, score: scoreMatch(m.name.toLowerCase(), query) });
    }
  }
  return hits;
}
function scoreMatch(hay: string, q: string): number {
  if (hay === q) return 3;
  if (hay.startsWith(q)) return 2;
  return 1;
}
