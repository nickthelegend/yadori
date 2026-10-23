# Assets and licences

| Asset | Where | Licence / source |
|---|---|---|
| Built-in face | `packages/app/src/face/face-material.ts` | Our own signed-distance shader (MIT, this repo). Labelled "Built-in face, not generated" everywhere it shows |
| Den diorama + IWER rooms `yadori_den`, `yadori_bare` | `packages/app/src/den/den.ts` → `public/rooms/*.glts` | Our own procedural three.js geometry (MIT) |
| Sound effects (wake chime, poke, purr, flick, sleep) | `packages/app/src/voice.ts` | Synthesised at runtime with Web Audio oscillators; no audio files |
| Meta MMS-TTS weights (`facebook/mms-tts-eng`, ONNX port `Xenova/mms-tts-eng`) | `models/` (gitignored) | **CC-BY-NC-4.0** (non-commercial). Downloaded only by `scripts/fetch-models.sh` after you accept; never committed |
| Muse Image character sheets | `data/spirits/<id>/sheet/` (gitignored) | Generated per object with your Meta Model API key; stay on your machine |
| Fonts: Satoshi | loaded from Fontshare | Fontshare free font licence (ITF) |
| Fonts: Atkinson Hyperlegible Mono | loaded from Google Fonts | SIL Open Font License 1.1 |
| IWSDK starter, IWER emulator, `.claude/skills` in `packages/app` | `npm create @iwsdk@1.1.0-rc.2` | MIT (Meta Platforms) |
| `@meta-quest/metavr` dev dependency (from the IWSDK starter) | `packages/app/package.json` | Meta Platform Technologies SDK License; collects usage data when used (see the starter's note) |

No photos, people or brands are in the repo. Landing images are crops of our own emulator recordings.
