# War Room browser measurements

Chrome 158.0.8127.36 exercised the extracted ZIP at `80e0b0aac2d737a3a5c0a05f5522611b8d2aad86`. Both renderers used the AMD Ryzen 9 5950X 16-Core Processor and a 1100 × 720 CSS-pixel viewport. The driver verified each served game file against its committed Git blob and recorded the resulting runtime SHA-256 in both reports. Each camera run produced a victory receipt and reopened the downloaded file in its recording browser.

| Workload | Draw samples | Frame interval ms p50 / p95 | CPU draw ms p50 / p95 | WebGL GPU ms p50 / p95 | Draw calls p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| RTX 5060 Ti · command observer | 90 | 16.70 / 17.10 | 0.40 / 0.50 | 0.40 / 1.58 | 10 / 10 |
| RTX 5060 Ti · released overview | 310 | 16.70 / 16.70 | 0.50 / 0.70 | 1.11 / 1.49 | 62 / 62 |
| SwiftShader · command observer | 90 | 16.70 / 17.20 | 0.50 / 0.70 | 6.33 / 6.71 | 10 / 10 |
| SwiftShader · released overview | 310 | 16.70 / 16.70 | 0.80 / 1.00 | 8.39 / 9.48 | 62 / 62 |

Command observation timings cover a fresh live command battle in the overview camera. The driver times the actual `CombinedView.draw` call, counting frames and reading `EXT_disjoint_timer_query` every sixth frame. The interval measures elapsed wall time between draw calls. Static buffer budgets and live projectile and visible-body counts accompany each sample in the compressed reports.

The released reference uses the two overview segments of `profile-base` on the v0.3.0 tank recording. It submits full-detail geometry on the full battlefield canvas, advances two ticks per frame, and measures intervals using `requestAnimationFrame` timestamps. The War Room uses balanced detail and a side panel. Geometry load, engagement phase and viewport differ, so the table describes each playable workload. It cannot establish a rendering speedup.

- **RTX 5060 Ti.** Strategic map draw 0.20 / 0.30 ms (n=68), order submission 0.10 / 0.30 ms (n=3). 15 valid GPU timings, 0 disjoint observations. Sampled allocations totalled 32,131,932 bytes across a separate 600 ms live map window. GC-collected JS heap snapshots used 1,609,672 bytes in briefing and 3,105,508 bytes paused after profiling.
- **SwiftShader.** Strategic map draw 0.20 / 0.30 ms (n=73), order submission 0.10 / 0.40 ms (n=3). 15 valid GPU timings, 0 disjoint observations. Sampled allocations totalled 31,873,808 bytes across a separate 600 ms live map window. GC-collected JS heap snapshots used 1,609,820 bytes in briefing and 3,104,208 bytes paused after profiling.

Map draw timing covers the strategic canvas draw call. Order submission includes admission and excludes the following DOM refresh. Browser clock quantization can produce zero-duration samples. The allocation sampler estimates allocation volume. Snapshot differences over these short runs cannot establish long-session memory growth. GPU queries cover the WebGL observer. The 2D canvas has no equivalent timer in these runs.

Per-tick CPU distributions, sampled steering work, active order counts, projectile sweeps and repeated numerical reference costs are recorded with the command authority. [Numerical measurements](../command-authority/measure.json)

The raw reports preserve timing arrays, sources, WebGL backend strings, Chromium version, lifecycle checks, heap samples, request paths, negative order feedback and replay digests. [Native command](browser/native.json.gz) · [Software command](browser/software.json.gz) · [Native reference](browser/v0.3.0-native.json.gz) · [Software reference](browser/v0.3.0-software.json.gz)
