# VW-003 · Glassworks Crossing verification

The game, acceptance drivers and tests were run at `8b9487233a042f5a5cf210f0180df717b5431ac5`. Its parent is the reviewed Cutbank merge, `2a37cb8f91bb0ed9e0bab349e13cc3d69510e3ad`. The following evidence commit adds only files in this directory.

## Play or reproduce

Run `python3 -m http.server 8080 --bind 127.0.0.1` in the repository root and open `http://127.0.0.1:8080/`. Choose **Mech sortie → Deploy walker**. Hold W to cross the causeway. The arrows turn the torso and elevate the gun independently. C switches between chase and gun sight. Disable the sentinel with Space, then continue to the blue beacon. To reproduce the exposed defeat, walk straight ahead with W alone. To replay a recording, open **Walker controls & saved replays** and select the downloaded JSON. [Winning recording](winning-replay.json)

```sh
output=$(mktemp -d)
python3 tools/identity.py --check
node --test test/*.test.js
node tools/measure.mjs > "$output/flight-measure.json"
node tools/measure.mjs mech > "$output/mech-measure.json"
CHROMIUM=google-chrome node tools/browser.mjs "$output/mech" mech
CHROMIUM=google-chrome node tools/browser.mjs "$output/tank" tank
CHROMIUM=google-chrome node tools/browser.mjs "$output/sable"
CHROMIUM=google-chrome node tools/browser.mjs "$output/terrain" terrain
CHROMIUM=google-chrome node tools/browser.mjs "$output/routes" routes
```

## Contacts and outcomes

Node v22.18.0 passed 38 tests. On sloping ground the tests measure both 1.55 m links, check the pelvis projection against the planted triangle and verify that stance shoes keep the same coordinates through a stride. A reachable drop unloads the shoes, lowers the pelvis and recovers six contacts. At the 9 m ledge, unreachable feet stay unloaded and horizontal motion stops. A separate test arrests a stride near the other walker and then backs away. A fixed command trace produced identical victory receipts at presentation schedules of 30, 60 and 144 Hz. [Test results](node.tap) · [Walking model and bounds](../../docs/MECH_WARFARE.md)

| Seed 919 run | Ticks | Completed strides | Score | State digest | Event digest |
| --- | ---: | ---: | ---: | --- | --- |
| Node, walk and fire from tick zero | 1,152 | 48 | 150 | `1b3e05f3` | `20ed0bf8` |
| Node, walk into sentinel fire | 1,132 | 47 | 0 | `29369f1b` | `96b8a768` |
| Chromium, keyboard victory | 1,154 | 48 | 150 | `0641085c` | `e2e163e0` |
| Chromium, keyboard defeat | 1,134 | 47 | 0 | `2b6d9a0a` | `9fd0074a` |

Both numerical fixtures replayed in Node. Both browser recordings replayed in Chrome. The browser accepted input after launch and released the trigger after disabling the sentinel. Its saved win has SHA-256 `fd91fa507b62f28e50a294c639bb81f0393c8897ab3bc065ecfb8eb4f3f03a1a` and passed the file-picker round trip. The walking authority source is `vw-003:b0418e4091bb2fe8f7b7714095023ea4890cc1f9865284101f0cd0a7414d6a3f`. [Node recordings and ordered events](mech-outcomes.json) · [Browser report](mech.json)

To verify both archived numerical outcomes from the repository root, run

```sh
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mechReceipt, replayMech} from './sim/mech-world.js';
const runs = JSON.parse(readFileSync('evidence/mech-warfare/mech-outcomes.json', 'utf8'));
for (const run of runs) {
  const world = replayMech(JSON.stringify(run.receipt));
  assert.deepEqual(mechReceipt(world), run.receipt);
  assert.deepEqual(world.events, run.events);
  console.log(world.status, world.tick, run.receipt.stateHash);
}
JS
```

## What the browser observed

At tick 43 the leg frame faced due north while the torso had traversed 0.32 rad. On a separately regenerated field, the three planted soles had zero height error and the other three were 0.338 m above the surface. At tick 61 the opposite tripod was planted and the airborne soles cleared the ground by 0.116 m. In the winning sortie the sentinel was disabled at tick 558. The mission continued until the walker reached the beacon at tick 1,154 with 80% health. In the loss run the sentinel survived with its full 60 health points. [Briefing](01-glassworks-briefing.png) · [Walking](02-walking.png) · [Gun sight after first damage](03-engagement.png) · [Beacon victory](04-beacon-victory.png) · [Defeat](05-defeat.png)

