# Yadori (宿り)

**Wake up your room.** On a Quest 3/3S (WebXR mixed reality, Meta's Immersive Web SDK), pinch a real piece of
furniture (the couch, the lamp, the plant) and it wakes up. Muse Image draws it a face that sits on the object
itself, Muse Spark gives it a personality from what it is and where it stands, Muse Voice Transcribe hears you,
and it answers with a voice that comes from the object (Meta MMS-TTS, open weights). Wake two and they talk to
each other.

No headset? The same app runs in a desktop browser on an emulated room (IWER), and a phone mode wakes small
objects such as a mug in a real phone clip (SAM 3.1 tracking).

Meta Global AI Developer Hackathon 2026. Status: **spec only**. Product code starts Oct 26, 2026 (event start).
Without `MODEL_API_KEY` it still anchors a built-in face to your furniture in puppet mode (you give it its lines),
clearly labelled, and shows "Setup required" for the Meta models.

Spec: [`specs/yadori.md`](../../specs/yadori.md) in the grokbot handoff folder.

License: MIT (see [LICENSE](LICENSE)). Voice weights (MMS-TTS) are CC-BY-NC-4.0 and are downloaded at setup,
never committed.
