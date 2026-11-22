# Breakwater Reach rendering measurements

The reviewed base was `6c8bf5453110f195e5adae107f0d5dd56a1845d8`. The tested game and benchmark driver were `caece10be1bdc7474fd7bb6550d1973cab521147`. Each pair of passes followed the same 1,149-tick tank recording to victory. Balanced reduced mean WebGL draw submissions by 31.4% and mean submitted vertices by 7.9% on this route. The Full profile matched the base draw and vertex counts at each sampled tick.

| Backend | Renderer | Simulation CPU ms | View CPU ms | HUD CPU ms | GL timer ms | RAF interval ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Native | Reviewed base | 0.60 / 0.90 | 0.50 / 0.70 | 0.00 / 0.10 | 1.16 / 1.53 | 16.70 / 16.70 |
| Native | Full | 0.60 / 0.90 | 0.50 / 0.70 | 0.00 / 0.10 | 0.92 / 1.44 | 16.70 / 16.70 |
| Native | Balanced | 0.60 / 0.80 | 0.40 / 0.60 | 0.00 / 0.10 | 0.98 / 1.35 | 16.70 / 16.80 |
| Software | Reviewed base | 0.70 / 1.10 | 0.70 / 1.00 | 0.10 / 0.20 | 11.72 / 14.29 | 16.70 / 16.80 |
| Software | Full | 0.70 / 1.10 | 0.70 / 1.00 | 0.10 / 0.20 | 11.08 / 14.87 | 16.70 / 16.80 |
| Software | Balanced | 0.70 / 1.20 | 0.60 / 0.90 | 0.10 / 0.20 | 10.63 / 13.82 | 16.70 / 16.80 |

The median RAF interval was 16.7 ms in all six cases. On the native GPU, median GL time varied from 0.76 to 1.08 ms across the two Full passes and from 0.98 to 0.99 ms across the two Balanced passes. The clearest improvement on this route was fewer draw submissions and lower CPU time in the view.

Each entry gives pooled p50 / p95, using the sorted sample at `floor(p × count)`. Each row contains two passes of 575 frames and 574 RAF intervals. View CPU measures wall time inside `CombinedView.draw`, including GL submission and chart drawing. HUD CPU measures synchronous DOM updates. Zero-duration samples fell within the browser clock's resolution. The simulation column measures two 120 Hz steps per frame, with a final single step. The GL column uses asynchronous `EXT_disjoint_timer_query` queries around the view's GL commands every eighth frame. Each backend returned 432 timer samples with zero discarded. RAF measures the spacing of browser callbacks. Headless composition and scheduling limit what the observed intervals establish about displayed frame rate.

| Profile | Mean draws | Mean vertices | Live GL meshes | Effect box capacity | Owned CPU geometry bytes | GPU geometry upper bound, bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 61.5 | 83,975.0 | 31 | 128 | 850,464 | 2,031,840 |
| full | 61.5 | 83,975.0 | 31 | 128 | 850,464 | 2,031,840 |
| balanced | 42.2 | 77,341.9 | 32 | 64 | 881,856 | 2,029,392 |

The scene started with nine actors across both factions. The recording reached 13 simultaneous projectiles. Balanced rendered up to 5 distant actors in one batch, 32 debris boxes, 5 shadow discs and 192 wake vertices. Every candidate sample accounted for all live actors visible under that camera's drawing rules and included every live projectile in the effect stream. CPU bytes cover owned geometry arrays, including the distant templates. GPU bytes use capacity, and mesh counts were checked again after disposal. The benchmark did not measure total process memory or whole-browser allocations.

## Conditions

The host ran Linux x64 kernel `7.0.0-43-generic` on an AMD Ryzen 9 5950X 16-Core Processor. Chromium reported `Chrome/158.0.8127.36`, V8 `15.8.62.31`, a 1× device scale and 1100 × 720 WebGL1 drawing buffers. The game canvas had antialiasing enabled.

- Native renderer was `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)`. CDP identified driver `595.99.02`, PCI vendor/device `10de:2d04`.
- Software renderer was `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Its timings characterize the software backend running on this host.
- The driver opened the game from local HTTP, deployed a tank and paused the live station. It then replayed the recorded commands through the production simulation, renderer, tactical chart and HUD. Each pass created a fresh view and warmed it for 24 RAF callbacks using a separate world. The measured world used chase through tick 480, sight through 840 and overview through victory. Candidate pass order was Full, Balanced, Balanced, Full. The base was run twice. One browser process ran each four-pass or two-pass group with an isolated temporary profile.
- Simulation and events matched across all twelve passes. The state hash was `167150e6`, the event hash `ce10fecb`, and the replay source identity `vw-005:c24aebf0136cc5a8374606a0e541180ca46caefc5482e5f6779862a74b753c3a`. The SHA-256 of the archived command file was `b710f7a67d9f2680c0e709ca1d97237f4b7f91875cc5e4a216cc0b86a2bbbad5`. [Archived recording](../combined-arms/tank-replay.json)

## Raw observations and screenshots

Each report includes the tested revision, driver's revision, graphics flags, actual GL context and device, request paths, error list, per-pass field names and the samples in order. Native results are available for the [reviewed base](native-base.json) and [candidate](native-candidate.json). SwiftShader results are available for the [reviewed base](software-base.json) and [candidate](software-candidate.json).

The PNGs came from Chromium outside the timed passes. Both views at tick 240 produced state hash `88c0442d` and both views at tick 600 produced `78fa9766`.

| View | Full | Balanced |
| --- | --- | --- |
| Chase, tick 240 | [Full](breakwater-full-chase.png) | [Balanced](breakwater-balanced-chase.png) |
| Sight, tick 600 | [Full](breakwater-full-sight.png) | [Balanced](breakwater-balanced-sight.png) |

## Reproduction

From a clean checkout of the tested revision, use a separate base worktree and fresh output directories. The browser verifies the actual GL renderer for the requested backend and exits on a mismatch. The native run requires a working hardware-backed Chrome WebGL context.

```sh
driver_dir=$PWD
bench_dir=$(mktemp -d)
git worktree add --detach "$bench_dir/base" 6c8bf5453110f195e5adae107f0d5dd56a1845d8
for backend in native software
do
  (cd "$bench_dir/base" && CHROMIUM=google-chrome CHROMIUM_BACKEND="$backend" \
    node "$driver_dir/tools/browser.mjs" "$bench_dir/$backend-base" profile-base)
  CHROMIUM=google-chrome CHROMIUM_BACKEND="$backend" \
    node tools/browser.mjs "$bench_dir/$backend-candidate" profile
done
```
