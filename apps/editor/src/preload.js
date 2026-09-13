"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("palmier", {
  health: () => ipcRenderer.invoke("health"),
  state: () => ipcRenderer.invoke("state"),
  op: (name, args) => ipcRenderer.invoke("op", name, args),
  clipAt: (seqId, frame) => ipcRenderer.invoke("clipAt", seqId, frame),
});
