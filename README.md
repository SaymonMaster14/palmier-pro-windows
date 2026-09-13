# Palmier Pro Windows — community port (unofficial)

A real, working AI-native video editor for Windows, ported from the last GPLv3
Palmier Pro source. **Not an official Palmier product. No affiliation with palmier-io.**

- Upstream: `palmier-io/palmier-pro@8805801fa4df8bc2dbc57cb0a854a1f5108f95c6` (`last-gpl-source`)
- License: GPLv3 (see `LICENSE`, `docs/UPSTREAM_PROVENANCE.md`)
- Migration ledger: `PORTING_LEDGER.md` (authoritative; only `PASS` = tested working)

## Current status (2026-09-13, honest)

- [x] Core domain: frame-exact time, project/sequence/track/clip model, single-owner
      store, undo/redo, atomic persistence — 7/7 unit tests green
- [x] Vertical slice (Node): probe real media → place/split/delete/overlay/text →
      save/reopen → H.264 export → ffprobe validation — `SLICE PASS`
- [x] Electron app shell: launches headless with BOOT-OK, demo project from real media, IPC state/ops/clipAt (PALM_SMOKE/PALM_DEMO) (`apps/editor`), not yet launch-verified
- [ ] Timeline UI, preview playback, inspector, agent chat: not started
- [x] MCP server: live in app on 127.0.0.1:19789; external-client E2E PASS (place/readback/undo/redo)

## Requirements

- Windows 11 x64, Node 20+, FFmpeg 7+ with `ffmpeg`/`ffprobe` on PATH

## Setup / dev / test

```powershell
npm install
npm run build -w packages/core
node --test packages/core/dist/test/*.test.js
powershell -ExecutionPolicy Bypass -File scripts/make-fixtures.ps1
node packages/core/dist/scripts/vertical-slice.js
```

## Packaging / MCP / limitations

Packaged installer and MCP transport E2E land after the Electron shell is wired
to the core store. See `PORTING_LEDGER.md` for per-subsystem status.
Do not advertise beyond the checklist above.

## Troubleshooting

If Electron dist contains only locales/ after install, the postinstall extractor stalled on this host. Re-extract the cached zip into node_modules/electron/dist, write electron.exe into node_modules/electron/path.txt, then re-run npx electron --version.
