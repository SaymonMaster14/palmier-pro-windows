"use strict";
// postpackage: remove the vendored copy so dev resolution falls back to the workspace link.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
fs.rmSync(path.join(ROOT, "apps", "editor", "node_modules"), { recursive: true, force: true });
console.log("postpackage: vendor copy removed");
