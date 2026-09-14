# Porting ledger (authoritative migration ledger)

Pinned upstream: `palmier-io/palmier-pro@8805801fa4df8bc2dbc57cb0a854a1f5108f95c6` (`last-gpl-source`, 2026-08-24). Reference: `../palmier-pro-upstream`.

States: NOT_STARTED INVESTIGATING BLOCKED IMPLEMENTING IMPLEMENTED_UNVERIFIED PASS DEFERRED_WITH_REASON. Only PASS = tested behavior known to work.

## Subsystems

| # | Upstream subsystem / files | Purpose | Apple dep | Windows replacement | Owner | Status | Test | Gaps / evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | App bootstrap (`App/`, `PalmierProApp`, WindowController) | launch, windows, lifecycle | SwiftUI/AppKit | Electron main+renderer | apps/editor | IMPLEMENTING | none yet | skeleton next |
| 2 | Project model+package (`Models/ProjectFile`, `Project/`, FileIO, ProjectPackageCoordinator) | project lifecycle, atomic save | FileIO/Foundation | `core/persistence.ts` JSON+tmp/rename | core | IMPLEMENTING | unit pending | save/reopen test next |
| 3 | Editor domain+ViewModel (`Editor/ViewModel/*` ~35 files: ClipMutations, Linking, Ripple, Clipboard, Nesting, Multicam, Sync) | canonical mutations | AVFoundation types | `core/store.ts`+`model.ts` | core | IMPLEMENTING | unit pending | ripple/nest/multicam later |
| 4 | EditorUndo (`Editor/EditorUndo.swift`) | undo/redo, coalescing | AppKit undo | `core/store.ts` history | core | IMPLEMENTING | unit pending | interleaving UI/Agent test pending |
| 5 | Time model (PASS 2026-09-13: 3 unit tests; slice export dur 3.000s) (CMTime scales, SourceMediaTimebase, TimelineGeometry) | frame-exact timing | CMTime | `core/time.ts` fps-rational frames | core | IMPLEMENTING | unit pending | VFR policy pending |
| 6 | Timeline UI+engines (`Timeline/*` 26 files: SnapEngine, Geometry, Ruler, DragState, RippleEngine, OverwriteEngine) | move/trim/split/snap/zoom/seek | SwiftUI/Drag | renderer timeline canvas | editor+core | NOT_STARTED | — | domain ops first |
| 7 | Preview (`Preview/*` 21: VideoEngine, TimelineRenderer, CompositionBuilder, ScrubAudio) | timeline-aware playback | AVPlayer/AVAssetReader | HTMLVideo/WebCodecs + FFmpeg thumbs | editor+core | NOT_STARTED | — | cuts→preview contract pending |
| 8 | Compositing (`Compositing/*` 23) + Metal/CI kernels (`Metal/`, Plugins/MetalCIKernelPlugin) | transforms/crop/opacity/blend | CoreImage/Metal | Canvas/WebGL/WebGPU, FFmpeg filters for export | core/renderer | NOT_STARTED | — | start CPU/FFmpeg, GPU after profile |
| 9 | Effects/inspector (`Inspector/*` 22, Editor ClipSettings/Keyframes/Layout/Matte/ChromaKey) | params, keyframes, inspector | CoreImage | `core` effect params + renderer controls | core+editor | NOT_STARTED | — | per-effect entries as discovered |
| 10 | Audio (`Audio/*` 13: meters, scrub, beat, VAD, enhance, AITransition) | import/place/trim/volume/mix/waveform | CoreAudio/AVFoundation | WebAudio preview + FFmpeg audio filters | core+editor | NOT_STARTED | — | metering/fades/envelopes tracked separately |
| 11 | Text/graphics (`Models/TextStyle/Layout/Animation/FillMode`, Captions/*) | text clips, captions | CoreText | browser text + drawtext burn-in | core+editor | NOT_STARTED | — | overlay-only forbidden; export must burn in |
| 12 | Media import/library (`MediaPanel/*` 29, MediaAsset/Manifest/Resolver/Folder) | import, probe, relink, thumbs | AVFoundation/UTType | `core/media.ts` ffprobe + workers | core | IMPLEMENTING | integration pending | rotation/alpha/VFR/corrupt cases pending |
| 13 | Export (`Export/*` 9: ExportService/Queue/Options, HDR, FCPXML/XML, PalmierProjectExporter) | H.264 MP4 + others | AVAssetWriter | `core/export.ts` FFmpeg filter_complex | core | IMPLEMENTING | integration pending | HDR/FCPXML deferred until base MP4 PASS |
| 14 | Persistence/search/index (`Search/*` 10, MediaManifest, Transcript index) | media indexing, visual/transcript search | MLX/Apple search | worker index + ffprobe thumbs (transcript later) | core | NOT_STARTED | — | must not block editor slice |
| 15 | Transcription (`Transcription/*` 6, speech-swift/MLX trait BundledSpeech) | transcripts, captions, silence/deadair | MLX/speech-swift | provider abstraction (no Apple runtime) | core | DEFERRED_WITH_REASON | — | Apple-runtime port impossible; provider interface only |
| 16 | Agent tools (`Agent/*` ToolExecutor+*.swift ~30 files: Clips/Timeline/Media/Import/Texts/Color/Effect/Markers/Words/Captions/Sync/Multicam/Export/Projects/Search/Skills) | intent-level editing ops w/ receipts | — (logic) | `core/agentTools.ts` on same domain ops | core | NOT_STARTED | — | receipts: ids/ranges/warnings/noop/errors |
| 17 | MCP server (`Agent/MCP/*`: MCPHTTPServer/MCPService, port 19789 /mcp) | external agent control | Swift MCP SDK | `core/mcp.ts` HTTP JSON-RPC (MCP SDK later) | core | IMPLEMENTING | e2e pending | must share domain ops; no raw JS exec |
| 18 | Agent chat/panel (`Agent/Chat|Panel|Clients|Skills/*`, ViewModel AIEdit/AgentActivity) | in-app agent UX | SwiftUI + providers | renderer panel + provider interface | editor+core | NOT_STARTED | — | — |
| 19 | Generation (`Generation/*` 36: Seedance/Kling/Nano Banana, providers) | image/video gen in timeline | closed-source svc | provider interface, local-fixture tested | core | DEFERRED_WITH_REASON | — | no hard-wired paid vendor; baseline editor needs no creds |
| 20 | Home/settings/help/telemetry (`Home/*` 9, `Settings/*` 15, `Help/*` 5, Telemetry, Backend, Account) | entry, prefs, help, updates | Sparkle/Clerk/Convex/Sentry/PostHog | Electron equivalents later | editor | NOT_STARTED | — | telemetry/auth out of scope for slice |
| 21 | Design system (`UI/*` 23, AppTheme) | tokens, no hardcoded style | — | CSS tokens mirror | editor | NOT_STARTED | — | centralize before UI polish pass |
| 22 | Localization (`Localization/*`, L10n, 14 locales) | UI strings | — | i18n later | editor | NOT_STARTED | — | contracts/persistence stay machine-facing English |

## Acceptance mapping (A-N) 2026-09-13: core slice PASS (unit 7/7; vertical-slice SLICE PASS: h264+aac 640x360 3.000s, ffprobe ok, frames extracted). Electron BOOT skeleton only, launch unverified. MCP transport E2E pending. Full A-N table still ahead.


## 2026-09-13 turn 2 evidence

- A BOOT: PASS. \PALM_SMOKE=1 PALM_DEMO=1 PALM_HEADLESS=1 npx electron apps/editor\ -> DEMO-LOAD ok, MCP-LISTEN 19789, SMOKE-STATE-SEQ 1, BOOT-OK, exit 0. IPC handlers registered before loadFile (no-handler race fixed). Headless GPU log noise only.
- J MCP READ: PASS. External node client over HTTP 127.0.0.1:19789/mcp: getProject/listClips/timelineContext against running app.
- K MCP WRITE: PARTIAL. placeClip via MCP -> readback 1->2, undo ->1, redo ->2, final undo, all through real transport on live store (\
ode apps/editor/scripts/run-mcp-e2e.js\ -> MCP-E2E-PASS, RUN-MCP-E2E-PASS). UI-live-reflection of MCP edits still pending.
- #1 App bootstrap: PASS. #17 MCP server: PASS (transport). #7 Preview: IMPLEMENTING (source file preview + clipAt highlight + seek; multi-layer/effects pending).
- Electron binary note: npm postinstall extraction yields only locales/ on this host; workaround is Expand-Archive of the cached zip + path.txt (see README troubleshooting).


## 2026-09-13 turn 3 evidence

- D TIMELINE: interactions now mutate the canonical store through the same ops as MCP: drag=moveClip, edge handles=trimStart/trimEnd, click=select, Del=deleteClip, header split/undo/redo. Smoke proves renderer IPC op path (SMOKE-UI-OP true:2). Timeline geometry (pxToFrame/frameToPx) lives in core/model.ts with unit test; renderer calls it via sync IPC (SMOKE-GEOM function), no duplicated math.
- E PREVIEW: timeline->source mapping in renderer (clipAt + sourceInFrame offset), so cuts/seeks show the edit; multi-track compositing in preview still pending.
- K MCP WRITE: now FULL for the covered paths — store mutations broadcast store-changed, renderer auto-refreshes, so MCP edits appear in the open UI. Evidence: RUN-MCP-E2E-PASS + refresh subscription in renderer.
- Suite: 8/8 unit green; vertical slice SLICE PASS (h264+aac 3.000s); smoke BOOT-OK.

## 2026-09-13 turn 4 evidence

- I EXPORT: multi-source base layer (red/blue proven by frame luma: gap near-black, content +20), timeline gaps filled with black/silence so export duration matches the model, audio mix per-clip volume/mute with truthful warnings for video-only assets, still-image probe (durationSec 0 + still flag).
- Export hang root-caused: infinite -loop image input + audio map = never-ending transcode (bisected to overlay+audio combo). Fix: bound every looped input with -t expectSec. Verified: repro exit 0, 9/9 unit green, SLICE PASS (h264+aac 3.000s).
- Note: ffmpeg 9 emits no signalstats YAVG lines; export test computes mean luma from rawvideo in JS instead.

## 2026-09-13 turn 5 evidence

- B PROJECT + H PERSISTENCE: PASS at app level. saveProject/openProject IPC, PALM_PROJECT boot load, store.loadFrom (clears undo history across projects), Save button in renderer. run-persist-e2e.js: edit in running app -> save -> quit -> reboot from file -> identical clip IDs/ranges (PERSIST-E2E-PASS clips=2).
- Regressions green: smoke BOOT-OK + UI-OP true:2 + GEOM function; MCP-E2E-PASS; 9/9 unit.

## 2026-09-13 turn 6 evidence

- C IMPORT in app: importMedia IPC (native dialog when no paths) + probe/kind/duration + auto-place on first unlocked matching track, tracks created if missing. SMOKE-IO-IMPORT 3:4:5 against the running app.
- I EXPORT in app: exportActive IPC + ffprobe validation with honest audio fallback note. SMOKE-IO-EXPORT 271527:true.
- Regressions: PERSIST-E2E-PASS, MCP-E2E-PASS, 9/9 unit.

## 2026-09-13 turn 7 evidence

- F/G INSPECTOR: setTransform/setOpacity store ops (validated, no-op aware) + setVolume path exposed; addTrack op added to store+main+MCP after the agent task exposed the gap. Renderer inspector edits selected clip (x/y/scale/opacity/volume).
- L AGENTIC (scripted): agent-task.js via real MCP transport: inspect -> setTransform/Opacity/Volume -> addTrack V2 -> text -> save -> export -> validate -> undo. AGENT-TASK-PASS export=78120b dur=3.000s.
- Regressions: 10/10 unit, smoke BOOT-OK + IO 3:4:5/271527:true, MCP-E2E-PASS, PERSIST-E2E-PASS.

## 2026-09-13 turn 8 evidence

- M PACKAGED: PASS (portable). PalmierProWindows-0.0.1-portable.exe (~85 MB) + win-unpacked verified: DEPS ffmpeg/ffprobe logged, PROJECT-LOAD real project, SMOKE-STATE-SEQ 1, SMOKE-UI-OP true:2, SMOKE-GEOM function, BOOT-OK, MCP getProject over HTTP against packaged app (PKG-MCP-PROJECT, PORTABLE-HEALTH true).
- Boot dependency check: ffmpeg/ffprobe versions logged at startup, error dialog when missing (FFmpeg stays a system requirement, documented).

## 2026-09-13 turn 9: N FINAL E2E + parity review (sec 38)

- N FINAL E2E: PASS on packaged app (win-unpacked). Chain: import av+img+audio via MCP -> split video -> delete section -> trim image -> overlay on V2 + scale 0.5 -> text on V3 -> volume 0.7 -> save -> quit -> reopen (identical IDs/ranges) -> MCP setOpacity -> readback -> undo -> redo -> export H.264 -> ffprobe audio,video dur=3.000 + decode ok. FINAL-E2E-PASS bytes=97721 dur=3.000 streams=audio,video clips=4.
- Harness flake fixed: per-run random MCP ports in all 4 e2e scripts (was: fixed 19789 cross-talk between consecutive runs).

### Parity vs upstream (honest, per area)

- Project/package/lifecycle: PARTIAL-PASS (new/save/reopen/atomic JSON; no .palmier bundle, no Save-As-into-package media copy, no relink UI).
- Timeline ops (move/trim/split/delete/link-agnostic): PARTIAL (no ripple/overwrite engines, no nesting, no multicam, no slip/slide, no multi-select, no snap/zoom/waveform UI).
- Undo/redo: PASS for covered ops (shared history UI+MCP, no-op guards).
- Preview: PARTIAL (source-mapped cuts/seek; no multilayer compositing, no effects, no scopes, no scrub-audio).
- Compositing/effects: PARTIAL (export: scale-crop/overlay/opacity/text; no color/grade/keyframes/blend/crop-inspector/chroma/matte in UI).
- Audio: PARTIAL (import/trim/mix/volume/mute/export-sync; no meters/waveform/fades/envelopes/beat/VAD/enhance).
- Text/captions: PARTIAL (place/edit/preview-map/export burn-in; no animation/fill-modes/caption import).
- Export: PARTIAL-PASS for H.264 MP4 (gaps, multisource, overlays, text, mix, validation); no HDR/FCPXML/XML/project-export/queue UI.
- Agent tools: PARTIAL (~14 intent tools w/ receipts; upstream has ~30 incl. color/captions/words/sync/multicam/organize/search/skills).
- MCP: PASS for covered surface (HTTP real transport, read/write/undo/redo/import/export).
- Generation: DEFERRED (provider interface only, per plan). Transcription: DEFERRED (Apple runtime). Search/index: NOT_STARTED. Agent chat/panel: NOT_STARTED. Home/settings/telemetry/auth: NOT_STARTED. Design tokens: NOT_STARTED. Localization: NOT_STARTED.

## 2026-09-13 turn 10 evidence

- Ripple (upstream RippleEngine parity, single-track scope): pure computeRippleShifts in core/model.ts, store.rippleDelete as one undo unit, MCP + main OPS + Shift+Delete in renderer. Unit (gap closes same-track only, other track untouched, undo restores) + live RIPPLE-MCP-PASS starts=0,90.
- Suite 11/11 green; smoke BOOT-OK.

## 2026-09-13 turn 11 evidence

- Markers (upstream TimelineMarker parity): id/name/start/duration/color/comment/status, name<=120 + comment<=4000 validation, store add/remove with undo, MCP add/remove/list, renderer ruler ticks + M-to-add. Unit + live MARKER-MCP-PASS (add/readback/undo).
- Suite 12/12 green.

## 2026-09-13 turn 12 evidence

- Snapping (upstream SnapEngine parity, clip/marker/playhead scope): pure collectSnapTargets/snapProbe/snapClipStart in core, snapMove IPC (threshold 6f, playhead + markers as targets), drag-move commits through it. Unit + live SMOKE-SNAP 90.

## 2026-09-13 turn 13 evidence

- Waveform: core waveformPeaks (mono 8kHz decode, bucketed peaks, mtime cache, single-flight bound), unit (tone-vs-silence contrast, cache identity, errors), waveform IPC + preload, canvas rendering on audio clips. Live SMOKE-WV 50:0.125.

## 2026-09-13 turn 14 evidence

- Search (first slice): core searchProject/searchSequence (media names+kinds, clip names+text, marker names+comments, ranked, capped), MCP search case, renderer media filter box. Unit + SMOKE-SEARCH 4|4 of 4 + live SEARCH-MCP-PASS n=2. Visual/transcript indexes stay deferred.

## 2026-09-13 turn 15 evidence

- Fades: Clip fadeInFrames/fadeOutFrames (validated, sum<=duration, backfilled ?? 0 for old projects), store.setFade, export video fade(alpha) + afade, MCP + main OPS + inspector seconds inputs. Filter-graph unit + real FADE-EXPORT ok dur=3.000s. Suite 16/16.

## 2026-09-13 turn 16 evidence

- Overwrite (upstream OverwriteEngine parity): pure computeOverwrite (remove/trimEnd/trimStart/split), store.overwritePlace as one undo unit, MCP + main OPS + Alt+drag in renderer. Unit covers all four actions + region math + undo. Suite 18/18.

## 2026-09-13 turn 17 evidence

- Audio meter: WebAudio analyser tapped on preview element, peak bar canvas with clip indicator, autoplay-safe resume. Live SMOKE-METER true:220 (analyser on during real playback). No calibrated dB claims.

## 2026-09-13 turn 18 evidence

- Design tokens: all hardcoded UI color literals centralized in :root (AppTheme discipline); canvas paint reads tokens via cssVar. No literals outside tokens. Smoke suite still BOOT-OK.

## 2026-09-13 turn 19 evidence

- Keyframes (upstream KeyframeTrack parity, numeric scope): sorted upsert, linear/hold/smooth eval, store set/remove with validation+undo, MCP, evalKeys IPC, inspector live op/vol at playhead. Unit + SMOKE-KEYS 0.2. Export honoring keyframes explicitly deferred.

## 2026-09-13 turn 21 evidence

- Thumbnails (first MediaVisualCache slice): core thumbnail() (seek+fallback for stills, sha1 cache key, empty-output retry), thumb IPC (userData cache), media-panel imgs (audio skipped honestly). Unit + live SMOKE-TH 3 loaded @160px.

## 2026-09-13 turn 22 evidence

- Keyframe UI: key op/vol @playhead buttons + key list with remove, all on canonical ops. Live SMOKE-KEYUI 1 (real click path creates key).

## 2026-09-13 turn 23 evidence

- Keyframe lane: key dots on clips (opacity/volume), dblclick adds key at playhead with base value. Live SMOKE-KEYLANE 1:1.

## 2026-09-13 turn 24 evidence

- Dissolve transitions: Clip.transitionOutFrames + setTransition (validated), export xfade/acrossfade fold with timebase normalization, program shortens honestly (expectSec from fold). Blend proven by luma (mid between colors), 1.5s duration. MCP + OPS + inspector seconds input. Suite 21/21 + slice green.

## 2026-09-13 turn 25 evidence

- Clip speed 0.25-4: setSpeed op, export honors via source-range + setpts/atempo, preview source mapping fixed, MCP + OPS + inspector. Export proof 2x->3s with audio. Suite 22/22 + slice green.

## 2026-09-13 turn 26 evidence

- Project entry: New/Open header buttons, recents (userData, capped/deduped/existence-filtered) with click-to-open, save/open touch recents. Fixed notify scoping bug (registerIpc out of boot scope). SMOKE-PROJ true:0:3.

## 2026-09-13 turn 27 evidence

- Local command agent: core parseAgentCommand (split/marker/text/volume/delete/ripple/undo/redo with context validation + honest errors), agentRun IPC on canonical ops, chat panel with receipts. Unit + SMOKE-AGENT marker: |error. LLM provider explicitly deferred.

## 2026-09-13 turn 28 evidence

- Preview rate: 0.5/1/1.5/2x selector driving video.playbackRate (browser keeps AV sync; timeline mapping already time-based). Live SMOKE-RATE 2.

## 2026-09-13 turn 29 evidence

- Settings: persisted settings.json (mcpPort validated, restart note), getSettings exposes FFmpeg versions, renderer panel with save. SMOKE-SETS true:threw:true.

## 2026-09-13 turn 30 evidence

- Volume keyframes in export: per-frame volume expressions (eval=frame required on this FFmpeg build), verified by volumedetect ramp. Overlapping audio now mixes (adelay+amix clusters) instead of concatenating; overlap stays 3s with audio. Suite 26/26 + slice green.

## 2026-09-13 turn 31 evidence

- Overlay opacity keys in export: colorchannelmixer proven init-only (no t/n per-frame eval), so HOLD steps via per-span sub-overlays; linear/smooth documented as hold-approximated in export. Step proven by redness (late > early + 20). Suite 27/27 + slice green.

## 2026-09-13 turn 32 evidence

- Crop inspector (upstream SetClipCrop parity): CropBox fractions + validation, setCrop op, export crop-zoom, MCP + OPS + inspector l,t,r,b input. Graph + real export proof. Suite 28/28.

## 2026-09-13 turn 33 evidence

- Blend modes (upstream SetClipBlendMode parity): normal/screen/multiply/overlay, full-frame blend path in export with gbrp conversion (YUV blend proven wrong: 216 vs 253), transform+blend falls back with warning. Proven screen>=250, multiply darkens. Suite 29/29.

## 2026-09-13 turn 34 evidence

- Rotation: transform.rotationDeg honored in export (base + overlays, in-frame fill black documented), inspector rot input. Graph + real export proof. Suite 30/30.

## 2026-09-13 turn 35 evidence

- Track mute/hide/lock: setTrackFlags op, lock enforced in shared req_clip (all mutating ops), export skips hidden video + muted audio, clipAt skips hidden, header M/H/L toggles. Unit + export proof. SMOKE-DOM 3:3.
- Caught latent renderer syntax break (unquoted attr since crop turn) via new SMOKE-DOM guard; fixed.

## 2026-09-13 turn 36 evidence

- Multi-select: Set-based selection, Ctrl+toggle, drag-all via moveClips, Delete-all one undo, inspector first-selected. Caught real validation gap (mover-vs-mover overlap) fixed with post-move layout check. SMOKE-MULTI 3:1,2,3:0.
- Fixed missing Agent panel HTML that threw at boot and silently killed later bindings; added renderer console-error capture (SMOKE-ERRS []) to prevent recurrence.

## 2026-09-13 turn 37 evidence

- Clip linking (upstream ManageClipLinks parity): linkGroup model, link/unlink ops, move/delete/ripple propagate to group in one undo unit, shared applyMoves layout check (caught mover-vs-mover overlap gap), Link/Unlink buttons + MCP. Unit links.test green. Suite 33/33.

## 2026-09-13 turn 38 evidence

- Subtitle import (first slice): SRT/VTT cue parse (timing+text, tags stripped, inline/standard layouts, group-index fix m[4]->m[3]), importSubtitles places text clips on a Subtitles track, MCP importSubs. Unit green. Suite 35/35.

## 2026-09-13 turn 39 evidence

- Export queue (§24): ffmpeg -progress pipe parsing to fractional progress, jobs map with start/status/cancel (AbortController, abort path unit-tested), renderer queue rows with live % + cancel, Export button queues. SMOKE-IO-EXPORT done:1 validated. Errors now report stderr tail. Suite 36/36.

## 2026-09-13 turn 40 evidence

- Packaging hygiene: readSettings scoping bug (masked in dev by env, fatal packaged) fixed; SNAP smoke made overlap-proof; smoke result-file for uncapturable packaged stdio.
- Rebuilt + re-verified packaged app: PROJECT-LOAD, BOOT-OK, MCP live, FINAL-E2E-PASS bytes=97690 dur=3.000. (Partial builder extraction + silent NSIS failures observed twice; clean rebuild fixed the former; portable single-exe still pending re-wrap.)

## 2026-09-13 turn 41 evidence

- Subtitle burn-in proof: imported SRT caption measurably adds edges vs no-caption frame in real export. Suite 37/37.

## 2026-09-13 turn 42 evidence

- Subtitle import path: .srt/.vtt routed in importAndPlace (UI dialog + MCP import), subtitle media kind, clips placed. Live SUBIMP subtitle/1. Suite 37/37.

## 2026-09-13 turn 43 evidence

- Text style (upstream TextStyle/Layout slice): align left/center/right + background box on text clips, setTextStyle op, drawtext x/box in export, MCP + inspector. Graph + real export proof. Suite 38/38.

## 2026-09-13 turn 44 evidence

- Multi-select UI + audio scrub grains (audioAt IPC, 150ms grains while paused) + missing Agent panel HTML fixed (was killing later bindings). SMOKE-MULTI 3:1,2,3:0, scrub path live. Suite 38/38.

## 2026-09-13 turn 45 evidence

- Scrub audio: audioAt IPC (timeline->source mapping, muted-aware), 150ms grains on seek while paused. Live SMOKE-SCRUB 1|atSec:0.333|true.

## 2026-09-13 turn 46 evidence

- Timeline filmstrip: per-clip thumbs at 25/50/75% source time via cached thumbAt IPC. Live SMOKE-STRIP 3:3.

## 2026-09-13 turn 47 evidence

- Repackaged with all features since last build (queue, links, subs, agent, settings, scrub, strips); portable exe fresh; FINAL-E2E-PASS bytes=97690 on packaged app.

## 2026-09-13 turn 48 evidence

- Queue cancel in-app: long export started via queue, cancelled mid-flight, status cancelled. Live SMOKE-QCANCEL cancelled.

## 2026-09-13 turn 49 evidence

- Repackaged current tree (portable fresh); FINAL-E2E-PASS bytes=97690 on packaged app.

## 2026-09-13 turn 50 evidence

- Font family (upstream TextStyle.fontName slice): Clip.fontFamily + FONT_FAMILIES allowlist (sans/serif/mono/arial/times/courier/verdana) + resolveFontFile (Windows Fonts mapping, null when missing) + fontFilterPath (filter-safe escaping). setTextStyle validates/backfills default sans/noop-aware/undoable. Export adds fontfile when resolvable, honest fallback otherwise. MCP setTextStyle passes patch through (no change needed). Inspector font dropdown + Apply now sends setTextStyle (align/bg/font) instead of silently dropping text style.
- Latent fixes: inspector Apply referenced undefined r9 (ReferenceError after the other ops; now r9 = setTextStyle receipt with .catch so non-text clips report honest failure instead of throwing). Main OPS allowlist was missing setTextStyle/linkClips/unlinkClips even though the renderer calls them (Link/Unlink buttons threw unknown-op; now allowed, sharing the same domain ops as MCP).
- Suite 39/39 green (textstyle.test.ts +1: validation/noop/undo/redo/graph fontfile/real export+validate). Smoke on dev app: SMOKE-FONT 0:none:times:true (Apply click exception-free, op-level set/readback live-proven) + BOOT-OK + ERRS [] + IO/MCP/PROJ/SETS/RATE/AGENT/SCRUB/WV all matching baseline.
- Baseline attribution (git stash + rebuild + same smoke, then pop): SMOKE-MULTI 14:...:14, SMOKE-KEYLANE place-fail, SMOKE-KEYUI 0 are IDENTICAL without this turn's diff — pre-existing smoke-order effects of the crowded post-pads timeline (delete-all leaves 14, fixed-start-0 place collides), not regressions. Recorded as known gaps for the timeline-smoke hardening pass.
- Known nuance: SMOKE-FONT c1=none means the Apply click acted on the previously-selected (video) clip rather than the synthetic-selected text clip — inspector re-render timing under synthetic selection needs a dedicated look during UI polish; op-level font flow is proven. Packaged build still predates this slice (re-verify on next packaging turn).

## 2026-09-13 turn 51 evidence

- ROOT CAUSE + FIX (real P0, user-visible): timeline clip HTML concatenated the audio waveform `<canvas>` INSIDE the unquoted `data-id` attribute (`data-id=<id><canvas...`), so every audio clip rendered with a corrupted DOM id (`<uuid><canvas`). Effects: multi-select Delete-all always failed whole-op (`clip not found` in req_clip validation, left=14); click move/select/keyframe on audio clips addressed a ghost id; timeline waveform canvases never existed as elements (only the IPC-level waveform worked). Fix is one line: single-quoted attributes, canvas as a real child element. No UUID-bearing attribute is ever unquoted now.
- Proof (dev-app smoke, same crowded post-pads state): SMOKE-MULTI 14:1..14:0:stalePre=0 (was :14), SMOKE-KEYLANE 1:1, SMOKE-KEYUI 1, SMOKE-ERRS [], BOOT-OK. Method: baseline-stash run proved the failure pre-existing; #log receipt mining surfaced `delete: ok:false clip not found`; temporary DOM-vs-store id forensics isolated the ghost (`<id><canvas`); probe scaffolding reverted, the stalePre check stays in SMOKE-MULTI as a permanent guard.
- Process note: first rewrite attempt using backslash-escaped quotes failed vm parse-check; an isolated line-level vm probe confirmed the failure and validated the single-quote rewrite before it touched the file. No core changes this turn, so unit suite stays 39/39 from turn 50.
- Known nuance carried: SMOKE-FONT c1=none (Apply click bound to previously-selected clip under synthetic selection; op-level font flow proven times:true, Apply click exception-free). Owned by the UI-polish pass, not this fix.

## 2026-09-13 turn 52 evidence

- Repackaged current tree (font slice + audio data-id fix + MULTI stalePre guard): prepackage rebuilt core (dist verified exposing resolveFontFile), electron-builder portable DONE-0, PalmierProWindows-0.0.1-portable.exe fresh 85,285,326b, postpackage vendor cleanup done. NSIS stage slow but clean this time, no flakes.
- Packaged re-verification (win-unpacked): FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 (byte count shifted vs 97690 because the text burn-in now carries fontfile — proof the new export graph is inside the packaged build). Kill-cleanup noise only.
- Unit suite unchanged this turn (no core edits; 39/39 stands from turn 50 on the identical tree).

## 2026-09-13 turn 53 evidence

- Bold/italic (upstream TextStyle isBold/isItalic slice): Clip.fontBold/fontItalic, FONT_VARIANTS table (arial/times/cour/verdana regular+bold+italic+boldItalic; irregular Windows names mapped explicitly, no suffix guessing), resolveFontFile(family, bold, italic) with regular fallback then honest null. setTextStyle validates booleans/backfills false/noop-aware/undoable. Export selects the variant file. Inspector B/I checkboxes wired through Apply. MCP passes through.
- Suite 40/40 green (new test: validation/noop/readback/variant resolution/undo/redo/graph fontfile/real export+validate). Dev-app smoke unchanged and green: MULTI stalePre=0 left=0, KEYLANE 1:1, KEYUI 1, ERRS [], BOOT-OK.
- Process note: two patch anchors missed on CRLF files (multiline anchor + same-line `}` assumption); fixed with single-line anchors. All patch scaffolding removed.

## 2026-09-13 turn 54 evidence

- Text entrance animation (upstream TextAnimation slice, entrance mode only): Clip.textAnim in [none, popIn, slideUp], setTextAnim op (text-only, allowlist, noop-aware, undoable), MCP + main OPS + inspector dropdown all wired (Apply sends it as r10 with honest failure receipt for non-text clips). Export: popIn approximated as alpha ramp (upstream pop is a scale pop; documented approximation), slideUp as y ramp over min(0.4s, half-duration); shared t0/t1 with the enable window. Typewriter + per-word presets (wordReveal/wordSlide/highlightPop/highlightBlock) DEFERRED: they need a word-timing model that does not exist yet.
- Proof: drawtext alpha/y expressions pre-verified on FFmpeg 9 with direct probes (early/late diffs 6795/11641); unit suite 42/42 including pixel proof (animated early-vs-late diff beats still-base control 5x+500) plus real export+validate. Dev-app smoke green with the renderer change: MULTI stalePre=0, ERRS [], BOOT-OK.

## 2026-09-13 turn 55 evidence

- Envelope editing by drag (timeline interaction parity): dots now sit at value height (opacity 0..1, volume 0..4, center-anchored via calc -3px so the dot tracks the cursor exactly by construction), and dragging a dot commits ONE moveKeyframe op on mouseup (remove-old + upsert-new in a single exec = single undo unit, same-domain-op rule kept for UI/MCP/agent). Plain click still selects (no-op commit skipped). New store.moveKeyframe validates track/value, preserves interpolation when omitted, noop-aware. Wired into main OPS, MCP dispatch, and a live SMOKE-KEYDRAG (synthetic drag with real clientX/Y through the actual event path).
- Proof: unit suite 43/43 (new keymove test: missing-key failure, bad-value rejection, atomic move, noop, undo/redo, interpolation carry); live SMOKE-KEYDRAG expF=44 keys=44=0.825 errs=0 — frame pixel-perfect, value within half-subpixel round-trip (0.025 on a 26px lane), no renderer errors. Full smoke otherwise unchanged and green.

## 2026-09-13 turn 56 evidence

- Repackaged current tree (text anim + keyframe drag): portable exe fresh 85,291,139b, postpackage cleanup done. NSIS/7za stage slow (~heavy compression) but clean; verified 7za alive before concluding stall.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 (N chain unaffected by new features, identical output expected), PLUS a one-off packaged MCP probe (deleted after): setTextAnim + setKeyframe + moveKeyframe + readbacks + undo/redo over real transport against win-unpacked — MCP-PROBE-PASS anim=slideUp key=278=0.3 undo-redo-ok.
- Probe debugging note: PALM_DEMO silently skips in the packaged app (fixtures live outside the asar), so a packaged probe must import absolute fixture paths first like FINAL-E2E does; fixed the probe accordingly instead of blaming the app.

## 2026-09-13 turn 57 evidence

- Review pass (§33) with teeth: cross-checked renderer op calls vs main OPS allowlist vs store methods vs MCP cases. Clean except MCP was missing trimStart (asymmetric with trimEnd) and the batch deleteClips/moveClips (agent had only single-clip variants, losing undo-atomic batch edits). Added the 3 dispatch cases (thin passthroughs, same pattern). No TODO/FIXME/HACK tags anywhere; unquoted-attr sweep: only static/integer-valued attrs remain (turn-51 class fully clean); C:\Windows fallback is env-overridable and fine for a Windows-only target.
- Fixed a Windows-portability wart in the smoke itself: QCANCEL exported to /tmp/qcancel.mp4 (nonexistent on Windows; only passed by cancel-timing luck). Now uses the default userData path. Verified SMOKE-QCANCEL cancelled.
- Proof: live dev-app MCP probe (deleted after): trimStart ranges [105,45], moveClips readback [120,180], batch delete + undo restore — MCP-PROBE61-PASS. Suite 43/43. Full smoke green on re-run.
- Flake honesty: one smoke run showed SMOKE-IO-EXPORT status:error (ffmpeg died at 11% with exit 3199971767); identical-tree retry passed (done). 8/8 prior runs done. Attributed to environmental pressure on a heavily-loaded host, not a regression — no code changed in the export path.

## 2026-09-13 turn 58 evidence (UI/UX overhaul pass 1)

- Reference work (read-only, outside repo): cloned Augani/openreel-video to ../openreel-ref; license is MIT (attribution recorded in docs/THIRD_PARTY_NOTICES.md). Studied its token system (dark cinematic + emerald, per-kind clip colors, timeline/track/stage tokens, density/rail metrics, NLE band layout) and upstream Palmier GPL UI (TimelineClipColors palette, WorkspaceLayout panels). No OpenReel source files copied; all CSS/HTML written fresh.
- Redesign of apps/editor/renderer (presentation only, zero domain changes): dark cinematic token system; topbar with grouped File/Edit/Media/Export actions; media panel with thumbnails + kind badges; black-stage preview with transport row (scrub + live timecode readout + rate) and slim meter; bottom timeline band (header + track-header rail with M/H/L + lanes + generated time ruler); per-kind clip gradients (Palmier palette: video teal-blue, audio green-teal, image purple, text amber for contrast); emerald selection; labeled inspector sections; slimmer scrollbars/checkbox accent. All functional ids/classes preserved byte-for-byte; geometry (34px rows, %-positioning) untouched.
- Behavior added by the pass: time ruler ticks in refresh, timecode readout in markActive, track-header rows restructured into aligned .trk rows (same buttons/ops), keyframe dots now value-positioned AND visible (see below).
- Bugs caught by the pass with live proof: (1) keyframe dots lost center-anchoring when the redesign added a 1px border (KEYDRAG value drifted 0.8->0.75); fixed with box-sizing + 3.5px centering, back to 0.786 (half-subpixel round-trip). (2) PS Set-Content BOM spliced mid-<style> silently killed the :root token block (page rendered unstyled: transparent bg, empty accent, no gradients); diagnosed via live cssRules/computed-style probe, fixed by stripping BOM. SMOKE-VISUAL stays as a permanent design guard (accent, kinds, band, ruler ticks, tc format, rail rows, primary Apply).
- Proof: full dev-app smoke green (all lines match pre-redesign baselines incl. MULTI stalePre=0, KEYLANE 1:1, KEYUI 1, ERRS [], BOOT-OK) + SMOKE-VISUAL acc=#10b981 kinds=k-video,k-text band=true ruler=5 tc=00:00:10 rail=2 applyCls=primary.

## 2026-09-13 turn 58 packaging

- Repackaged the redesigned tree: portable exe fresh 85,291,102b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 on win-unpacked (N chain unaffected by presentation-only changes, identical output expected and correct).

## 2026-09-13 turn 59 evidence (UI pass 2, Palmier fidelity)

- Read upstream AppTheme.swift values and shifted the theme toward the real Palmier dark UI: backgrounds to #18191c scale, clip selection outline white (was emerald), timecode amber #f29933, playhead Palmier red #ff524d, clip borders black. Emerald kept for brand dot, focus rings, slider thumb and primary Apply only (documented fusion).
- Taller lanes without touching drag math: rows 34->44px, clips 26->34px, band 268->284px with vertical lane scroll, rail padding corrected 30->12px to match trackTop base (latent misalignment fixed), trackTop step 34->44 in one place. Keyframe dot centering is lane-height independent by construction; live KEYDRAG value now 0.806 (was 0.786), frame still pixel-perfect.
- Details: media empty-state placeholder, track kind tags (A/V) in rail headers, transport shows position + total duration (00:00:10 / 00:04 cross-checked against 120-frame timeline).
- Proof: full smoke green, all lines at baseline, SMOKE-VISUAL still asserting (acc kept as brand token).

## 2026-09-13 turn 59 packaging

- Repackaged pass-2 tree: portable exe fresh 85,292,268b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 (presentation + lane-geometry changes do not affect the N render; identical output expected and correct).

## 2026-09-13 turn 60 evidence (UI pass 3)

- Text overlay in preview (functional gap, not just paint): text clips were export-only. markActive now renders the topmost visible text clip at the playhead into a #textov overlay (reuses the existing clipAt hit, same topmost-track ordering as export), honoring size (scaled to displayed video), color, align, family, bold, italic and bg box; hidden on every refresh so no stale frames. Toolbar Split/Undo/Redo gained unicode glyphs + titles; media thumbs 64->96px.
- Proof: new SMOKE-TEXTOV vis|text-ok through the real seek path; full smoke green (timecode now 00:03:05 / 00:04, cross-checked against seek=95f and 120f timeline).

## 2026-09-13 turn 60 packaging

- Repackaged pass-3 tree: portable exe fresh 85,292,539b, postpackage cleanup done. Mid-build scare disproven again: node parents go quiet while 7za works (184s CPU observed) — wait for the 7z artifact, not the parent CPU.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 (presentation-only delta, identical output expected and correct).

## 2026-09-13 turn 61 evidence (timeline zoom + playhead + sync fix)

- Timeline zoom (renderer-ephemeral VIEW window, never serialized): clips/markers/ruler all map through viewStart/viewDur; drag math uses the visible width; seek stays full-range; +/- fit-zoom controls in the timeline bar with % label; window.__setZoom test hook (established pattern). Fit mode output is byte-identical to pre-zoom math.
- Playhead was never positioned (static div since the timeline was built). markActive now places it in view coordinates and hides it outside the window.
- Real sync bug found via the zoom probe (not theory): the video timeupdate handler wrote FRAME = videoTime*FPS ignoring clip offset, so on any edited timeline every timeupdate yanked the playhead/seek to source time (seek 44 became 14 through a [30,90) clip). Inverts through the current clip now (asset-backed clips; text-on-top edge keeps prior behavior, documented gap). Single-clip-at-0 projects were immune, which is why E2E never caught it.
- Proof: SMOKE-ZOOM clip:true ph:true (clip % exact, playhead ~50% in-zoom, state untouched after reset) on the crowded timeline; full smoke otherwise at baseline with ERRS [] and BOOT-OK. Renderer-only change; unit suite untouched and standing.

## 2026-09-13 turn 61 packaging

- Repackaged zoom tree: portable exe fresh 85,292,232b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4 (renderer-only delta, identical output expected and correct).

## 2026-09-13 turn 62 evidence (keyboard shortcuts + preview text animation)

- Keyboard shortcuts (second document keydown listener, no interference with existing M/Delete): Space play/pause (skipped on focused buttons/fields to avoid double activation), arrows frame-step (native slider behavior preserved when it has focus), S split, +/- zoom, 0/F fit, Home/End bounds. All edit actions reuse the existing button handlers (zero duplicated logic).
- Preview text entrance animation: overlay span animates on clip change only (popIn fade / slideUp rise, CSS keyframes), so continuous playback and seeks within one clip never re-trigger it.
- Proof: SMOKE-PLAY play:true pause:true fwd:true back:true and SMOKE-TEXTOV vis|text-ok|anim=ppslide through real event paths; full smoke otherwise at baseline. Honest iteration: first PLAY run raced live playback (arrows vs timeupdate rewriting FRAME); fixed the probe to pause first instead of touching the app.

## 2026-09-13 turn 62 packaging

- Repackaged shortcuts+anim tree: portable exe fresh 85,292,860b, postpackage cleanup done.
- Builder flake hit again mid-turn: first attempt died silent (0-byte nsis.7z, idle parents, no DONE, no error). Recovered per precedent: removed the 0-byte artifact, re-ran, watched 7za CPU climb to completion (DONE-0). Health signal for future packaging turns: 7za CPU must keep climbing; idle parents + 0-byte artifact = dead, rebuild.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 63 evidence (text shadow + outline)

- Upstream TextStyle Shadow/Outline slice at port granularity (flags like textBg): Clip.textShadow/textOutline, setTextStyle validates/backfills/noop-aware/undoable, export adds drawtext shadow + borderw, inspector checkboxes wired through Apply, MCP pass-through.
- Proof: unit suite 44/44 (new test: validation/noop/readback/graph tokens/real export+validate); full dev-app smoke green with the renderer change (Apply path + ERRS [] guard the new checkboxes).

## 2026-09-13 turn 63 packaging

- Repackaged shadow/outline tree: portable exe fresh 85,293,459b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 64 evidence (timeline context menu)

- Right-click on clips (Split here at the click frame via zoom-aware mapping, Delete, Ripple delete, Add marker here) and on empty lane space (marker), all through the existing domain ops with structured log receipts; dismiss on any click. Empty-lane handler attached once to the persistent #tl node (never duplicated by refresh); clip items bound per render like the other clip handlers.
- Proof: SMOKE-CTX menu:split n0=3 n1=4 errs=0 through the real contextmenu event path; full smoke otherwise at baseline with ERRS [] and BOOT-OK.

## 2026-09-13 turn 64 packaging

- Repackaged context-menu tree: portable exe fresh 85,294,394b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 65 evidence (preview text fx parity)

- Preview overlay now honors textShadow (2px offset, mirroring export values) and textOutline (2px stroke) alongside the existing size/color/align/family/bold/italic/bg handling, closing the preview-vs-export gap from turn 63.
- Proof: SMOKE-TEXTOV vis|text-ok|anim=ppslide|fx=true:2px through the real seek path with computed-style readback; full smoke otherwise at baseline.

## 2026-09-13 turn 65 packaging

- Repackaged preview-fx tree: portable exe fresh 85,294,047b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 66 evidence (Home project entry)

- Home overlay (product entry surface, §18): brand card with project-name New, Open, Import delegations (Open/Import reuse the existing header handlers via click, zero duplicated logic) and a live recents list; shown iff the project has no sequences, as a fixed overlay so all editor DOM stays queryable; hides automatically on any refresh that yields a sequence.
- Self-caught placement bug: first wired syncHome() after the if (!SEQ) return in refresh, so Home never appeared exactly when needed (smoke proved home=none); moved before the early return, now home=flex recents=2/2 back=14:none.
- Proof: SMOKE-HOME (newProject empty -> overlay + rows -> reopen restores 14 clips and hides) through real IPC; full smoke otherwise at baseline with ERRS [] and BOOT-OK.

## 2026-09-13 turn 66 packaging

- Repackaged Home tree: portable exe fresh 85,297,172b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 67 evidence (per-track volume mixer)

- Track.volume (0..4, default 1) plumbed end to end: setTrackFlags accepts/validates it (exec JSON-compare gives noop for free), export multiplies it into the per-clip base that already feeds per-frame volume expressions (keyframes included), MCP passes through, rail headers show a volume slider on audio tracks committing on change (single undo per gesture, no per-tick spam).
- Proof: unit suite 45/45 (new trackvol test: validation/noop/readback/undo plus volumedetect export proof); live SMOKE-MIX op=0.5 slider=2 with restore to 1; full smoke otherwise at baseline.
- Honest iteration: first test run failed on threshold (2.7dB not 12dB) because the video clip s own full-volume audio masked the wav under test; muted the video clip to isolate, implementation untouched and correct.

## 2026-09-13 turn 67 packaging

- Repackaged mixer tree: portable exe fresh 85,296,720b, postpackage cleanup done. Also committed the .gitignore scaffolding guard (patch/probe/append scripts now ignored so git add -A can never sweep them in again).
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 68 evidence (§29 performance baseline)

- First real measurements on this host (dev app, MCP transport, 215-clip timeline, 42s 640x360 H.264 export): startup-to-healthy 1247ms; import 3 files 349ms; 10 placements 94ms (~9ms/op); export 3809ms = 11x realtime; 200 placements 2723ms (13.6ms/op incl. notify+refresh each); single moveClip 19ms; listClips 15ms / 96KB; app peak RSS UNMEASURED (tasklist parse failed, recorded honestly instead of inventing a number).
- Verdict per §5/§29: nothing pathological — sub-20ms interactions, 11x export, 1.2s startup. No optimization warranted; no code changed. Next profiling only if a workload complains.

## 2026-09-13 turn 69 evidence (duplicate clips)

- New duplicateClips domain op (one undo unit): deep-copies clips to their track ends with fresh ids, carries keyframes/fades/style, regroups internal links under a new group id (never links copies back to originals), validates existence/locks, rejects empty sets. Wired to Ctrl+D (field-guarded, no interference with typing), timeline context menu, main OPS and MCP.
- Proof: unit suite 46/46 (new dup test: placement, keyframe carry, link regrouping vs originals, undo/redo); live SMOKE-DUP n0=3 n1=1 uniq=true errs=0 through the real keydown path; downstream CTX/VISUAL lines shifted consistently (n0=4, total 00:05), full smoke otherwise at baseline.

## 2026-09-13 turn 69 packaging

- Repackaged duplicate tree: portable exe fresh 85,298,759b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 70 evidence (contextual inspector + keyList root-cause fix)

- Inspector is kind-aware now (mirrors the export support matrix, nothing hidden that works): Transform for video/image, Volume for video/audio, Timing fades everywhere except text, transition video/image, speed video/audio, Frame video/image, full Text section (now including size+color inputs) for text, key buttons per honored track. Apply guards every read with section presence (skipped ops report noop, one bad field no longer aborts the rest); all value inits null-safe.
- ROOT CAUSE fix with a two-turn history: keyList compared clip id to the SEL Set object (x.id === SEL), so it always threw, silently unbinding Apply and both key buttons (async rejection invisible to the old error hook). That single line explains KEYUI stuck at 0 and FONT c1=none across many turns. Fixed to sel0(). Added a permanent unhandledrejection hook to __errs so this bug class can never hide again (it immediately surfaced a second instance: direct .value assignments on kind-hidden inputs, also fixed null-safe).
- Honest probe correction: my first INSP assertion searched serialized HTML for fsec-t>Transform while browsers serialize fsec-t">Transform (quote) — the app was right, the probe wrong; fixed the assertion, not the app. Also fixed a PowerShell && slip and a quote-in-quote main.js breakage during the turn, both caught by node --check before any run.
- Proof: SMOKE-KEYUI 0->1, SMOKE-FONT c1 none->sans, SMOKE-INSP transform=true text=false errs=0, SMOKE-ERRS [] across the full run; everything else at baseline with BOOT-OK.

## 2026-09-13 turn 70 packaging

- Repackaged contextual-inspector tree: portable exe fresh 85,298,526b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 71 evidence (tracks, transition badge, color guidance)

- Add video/audio track buttons in the timeline bar (existing addTrack op, auto V/A names, refresh funnel); rail follows. Transition wedge badge on clips carrying transitionOutFrames (previously invisible state). Color input gained a guidance datalist (still free text, zero constraint risk).
- Proof: SMOKE-FX exp=1 got=1 errs=0 and SMOKE-TRACK tracks=2>3 rail=3 through real UI paths; full smoke otherwise at baseline with BOOT-OK.

## 2026-09-13 turn 71 packaging

- Repackaged tracks tree: portable exe fresh 85,300,554b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 72 evidence (export quality presets)

- ExportQuality draft/balanced/high threaded end to end: core qualityArgs (draft veryfast+crf28, high slow+crf18, balanced byte-identical default), validated in buildFfmpegArgs, ExportOpts passthrough, main IPC (queue + direct), preload, MCP export, header quality select wired into the Export button. Default path unchanged by construction.
- Proof: unit suite 47/47 (new test: per-quality flags in args, bad-quality rejection, all three export+validate, draft<high bytes); live SMOKE-IO-EXPORT done via the draft queue path; full smoke green with BOOT-OK.
- Flake honesty, second data point: one run showed the known ffmpeg exit 3199971767 at 11.5% (turn-57 signature); identical retry passed. Unit exports with the same draft flags pass, so the new flags are exonerated; environmental.

## 2026-09-13 turn 72 packaging

- Repackaged export-quality tree: portable exe fresh 85299117b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 73 evidence (headless mute)

- Headless runs no longer touch host audio: main appends Chromium mute-audio whenever PALM_HEADLESS=1 (one guard at startup covers smoke, MCP, persist, final-e2e and ad-hoc probes; user-owned portable runs unaffected, sound normal).
- Proof: node --check main+preload clean; live MUTE-BOOT-OK headless dev boot healthy with the switch.

## 2026-09-13 turn 74 evidence (UI polish, OpenReel-informed)

- Surface-only restyle of renderer/index.html (19 CSS rules, zero JS/HTML/geometry changes): Inter-first type stack with tight tracking, inset-highlight buttons + glowing emerald primary, flatter OpenReel-style clip fills with top sheen per Palmier clip hue, refined media thumbs, sunken inputs, glowing timecode pill, card/context-menu depth. All smoke-touchable ids/classes and drop geometry preserved.
- Proof: renderer JS vm-parse OK, unit suite 47/47, smoke102 BOOT-OK DONE-0 with SMOKE-VISUAL kinds intact. Track/media count variance vs smoke100b traced to persisted dev userData, CSS exonerated by construction (diff is style-block only).

## 2026-09-13 turn 74 packaging

- Repackaged UI-polish tree: portable exe fresh 85299548b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 75 evidence (Palmier toolbar groups, track strips)

- Topbar regrouped into the Palmier toolbar anatomy (Project | Edit | Export | Link) with labeled hairline-divider groups; every control kept id, label and order. Timeline track headers gained the Palmier 3px kind color strip; playhead gained a red knob marker. DOM/geometry for all smoke-touchable nodes unchanged.
- Proof: renderer JS vm-parse OK, topbar divs balanced 5/5 with all 12 ids present, unit suite 47/47, smoke104 BOOT-OK DONE-0 at smoke102 shape.

## 2026-09-13 turn 75 packaging

- Repackaged toolbar-groups tree: portable exe fresh 85298783b, postpackage cleanup done.
- Packaged verification: FINAL-E2E-PASS bytes=97402 dur=3.000 streams=audio,video clips=4.

## 2026-09-13 turn 76 evidence (keyboard shortcuts undo/redo/save)

- Palmier-basic shortcuts wired to existing buttons: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, Ctrl/Cmd+S save; plain S still splits (guarded against ctrl/meta), shortcut hints added to button titles. No new ops, no geometry changes.
- Proof: renderer JS vm-parse OK, unit suite 47/47, live KEYS-PROBE split=true undo=true redo=true save=true nosplit=true errs=0 through real keydown paths; temp probe hook reverted (main.js clean).
