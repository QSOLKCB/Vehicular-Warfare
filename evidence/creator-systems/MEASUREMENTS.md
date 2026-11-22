# Workshop measurements

Tested revision `9506f890641fcc39ce5047feec4c47a11db499ad` ran on Linux x64 with an AMD Ryzen 9 5950X. Node v22.18.0 measured the five numerical playtests. Chrome 158.0.8127.36 with V8 15.8.62.31 ran the editor, playtest and viewer. The browser used WebGL1 through ANGLE Vulkan SwiftShader at 1100 × 720. Native GPU measurements and physical speaker listening were **not run**. [Node captures](creator-measure.json) · [Chromium capture](creator-browser.json)

## Prepare, play and seek

Preparation measures one call to `createCreatorWorld` with a JSON pack. It includes parsing, seeded world generation and placement checks. The editor also builds a 320 × 320 terrain image when the seed changes, then draws markers onto a 640 × 640 chart. Browser chart drawing, DOM updates and storage writes were outside the preparation timer. Layouts ran in the listed order within one Node process, with no warm-up. [Measurement driver](../../tools/measure.mjs) · [Chart source](../../game/creator-editor.js)

| Authored layout and outcome | Ticks | Prepare ms | Step p50 / p95 µs | Verify ms | Seven seeks, median / max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tidal Ledger · helicopter victory | 907 | 36.3 | 467 / 1,031 | 405.0 | 18.0 / 44.5 |
| Copper Crossing · tank victory | 1,022 | 4.9 | 349 / 639 | 437.9 | 9.1 / 13.1 |
| Salt Steps · mech victory | 905 | 4.1 | 303 / 593 | 348.4 | 21.2 / 49.9 |
| Estuary Wake · ship victory | 905 | 4.3 | 320 / 559 | 418.3 | 17.8 / 46.9 |
| Copper Crossing · tank defeat | 1,054 | 4.4 | 221 / 474 | 332.8 | 10.8 / 35.1 |

Each step sample covers one 120 Hz simulation tick. Verification measures wall time to parse the receipt, simulate it through the recorded tick, build checkpoints and verify its digests. The verifier checks for a yield after each step once its current batch has consumed 8 ms. The wall time includes those yields. A checkpoint every 120 ticks limits a restored seek to at most 119 subsequent steps. Each run visited 0%, 75%, 25%, 100%, 50%, 0% and 100% in order. Every resulting receipt matched an independently advanced world at the same tick. The 35 seek timings include no-op and rewind-to-start samples. Their pooled p50 was 13.1 ms and p95 was 46.9 ms. [Raw per-tick, verification and seek observations](creator-measure.json)

## Browser frame and resource observations

The keyboard playtest of Copper Crossing won at tick 960. Percentiles below use the sorted sample at index `floor(n × p)`. The interval includes browser scheduling and test activity such as screenshots. Draw CPU covers scene preparation, chart rendering and WebGL submission. GPU execution time was unmeasured. [Victory metrics and input receipt](creator-browser.json)

| Browser observation | Samples | p50 ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| Animation-frame interval | 453 | 16.7 | 33.3 | 216.6 |
| CPU per simulation step | 960 | 0.3 | 0.6 | 1.2 |
| CPU per view draw | 454 | 0.7 | 1.0 | 1.5 |

The nine-actor playtest peaked at 12 live projectiles. Its final frame submitted 78,990 vertices in 39 draws. The renderer accounted for 850,464 bytes of persistent CPU geometry and at most 2,032,632 bytes of GPU vertex storage. Its streamed effects buffer has room for 128 boxes. These counters exclude framebuffer, chart, browser, driver and replay checkpoint memory. The debrief reported zero mesh buffers and no active audio, session listeners or animation frame. Keyboard pause, blur and pointer unlock also cleared input and released the active renderer. All three replay cameras at tick 480 reported state `9e45b2a8`. [World, resource, teardown and camera observations](creator-browser.json)

## Original score

The live music observation reported three voices on a running audio context. A separate Chromium offline audio render drove the same score from the accepted winning receipt, one update per recorded tick plus 0.6 s of decay. The active cues were departure at tick 0, exchange at tick 3, crossing at tick 357 and secured at tick 960. The score scheduled 44 notes. The mono 22,050 Hz file contains 189,630 signed 16-bit samples spanning 8.60 s. Before PCM encoding, the peak absolute sample was 0.212 and RMS was 0.0212. This capture covers the four cues reached in that recording. [Rendered WAV](workshop-score.wav) · [Cue transitions and signal measurements](creator-browser.json) · [Audio capture driver](../../tools/creator-score.mjs)