The driver navigated from the mission board under the local `/ridgefire/` prefix, switched cameras, enabled sound, paused and restarted. Keyboard pause, blur, a hidden-state event, pointer unlock and changing the foreground tab cleared held inputs, stopped the clock and released the scene buffers, sound, animation frame and session listeners. The WebGL-unavailable path showed the retry panel. Chrome recorded zero runtime errors and only loopback requests. [Lifecycle, requests and replay](mech.json)

## Performance

Chrome 158.0.8127.36 (V8 15.8.62.31) ran WebGL1 at 1100 × 720 on an AMD Ryzen 9 5950X using ANGLE Vulkan SwiftShader software rendering. Each pair below is p50 / p95, in milliseconds. Frame intervals use the animation clock, view time includes CPU preparation and draw submission, and tick time measures one authoritative step. Tick windows contain the last 1,024 samples. Zero reflects timer precision.

| Chrome run | Frame intervals | Frame interval | View CPU | Tick CPU | Peak live pulses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Victory | 576 | 16.7 / 16.8 | 0.3 / 0.5 | 0.0 / 0.2 | 3 |
| Defeat | 567 | 16.7 / 16.8 | 0.4 / 0.6 | 0.0 / 0.1 | 1 |

The first damage observation submitted 69,048 vertices in 46 draws with two walkers. The view accounted for 1,731,456 bytes of geometry, including its reusable buffers. The game caps live pulses at 12, recent events at 96 and simultaneous sound voices at eight. The debugger reported 16,544,620 bytes of used JS heap after restart and 2,171,404 bytes after the final debrief and forced collection. Both snapshots include the debugger and page. In a separate single Node victory run, world-step CPU time was 37 / 138 microseconds (p50 / p95, 1,152 samples), with five pulses live at peak. [Raw browser windows and heap samples](mech.json) · [Raw numerical timings](mech-measure.json)

Native GPU performance, physical speaker output, mobile input and long-session allocation rates were **not run**. The walker uses six point soles, quasi-static support and two translating body hit boxes. Replay verification covers the recording runtime.

## Earlier missions and source provenance

The shared ground station completed Cutbank victory at tick 485 and defeat at tick 1,058. Sable Valley completed victory at 1,076 and defeat at 764. With the same fixed commands, original WebGL, voxel and switching modes all reproduced the 442-tick Sable victory with state `56d28634` and event digest `79014d08`. [Cutbank regression](tank-regression.json) · [Sable regression](sable-regression.json) · [Renderer parity and depth](voxel-regression.json) · [Sable numerical timings](flight-measure.json)

Long Watch won at tick 8,545 after 12 enemy launches. Frostline Run won at tick 9,475 after 18. Chrome reproduced both recordings. Replaying these two Chromium wins in Node produced different digests, as in the reviewed Cutbank evidence. The Long Watch exposure run ended at tick 1,633 after nine damaging hits. All five Chromium suites exited successfully with zero recorded runtime errors. [Route recordings and runtime comparison](routes-flights.json) · [Exposure defeat](routes-exposure.json) · [Chromium environment](routes-runtime.json)

The helicopter source identity is `vw-001a:510b596e40cc515d1ac9a6b8281fd4c06559258f83a1c179b082426954733ecb`. The tracked identity is `vw-002:f142eb3087c23f7e4ca5b36bbe87578526ee43dc931b1899109754588d38e140`. The simulation files in both identity calculations match the reviewed base byte for byte. Archived Node Cutbank receipts replayed at ticks 447 and 1,055. Historical Sable receipts replayed at ticks 1,036 and 763. [Tracked receipts](../tracked-warfare/tank-numeric.json) · [Historical Sable receipts](../browser/playthrough.json)

All five vendored modules, LICENSE and NOTICE matched the upstream Git blobs and the SHA-256 manifest at VANILLAJS v3.4.0, commit `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466`. The manifest SHA-256 is `0608e182be0d55f1dcb2fcf92eae6e3078e704de8ef7fadcc0fb5ab933a61bef`. The Glassworks terrain, articulated geometry and synthesized sound were created in this repository. [Engine manifest and file hashes](../../vendor/vanillajs/provenance.json)
