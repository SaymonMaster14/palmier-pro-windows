import type { Keyframe } from './model.js';

// FFmpeg per-frame expressions from keyframe tracks. Segment-local seconds;
// values outside the key range hold the edge value. Base multiplies.
export function volumeExpr(keys: Keyframe[], clipStartFrame: number, fps: number, base: number): string {
  if (!keys.length) return String(base);
  const f = (fr: number): string => ((fr - clipStartFrame) / fps).toFixed(6);
  const s = [...keys].sort((a, b) => a.frame - b.frame);
  let e = String(s[s.length - 1].value * base);
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1], b = s[i];
    const t0 = f(a.frame), t1 = f(b.frame);
    const v0 = (a.value * base).toFixed(6), v1 = (b.value * base).toFixed(6);
    const span = (+t1 - +t0).toFixed(6);
    const ramp = v0 + "+(" + v1 + "-" + v0 + ")*(t-" + t0 + ")/" + span;
    e = "if(lt(t," + t1 + ")," + (a.interpolation === "hold" ? v0 : ramp) + "," + e + ")";
  }
  e = "if(lt(t," + f(s[0].frame) + ")," + (s[0].value * base).toFixed(6) + "," + e + ")";
  return e;
}
