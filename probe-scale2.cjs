const fs = require("node:fs");
const s = fs.readFileSync("apps/editor/renderer/index.html", "utf8");
const lines = s.split("\n");
lines.forEach((ln, i) => {
  const t = ln.trim();
  if (t.indexOf("f2x(") >= 0 || t.indexOf("pxToFrame(") >= 0 || t.indexOf("ph.style.left") >= 0 || t.indexOf("tl.innerHTML") >= 0 || t.indexOf("dur / dur") >= 0 || t.indexOf("/ dur * 100") >= 0 || t.indexOf("(dur)") >= 0) console.log("L" + (i + 1) + ": " + t.slice(0, 160));
});
console.log("---refresh-head---");
const ri = lines.findIndex((x) => x.indexOf("async function refresh()") === 0);
console.log(lines.slice(ri, ri + 8).join("\n"));
