# Breakwater Reach · paired presentation measurements

The game and driver were tested at `4855372aefc64b307b8088fbd6bdbffdf9e3611c` using the extracted ZIP. The driver used the archived tank run, with identical command changes, actors and projectiles in each timed pass. The 1,149-tick victory reproduced state `167150e6` and events `ce10fecb` in every pass. Each backend ran the reference, experiment, experiment and reference again, with 24 warm-up frames before each pass and 575 measured draws per pass. The chase, sight and overview camera schedule follows the v0.2.0 benchmark. Both paths use Balanced vehicle detail.

Linux x64, AMD Ryzen 9 5950X 16-Core Processor, Chrome/158.0.8127.36, 1100 × 720 WebGL1. The native context identified `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)`. The software context independently identified `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Device and driver metadata are in the raw reports.

Values are pooled median / p95 in milliseconds. Draws and vertices are arithmetic means per frame. CPU view time includes geometry submission and tactical chart drawing. A preparation reading of zero can fall below the exposed browser timer resolution.

| Backend | Presentation | Draws | Vertices | View CPU ms | FX geometry CPU ms | GL timer ms | Frame interval ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native | standard | 42.2 | 77,342 | 0.40 / 0.50 | 0.00 / 0.00 | 0.75 / 1.15 | 16.70 / 16.70 |
| native | fx | 43.2 | 77,402 | 0.40 / 0.60 | 0.00 / 0.00 | 0.77 / 1.19 | 16.70 / 16.70 |
| software | standard | 42.2 | 77,342 | 0.60 / 0.90 | 0.00 / 0.00 | 10.46 / 12.94 | 16.70 / 16.80 |
| software | fx | 43.2 | 77,402 | 0.70 / 0.90 | 0.00 / 0.10 | 10.34 / 12.97 | 16.70 / 16.70 |

## Memory and resources

Each backend also ran one separate, untimed allocation-sampling pass per presentation. V8 sampled JavaScript heap allocations every 8 KiB and included objects collected during the pass. These estimates include construction, warm-up, the benchmark driver and HUD. The raw reports attribute samples to the nearest game source frame and show heap snapshots. GPU memory, typed-array backing stores and whole-process memory require separate accounting.

| Backend | Presentation | Sampled JS bytes | Experiment-owned typed-array bytes | Live meshes |
| --- | --- | ---: | ---: | ---: |
| native | standard | 660,882,776 | 0 | 32 |
| native | fx | 664,270,208 | 2,459 | 33 |
| software | standard | 663,071,976 | 0 | 32 |
| software | fx | 664,175,760 | 2,459 | 33 |

All views released their mesh buffers after each pass. Request lists are restricted to the served loopback game and local data. The measurements describe this replay and these backends. [Raw native report](native.json.gz) · [Raw SwiftShader report](software.json.gz) · [Pooled JSON](pooled.json)

The following screenshots are taken outside timed frames at identical accepted ticks.

| View | Reference | Experiment |
| --- | --- | --- |
| chase, 240 | [Standard](breakwater-standard-chase.png) | [Experiment](breakwater-fx-chase.png) |
| sight, 600 | [Standard](breakwater-standard-sight.png) | [Experiment](breakwater-fx-sight.png) |
