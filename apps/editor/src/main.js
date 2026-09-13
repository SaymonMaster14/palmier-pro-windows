"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
let win = null;
async function boot() {
  await app.whenReady();
  win = new BrowserWindow({ width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, "preload.js") } });
  win.on("closed", () => (win = null));
  await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  ipcMain.handle("health", () => ({ ok: true, app: "palmier-pro-windows" }));
}
boot().catch((e) => { console.error(e); app.exit(1); });
