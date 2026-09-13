const fs = require("node:fs");
const f = "packages/core/src/test/abort.test.ts";
let s = fs.readFileSync(f, "utf8");
s = s.replace("const fix = (n) =>", "const fix = (n: string): string =>");
fs.writeFileSync(f, s);
console.log("typed");
