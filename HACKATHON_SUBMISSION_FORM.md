# Yadori: Meta Global AI Developer Hackathon submission draft

> Draft, not submitted. Event Oct 26 – Nov 4, 2026; submissions due **Nov 4, 9:00 PM ET** (Nov 5 02:00 UTC,
> 07:30 IST). Applications close **Oct 25, 11:59 PM ET**. Nick submits; nothing here is pushed or posted.

## Built before the event (read first)

All of this code was written on **Oct 24, 2026**, two days before the event opens, because Nick asked to start
early. The spec's own rule was "product code starts Oct 26". The Official Rules were not published on Oct 24, so
whether pre-event code may be entered is unknown. Before submitting, Nick reads the rules for a build-window
clause and either (a) enters as-is with this disclosure, (b) enters only the work committed from Oct 26 on
(`git log --format='%h %cI' main` shows every commit's date), or (c) keeps Yadori as portfolio.
Recommended before Oct 26: tag the last pre-event commit `pre-event-2026-10-25` (not done; Nick decides).

**Entries per person** are also unknown (four Meta AI candidates: Hasami, Mimic, Thyra, Yadori). The spec's
ranking puts Thyra first and Yadori second.

## Form fields

**Project name:** Yadori (宿り, "to dwell": a spirit living in a thing)

**Track:** Indie developer · **Theme:** Push the Frontier (to confirm against the official rules)

**One line:** Pinch a real piece of furniture on a Quest 3 and it wakes up: a living face on the object that
blinks, watches you and reacts to your hands, a personality from Muse Spark, and a voice from the object itself.

**What it does:** Yadori uses the Quest's own room understanding (WebXR mesh detection: `couch`, `table`,
`lamp`, `plant`, `screen`…) to find furniture. Point at one and pinch: a face blooms on the side facing you,
anchored to the room. It follows you with its eyes, jumps when you poke it with your real fingertip, blushes
when you stroke it, spins when you flick it. Wake a second piece and they gossip: whispers fly between them and
each one turns its eyes to the other. With a Meta Model API key, Muse Spark gives each object a personality from
what it is and what stands near it (`create_spirit`) and plays it in conversation with tools (`glance`, `emote`,
`remember`, `ask_object`, `look`, `sleep`); Muse Image draws its face sheet; Muse Voice Transcribe hears you;
Meta MMS-TTS speaks from the object's position.

**Meta models used:**
- *Integrated, pending a key (never called yet):* Muse Spark 1.3 (persona + tool loop), Muse Image 1.0
  (10-image sheet), Muse Voice Transcribe 1.0 (push-to-talk), SAM 3.1 (`/api/cut` with a person check).
  Request shapes not confirmed against a live key are marked UNVERIFIED in the source. Without the key every
  step says "Setup required"; no reply, face or transcript is ever faked.
- *Open weights:* Meta MMS-TTS (`facebook/mms-tts-eng`, CC-BY-NC-4.0) for voice out, after
  `scripts/fetch-models.sh` (not downloaded yet: licence acceptance is Nick's call).
- *Meta platform:* Immersive Web SDK 1.1 (IWSDK) for the WebXR app, IWER for emulator testing.

**How we built it:** TypeScript end to end. IWSDK app with one ECS system; a signed-distance face shader (one
draw call per face); pure packages for placement geometry and the face rig; a Node gateway that alone holds the
key, with a budget cap, rate limit, run log and an MCP server; IWER synthetic rooms generated from the same
code as the browser diorama, so tests have exact ground truth.

**Challenges:** Quest's room model only has furniture-sized boxes, not mugs, and Quest Browser's camera access
is uncertain, so the headset wakes furniture and the camera path is optional. There is no Meta TTS on the API,
so voice out is MMS-TTS (non-commercial licence) with labelled fallbacks.

**What's next:** a device session on a Quest 3, the live Meta calls (persona, sheet, transcribe), the realtime
transcription proxy, a phone "puppeteer" so a second person can voice spirits in the headset, phone clip mode
for small objects.

**Measured (IWER emulator on a laptop, not a headset; TESTING.md has the raw runs):** hands-only e2e 21/21
(one pinch to the first face; face 0.00 cm from its computed target; poke/pet/flick from tracked fingertip and
palm; gossip gaze matches geometry; 0 console errors); Meta VR Glasses profile 8/8 (gaze + pinch, faces within
±3° of the view centre); 600-frame probe in XR with two spirits: CPU p95 1.6 ms, 20 draw calls; 82 unit tests.

**Video:** not recorded yet. Test clips from the emulator are in `grokbot/videos/yadori/`; the demo video
follows the spec's script and is captioned "IWER emulator, synthetic room" where it is.

**Links:** repo (Nick creates and pushes), landing (`packages/landing`), hosted app (not deployed).
