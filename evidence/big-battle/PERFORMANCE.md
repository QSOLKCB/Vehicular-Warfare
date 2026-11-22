# The Big Battle · measured scale

Node v22.18.0 and Chrome/158.0.8127.36 ran gameplay and drivers at `4c45f35e6092c8b7d4ebd8a1a0d1477338254b75` on an AMD Ryzen 9 5950X 16-Core Processor. Both deployments used the same Breakwater field, formation authority and shared 32-projectile cap.

## Simulation

After a warmup of each deployment, the numerical driver alternated three 480-tick measurements per scenario. All Cobalt crews designated the relay and Basalt received one queued MOVE. The ranges below span the three independent runs. Incoming sweeps count active cells entering the collision pass.

| Mobile vehicles | Commandable | Tick µs p50 range | Tick µs p95 range | Peak shots | Incoming sweeps over 480 ticks |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 4 | 270–296 | 362–427 | 10 | 2553 |
| 24 | 12 | 662–748 | 1063–1153 | 26 | 7427 |

A separate fresh group MOVE to (−15, 6) measured the first route searches and followed the resulting live encounter through tick 2,000. For the twelve-crew order seven crews recorded destination arrival. Six crews were operational at the final observation. Destruction after a completed MOVE preserves that arrival in the ledger.

| Moving crews | Admission ms | First movement tick ms | Plans | Grid nodes visited |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 0.42 | 2.05 | 4 | 191 |
| 12 | 0.60 | 5.75 | 12 | 1223 |

## Packaged browser observations

Each renderer ran fresh 8- and 24-vehicle sessions at 1100 × 720 CSS pixels, first on the map and then in the overhead camera at balanced detail. The camera recorded up to 90 draws with a GPU timer query every sixth frame. CPU timings measure draw submission, and interval timings measure time between successive draws. The table reports p50 / p95 in milliseconds.

| Renderer | Mobile vehicles | Map CPU | 3D interval | 3D CPU | WebGL GPU | Draw calls p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| RTX 5060 Ti | 8 | 0.30 / 0.40 | 16.70 / 17.30 | 0.60 / 1.00 | 0.51 / 0.61 | 10 |
| RTX 5060 Ti | 24 | 0.20 / 0.40 | 16.80 / 18.40 | 0.50 / 0.80 | 0.57 / 1.32 | 10 |
| SwiftShader | 8 | 0.20 / 0.20 | 16.70 / 17.10 | 0.50 / 0.70 | 6.32 / 6.84 | 10 |
| SwiftShader | 24 | 0.20 / 0.30 | 16.50 / 18.40 | 0.70 / 1.00 | 6.63 / 7.22 | 10 |

The separate playthrough selected all twelve Cobalt crews, queued a move for Basalt 2, switched to 3D during projectile travel, returned to the map and reimported the downloaded victory. The live pointer and form inputs reached the two browser sessions at different ticks. Each session reproduced its own recording. Each profile also sampled heap once after releasing the renderer on pause.

| Renderer | Visible bodies in observed battle frame | Live cells in frame | Winning tick | Verified state | Verified events |
| --- | ---: | ---: | ---: | --- | --- |
| RTX 5060 Ti | 25 | 12 | 648 | `17f59443` | `36df0332` |
| SwiftShader | 25 | 3 | 654 | `c25b0e33` | `5f305ac6` |

The raw reports include per-frame visible-body and projectile counts, vertex counts, heap use, CPU and GPU geometry budgets, and timer-query availability. Terrain, visibility, order mix and camera subject affect the workload. The larger tested deployment is 24 mobile vehicles plus one shore relay.
