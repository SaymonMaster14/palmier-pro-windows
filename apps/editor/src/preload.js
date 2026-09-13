"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("palmier", {
  health: () => ipcRenderer.invoke("health"),
  state: () => ipcRenderer.invoke("state"),
  op: (name, args) => ipcRenderer.invoke("op", name, args),
  clipAt: (seqId, frame) => ipcRenderer.invoke("clipAt", seqId, frame),
  thumb: (assetId) => ipcRenderer.invoke("thumb", assetId),
  waveform: (assetId, buckets) => ipcRenderer.invoke("waveform", assetId, buckets),
  evalKeys: (seqId, clipId, frame) => ipcRenderer.invoke("evalKeys", seqId, clipId, frame),
  snapMove: (seqId, clipId, rawStart, ph) => ipcRenderer.invoke("snapMove", seqId, clipId, rawStart, ph),
  saveProject: (p) => ipcRenderer.invoke("saveProject", p),
  openProject: (p) => ipcRenderer.invoke("openProject", p),
  importMedia: (paths) => ipcRenderer.invoke("importMedia", paths),
  exportActive: (outPath) => ipcRenderer.invoke("exportActive", outPath),
  geom: () => ({
    pxToFrame: (...a) => ipcRenderer.sendSync("geomSync", "pxToFrame", a),
    frameToPx: (...a) => ipcRenderer.sendSync("geomSync", "frameToPx", a),
  }),
  onStoreChanged: (cb) => ipcRenderer.on("store-changed", (_e, rev) => cb(rev)),
});






