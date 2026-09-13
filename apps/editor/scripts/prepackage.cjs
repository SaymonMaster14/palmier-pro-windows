"use strict";
// prepackage: ensure core dist is built so electron-builder packs fresh output.
const cp = require("node:child_process");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
cp.execSync("npm run build -w packages/core", { cwd: ROOT, stdio: "inherit" });
console.log("prepackage: core built");
