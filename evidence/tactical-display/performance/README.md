# Breakwater Reach · paired presentation measurements

The game and driver were tested at `3793a0e5b1213f3bb66ffc2469cbb75a5f17be85` using the extracted ZIP. The driver used the archived tank run, with identical command changes, actors and projectiles in each timed pass. The 1,149-tick victory reproduced state `167150e6` and events `ce10fecb` in every pass. Each backend ran the reference, experiment, experiment and reference again, with 24 warm-up frames before each pass and 575 measured draws per pass. The chase, sight and overview camera schedule follows the v0.2.0 benchmark. Both paths use Balanced vehicle detail.

Linux x64, AMD Ryzen 9 5950X 16-Core Processor, Chrome/158.0.8127.36, 1100 × 720 WebGL1. The native context identified `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)`. The software context independently identified `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Device and driver metadata are in the raw reports.

Values are pooled median / p95 in milliseconds. Draws and vertices are arithmetic means per frame. CPU view time includes geometry submission and tactical chart drawing. A preparation reading of zero can fall below the exposed browser timer resolution.

| Backend | Presentation | Draws | Vertices | View CPU ms | Chart CPU ms | GL timer ms | Frame interval ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native | standard | 42.2 | 77,342 | 0.40 / 0.60 | 0.00 / 0.10 | 0.89 / 1.34 | 16.70 / 16.80 |
| native | retro | 42.2 | 77,342 | 0.70 / 0.90 | 0.30 / 0.40 | 1.74 / 2.53 | 16.70 / 16.70 |
| software | standard | 42.2 | 77,342 | 0.60 / 0.90 | 0.00 / 0.10 | 10.61 / 13.57 | 16.70 / 16.70 |
| software | retro | 42.2 | 77,342 | 1.10 / 1.40 | 0.50 / 0.60 | 10.74 / 13.61 | 16.70 / 16.70 |

## Memory and resources

Each backend also ran one separate, untimed allocation-sampling pass per presentation. V8 sampled JavaScript heap allocations every 8 KiB and included objects collected during the pass. These estimates include construction, warm-up, the benchmark driver and HUD. The raw reports attribute samples to the nearest game source frame and show heap snapshots. GPU memory, typed-array backing stores and whole-process memory require separate accounting.

| Backend | Presentation | Sampled JS bytes | Experiment-owned typed-array bytes | Live meshes |
| --- | --- | ---: | ---: | ---: |
| native | standard | 666,001,548 | 0 | 32 |
| native | retro | 668,887,932 | 198,076 | 32 |
| software | standard | 661,030,168 | 0 | 32 |
| software | retro | 665,809,580 | 198,076 | 32 |

All views released their mesh buffers after each pass. Request lists are restricted to the served loopback game and local data. The measurements describe this replay and these backends. [Raw native report](native.json.gz) · [Raw SwiftShader report](software.json.gz) · [Pooled JSON](pooled.json)

The following screenshots are taken outside timed frames at identical accepted ticks.

| View | Reference | Experiment |
| --- | --- | --- |
| chase, 240 | [Standard](breakwater-standard-chase.png) | [Experiment](breakwater-retro-chase.png) |
| sight, 600 | [Standard](breakwater-standard-sight.png) | [Experiment](breakwater-retro-sight.png) |
