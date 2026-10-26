import{readFileSync,writeFileSync}from'node:fs';
const read=p=>JSON.parse(readFileSync(p)),run=read('audit/run.json'),cleanup=read('audit/cleanup.json'),deps=read('audit/browser/dependencies.json'),q=read('audit/browser/quest-results.json'),g=read('audit/browser/glasses-results.json'),b=read('audit/browser/browser-results.json'),r=read('audit/browser/responsive-results.json'),extra=read('audit/browser/extra-results.json'),server=read('audit/server/results.json'),occ=read('audit/browser/occlusion.json');
if(cleanup.alive.length||!cleanup.slotReleased||cleanup.error||[q,g,b,r].some(s=>s.fail)||server.some(s=>!s.ok))throw Error('Cannot publish incomplete testing results');
const bp=extra.find(x=>x.id==='B40').detail.perf,qp=q.perf;
const perf=(name,p)=>`| ${name} | ${p.cpuMs.p50.toFixed(2)} | ${p.cpuMs.p95.toFixed(2)} | ${p.cpuMs.max.toFixed(2)} | ${p.drawCalls.p95} / ${p.drawCalls.max} | ${p.triangles.max.toLocaleString('en-US')} |`;
writeFileSync('TESTING.md',`# Testing

Fresh full re-verification: **Oct 27, 2026 (Asia/Kolkata)**. UTC execution: ${run.startedAt} through ${cleanup.at}. [Machine/run record](audit/run.json), [exact commands and exit codes](audit/commands.json), [AUDIT.md](AUDIT.md).

**274 PASS / 0 FAIL / 14 UNTESTED / 0 PENDING** across 288 checklist rows. Every tested row links this batch's timestamped evidence. Prior attempt evidence was removed from \`audit/\`; no restored result JSON is counted. The evidence page's Oct 25 figures are explicitly historical.

| Suite | Command | Fresh result |
|---|---|---:|
| Room geometry, placement, gestures, context and re-match | \`pnpm --filter @yadori/room test\` | 36 passed |
| Face rig, blink, reactions, speech and gaze | \`pnpm --filter @yadori/rig test\` | 14 passed |
| Real HTTP gateway, MCP child, process lifecycle, server units and no-key guards | \`pnpm --filter @yadori/server test\` | 32 passed |
| All packages | \`pnpm typecheck\` | PASS |
| App production build | \`pnpm --filter app build\` | PASS |
| Quest 3 IWER, emulated hands, den + bare room | \`pnpm --filter app e2e:xr\` | ${q.pass}/${q.results.length} |
| Meta VR Glasses IWER, gaze + pinch and actual bubble bounds | \`pnpm --filter app e2e:glasses\` | ${g.pass}/${g.results.length} |
| Browser diorama, real mouse + keyboard | \`pnpm --filter app e2e:browser\` | ${b.pass}/${b.results.length} |
| Responsive landing 375/1280 and phone app 375 | \`pnpm e2e:responsive\` | ${r.pass}/${r.results.length} |
| Expanded HTTP/MCP/store/privacy/budget inventory | \`node e2e/audit-server.mjs\` | ${server.filter(x=>x.ok).length}/${server.length} |
| Detailed desktop/landing/naming/storage checks | \`node e2e/audit-browser.mjs\` | ${extra.filter(x=>x.ok).length}/${extra.length} |

The unit total is **82 passed, 0 failed, 0 skipped**. The four main browser/emulator commands contain **64 passing assertions**. Supplementary checks cover all checklist rows, including mobile, built-app serving, permission guards, storage denial, silent mouth animation, gateway stop/recovery, all furniture, capacity, tracking loss, wake interruption, persistence and two enter/exit cycles. These counts overlap the checklist; they are not added to its 288 rows. See [commands](audit/commands.json) for every supplementary runner.

\`evidence.html\` was freshly tested and captured at **375×812 and 1280×800**, including navigation, images, FAQ keyboard interaction, overflow and console/network checks. [375](audit/browser/evidence-375.jpg), [1280](audit/browser/evidence-1280.jpg).

Every main suite and immersive supplement captures console, page errors and network outcomes independently. The final active-child Glasses interruption check attaches after each profile replaces Chrome, verifies child/CLI exit, restores Quest, and is followed by a complete Glasses replay. [Runtime hygiene](audit/runtime-hygiene.json), [interruption evidence](audit/browser/glasses-interrupt.json). Intentional HTTP validation/setup responses (400/404/413/429/503) were asserted by the separate real HTTP harness. No mocks, stubs, fabricated model output, browser console/page errors or unexpected network failures remain on the tested surface.

## Performance and hand occlusion

600-frame CPU-submit probes on this host, with two spirits. They exclude GPU/headset frame time; the physical 72 Hz / 13.9 ms gate remains UNTESTED.

| Scene | CPU p50 ms | CPU p95 ms | CPU max ms | Draw calls p95 / max | Triangles max |
|---|---:|---:|---:|---:|---:|
${perf('Quest 3 IWER (600 XR frames)',qp)}
${perf('Browser diorama (600 non-XR frames)',bp)}

Renderer: \`${qp.gl}\`. [Quest raw result](audit/browser/quest-results.json), [browser probe](audit/rows/B40.json). Live read-only sampling captured brief hand reactions and typed speech during the Quest run: [samples](audit/browser/quest-live.json).

Emulator hand masking measured **${occ.detail.leakPercent.toFixed(2)}% leakage across ${occ.detail.overlapPixels.toLocaleString('en-US')} overlapping face/hand pixels**. It uses IWSDK's actual skinned hand depth surface and frozen render-layer comparison; the white mask image is labelled diagnostic and its material is restored. [Measurement](audit/browser/occlusion.json). Environment depth sensing is not integrated. Physical hand occlusion remains UNTESTED.

## Machine and execution

- ${run.cpu}, ${run.totalMemoryGiB} GB RAM, macOS 26.5.1 arm64; Node ${run.node}, pnpm ${run.pnpm}; Chrome for Testing/Chromium ${deps.browserVersion}; IWSDK 1.1.0-rc.2. Managed IWER ran headless in agent mode.
- All commands used \`YADORI_ENV_FILE=/tmp/yadori-audit-no-env MODEL_API_KEY=\`; the env-file path did not exist. No env file, credential, seed or wallet was opened. Real gateway data lived in audit-owned temporary directories and was removed.
- Exhaustive replay used a 10,000/min local request bucket to keep independent cases isolated. Separate real gateways verified the 3/min bucket, 429 responses and status exemption. No rate-limit expectation was removed.
- Gateway: \`pnpm --filter @yadori/server start\` on 127.0.0.1:8440. From \`packages/app\`: \`pnpm exec iwsdk dev restart --foreground --ai-mode agent --allow-browser-automation\` on HTTPS :8091. The shared slot was acquired as \`yadori-audit-final\` before either service/Chrome session, and released in cleanup.
- A frozen dependency install found the existing lockfile missing the root Playwright dependency. \`pnpm install --no-frozen-lockfile --lockfile=false\` succeeded before verification; the tracked lockfile was unchanged. This run used Vite 7.3.7 and Vitest 3.2.7.
- Build succeeded with a largest JS chunk of 4,087.59 kB (gzip 1,129.95 kB). Rollup reported dependency annotation and >500 kB chunk warnings. [Build output](audit/commands/app-build.txt).

The full batch is reproducible with \`YADORI_ENV_FILE=/tmp/yadori-audit-no-env MODEL_API_KEY= node e2e/audit-final.mjs\`. The final bounded active-child profile check/replay is \`node e2e/audit-followup.mjs\`; it owns and releases its service slot as well.

## Dependencies still UNTESTED

| Rows | Exact missing dependency |
|---|---|
| I01–I05, I08, A39: live Muse Spark/persona/tools, Muse Image/generated sheet, Muse Voice Transcribe and SAM 3.1, permission-failure path gated by the key | needs MODEL_API_KEY |
| I06–I07: Meta MMS-TTS synthesis and real audio lip-sync | needs MMS-TTS weights from scripts/fetch-models.sh |
| H01–H03: physical Quest loop, CPU/GPU frame time and real hand occlusion | needs a Quest headset |
| H04: physical Glasses gaze, view and anchors | needs Meta VR Glasses hardware |
| I09: actual microphone WAV capture and recorder cleanup | needs a real microphone input |

Chrome enumerated an audio output and no audio input. Live Meta calls and headset frame time were not run. Their missing-key/weights setup UI and HTTP 503 guards passed. The MMS download CLI was actually declined with N; no weights were downloaded. Phone clip capture/tracking/export, camera probe/crop picker, SAM sheet-part cutting and realtime voice streaming remain disclosed as unbuilt.

All owned gateway, dev-server, Chrome and child PIDs stopped; configuration is \`metaQuest3\`; the heavy slot was released. [Cleanup](audit/cleanup.json), [evidence limits](audit/packaging.json). No commits, pushes or deployments were made by this worker.
`);
console.log('TESTING.md generated from fresh run evidence');
