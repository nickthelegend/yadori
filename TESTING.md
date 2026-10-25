# Testing

Evidence as of Oct 25, 2026: fresh unit, typecheck and build runs below; emulator/browser results restored
from the last complete run, `74e90e1` (MacBook, Apple M4, Chromium via IWSDK agent mode). **Device: no.**
Nothing here ran on a Quest or on Meta VR Glasses hardware; emulator numbers are a relative proxy (the M4 CPU
is several times faster than a Quest 3, and GPU time is not measured). **Meta Model API: no key yet**, so every
Meta test ran its "Setup required" branch (live when `MODEL_API_KEY` is set; never mocked, never skipped).

## Totals

| Suite | Command | Result |
|---|---|---|
| `@yadori/room` (Vitest): ray vs box, face placement on all 6 sides + clamps, turn limit, room context, re-match ±10% / 30 cm, poke/flick/pet classifiers incl. a near-miss sweep, pointer strokes | `pnpm --filter @yadori/room test` | **Passed: 36**, 0 skipped (fresh rerun) |
| `@yadori/rig` (Vitest): mouth shapes from envelope and text, blink bounds + determinism, wake/sleep, reactions, springs settle, lip-sync ≤ 80 ms, gaze clamp, thinking look | `pnpm --filter @yadori/rig test` | **Passed: 14**, 0 skipped (fresh rerun) |
| `@yadori/server` (Vitest): HTTP contract without key (status, wake → built-in face, 503 setup_required for chat/transcribe/cut, MMS-TTS setup message, forget deletes the folder, path tricks, rate limit, key never echoed), persona validation, turn budget (6 tools, 2 `ask_object` hops), SAM token parser, WAV checks, budget cap, Meta live-or-setup-required, MCP over stdio as a child process, the gateway as a real process | `pnpm --filter @yadori/server test` | **19 passed; 13 did not complete**: sandbox `listen EPERM` on `127.0.0.1`. Last complete run: **32 passed**, Oct 25 (`74e90e1`) |
| Emulator e2e, Quest 3 profile, **hands only**, synthetic room `yadori_den` + `yadori_bare` | `pnpm --filter app e2e:xr` | **Restored-from-74e90e1: 21 / 21**, Oct 25; fresh retry not-run (runtime startup blocked) |
| Emulator e2e, Meta VR Glasses profile (gaze + pinch, field of view, gaze-off fallback) | `pnpm --filter app e2e:glasses` (`bash e2e/run-glasses.sh`; server must already be up; switches to `metaVRGlasses` and restores `metaQuest3`) | **Restored-from-74e90e1: 8 / 8**, Oct 25; fresh retry not-run (runtime startup blocked) |
| Browser diorama e2e (no headset), real mouse + keyboard | `pnpm --filter app e2e:browser` | **Restored-from-74e90e1: 18 / 18**, Oct 25; fresh retry not-run (runtime startup blocked) |
| Responsive: landing 375 / 1280 px, app on a phone user agent at 375 px | `pnpm e2e:responsive` | **Restored-from-74e90e1: 12 / 12**, Oct 25; fresh retry not-run (Chromium MachPort permission denied) |
| Production build | `pnpm --filter app build` | **Passed** (fresh rerun; largest chunk 4.09 MB; chunk-size and dependency annotation warnings) |
| Typecheck | `pnpm typecheck` | **Passed** (fresh rerun: app, room, rig, server) |

Fresh unit rerun: **69 passed; 13 did not complete**, out of 82. Server breakdown: `units.test.ts` 17 passed,
`live-meta.test.ts` 2 passed (no key, Setup required); `contract.test.ts` 9 and `mcp.test.ts` 3 were not-run
because their loopback-listen setup failed; `process.test.ts` 1 timed out before the gateway became ready.
Vitest reports **19 passed, 1 failed, 12 skipped**, two unhandled `listen EPERM` errors, plus setup/teardown
errors in the two blocked suites; the server command exits 1. These are sandbox startup limits, not a new
complete server pass or evidence of a product regression. The last complete server result remains **32 passed
on Oct 25**, recorded in `74e90e1` (82 unit tests passed in that run). No product code was changed to avoid listening.

Dependency setup: frozen installation found an outdated lockfile; retrying without writing the lockfile failed
with DNS `ENOTFOUND registry.npmjs.org`. The rerun used copied `node_modules` directories from the local
`projects/yadori` checkout. No `.env` was read: the server test command used
`YADORI_ENV_FILE=/private/tmp/yadori-verify2-no-env MODEL_API_KEY= pnpm --filter @yadori/server test`
(the configured env-file path does not exist).

Emulator/browser/responsive evidence: **59 checks passed in the Oct 25 run**, not 59 fresh passes.
The retry task restored all four JSON files in `995a2af` (merged by `50e5345`); each file on disk is
byte-for-byte identical to `74e90e1`, including its original timestamp:

