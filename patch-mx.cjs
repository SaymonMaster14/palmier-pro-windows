const fs = require("node:fs");
let fails = 0;
function rep(path, anchor, replacement) {
  const s = fs.readFileSync(path, "utf8");
  const i = s.indexOf(anchor);
  if (i < 0) { console.error("ANCHOR-MISS " + path + " :: " + anchor.slice(0, 70)); fails++; return; }
  if (s.indexOf(anchor, i + 1) >= 0) { console.error("ANCHOR-AMBIG " + path + " :: " + anchor.slice(0, 70)); fails++; return; }
  fs.writeFileSync(path, s.slice(0, i) + replacement + s.slice(i + anchor.length));
  console.log("PATCHED " + path + " :: " + anchor.slice(0, 45));
}
const M = "packages/core/src/model.ts";
const ST = "packages/core/src/store.ts";
const EX = "packages/core/src/export.ts";
const RX = "apps/editor/renderer/index.html";
const MN = "apps/editor/src/main.js";
rep(M, "locked?: boolean; hidden?: boolean; muted?: boolean }", "locked?: boolean; hidden?: boolean; muted?: boolean; volume?: number }");
rep(ST, "patch: { muted?: boolean; locked?: boolean; hidden?: boolean }): Receipt {", "patch: { muted?: boolean; locked?: boolean; hidden?: boolean; volume?: number }): Receipt {");
rep(ST, "if (typeof v !== \"boolean\") throw new Error(\"bad flag \" + k); tr[k] = v; }", "if (typeof v !== \"boolean\") throw new Error(\"bad flag \" + k); tr[k] = v; }\n      if (patch.volume !== undefined) { if (!Number.isFinite(patch.volume) || patch.volume < 0 || patch.volume > 4) throw new Error(\"bad track volume\"); tr.volume = patch.volume; }");
rep(EX, "const vol = c.muted ? 0 : c.volume;", "const tgain = s.tracks.find((x) => x.id === c.trackId)?.volume ?? 1; const vol = c.muted ? 0 : c.volume * tgain;");
rep(RX, "box.appendChild(d);", "if (tr.kind === \"audio\") { const sl = document.createElement(\"input\"); sl.type = \"range\"; sl.min = \"0\"; sl.max = \"4\"; sl.step = \"0.1\"; sl.value = tr.volume ?? 1; sl.title = \"track volume\"; sl.addEventListener(\"change\", async () => { await window.palmier.op(\"setTrackFlags\", [SEQ.id, tr.id, { volume: Number(sl.value) }]); await refresh(); }); d.appendChild(sl); } box.appendChild(d);");
rep(RX, "#ctxmenu button:hover{background:var(--accsoft)}", "#ctxmenu button:hover{background:var(--accsoft)}\n#tracks .trk input[type=range]{width:54px;flex:none;padding:0}");
const mixInner = "(async () => { var s0 = await window.palmier.state(); var q0 = s0.sequences[0]; var at = q0.tracks.find(function(t){ return t.kind === 'audio'; }); if (!at) return 'no-audio-track'; var r1 = await window.palmier.op('setTrackFlags', [q0.id, at.id, { volume: 0.5 }]); if (!r1.ok) return 'op-fail'; var s1 = await window.palmier.state(); var v1 = s1.sequences[0].tracks.find(function(t){ return t.id === at.id; }).volume; var sl = null; document.querySelectorAll('#tracks .trk input[type=range]').forEach(function(el){ if (!sl) sl = el; }); var wired = 'no-slider'; if (sl) { sl.value = 2; sl.dispatchEvent(new Event('input')); sl.dispatchEvent(new Event('change')); await new Promise(function(r){ setTimeout(r, 600); }); var s2 = await window.palmier.state(); wired = s2.sequences[0].tracks.find(function(t){ return t.id === at.id; }).volume; } await window.palmier.op('setTrackFlags', [q0.id, at.id, { volume: 1 }]); return 'op=' + v1 + ' slider=' + wired; })()";
rep(MN, "console.log(\"SMOKE-METER\",", "console.log(\"SMOKE-MIX\", await win.webContents.executeJavaScript(\"" + mixInner + "\"));\n    console.log(\"SMOKE-METER\",");
if (fails > 0) { console.error("PATCH-FAILED"); process.exit(1); } else console.log("MX-OK");
