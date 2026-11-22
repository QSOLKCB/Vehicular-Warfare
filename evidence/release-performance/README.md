# VW-007 release candidate

Download the [tested offline game](offline-game.zip) and unzip it. From inside the extracted Vehicular-Warfare directory, run `python3 -m http.server 8080 --bind 127.0.0.1` and open `http://127.0.0.1:8080/`. The complete candidate is 171,222 bytes. Two builds from the same implementation commit had SHA-256 `cdc638c95690c692ce1bed875a46836fc2667bc5a8b2fd72610bad11f3552650`.

| Revision | Exact Git commit |
| --- | --- |
| Reviewed creator systems base | `6c8bf5453110f195e5adae107f0d5dd56a1845d8` |
| Game, tests, benchmark driver and ZIP | `caece10be1bdc7474fd7bb6550d1973cab521147` |
| VANILLAJS v3.4.0 | `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466` |

The ZIP comment identifies the implementation commit. The second PR commit contains the observations from that implementation. A CI build records its own checkout SHA in its ZIP. The simulation and vendor Git trees match the reviewed base byte for byte. All six source identities, vendored module receipts and licence checksums are recorded in [provenance.json](provenance.json).

## Try the controls

Open Cutbank Relay, Glassworks Crossing or Lantern Sound from the mission board. Start in **Simple**. Use W/S to move, A/D to turn the vehicle and mount together, and Space to fire. Try D from rest in the cutter to feel the rudder take effect as the engine supplies headway. Try releasing W in the tank to stop at the firing shelf. Q/E and R/F give manual mount control with the same hand. For separate hull and mount control, select **Independent** before deploying or while paused. The same preference applies to all three surface crews in their own sorties, Breakwater Reach and workshop playtests.

Chromium 158.0.8127.36 served the extracted ZIP over local HTTP. All 72 runtime files matched the implementation tree, with combined SHA-256 `c88c5e1b76b79bc6629a7ef1d9ebe7705d0fdecf9edba2aa5b55a899d720d139`. The browser recorded 68 local or data requests and zero errors. Using only W and Space for the winning runs, all three crews completed their missions and reproduced their state and event hashes. [Raw commands, outcomes and controls checks](controls/controls.json)

| Crew | Victory tick | Score | State / event hash | Chromium screenshots |
| --- | ---: | ---: | --- | --- |
| Tank | 486 | 100 | `8b3e7ee1` / `ace6456c` | [Briefing](controls/01-tank-controls.png) · [Victory](controls/02-tank-victory.png) |
| Mech | 1,153 | 150 | `cb5fa56d` / `38fb67f4` | [Briefing](controls/01-mech-controls.png) · [Victory](controls/02-mech-victory.png) |
| Cutter | 1,250 | 250 | `7cc2cb84` / `2b4ce92d` | [Briefing](controls/01-ship-controls.png) · [Victory](controls/02-ship-victory.png) |

Separate inputs exercised steering from rest, manual aim and the Independent setting. Pausing cleared held input, stopped the simulation clock and freed the renderer's mesh buffers. In Breakwater Reach, E raised the helicopter and D turned the cutter and its deck mount. The workshop inherited the saved control preference and its walker responded to A in Simple mode.

## Review the render change

Open the [performance report](PERFORMANCE.md) for paired chase and sight screenshots, raw per-frame samples, CPU preparation and GPU timings. The course uses one recorded Breakwater Reach battle with three camera views. Balanced detail combines distant crews into a single draw and limits visual debris. Projectiles, the selected vehicle, the relay, collision and mission scoring continue to use the accepted world state.

## Numerical verification

Node 22.18.0 passed all [100 candidate tests](numerical/node.tap), including the original [87 reviewed-base tests](numerical/base-node.tap). The identity checker verified all six simulation source hashes. The original 801-tick flight finished with a victory in both runs, with identical command lists, events, state hash `e97f4002` and event hash `7aca9422`. The per-step observations are in the [reviewed-base flight](numerical/base-flight.json) and the [candidate flight](numerical/flight.json).

## Historical browser verification

| Suite | Observed result |
| --- | --- |
| [Sable Valley](regressions/sable.json) | Victory at tick 1,094. Exposed flight ended in defeat at tick 769. |
| [Long Watch and Frostline Run](regressions/routes-flights.json) | Fresh victories at ticks 8,602 and 9,429. Chromium reproduced both fresh receipts and verified the two [original archived recordings](regressions/archived-routes.json). Node produced different digests for the fresh flight recordings. Replay compatibility for these routes is scoped to the tested browser. [Exposed flight](regressions/routes-exposure.json) · [Runtime](regressions/routes-runtime.json) |
| [Terrain laboratory](regressions/terrain.json) | Checked WebGL and height-column parity, switching, pause, restart, cockpit and depth. |
| [Cutbank Relay](regressions/tank.json) | Victory at tick 484 and defeat at tick 1,056. |
| [Glassworks Crossing](regressions/mech.json) | Victory at tick 1,154 and defeat at tick 1,135. |
| [Lantern Sound](regressions/naval.json) | Victory at tick 1,250 and defeat at tick 959. |
| [Breakwater Reach](regressions/combined.json) | Helicopter, tank, mech and ship won at ticks 1,095, 1,149, 820 and 978. Defeat at tick 1,064. |
| [Mission workshop](regressions/creator.json) | The authored mission reached victory at tick 959 and defeat at tick 1,054. Chromium verified the prior mixed battle recording. |

## Reproduce

Use a checkout at the implementation commit shown above to reproduce the included ZIP. Use the [release guide](../../docs/RELEASE.md) to rebuild, check identities, run the numerical suite and drive the extracted candidate with Chromium. The [performance report](PERFORMANCE.md) gives the native/software comparison procedure. From this evidence directory, run `sha256sum -c SHA256SUMS` to verify the archived files.