| Result file | Status | Original UTC timestamp |
|---|---|---|
| `packages/app/e2e/results/xr-quest3.json` | restored-from-74e90e1, 21/21 | `2026-10-25T11:19:25.000Z` |
| `packages/app/e2e/results/xr-glasses.json` | restored-from-74e90e1, 8/8 | `2026-10-25T11:20:06.192Z` |
| `packages/app/e2e/results/browser-diorama.json` | restored-from-74e90e1, 18/18 | `2026-10-25T11:20:54.969Z` |
| `e2e/results/responsive.json` | restored-from-74e90e1, 12/12 | `2026-10-25T11:22:54.625Z` |

A fresh rerun in this orchestra did not start in the sandbox: IWSDK runtime startup/birth-identity checks
and Chromium MachPort permission restrictions blocked execution; loopback listening also hits `listen EPERM`.
The app server was not launched again during this documentation task, and the restored result JSONs were
left intact. `dev.emulator.device` remains `metaQuest3`. The detailed emulator findings and frame measurements
below describe the original Oct 25 run; they do not verify the later UI edits.

## Static landing-page check (separate from app emulator suites)

The landing task checked `packages/landing` in headless Chromium at **375 px and 1280 px**, plus
`evidence.html`: **23 checks passed**, **0 console errors**, **no horizontal scroll**. This was a static-page
check without the app server. It is separate from the restored 12/12 responsive suite above and does not
prove app or immersive interactions; it was not rerun during this documentation task.

## Emulator e2e: what is proven (Quest 3 profile, hands only)

From a cold load, the only inputs are emulated hands (`xr look-at`, `xr select` = pinch, `xr run-sequence` for
fingertip and palm paths) and typed puppet lines:

| Check | Result |
|---|---|
| Mesh detection reports the five labelled pieces | couch, lamp, plant, screen, table |
| Pinch at the couch wakes it | yes (≈ 4 s wall clock including CLI round trips; the app holds the wake "breath" ≥ 1.15 s) |
| ECS: a `Spirit` component with an anchored face | yes (`ecs find` + `ecs query`) |
| Face placement vs the computed target on the true box | **0.00 cm** (target: ≤ 1 cm) |
| Fingertip poke / palm stroke / fast swipe | poke 1, pet ≥ 1, flick 1 |
| Puppet line moves the mouth; voice mode labelled | yes; `browser` (Web Speech, labelled; MMS-TTS weights not downloaded) |
| Second spirit by pinch; gossip | whispers (37 particles); each face's gaze matches the direction to the other within 0.2 |
| Reload → both spirits re-found (label + size + position) | yes |
| Bare room: unlabelled box → "Tell me what this is" → wakes as "coat rack" | yes |
| Console errors during the whole run | **0** |
| Hand actions to the first "whoa" (a face on the couch) | **1** (one pinch) |

## Frame time and draw calls (emulator, not a Quest)

Probe: CPU ms from `world.update` to the end of `renderer.render`, plus `renderer.info`, 600 frames.

| Scene | CPU p50 | CPU p95 | max | Draw calls p95 | Triangles max |
|---|---|---|---|---|---|
| XR (Quest 3 profile), 2 spirits, one talking, whispers on | 0.70 ms | 1.00 ms | – | 26 | 18,584 |
| Browser diorama (whole den rendered + shadow pass), 2 spirits | 1.6 ms | 2.9 ms | 3.3 ms | 103 | 27,834 |

In XR the room is passthrough (IWER draws its synthetic room itself), so the app draws only faces, bubbles,
outline, chip and particles: one draw call per face. Quest target: ≤ 13.9 ms p95 at 72 Hz, **unverified on hardware**.

## Meta VR Glasses (emulator profile)

Gaze hovers the couch, a pinch wakes it; the face corners sit at −3.1° / +3.0° horizontally and +2.6° / −3.3°
vertically, the bubble top at +10.9° (limits: ±37°, +25°, −43°); with gaze disconnected the hand ray wakes the
lamp; 0 console errors. Screenshot: `e2e/shots/glasses-fov.png`.

## Recordings (test clips, not the demo video)

`grokbot/videos/yadori/` (each captioned in a visible box; no edits to program output):

| File | Length | What |
|---|---|---|
| `yadori-emu-wake-poke-pet-flick.mp4` | 27 s | emulator, hands only: hover outline + chip, pinch, the face blooms, lean in, poke, pet (hearts, blush), flick (grumpy wobble), a typed line |
| `yadori-emu-two-spirits-gossip.mp4` | 20 s | emulator: pinch the lamp awake, couch → lamp gossip with whispers, both faces turn to each other, three typed lines |
| `yadori-browser-diorama.mp4` | 31 s | no headset: click to wake, the eyes follow the cursor, tap / rub / swipe, a typed line, the lamp, gossip and reply |

## Not tested yet

- Anything on a Quest 3 / 3S (Space Setup labels, frame time, real hand tracking, anchors across sessions,
  depth occlusion of the face by your real hand: not built yet). Checklist: [docs/QUEST.md](docs/QUEST.md).
- Live Meta calls (persona, sheet, transcribe, SAM 3.1): wired, never called; the request shapes marked
  UNVERIFIED in `packages/server/src` are checked on the first keyed run.
- MMS-TTS voice and the audio-path lip-sync metric (needs the CC-BY-NC weights; the rig's own test shows the
  mouth reaches a shape within 80 ms).
- Voice e2e with recorded WAVs and the camera e2e (spec): not built.
