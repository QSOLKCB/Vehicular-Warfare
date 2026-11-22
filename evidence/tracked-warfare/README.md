# VW-002 · Cutbank Relay verification

Base `10d67cbdf0bde2b83ea1f527ef0a17fdb7ddf221` is the reviewed merge of VW-VIS-001. The tested game, drivers and tests are at `b88ccb38822cc9e38c23acff8ecd0f009ec6eae7`. The following evidence commit adds the recorded results.

## Reproduce

Serve the repository with `python3 -m http.server 8080 --bind 127.0.0.1`. In desktop Chromium, open localhost on port 8080, choose **Tracked sortie**, then **Deploy crawler**. Hold W to drive north. Turn the turret with the arrow keys as the hull travels forward. Brake with Shift on the bench behind the ridge. The objective panel shows the guard’s view of your vehicle, and the gunner sight reports your view of the guard. Release Shift after stopping, switch to the gun sight with C and fire with Space. Save a replay at the debrief and use **Check saved ground replay** to verify it.

The following developer runs start an isolated loopback server under a directory prefix. Use a fresh output directory to preserve the previous receipts.

```sh
output=$(mktemp -d)
node --test test/*.test.js
node tools/measure.mjs
CHROMIUM=google-chrome node tools/browser.mjs "$output/routes" routes
CHROMIUM=google-chrome node tools/browser.mjs "$output/sable"
CHROMIUM=google-chrome node tools/browser.mjs "$output/terrain" terrain
CHROMIUM=google-chrome node tools/browser.mjs "$output/tank" tank
```

## Numerical result

Node v22.18.0 passed 26/26 tests. The two tracked suites exercise differential propulsion, pivoting, braking, inclined planes, a narrow interior ridge, rejection of an unsupported step, world bounds and independent traverse. In the accepted mission a stopped chassis had all eight hull corners screened by the ridge while its turret was exposed. Sweeps from the same observer hit terrain along the hull line and the turret on the higher line. The blocked-barrel fixture put a ridge between mount and muzzle while the muzzle point itself was clear. The four armour-face fixtures crossed actual contact planes. A separate fixture intercepted a translating hull between its endpoint poses. [TAP](node.tap) · [Tracked authority contract](../../docs/TRACKED_WARFARE.md)

| Node run | Ticks | State digest | Ordered event digest |
| --- | ---: | --- | --- |
| Drive 180 ticks, then brake and fire | 447 | `46ecee4c` | `2f78b155` |
| Drive into the open, take guard fire | 1,055 | `7103272f` | `5618f363` |

At 30, 60 and 144 Hz presentation schedules, the fixed command trace reproduced the shelf victory. The recordings include actual launch, impact, component/plate damage, destruction and outcome events. [Tank receipts](tank-numeric.json) · [Original Sable timing and receipt](flight-measure.json)

The tank simulation identity is `vw-002:f142eb3087c23f7e4ca5b36bbe87578526ee43dc931b1899109754588d38e140`. The helicopter identity remains `vw-001a:510b596e40cc515d1ac9a6b8281fd4c06559258f83a1c179b082426954733ecb`. All five vendored module entries, LICENSE and NOTICE matched the dependency closure and Git blobs at VANILLAJS v3.4.0 commit `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466`. The vehicle geometry, terrain, drive and encounter in this phase are original. [Per-file SHA-256 manifest](../../vendor/vanillajs/provenance.json)

## Chromium result

[Briefing](01-cutbank-briefing.png) · [Independent turret](02-independent-turret.png) · [Hull-down chase view](03-hull-down.png) · [Gun camera](03b-gun-sight.png) · [Accepted hit](04-hit.png) · [Victory](05-victory.png) · [Defeat](06-defeat.png)

The driver deployed from the original mission board, drove with W, independently traversed the turret and pivoted the hull. It then started a fresh run. The first pulse struck the ridge. At tick 253 the crawler had stopped on the bench at Z = 20.74 m. Its muzzle was clear and the guard could see the turret while all hull probes stayed masked. The driver finished the encounter from that position. The loss run drove into the open and the guard disabled the player through accepted hits. [Raw browser report](tank.json)

| Browser run | Ticks | State digest | Event digest | Peak live shots |
| --- | ---: | --- | --- | ---: |
| Victory | 485 | `58a10f4d` | `b94af14d` | 3 |
| Defeat | 1059 | `0ebc40bc` | `66ad8905` | 2 |

The debrief downloaded a winning receipt and the file picker verified the same bytes locally. Both end states reproduced in the recording browser. The driver exercised keyboard pause, blur, hidden-state notification, pointer unlock, a foreground-tab change, restart and the WebGL-unavailable error panel. Pauses stopped the clock, cleared held commands and released the mesh set, animation frame and session listeners. All observed network requests stayed local. [Downloaded replay](winning-replay.json)

The helicopter regressions completed Sable Valley victory and defeat, Long Watch at 8,590 ticks, and Frostline Run at 9,540 ticks. The original and optional voxel views again produced the same fixed-command victory. The long browser routes verified in Chromium and recorded their own Node runtime comparison. [Sable](sable-regression.json) · [Long route receipts](routes-flights.json) · [Long route runtime](routes-runtime.json) · [Exposure defeat](routes-exposure.json) · [Voxel replay, timing and depth checks](voxel-regression.json)

## Performance and limits

Chrome/158.0.8127.36 on an AMD Ryzen 9 5950X 16-Core Processor used 1100 × 720 WebGL1 with ANGLE Vulkan SwiftShader software rendering. The table uses the raw sample windows in the two terminal receipts. Frame intervals are RAF deltas. View time includes CPU preparation and draw submission. The tick sample measures one world step. All times are p50 / p95 in milliseconds and a zero reading reflects browser timer precision.

| Run | Frame samples | Frame interval | View CPU | World tick CPU |
| --- | ---: | ---: | ---: | ---: |
| Victory | 236 | 16.7 / 16.7 | 0.3 / 0.6 | 0.1 / 0.3 |
| Defeat | 530 | 16.7 / 16.7 | 0.3 / 0.6 | 0.1 / 0.2 |

The stopped chase frame submitted 64,824 vertices in 9 draws with two actors and 1,745,280 bytes of accounted geometry. The world caps shots at 12 and its recent event buffer at 96. The view reuses model and effect buffers. Debugger-reported JS heap used was 13,918,376 B after restart and 2,060,028 B after final teardown and forced GC. These snapshots cover the full page and include debugger effects. [Raw frame, view, tick and memory observations](tank.json)

Native GPU performance, mobile controls and long-session allocation behaviour were not run. Cutbank uses WebGL and has one stationary defending vehicle. Its rigid tracks, point-sampled component visibility and tick-local rotation approximation bound the tested physics scope. [Contact and replay API](../../docs/TRACKED_WARFARE.md)
