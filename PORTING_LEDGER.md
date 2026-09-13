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
