# Testing

Fresh full re-verification: **Oct 27, 2026 (Asia/Kolkata)**. UTC execution: 2026-10-26T22:39:16.137Z through 2026-10-26T22:51:15.102Z. [Machine/run record](audit/run.json), [exact commands and exit codes](audit/commands.json), [AUDIT.md](AUDIT.md).

**274 PASS / 0 FAIL / 14 UNTESTED / 0 PENDING** across 288 checklist rows. S13–S16 and P11 now link the offline-only follow-up; other rows retain the full batch's evidence. Prior attempt evidence was removed from `audit/`; no restored result JSON is counted. The evidence page's Oct 25 figures are explicitly historical.

| Suite | Command | Fresh result |
|---|---|---:|
| Room geometry, placement, gestures, context and re-match | `pnpm --filter @yadori/room test` | 36 passed |
| Face rig, blink, reactions, speech and gaze | `pnpm --filter @yadori/rig test` | 14 passed |
| Real HTTP gateway, MCP child, process lifecycle, server units and no-key guards | `pnpm --filter @yadori/server test` | 32 passed |
| All packages | `pnpm typecheck` | PASS |
| App production build | `pnpm --filter app build` | PASS |
| Quest 3 IWER, emulated hands, den + bare room | `pnpm --filter app e2e:xr` | 22/22 |
| Meta VR Glasses IWER, gaze + pinch and actual bubble bounds | `pnpm --filter app e2e:glasses` | 10/10 |
| Browser diorama, real mouse + keyboard | `pnpm --filter app e2e:browser` | 20/20 |
| Responsive landing 375/1280 and phone app 375 | `pnpm e2e:responsive` | 12/12 |
| Expanded HTTP/MCP/store/privacy/budget inventory | `node e2e/audit-server.mjs` | 76/76 |
| Detailed desktop/landing/naming/storage checks | `node e2e/audit-browser.mjs` | 86/86 |

The unit total is **82 passed, 0 failed, 0 skipped**. The four main browser/emulator commands contain **64 passing assertions**. Supplementary checks cover all checklist rows, including mobile, built-app serving, permission guards, storage denial, silent mouth animation, gateway stop/recovery, all furniture, capacity, tracking loss, wake interruption, persistence and two enter/exit cycles. These counts overlap the checklist; they are not added to its 288 rows. See [commands](audit/commands.json) for every supplementary runner.

`evidence.html` was freshly tested and captured at **375×812 and 1280×800**, including navigation, images, FAQ keyboard interaction, overflow and console/network checks. [375](audit/browser/evidence-375.jpg), [1280](audit/browser/evidence-1280.jpg).

Every main suite and immersive supplement captures console, page errors and network outcomes independently. The final active-child Glasses interruption check attaches after each profile replaces Chrome, verifies child/CLI exit, restores Quest, and is followed by a complete Glasses replay. [Runtime hygiene](audit/runtime-hygiene.json), [interruption evidence](audit/browser/glasses-interrupt.json). Intentional HTTP validation/setup responses (400/404/413/429/503) were asserted by the separate real HTTP harness. No mocks, stubs or fabricated model output were used. A subsequent offline-only rerun restored the expected wake HTTP 502. The saved offline capture records the wake 502 and Chrome's matching resource line, and this is the passing observation. S13, S14, S15, S16 and P11 PASS. Suite counts above are unchanged.

## Performance and hand occlusion

600-frame CPU-submit probes on this host, with two spirits. They exclude GPU/headset frame time; the physical 72 Hz / 13.9 ms gate remains UNTESTED.

| Scene | CPU p50 ms | CPU p95 ms | CPU max ms | Draw calls p95 / max | Triangles max |
|---|---:|---:|---:|---:|---:|
| Quest 3 IWER (600 XR frames) | 1.00 | 2.00 | 2.30 | 22 / 26 | 18,584 |
| Browser diorama (600 non-XR frames) | 1.50 | 2.90 | 3.40 | 107 / 107 | 27,846 |

Renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`. [Quest raw result](audit/browser/quest-results.json), [browser probe](audit/rows/B40.json). Live read-only sampling captured brief hand reactions and typed speech during the Quest run: [samples](audit/browser/quest-live.json).

Emulator hand masking measured **0.00% leakage across 3,192 overlapping face/hand pixels**. It uses IWSDK's actual skinned hand depth surface and frozen render-layer comparison; the white mask image is labelled diagnostic and its material is restored. [Measurement](audit/browser/occlusion.json). Environment depth sensing is not integrated. Physical hand occlusion remains UNTESTED.

## Machine and execution

- Apple M4, 16 GB RAM, macOS 26.5.1 arm64; Node v26.5.0, pnpm 10.29.2; Chrome for Testing/Chromium 156.0.8078.4; IWSDK 1.1.0-rc.2. Managed IWER ran headless in agent mode.
- All commands used `YADORI_ENV_FILE=/tmp/yadori-audit-no-env MODEL_API_KEY=`; the env-file path did not exist. No env file, credential, seed or wallet was opened. Real gateway data lived in audit-owned temporary directories and was removed.
- Exhaustive replay used a 10,000/min local request bucket to keep independent cases isolated. Separate real gateways verified the 3/min bucket, 429 responses and status exemption. No rate-limit expectation was removed.
- Gateway: `pnpm --filter @yadori/server start` on 127.0.0.1:8440. From `packages/app`: `pnpm exec iwsdk dev restart --foreground --ai-mode agent --allow-browser-automation` on HTTPS :8091. The shared slot was acquired as `yadori-audit-final` before either service/Chrome session, and released in cleanup.
- A frozen dependency install found the existing lockfile missing the root Playwright dependency. `pnpm install --no-frozen-lockfile --lockfile=false` succeeded before verification; the tracked lockfile was unchanged. This run used Vite 7.3.7 and Vitest 3.2.7.
- Build succeeded with a largest JS chunk of 4,087.59 kB (gzip 1,129.95 kB). Rollup reported dependency annotation and >500 kB chunk warnings. [Build output](audit/commands/app-build.txt).

The full batch is reproducible with `YADORI_ENV_FILE=/tmp/yadori-audit-no-env MODEL_API_KEY= node e2e/audit-final.mjs`. The final bounded active-child profile check/replay is `node e2e/audit-followup.mjs`; it owns and releases its service slot as well.

## Dependencies still UNTESTED

| Rows | Exact missing dependency |
|---|---|
| I01–I05, I08, A39: live Muse Spark/persona/tools, Muse Image/generated sheet, Muse Voice Transcribe and SAM 3.1, permission-failure path gated by the key | needs MODEL_API_KEY |
| I06–I07: Meta MMS-TTS synthesis and real audio lip-sync | needs MMS-TTS weights from scripts/fetch-models.sh |
| H01–H03: physical Quest loop, CPU/GPU frame time and real hand occlusion | needs a Quest headset |
| H04: physical Glasses gaze, view and anchors | needs Meta VR Glasses hardware |
| I09: actual microphone WAV capture and recorder cleanup | needs a real microphone input |

Chrome enumerated an audio output and no audio input. Live Meta calls and headset frame time were not run. Their missing-key/weights setup UI and HTTP 503 guards passed. The MMS download CLI was actually declined with N; no weights were downloaded. Phone clip capture/tracking/export, camera probe/crop picker, SAM sheet-part cutting and realtime voice streaming remain disclosed as unbuilt.

All owned gateway, dev-server, Chrome and child PIDs stopped; configuration is `metaQuest3`; the heavy slot was released. [Cleanup](audit/cleanup.json), [evidence limits](audit/packaging.json). The offline follow-up is committed in separate proxy, report and evidence commits as requested. No pushes or deployments were made.

Offline 502 follow-up: 2026-10-26T23:02:49.230Z through 2026-10-26T23:03:26.677Z. [Fresh row results](audit/browser/offline-502/results.json), [console/network classification](audit/browser/offline-502/hygiene.json), [cleanup](audit/browser/offline-502/cleanup.json). No other suites were rerun. Zero owned PIDs remain; the yadori-audit-502 slot is released.
