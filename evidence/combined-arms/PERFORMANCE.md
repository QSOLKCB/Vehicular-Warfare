# Breakwater Reach performance

All four measurements ran the full Breakwater encounter with one player, seven mobile CPU crews and the shore relay at commit `5af96674108ab08909ca0ad6b4c4333cc6304722`. The host used an AMD Ryzen 9 5950X on Linux x64. Node v22.18.0 ran the numerical sorties. Headless Chrome 158.0.8127.36 with V8 15.8.62.31 rendered WebGL1 through ANGLE and the Vulkan SwiftShader software backend at 1100 × 720. Native GPU measurements were **not run**. [Numerical runs](mixed-measure.json) · [Chromium runs](combined.json)

## Authoritative simulation

The Node driver timed every 120 Hz tick from deployment to victory, rounding elapsed time around the step call to the nearest microsecond. Each crew advanced and fired, then held its captured gate. The tank applied its brake there. Event collection and replay hashing occurred outside the timed call. Each percentile uses the sorted observation at zero-based index `floor(n × p)`. [Raw microseconds, live actor samples and event stream](mixed-measure.json)

| Player crew | Ticks | Step p50 µs | Step p95 µs | Slowest step µs | Peak live pulses | Events emitted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Helicopter | 1,095 | 304 | 637 | 4,054 | 13 | 123 |
| Tank | 1,149 | 231 | 506 | 1,237 | 12 | 136 |
| Mech | 820 | 251 | 390 | 868 | 13 | 99 |
| Ship | 978 | 245 | 369 | 693 | 13 | 119 |

Each world kept nine actor slots, a cap of 32 live pulses and the latest 96 events. A pulse expires after 360 ticks. The two-minute mission bounds the command ledger at 14,400 changes. The shared heightfield contains 9,409 height samples and 18,432 triangles. Six actors survived each measured victory. Each run filled the 96-event window. The recorder copied the accepted events after every tick, including those later evicted. The busiest tick emitted five events. [Node load samples and full encounters](mixed-measure.json)

## Browser frame timing

Chrome recorded `performance.now()` around each authoritative step and each call to `CombinedView.draw`. Draw time covers model transforms, WebGL submission, the chart and the sight query. HUD updates and audio ran afterward. The animation-frame interval measures time between consecutive callbacks, including scheduling delays during the keyboard, screenshot and polling run. GPU execution time was unmeasured. [Raw frame, step and draw observations under each victory's metrics](combined.json)

| Player crew | Step p50 / p95 ms | Draw p50 / p95 ms | Frame interval p50 / p95 ms | Longest interval ms | Samples, step / draw / interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Helicopter | 0.3 / 0.5 | 0.7 / 1.0 | 16.7 / 33.3 | 233.3 | 1,024 / 515 / 514 |
| Tank | 0.3 / 0.6 | 0.7 / 1.2 | 16.7 / 33.4 | 200.0 | 1,024 / 510 / 509 |
| Mech | 0.4 / 0.6 | 0.8 / 1.1 | 16.7 / 33.4 | 200.0 | 820 / 358 / 357 |
| Ship | 0.4 / 0.6 | 0.8 / 1.1 | 16.7 / 33.3 | 250.0 | 978 / 457 / 456 |

The browser retained the latest 1,024 observations per series. The helicopter and tank step percentiles therefore cover the closing 1,024 ticks. All four browser sorties peaked at 13 live pulses. Browser inputs arrived through the page and could fall on different ticks from the Node controls. [Input receipts and timing arrays](combined.json)

## Renderer resources

The live renderer owned 31 WebGL mesh buffers. Polls during the four successful sorties observed 39–64 draw calls and 78,849–85,824 submitted vertices per sampled frame. The streamed effects mesh can hold 128 boxes shared by live pulses, impacts and destruction effects. Separate reusable arrays accommodate 18 shadow discs and two cutters' wakes. Each debrief reported zero live mesh buffers, no pending animation callback, an inactive audio session and detached session listeners. [Render samples and disposal counters](combined.json)

The renderer reported 850,464 bytes of persistent CPU geometry arrays and a 2,031,840-byte upper bound on GPU vertex storage at this seed. The CPU count covers model source and transform arrays plus reusable stream storage. The GPU bound covers static meshes, model vertices and full dynamic stream capacities. Browser, driver, framebuffer and chart memory sit outside those geometry counters. [Per-draw geometry counters](combined.json)

## JavaScript allocations

A separate tank victory used Chrome's sampling heap profiler at a 32 KiB interval, including sampled objects reclaimed by minor and major collections. The driver polled the DOM for gate capture and the outcome during this run. Its start and end snapshots bracketed ticks 2 through 1,149, or 9.56 simulated seconds. Summed allocation estimates across 145 reported sites were 602,474,532 bytes, about 574.6 MiB or 60.1 MiB per simulated second. No wall-clock allocation rate was recorded. [Sampling configuration and all allocation sites](combined.json)

| Allocation site | Estimated MiB | Share |
| --- | ---: | ---: |
| Heightfield `sample`, terrain module line 61 | 115.34 | 20.1% |
| Built-in `map` | 73.87 | 12.9% |
| Heightfield `castSegment`, terrain module line 87 | 73.72 | 12.8% |
| Segment sampling helper `at`, terrain module line 108 | 48.24 | 8.4% |
| Anonymous terrain callback, line 107 | 35.76 | 6.2% |

These samples estimate cumulative JS allocation over one sortie and include temporary objects. The two heap snapshots cover a different interval, from an active deployment before the timed browser rounds to the disposed page after the separate allocation run and explicit garbage collection. V8 reported 55.91 MiB of used JS heap at the first snapshot and 2.86 MiB at the second. Peak live heap and individual object lifetimes were unmeasured. [Heap snapshots and allocation rows](combined.json)
