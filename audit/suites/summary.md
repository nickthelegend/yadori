# Fresh non-browser suite run

Executed from this worktree on 2026-10-26 21:24 UTC (2026-10-27 02:54 IST), without Chrome, Playwright, IWER, iwsdk dev, or the shared heavy slot.

| Command | Exit | Result | Evidence |
|---|---|---|---|
| `pnpm --filter @yadori/room test` | 0 | 36/36, four files | [room.txt](room.txt) |
| `pnpm --filter @yadori/rig test` | 0 | 14/14, one file | [rig.txt](rig.txt) |
| `pnpm --filter @yadori/server test` | 0 | 32/32, five files | [server.txt](server.txt) |
| `pnpm typecheck` | 0 | app, room, rig, server; no diagnostics | [typecheck.txt](typecheck.txt) |
| `pnpm --filter app build` | 0 | dist/index.html and directly referenced assets verified | [app-build.txt](app-build.txt) |

All 82 tests passed, with zero failed/skipped/todo and no unhandled startup/teardown errors. The server completed contract 9, units 17, MCP 3, process 1, live-meta setup 2. Its actual listening gateways, actual MCP stdio child, and actual node gateway process ran successfully. Existing contract assertions verified built-in-face wake, 503 setup_required=MODEL_API_KEY for chat/transcribe/cut, key non-disclosure using the suite's inert constant, and MMS-TTS setup. The live-meta suite took its no-key SetupRequired branch; these results provide no live-model evidence. UI setup states remain PENDING.

Before the commands, YADORI_ENV_FILE was exported to an asserted nonexistent audit path and MODEL_API_KEY was exported empty. No secret file was read or supplied. No API request to api.meta.ai was made by the no-key branch. No weights were downloaded. The child entrypoint process scan after completion found no matching gateway or MCP process left running.

The worktree had no node_modules. The frozen install failed on the pre-existing manifest/lock mismatch (root playwright absent from the lock; server importer also absent). No manifest or lockfile was changed. Local dependency links reuse the main checkout's installed packages; @yadori workspace imports resolve to this worktree's packages. See [install.txt](install.txt) and [dependencies.txt](dependencies.txt). Existing pnpm 10.29.2, Node v26.5.0, Vitest 3.2.7 and Vite 7.3.7 were used.

Build warnings: two Zod PURE-comment annotations removed by Rollup; chunks exceed 500 kB. Main JS was 4,085.82 kB (gzip 1,129.44 kB), secondary index chunk 714.69 kB (gzip 180.38 kB); CSS 8.50 kB (gzip 2.40 kB); HTML 1.47 kB (gzip 0.68 kB). These are fresh output values. Build runtime injection reports metaQuest3 and sunlit_living_room; this is build metadata, not emulator testing.

Unexecuted dependencies:

- Live Meta models and actual generated sheet: needs MODEL_API_KEY.
- MMS-TTS synthesis and measured audio lip-sync: needs MMS-TTS weights from scripts/fetch-models.sh.
- Real Quest core loop/performance/hand occlusion: needs a Quest headset.
- Real Glasses hardware: needs Meta VR Glasses hardware.

Browser, landing, IWER, and setup UI rows were not executed. No product failure was found; no source or test assertions were changed. No commits, push, or deployment performed. Machine-readable results: [results.json](results.json). Additional artifact/count/cleanup verification: [verification.txt](verification.txt). Test source fingerprints: [source-sha256.txt](source-sha256.txt).
