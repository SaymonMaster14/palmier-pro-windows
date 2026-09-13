const fs = require("node:fs");
const p = "apps/editor/renderer/index.html";
const lines = fs.readFileSync(p, "utf8").split("\n");
const bi = lines.findIndex((x) => x.indexOf("d.appendChild(b);") >= 0);
if (bi < 0) { console.error("B-LINE-BAD"); process.exit(1); }
let di = -1;
for (let i = bi + 1; i < Math.min(bi + 4, lines.length); i++) { if (lines[i].indexOf("box.appendChild(d);") >= 0) { di = i; break; } }
if (di < 0) { console.error("D-LINE-BAD"); process.exit(1); }
const eol = lines[di].endsWith("\r") ? "\r" : "";
lines[di] = "    if (tr.kind === \"audio\") { const sl = document.createElement(\"input\"); sl.type = \"range\"; sl.min = \"0\"; sl.max = \"4\"; sl.step = \"0.1\"; sl.value = tr.volume ?? 1; sl.title = \"track volume\"; sl.addEventListener(\"change\", async () => { await window.palmier.op(\"setTrackFlags\", [SEQ.id, tr.id, { volume: Number(sl.value) }]); await refresh(); }); d.appendChild(sl); }" + eol + "\n" + lines[di];
fs.writeFileSync(p, lines.join("\n"));
console.log("SLIDER-OK");
