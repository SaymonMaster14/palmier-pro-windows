"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("palmier", { health: () => ipcRenderer.invoke("health") });
