# Browser and IWER audit — Oct 26–27, 2026

This task executed 158 browser, IWER, landing, setup and related rows: **154 PASS, 2 FAIL, 2 newly UNTESTED**. All L/E/B/N/P/S/Q/G rows have an executed result. A49/A50 (built app) and I15 (integration inventory) also passed. I08 needs MODEL_API_KEY; I09 needs a real microphone: the OS reports only Mac mini Speakers and no audio input. Existing live-key, MMS-TTS and physical-headset UNTESTED rows were preserved. Remaining server/integration rows belong to the other audit tasks.

| Supplied suite | Fresh final result | Independent observed responses | Errors |
|---|---:|---:|---:|
| `pnpm --filter app e2e:xr` | 22/22 | 1,531 | 0 |
| `pnpm --filter app e2e:glasses` | 10/10 | 389 | 0 |
| `pnpm --filter app e2e:browser` | 20/20 | 763 | 0 |
| `pnpm e2e:responsive` | 12/12 | 755 | 0 |

The added checks measure actual bubble corners and independent console/page/network hygiene. Capture attaches separately for each suite because switching emulator profiles can replace Chrome. A capture with zero observed responses cannot pass. Final commands and UTC timestamps are in [final-commands.json](final-commands.json); the four result files and `*-network.json` / `*.jsonl` files contain fresh assertions and event logs. The supplied suite totals are separate from the 158 audit-row results.

Additional real-input runs covered all landing/evidence links, keyboard and FAQ interactions at 375/1280, phone touch and binder scrolling, naming/invalid input, source labels, real persisted gateway deletion, storage corruption and Chromium's disabled-local-storage setting. Chromium's disabled speech API exercised the labelled silent-mouth path with zero available voices; ordinary Chrome used its installed browser voice. No browser API was monkey-patched, no gateway response was intercepted, and no model-ready state was fabricated.

Immersive extensions verified the Spirit/XRAnchor component (`attached=true` in IWER), a 2m head path, hand near-miss/tracking interruption, lifecycle and wake cancellation, exact IDs/line counts after reload, all furniture including the rotated screen, and six actual wakes followed by a refused seventh in an explicitly synthetic capacity fixture. The glasses runner's SIGINT test exited 130, killed its child and restored `metaQuest3`. Full successful glasses execution also restored Quest and a ready command bridge. Physical tracking, gaze accuracy and headset performance remain UNTESTED.

Seven product fixes were verified from cold loads:

- Narrow layouts now visibly show the room-provenance label; two real enter/exit cycles verified the text and den visibility.
- Header measurement keeps the binder and Forget controls below the status pills.
- Non-array/null browser storage is treated as empty before saving or deleting.
- Pending wakes are discarded after an immersive room transition.
- Forget cancels speech and timers; removed-spirit callbacks cannot touch disposed faces.
- Blink blending now reaches the closed-eye range; measured eye openness reached 0.027 then returned to 1.
- Portrait framing keeps the lamp reachable after the couch wakes; both cards and “4 open” scroll within the rail.

Fresh app typecheck and production build passed. The changed rig passed all 14 unit tests. No full rerun of the other already-passing unit/server rows was performed in this task.

Remaining FAILs:

- **S16:** stopping the gateway between an online status poll and a wake produced the intended 502 and the correct “Gateway: … Waking with the built-in face.” recovery. Chrome also emitted `Failed to load resource: the server responded with a status of 502 ()`. The strict console-error rule keeps this FAIL. The status was not masked to manufacture a clean result.
- **Q35:** hand/depth occlusion is documented as unbuilt. Actual face/hand/background captures produced only four overlapping skeleton pixels, insufficient to establish the ≤5% gate. The 75% sample is not a calibrated physical-hand leakage measurement. Implement and validate an occluder before claiming this passes; H03 remains UNTESTED on physical hardware.

Host measurements, 600 frames each (Apple M4, ANGLE Metal; CPU submit time, excluding GPU): Quest IWER p50 **0.90ms**, p95 **1.90ms**, max **2.30ms**, all 600 frames immersive, draw calls max **26**, triangles max **18,584**. Browser p50 **2.30ms**, p95 **3.10ms**, max **3.40ms**, zero immersive frames, draw calls max **107**. These are host/emulator measurements, not a 72Hz headset result.

No api.meta.ai calls, model output, MMS-TTS downloads, mocks or stubs were used. The gateway ran with the prescribed absent env-file path and empty key. The synthetic rooms and capacity fixture are explicitly emulator data, not a real home. Frozen installation encountered the pre-existing manifest/lock mismatch; installed local dependencies were linked with workspace room/rig packages resolving to this worktree. No lockfile was changed.

The first long-lived monitor disconnected during a Chrome/profile replacement; its later zero-event window was rejected. A fresh locked capture session reran the affected surfaces with suite-owned CDP connections. Only the final accepted network reports are used for passing immersive hygiene rows. The intentional S16 console error remains in its evidence.

Cleanup: [cleanup-final.json](cleanup-final.json) records no remaining owned runtime descendants, no listeners on 8091/8440, and no held heavy slot. The emulator config is unchanged from git and remains `metaQuest3`. No commits, pushes or deployments were made; Loom owns commits and merges. The final narrow-layout caption fix was verified in immersive/browser mode and the mobile, responsive and browser regression flows. The next task owns the full audit rerun, including previously passing server/unit rows.
