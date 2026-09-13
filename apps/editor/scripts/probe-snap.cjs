'use strict';
const { spawn } = require('node:child_process');
const PORT = 19789 + Math.floor(Math.random() * 2000);
process.env.PALM_MCP_PORT = String(PORT);
const BASE = 'http://127.0.0.1:' + PORT + '/mcp';
async function main() {
  const app = spawn('node_modules/electron/dist/electron.exe', ['apps/editor'], { env: { ...process.env, PALM_DEMO: '1', PALM_HEADLESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const kill = () => { try { app.kill(); } catch {} };
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE.replace('/mcp', '/health')); if ((await r.json()).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
    const snapped = await appSnap(33);
    if (snapped !== 30) throw new Error('no snap: ' + snapped);
    console.log('SNAP-IPC-PASS snapped=30');
  } finally { kill(); await new Promise((r) => setTimeout(r, 1500)); try { require('node:child_process').execSync('taskkill /F /IM electron.exe'); } catch {} }
}
async function appSnap() { throw new Error('placeholder'); }
main().catch((e) => { console.error('SNAP-IPC-FAIL', e.message); process.exit(1); });
