const fs = require("node:fs");
const s = fs.readFileSync("apps/editor/renderer/index.html", "utf8");
s.split("\n").forEach((ln, i) => { const t = ln.trim(); if (t.indexOf("style.left") >= 0 || t.indexOf("playhead") >= 0 || t.indexOf("id=ph") >= 0 || t.indexOf("getElementById(.ph.)") >= 0) console.log("L" + (i + 1) + ": " + t.slice(0, 160)); });
