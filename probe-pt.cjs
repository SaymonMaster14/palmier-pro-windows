const fs = require("node:fs");
const s = fs.readFileSync("apps/editor/renderer/index.html", "utf8");
const i = s.indexOf("function paintTracks()");
console.log(JSON.stringify(s.slice(i, i + 1100)));
