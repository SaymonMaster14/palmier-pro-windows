const fs = require("node:fs");
const s = fs.readFileSync("apps/editor/renderer/index.html", "utf8");
const lines = s.split("\n");
lines.forEach((ln, i) => {
  if (ln.indexOf("DUR()") >= 0 || ln.indexOf("frameToPx") >= 0 || ln.indexOf("pxToFrame") >= 0 || ln.indexOf("f2x") >= 0) console.log("L" + (i + 1) + ": " + ln.trim().slice(0, 130));
});
