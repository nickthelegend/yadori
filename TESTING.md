# Testing

Real counts from runs on Oct 24, 2026 (MacBook, Apple M4, Chromium via IWSDK agent mode). **Device: no.**
Nothing here ran on a Quest or on Meta VR Glasses hardware; emulator numbers are a relative proxy (the M4 CPU
is several times faster than a Quest 3, and GPU time is not measured). **Meta Model API: no key yet**, so every
Meta test ran its "Setup required" branch (live when `MODEL_API_KEY` is set; never mocked, never skipped).

## Totals

| Suite | Command | Result |
|---|---|---|
| `@yadori/room` (Vitest): ray vs box, face placement on all 6 sides + clamps, turn limit, room context, re-match ±10% / 30 cm, poke/flick/pet classifiers incl. a near-miss sweep, pointer strokes | `pnpm --filter @yadori/room test` | **36 passed**, 0 skipped |
| `@yadori/rig` (Vitest): mouth shapes from envelope and text, blink bounds + determinism, wake/sleep, reactions, springs settle, lip-sync ≤ 80 ms, gaze clamp, thinking look | `pnpm --filter @yadori/rig test` | **14 passed**, 0 skipped |
| `@yadori/server` (Vitest): HTTP contract without key (status, wake → built-in face, 503 setup_required for chat/transcribe/cut, MMS-TTS setup message, forget deletes the folder, path tricks, rate limit, key never echoed), persona validation, turn budget (6 tools, 2 `ask_object` hops), SAM token parser, WAV checks, budget cap, Meta live-or-setup-required, MCP over stdio as a child process, the gateway as a real process | `pnpm --filter @yadori/server test` | **32 passed**, 0 skipped |
| Emulator e2e, Quest 3 profile, **hands only**, synthetic room `yadori_den` + `yadori_bare` | `pnpm --filter app e2e:xr` | **21 / 21** |
| Emulator e2e, Meta VR Glasses profile (gaze + pinch, field of view, gaze-off fallback) | `pnpm --filter app e2e:glasses` (switch `dev.emulator.device` first) | **8 / 8** |
| Browser diorama e2e (no headset), real mouse + keyboard | `pnpm --filter app e2e:browser` | **18 / 18** |
| Responsive: landing 375 / 1280 px, app on a phone user agent at 375 px | `pnpm e2e:responsive` | **12 / 12** |
| Production build | `pnpm --filter app build` | passes (one 4.1 MB chunk: IWSDK + three) |
| Typecheck | `pnpm typecheck` | passes (app, room, rig, server) |

Unit tests: **82**. E2E checks: **59**. Raw results: `packages/app/e2e/results/*.json`, `e2e/results/responsive.json`.

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
| Second spirit by pinch; gossip | whispers (40 particles); each face's gaze matches the direction to the other within 0.2 |
| Reload → both spirits re-found (label + size + position) | yes |
| Bare room: unlabelled box → "Tell me what this is" → wakes as "coat rack" | yes |
| Console errors during the whole run | **0** |
| Hand actions to the first "whoa" (a face on the couch) | **1** (one pinch) |

## Frame time and draw calls (emulator, not a Quest)

Probe: CPU ms from `world.update` to the end of `renderer.render`, plus `renderer.info`, 600 frames.

| Scene | CPU p50 | CPU p95 | max | Draw calls p95 | Triangles max |
|---|---|---|---|---|---|
| XR (Quest 3 profile), 2 spirits, one talking, whispers on | 1.40 ms | 1.60 ms | – | 20 | 18,576 |
| Browser diorama (whole den rendered + shadow pass), 2 spirits | 2.5 ms | 3.1 ms | 3.7 ms | 107 | 27,846 |

In XR the room is passthrough (IWER draws its synthetic room itself), so the app draws only faces, bubbles,
outline, chip and particles: one draw call per face. Quest target: ≤ 13.9 ms p95 at 72 Hz, **unverified on hardware**.

## Meta VR Glasses (emulator profile)

Gaze hovers the couch, a pinch wakes it; the face corners sit at ±3° horizontally and +2.6° / −3.3° vertically,
the bubble top at +10.9° (limits: ±37°, +25°, −43°); with gaze disconnected the hand ray wakes the lamp; 0
console errors. Screenshot: `e2e/shots/glasses-fov.png`.

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
