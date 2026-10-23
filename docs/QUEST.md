# Trying Yadori on a Quest 3 / 3S

Nothing here has been run on a headset yet: every result in TESTING.md comes from the IWER
emulator. This is the checklist for the first device session.

## 0. Before you start (on the Quest)

1. **Space Setup** (Settings → Physical space → Space setup). Mark the furniture: couch, table,
   lamp, plant, screen, bed, storage. Yadori can only wake what Space Setup labelled; walls,
   floor and ceiling never wake. Unlabelled boxes ("other") ask "Tell me what this is".
2. Quest Browser up to date. Hand tracking on (Settings → Movement tracking).

## 1. Start the two processes on the Mac

```bash
cd projects/yadori
pnpm install                 # once
pnpm gateway                 # the gateway on 127.0.0.1:8440 (reads MODEL_API_KEY from .env if present)
pnpm --filter app dev        # IWSDK dev server on https://localhost:8091 (proxies /api to the gateway)
```

Optional voice out: `scripts/fetch-models.sh` downloads Meta MMS-TTS (CC-BY-NC-4.0, it asks first).
Without it the spirits speak with the browser voice (labelled) or silently with moving mouths.

## 2. Open it on the headset (pick one)

**A. USB cable (most reliable).** Enable developer mode, plug in, then:

```bash
adb devices                          # the Quest's serial should be listed
adb reverse tcp:8091 tcp:8091
```

On the Quest open `https://localhost:8091/` and accept the local certificate warning once.
`localhost` is a secure context, so WebXR and the microphone are allowed.

**B. Same Wi-Fi.** `npx @iwsdk/cli dev status` in `packages/app` prints `runtimeUrls.network`
(for example `https://192.168.0.6:8091/`). Open that on the Quest and accept the certificate warning.

**C. One origin, production build.**

```bash
pnpm --filter app build      # packages/app/dist; IWER is skipped on Quest Browser by user agent
pnpm gateway                 # also serves packages/app/dist on http://127.0.0.1:8440
adb reverse tcp:8440 tcp:8440
```

Then open `http://localhost:8440/` on the Quest.

**D. A deployed URL** comes later (Nick decides the hosting and the gateway's daily cap).

## 3. In the headset

1. Press **Enter mixed reality** (or accept the browser's XR offer). Allow hand tracking.
2. Look at the couch. Point with your hand: a dotted outline and a label chip appear.
3. **Pinch.** The outline breathes, sparkles rise, and a face blooms on the side facing you.
4. Walk a little: the eyes follow you; the face turns up to 40° toward you around its own up axis.
5. Touch it: **poke** the face with your index finger, **stroke** it slowly with your palm, **flick**
   your fingertip across it.
6. Wake a second piece. With `MODEL_API_KEY` set, talk to it (mic, Muse Voice Transcribe) and it may
   `ask_object` the other one. Without the key, wake and touch still work; lines need typing, which the
   2D page shows only outside the headset (puppet relay from a phone is not built yet).

## 4. Device checklist (write the answers into TESTING.md, "device: yes")

- Which labels did Space Setup produce? Does every labelled piece wake?
- Face placement: does the face sit on the right side of each object, 1 cm proud?
- Frame time with two spirits talking (Quest Browser's performance HUD, or `npx @iwsdk/cli` profiling with
  `iwsdk-native-xr-test`): target ≤ 13.9 ms p95 at 72 Hz.
- Hands: do poke / pet / flick trigger when you mean them and not when you just reach past?
- Anchors: reload the page; are the spirits re-found (anchor, or label + size + position)?
- Camera probe: not built yet (the spec's camera path is optional and Quest Browser's
  `camera-access` support is uncertain).

## 5. Driving it from the Mac (optional)

`packages/app/.claude/skills/iwsdk-native-xr-test` pairs a USB-connected Quest with the IWSDK CLI
(`npx @iwsdk/cli runtime pair-headset`), so the same e2e steps can run on the real device.
