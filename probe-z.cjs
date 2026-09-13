const fs = require("node:fs");
const l = fs.readFileSync("apps/editor/renderer/index.html", "utf8").split("\n");
l.forEach((x, i) => {
  const t = x.trim();
  if (t.indexOf("let S = null") === 0 || t.indexOf("const durR") === 0 || t.indexOf("rulerH +=") >= 0 || t.indexOf("ruler').innerHTML") >= 0 || t.indexOf("const df = Math.round") === 0 || t.indexOf("document.addEventListener(\"keydown\"") === 0) console.log("L" + (i + 1) + ": " + JSON.stringify(x));
});
