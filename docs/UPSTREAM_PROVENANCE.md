# Upstream provenance — Palmier Pro Windows port (community, unofficial)

- Upstream repository: `palmier-io/palmier-pro`
- Tag: `last-gpl-source`
- Tag object SHA: `9101d455991fac2cdf186e2073ce37a4c85505fe`
- Resolved commit SHA (peeled): `8805801fa4df8bc2dbc57cb0a854a1f5108f95c6`
- Upstream commit date: 2026-08-24 (`Merge pull request #572 from palmier-io/cursor/agent-generation-model-recommendation`)
- Upstream license: GPLv3 (see `LICENSE`, copied verbatim from upstream at port start)
- Date inspected: 2026-09-13
- Reference checkout (read-only, outside app source tree): `../palmier-pro-upstream` (detached HEAD at pinned SHA, `--depth 1 --branch last-gpl-source`)
- This repository: community Windows port. Not an official Palmier product. No affiliation with palmier-io.

## What was reused

- Nothing copied verbatim yet. Architecture, invariants and UX studied from `README.md`, `AGENTS.md`, `Package.swift`, `Sources/PalmierPro/*` (415 Swift files), `Tests/PalmierProTests/*` (198 test files).
- `LICENSE` copied verbatim from upstream GPLv3 source.

## What was rewritten

- Everything: TypeScript domain model, Electron shell, FFmpeg media pipeline, MCP server. Clean-room port, no Swift code carried over (Swift/AVFoundation/Metal cannot run on Windows).

## Apple-subsystem replacements

| Apple layer | Windows replacement |
|---|---|
| SwiftUI/AppKit | Electron + renderer (React target; minimal HTML renderer until React wiring lands) |
| AVFoundation (AVAsset/Reader/Writer, AVPlayer) | ffprobe metadata + FFmpeg filter_complex export + HTMLVideo/WebCodecs preview |
| CoreImage/Metal | Canvas/WebGL/WebGPU effect pipeline (CPU/FFmpeg filters first) |
| Accelerate | Typed arrays / WASM later; plain TS first, profile before native |
| CoreText/AppKit text | Browser text + FFmpeg drawtext for burned-in export |
| Sparkle | electron-updater (later) |
| Apple notifications | Electron/Windows notifications (later) |
| MLX / Apple speech | Provider abstraction; no local Apple runtime ported |
| Swift MCP SDK | Node HTTP MCP-style JSON-RPC surface (`packages/core/src/mcp.ts`) |
| .palmier package + FileIO/ProjectPackageCoordinator | JSON project file + atomic tmp+rename writes (`persistence.ts`) |
| EditorUndo (AppKit-integrated) | Single-owner `EditorStore` undo/redo (`store.ts`) |
