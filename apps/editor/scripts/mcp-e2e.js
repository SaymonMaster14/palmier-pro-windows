"use strict";
// Real MCP E2E over HTTP against the RUNNING editor (no in-process bypass).
const BASE = "http://127.0.0.1:" + (process.env.PALM_MCP_PORT || 19789) + "/mcp";
let id = 0;
async function call(method, params) {
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: ++id, method, params }) });
  const j = await r.json();
  if (!j.ok) throw new Error(method + " failed: " + (j.error || JSON.stringify(j)));
  return j.result;
}
async function main() {
  const h = await (await fetch(BASE.replace("/mcp", "/health"))).json();
  if (!h.ok) throw new Error("no health");
  const proj = await call("getProject", {});
  const seq = proj.sequences[0];
  if (!seq) throw new Error("no sequence in running app");
  const track = seq.tracks.find((t) => t.kind === "video");
  const asset = proj.media[0];
  if (!track || !asset) throw new Error("need video track + media");
  const before = (await call("listClips", { sequenceId: seq.id })).length;
  const ctx = await call("timelineContext", { sequenceId: seq.id });
  const placed = await call("placeClip", { sequenceId: seq.id, trackId: track.id, clip: { kind: "video", assetId: asset.id, startFrame: ctx.durationFrames, durationFrames: 30, name: "mcp-clip" } });
  if (!placed.ok || !placed.ids.length) throw new Error("place failed: " + JSON.stringify(placed));
  const after = await call("listClips", { sequenceId: seq.id });
  if (after.length !== before + 1 || !after.some((c) => c.id === placed.ids[0])) throw new Error("readback mismatch");
  const u = await call("undo", {});
  if (!u.undone) throw new Error("undo failed");
  const undone = await call("listClips", { sequenceId: seq.id });
  if (undone.length !== before) throw new Error("undo readback mismatch");
  const rd = await call("redo", {});
  if (!rd.redone) throw new Error("redo failed");
  const redone = await call("listClips", { sequenceId: seq.id });
  if (redone.length !== before + 1) throw new Error("redo readback mismatch");
  await call("undo", {});
  console.log("MCP-E2E-PASS clips=" + before + "->" + after.length + "->" + undone.length + "->" + redone.length);
}
main().catch((e) => { console.error("MCP-E2E-FAIL", e.message); process.exit(1); });
