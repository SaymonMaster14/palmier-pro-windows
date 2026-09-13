const fs = require("node:fs");
const st = fs.readFileSync("packages/core/src/store.ts", "utf8").split("\n");
st.forEach((x, i) => { if (x.indexOf("setTrackFlags") >= 0) console.log("ST" + (i + 1) + ": " + JSON.stringify(x)); });
const ex = fs.readFileSync("packages/core/src/export.ts", "utf8").split("\n");
ex.forEach((x, i) => { const t = x.trim(); if (t.indexOf("volumeExpr") >= 0 || t.indexOf("adelay") >= 0 || t.indexOf("amix") >= 0 || t.indexOf("muted") >= 0) console.log("EX" + (i + 1) + ": " + JSON.stringify(x.slice(0, 200))); });
