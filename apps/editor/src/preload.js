"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("palmier", {
  health: () => ipcRenderer.invoke("health"),
  state: () => ipcRenderer.invoke("state"),
  op: (name, args) => ipcRenderer.invoke("op", name, args),
  clipAt: (seqId, frame) => ipcRenderer.invoke("clipAt", seqId, frame),
  saveProject: (p) => ipcRenderer.invoke("saveProject", p),
  openProject: (p) => ipcRenderer.invoke("openProject", p),
  geom: () => ({
    pxToFrame: (...a) => ipcRenderer.sendSync("geomSync", "pxToFrame", a),
    frameToPx: (...a) => ipcRenderer.sendSync("geomSync", "frameToPx", a),
  }),
  onStoreChanged: (cb) => ipcRenderer.on("store-changed", (_e, rev) => cb(rev)),
});

