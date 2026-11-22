# Engine bridge rendering comparison

The released game and the upgraded ZIP replayed the accepted Breakwater tank recording over 1,149 ticks. Each group ran Full, Balanced, Balanced, Full using the original chase, sight and overview schedule. Every pass reached victory with state `167150e6` and events `ce10fecb`. Actor and projectile counts, draw calls and vertices matched frame for frame between the two engine pins. Seven of eight paired captures matched byte for byte. One native Balanced chase pixel at (897, 134) differed by one colour level in each RGB channel. All frame receipts matched. Capture comparisons and both SHA-256 values are listed in [the image receipts](images.json).

Each timing cell shows the pooled median / p95 in milliseconds over two passes. The draw column measures the CPU-side view, including the chart. GPU time comes from asynchronous timer queries. Frame interval measures headless Chromium callbacks. These observations apply to this machine and workload.

| Backend | ZIP | Detail | Draws p50 | View CPU ms | GL timer ms | Frame interval ms |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| native | base | full | 62 | 0.50 / 0.60 | 0.83 / 1.31 | 16.70 / 16.80 |
| native | base | balanced | 37 | 0.40 / 0.50 | 0.84 / 1.23 | 16.70 / 16.80 |
| native | bridge | full | 62 | 0.50 / 0.70 | 1.06 / 1.46 | 16.70 / 16.80 |
| native | bridge | balanced | 37 | 0.40 / 0.60 | 0.88 / 1.35 | 16.70 / 16.70 |
| software | base | full | 62 | 0.70 / 1.00 | 11.98 / 14.33 | 16.70 / 16.80 |
| software | base | balanced | 37 | 0.60 / 0.90 | 10.50 / 13.41 | 16.70 / 16.80 |
| software | bridge | full | 62 | 0.70 / 1.10 | 11.02 / 14.51 | 16.70 / 16.80 |
| software | bridge | balanced | 37 | 0.70 / 0.90 | 10.30 / 13.19 | 16.70 / 16.80 |

The host used AMD Ryzen 9 5950X 16-Core Processor, linux x64, Chrome/158.0.8127.36 and 1100 × 720 WebGL1 buffers. Native WebGL reported `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)`. SwiftShader was verified independently from the software context.

The four compressed JSON reports contain the raw frame samples, per-pass timings, renderer, source SHA, exact served game files digest and GPU device metadata. Use `gzip -dc` to read one. [Pooled data](pooled.json) · [Native capture](native-chase.png) · [Software capture](software-chase.png)
