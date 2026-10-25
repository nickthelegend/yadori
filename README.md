# Yadori (宿り)

**Wake up your room.** On a Quest 3/3S (WebXR mixed reality, Meta's Immersive Web SDK), point at a real
piece of furniture and pinch: the couch wakes up. A face blooms on the side that faces you, blinks, follows
you with its eyes, flinches when you poke it, purrs when you stroke it and spins when you flick it. Wake the
lamp too and the two of them talk to each other, whispers flying across the room.

With a Meta Model API key, Muse Spark gives every object a personality from what it is and what stands near
it, Muse Image draws its face sheet, Muse Voice Transcribe hears you and Meta MMS-TTS (open weights) gives it a
voice that comes from the object. Without a key it runs honestly in **puppet mode**: a built-in face, labelled
"not generated", and you type its lines.

Meta Global AI Developer Hackathon 2026 (Indie, "Push the Frontier"). Spec: `grokbot/specs/yadori.md`.
Status: **built in the IWER emulator and the browser; not yet run on a headset; Meta models wired but never
called (no key yet).** See [TESTING.md](TESTING.md) for the real numbers.

> Build-window note: this code was written on Oct 24, 2026, before the event opens on Oct 26, because Nick asked
> to start early. If the official rules require code written during the event, see HACKATHON_SUBMISSION_FORM.md.

## What works today (no key)

| | Browser diorama (no headset) | IWER emulator (Quest 3 profile) | Quest 3/3S |
|---|---|---|---|
| Find labelled furniture | the den's 5 pieces | WebXR mesh detection (`XRMesh.semanticLabel`) in our synthetic room | Space Setup labels (untested) |
| Wake | click | hand ray + pinch | hand ray + pinch (untested) |
| Face on the object, anchored | yes | yes (`XRAnchor`) | untested |
| Eyes follow you / your finger / the cursor / whoever talks | yes | yes | untested |
| Poke, pet, flick | tap, rub, swipe | tracked fingertip and palm | untested |
| Puppet lines + gossip with whispers | yes | yes (typed on the page) | needs the key (no typing in the headset) |
| Re-found after a reload | label + size + position | same | + anchors (untested) |
| Meta VR Glasses | | gaze + pinch, faces inside the 74° × 68° view | untested |

## Waiting for `MODEL_API_KEY` (shows "Setup required" until then)

- **Muse Spark** (`muse-spark-1.3`): `create_spirit` persona (forced tool call, strict schema) and the
  conversation turn with six tools: `look`, `glance`, `emote`, `remember`, `ask_object` (≤ 2 hops), `sleep`
  (≤ 6 tool calls per turn).
- **Muse Image** (`muse-image-1.0`): a 10-image sheet per object (base face = neutral, 4 more expressions,
  5 mouth shapes), ≈ $0.10. The app plays them as whole-face frames. *Unverified: the edits request shape.
  Not wired: cutting the sheet into parts with SAM 3.1.*
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`): push-to-talk WAV to `/v1/asr/transcribe`.
  *Unverified: field names. Not built: the realtime socket proxy.*
- **SAM 3.1** (`sam-3.1`): `/api/cut` with the person check, boxes parsed from the documented token
  grammar. *Unverified: mask decoding. Not built: the camera probe in the app (Quest Browser camera access
  is uncertain).*

Voice out is **Meta MMS-TTS** (`facebook/mms-tts-eng`, CC-BY-NC-4.0) on the gateway once
`scripts/fetch-models.sh` has downloaded the weights (it asks first). Until then the app uses the browser's
voice, labelled "Browser voice, not a Meta model", or speaks silently with a moving mouth, labelled.

## Run it

```bash
pnpm install
pnpm gateway                  # gateway on 127.0.0.1:8440, the only holder of MODEL_API_KEY (.env)
pnpm --filter app dev         # https://localhost:8091 (IWSDK dev server, proxies /api)
```

Open `https://localhost:8091/`: the browser diorama. "Enter mixed reality (emulated)" switches to IWER's
synthetic room `yadori_den` (`?room=bare` gives one unlabelled box: "Tell me what this is").
On a Quest: [docs/QUEST.md](docs/QUEST.md).

## Layout (monorepo, pnpm)

| Package | What |
|---|---|
| `packages/app` | IWSDK 1.1 app (`immersive-ar`): `YadoriSystem` (targets from `XRMesh`, ray + pinch wake, gestures, gaze, speech, gossip), the SDF face shader, effects, the 2D overlay, the den diorama and the generated IWER rooms, e2e scripts |
| `packages/rig` | the face rig: 5 expressions, 5 mouth shapes from audio envelope or text timing, blinks, gaze, squash/wobble springs |
| `packages/room` | pure geometry: ray vs box, face placement rule, room context for Spark, re-match, poke/pet/flick classifiers |
| `packages/server` | the gateway (Node, no framework): Meta client, Spark persona + tool loop, Image sheet, Transcribe, SAM 3.1, MMS-TTS, spirit store, budget cap, rate limit, run log, MCP over stdio |
| `packages/landing` | landing page (one story, the couch card) and `evidence.html` |
| `docs/` | Quest guide |

The spec planned a Python FastAPI gateway; it is TypeScript on `node:http` instead, to keep one toolchain and
a light install. Phone clip mode (SAM 3.1 video tracking of a mug) from the spec is not built.

## Honesty rules in the code

- No canned replies: without the key, chat/transcribe/cut return 503 `setup_required`; wake returns the
  built-in face with a `setup` map.
- Every face, voice and room carries its label in the UI: "Built-in face, not generated", "Drawn from the
  label", "Browser voice, not a Meta model", "Emulated room (IWER), not your room", "puppet line (you)".
- The key is read only by the gateway; tests assert it is never echoed.

## Licence

MIT, see [LICENSE](LICENSE). MMS-TTS weights are CC-BY-NC-4.0 and never committed. See [ASSETS.md](ASSETS.md).
