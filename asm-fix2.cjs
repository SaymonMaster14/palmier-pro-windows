const fs = require("node:fs");
const f = "apps/editor/src/main.js";
let s = fs.readFileSync(f, "utf8");
const oldT = "    expJobs.set(id, { ...job, ctrl });";
if (!s.includes(oldT)) throw new Error("anchor?");
s = s.replace(oldT, "    job.ctrl = ctrl;\n    expJobs.set(id, job);");
fs.writeFileSync(f, s);
console.log("fixed");
