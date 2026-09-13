"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("palmier", {
  health: () => ipcRenderer.invoke("health"),
  state: () => ipcRenderer.invoke("state"),
  op: (name, args) => ipcRenderer.invoke("op", name, args),
  audioAt: (seqId, frame) => ipcRenderer.invoke('audioAt', seqId, frame),
  audioAt: (seqId, frame) => ipcRenderer.invoke("audioAt", seqId, frame),
  clipAt: (seqId, frame) => ipcRenderer.invoke("clipAt", seqId, frame),
  thumbAt: (assetId, atSec) => ipcRenderer.invoke("thumbAt", assetId, atSec),
  thumb: (assetId) => ipcRenderer.invoke("thumb", assetId),
  waveform: (assetId, buckets) => ipcRenderer.invoke("waveform", assetId, buckets),
  evalKeys: (seqId, clipId, frame) => ipcRenderer.invoke("evalKeys", seqId, clipId, frame),
  agentRun: (text, ctx) => ipcRenderer.invoke("agentRun", text, ctx),
  getSettings: () => ipcRenderer.invoke("getSettings"),
  setSettings: (patch) => ipcRenderer.invoke("setSettings", patch),
  exportStart: (outPath) => ipcRenderer.invoke("exportStart", outPath),
  exportStatus: (id) => ipcRenderer.invoke("exportStatus", id),
  exportCancel: (id) => ipcRenderer.invoke("exportCancel", id),
  onExportProgress: (cb) => ipcRenderer.on("export-progress", (_e, j) => cb(j)),
  snapMove: (seqId, clipId, rawStart, ph) => ipcRenderer.invoke("snapMove", seqId, clipId, rawStart, ph),
  saveProject: (p) => ipcRenderer.invoke("saveProject", p),
  openProject: (p) => ipcRenderer.invoke("openProject", p),
  newProject: (name) => ipcRenderer.invoke("newProject", name),
  listRecents: () => ipcRenderer.invoke("listRecents"),
  importMedia: (paths) => ipcRenderer.invoke("importMedia", paths),
  exportActive: (outPath) => ipcRenderer.invoke("exportActive", outPath),
  geom: () => ({
    pxToFrame: (...a) => ipcRenderer.sendSync("geomSync", "pxToFrame", a),
    frameToPx: (...a) => ipcRenderer.sendSync("geomSync", "frameToPx", a),
  }),
  onStoreChanged: (cb) => ipcRenderer.on("store-changed", (_e, rev) => cb(rev)),
});









