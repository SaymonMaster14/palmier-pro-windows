'use strict';
const { spawn } = require('node:child_process');
const PORT = 19789 + Math.floor(Math.random() * 2000);
process.env.PALM_MCP_PORT = String(PORT);
async function main() {
  const app = spawn('node_modules/electron/dist/electron.exe', ['apps/editor'], { env: { ...process.env, PALM_DEMO: '1', PALM_HEADLESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const kill = () => { try { app.kill(); } catch {} };
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/health'); if ((await r.json()).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
    const { execSync } = require('node:child_process');
    void execSync;
    const WebContents = null;
    console.log('APP-UP');
  } finally { kill(); await new Promise((r) => setTimeout(r, 1500)); try { require('node:child_process').execSync('taskkill /F /IM electron.exe'); } catch {} }
}
main();
