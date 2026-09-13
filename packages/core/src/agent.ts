import type { Project } from './model.js';

// Local command agent (first slice of upstream Agent parity): deterministic
// intent parsing over explicit context. No LLM, no network, no guessing —
// unknown input returns a truthful error listing supported commands.
// Provider-backed agents plug in later by producing these same intents.
export interface AgentCtx { sequenceId: string; playheadFrame: number; selectedClipId: string | null }
export type AgentIntent =
  | { op: 'splitClip'; clipId: string; atFrame: number }
  | { op: 'deleteClip'; clipId: string }
  | { op: 'rippleDelete'; clipId: string }
  | { op: 'addMarker'; name: string; atFrame: number }
  | { op: 'addText'; text: string; atFrame: number }
  | { op: 'setVolume'; clipId: string; volume: number }
  | { op: 'undo' }
  | { op: 'redo' };
export const AGENT_HELP = 'commands: split here | delete selected | ripple selected | marker <name> | text <words> | volume <0-4> | undo | redo';
export function parseAgentCommand(p: Project, ctx: AgentCtx, raw: string): AgentIntent {
  const text = raw.trim();
  const low = text.toLowerCase();
  const needSel = (): string => {
    if (!ctx.selectedClipId) throw new Error('no clip selected');
    return ctx.selectedClipId;
  };
  if (low === 'split here') {
    const id = needSel();
    const seq = p.sequences.find((s) => s.id === ctx.sequenceId);
    const c = seq && seq.clips.find((x) => x.id === id);
    if (!c || ctx.playheadFrame <= c.startFrame || ctx.playheadFrame >= c.startFrame + c.durationFrames) {
      throw new Error('playhead is not inside the selected clip');
    }
    return { op: 'splitClip', clipId: id, atFrame: ctx.playheadFrame };
  }
  if (low === 'delete selected') return { op: 'deleteClip', clipId: needSel() };
  if (low === 'ripple selected') return { op: 'rippleDelete', clipId: needSel() };
  if (low === 'undo') return { op: 'undo' };
  if (low === 'redo') return { op: 'redo' };
  let m = low.match(/^marker\s+(.+)$/);
  if (m) return { op: 'addMarker', name: m[1].slice(0, 120), atFrame: ctx.playheadFrame };
  m = low.match(/^text\s+(.+)$/);
  if (m) {
    if (!text.slice(4).trim()) throw new Error('text needs words');
    return { op: 'addText', text: text.slice(text.toLowerCase().indexOf('text') + 4).trim(), atFrame: ctx.playheadFrame };
  }
  m = low.match(/^volume\s+([0-9]*\.?[0-9]+)$/);
  if (m) {
    const v = Number(m[1]);
    if (!(v >= 0 && v <= 4)) throw new Error('volume 0-4');
    return { op: 'setVolume', clipId: needSel(), volume: v };
  }
  throw new Error('unknown command. ' + AGENT_HELP);
}
