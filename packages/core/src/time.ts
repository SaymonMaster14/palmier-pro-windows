// Frame-exact time model. All timeline math in integer frames; seconds only at I/O boundaries.
export interface RationalFps { num: number; den: number }
export const fpsFloat = (f: RationalFps): number => f.num / f.den;
export const fpsFromFloat = (v: number): RationalFps => {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`bad fps ${v}`);
  const den = 1001; // covers 29.97/59.94 families when num rounded
  const common: Record<string, RationalFps> = {
    '23.976': { num: 24000, den: 1001 }, '29.97': { num: 30000, den: 1001 },
    '59.94': { num: 60000, den: 1001 },
  };
  const k = v.toFixed(3);
  if (common[k]) return common[k];
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return { num: r, den: 1 };
  return { num: Math.round(v * den), den };
};
// Rounding rule (single source of truth): seconds->frames rounds half away from zero via Math.round.
export const secondsToFrames = (s: number, fps: RationalFps): number => {
  if (!Number.isFinite(s) || s < 0) throw new Error(`bad seconds ${s}`);
  return Math.round(s * fpsFloat(fps));
};
export const framesToSeconds = (f: number, fps: RationalFps): number => {
  if (!Number.isInteger(f) || f < 0) throw new Error(`bad frames ${f}`);
  return f / fpsFloat(fps);
};
// Source<->timeline with speed: timelineFrames * speed = sourceFrames consumed.
export const sourceFramesFor = (timelineFrames: number, speed: number): number => {
  if (!(speed > 0) || !Number.isFinite(speed)) throw new Error(`bad speed ${speed}`);
  return Math.round(timelineFrames * speed);
};
