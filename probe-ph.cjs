const fs = require("node:fs");
const s = fs.readFileSync("apps/editor/renderer/index.html", "utf8");
s.split("\n").forEach((ln, i) => { if (ln.indexOf("\"ph\"") >= 0 || ln.indexOf("seek\")") >= 0 && ln.indexOf("max") >= 0) console.log("L" + (i + 1) + ": " + ln.trim().slice(0, 150)); });
