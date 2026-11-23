# Operation Overlord performance

Node v22.18.0 ran both 24-vehicle scenarios at `8ada33b9bbf5d2114f684c667aecad80855896bb` on the AMD Ryzen 9 5950X 16-Core Processor. Both deployed seed 2505, ordered all twelve Cobalt crews to attack the visible relay at tick zero and queued a crossing move for Basalt 2. Each scenario retained the 120 Hz clock and 32-projectile cap. [Raw paired measurements](paired.json.gz)

## Simulation ticks

The driver warmed each scenario for 60 ticks and alternated the run order over three 480-tick trials per scenario. The table pools tick samples across those trials. The p95 range gives the lowest and highest individual trial p95.

| Scenario | Tick samples | p50 ms | p95 ms | Trial p95 range ms | Max ms | Node sampled heap MiB |
| --- | --- | --- | --- | --- | --- | --- |
| Big Battle | 1440 | 0.698 | 1.217 | 1.036–1.431 | 2.560 | 8.7–27.4 |
| Overlord | 1440 | 0.698 | 1.142 | 1.048–1.246 | 3.076 | 8.4–26.9 |

Overlord’s pooled p95 was 0.075 ms lower (6.2%). The measured tactical phase averaged 0.0311 ms per tick. Its p50 / p95 were 0.0233 / 0.0676 ms, with a 0.968 ms maximum. That phase covers section readiness, scheduled doctrine decisions and faction sensor sampling. Formation route searches, movement, weapon resolution and the rest of the encounter contribute to total tick time. [Paired samples and phase timings](paired.json.gz)

The historical Big Battle p95 range on the Ryzen 9 5950X was about 1.06–1.15 ms. The fresh pair shares its starting conditions, but its two AI policies produce different contacts, routes, casualties and projectile loads. Overall tick differences include those workload changes, instrumentation, runtime warmup and host scheduling. [Historical Big Battle measurements](../big-battle/PERFORMANCE.md)

## Accepted work and replay

The 480-tick rows use the first trial of each scenario. Separate runs continued through the terminal outcome. Navigation plans include direct legs, and visited nodes count grid expansions. Blocked counts distinct crew, tick and reason combinations. Incoming sweeps count active projectiles entering the collision pass. The mobile crew counts exclude the relay.

| Scenario | Tick / outcome | Decisions / sim s | Sensor evaluations | Plans / visited / replans | Blocked | Live crews / casualties | Launches / peak live / sweeps | Verified state / event |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Big Battle | 480 / active | 0 / 0.0 | — | 1 / 0 / 0 | 0 | 24 / 0 | 52 / 26 / 7391 | `202cb0a7` / `0d5ffbc2` |
| Overlord | 480 / active | 231 / 57.8 | 700 | 33 / 193 / 0 | 3 | 23 / 1 | 48 / 24 / 6218 | `216fd448` / `32772b6d` |
| Big Battle | 637 / victory | 0 / 0.0 | — | 1 / 0 / 0 | 0 | 21 / 3 | 63 / 26 / 9803 | `e864f6a8` / `cf908d66` |
| Overlord | 837 / victory | 380 / 54.5 | 1397 | 45 / 763 / 0 | 5 | 20 / 4 | 74 / 24 / 11178 | `2d12f282` / `8474ea5a` |

The complete Overlord run ended 200 ticks later and launched 11 more projectiles. Every measured run replayed in the recording Node runtime. The raw reports include source identities, spawn positions, accepted commands, survivors and each blocked result. [Paired receipts and work counters](paired.json.gz)

## Packaged Chromium

Native used Chrome/158.0.8127.36, 1100 × 720 and ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2) at `8ada33b9bbf5d2114f684c667aecad80855896bb`. Its player-driven operation reached victory at tick 1064 and reproduced state / event `c334a225` / `e050ac0d` in that browser. [Native report](native.json.gz)

Software used Chrome/158.0.8127.36, 1100 × 720 and ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) at `8ada33b9bbf5d2114f684c667aecad80855896bb`. Its player-driven operation reached victory at tick 1057 and reproduced state / event `b1fec909` / `6fcc16ca` in that browser. [Software report](software.json.gz)

Each renderer profiled separate live Big Battle and Overlord sessions on the strategic map and in the overhead camera. Entries are p50 / p95 in milliseconds. Map CPU covers the chart draw, 3D CPU covers draw submission, and WebGL time uses completed disjoint-timer extension queries issued every sixth observed draw. GPU n is the number of usable query samples. Heap is the DevTools used-size snapshot after the observer sample.

| Renderer | Scenario | Map interval | Map CPU | 3D interval | 3D CPU | WebGL GPU | GPU n | Heap MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| native | Big Battle | 16.70 / 16.80 | 0.10 / 0.20 | 16.70 / 17.30 | 0.50 / 0.60 | 0.44 / 1.37 | 15 | 13.1 |
| native | Overlord | 16.70 / 16.70 | 0.20 / 0.30 | 16.70 / 17.20 | 0.60 / 0.90 | 0.42 / 2.03 | 15 | 25.1 |
| software | Big Battle | 16.70 / 16.70 | 0.40 / 0.50 | 16.70 / 24.40 | 1.10 / 1.50 | 8.45 / 13.56 | 15 | 6.0 |
| software | Overlord | 16.70 / 16.70 | 0.30 / 0.40 | 16.70 / 17.60 | 1.00 / 1.30 | 6.90 / 9.24 | 15 | 34.2 |

Node sampled its process heap every 60 ticks. Browser and Node heaps include runtime and collector activity. Allocation rates, retained growth over long sessions and performance on other hardware remain unmeasured. Browser input reached the two acceptance playthroughs at different ticks. Replay verification compares each recording with its reconstruction in the same runtime.

Regenerate the tables with `node tools/overlord-report.mjs evidence/overlord/paired.json.gz evidence/overlord/native.json.gz evidence/overlord/software.json.gz`.
