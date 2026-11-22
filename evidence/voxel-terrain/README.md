# VW-VIS-001 verification

Tested game and drivers at `ac7feb2623e901314775cc6ba84782f94e543885` against release base `3aee7dd20de522afce41fbcc03b70f9f22b94813`. The subsequent evidence commit contains the outputs of these runs. The simulation source ID is `vw-001a:510b596e40cc515d1ac9a6b8281fd4c06559258f83a1c179b082426954733ecb` in all three terrain schedules.

## Reproduce

From the repository root on Linux with Node 22, Python 3 and a local Chromium binary, run each command to completion. A fresh directory keeps this run’s reports and PNGs together.

```sh
output=$(mktemp -d)
node --test test/*.test.js
node tools/measure.mjs
CHROMIUM=google-chrome node tools/browser.mjs "$output/routes" routes
CHROMIUM=google-chrome node tools/browser.mjs "$output/sable"
CHROMIUM=google-chrome node tools/browser.mjs "$output/terrain" terrain
```

For a manual comparison, run `python3 -m http.server 8080 --bind 127.0.0.1` and open the local game in Chromium. Select Sable Valley, launch in chase view and press **T** in a hover. Pause, select **Experimental voxel · Fine**, resume and climb with **E** until the sight picks up a target. **C** changes cameras and **V** zooms the cockpit sight.

## Source and numerical checks

Node v22.18.0 passed all 16 tests. The geometry checks compare boundary and diagonal samples against barycentric interpolation of the WebGL vertex stream, then check a flat-field skyline and a hidden far ridge. The numerical flights cover all three missions, same-runtime replay and the archived Sable receipts. The independent Node Sable trace won in 801 ticks, with peak five live shots, tick cost 27/97 µs p50/p95, state hash `e97f4002` and event hash `7aca9422`. [TAP](node.tap) · [Per-tick measurements and accepted events](measure.json)

The five module entries, LICENSE and NOTICE were checked byte-for-byte against Git blobs at VANILLAJS v3.4.0 commit `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466`. The imported set matches the transitive dependencies listed in that revision’s MODULES.json. The renderer, palettes and shaders in this phase are original. [SHA-256 manifest](../../vendor/vanillajs/provenance.json)

## Chromium flights

[Original WebGL chase](sable-webgl.png) · [Survey chase](sable-voxel.png) · [Fine cockpit sight](sable-voxel-cockpit.png) · [Frostline Fine cockpit](frostline-voxel-cockpit.png)

The Sable Valley pilot switched modes while moving, paused, changed the profile, resumed and restarted. A low rocket struck the ridge. After climbing above it, the pilot acquired a visible target in the zoomed sight and flew to victory in Fine. On Frostline the driver flew the winter cockpit in Fine and verified its paused receipt in Chromium. The original regression driver flew Sable to victory and defeat, exercised pointer capture loss, blur, a hidden tab and an actual foreground-tab change, then denied WebGL on reload and checked the error panel. All three drivers observed only local game requests. [Terrain report](terrain.json) · [Sable regression](sable.json) · [Route runtime](runtime.json)

| Chromium flight | Ticks | State hash | Event hash |
| --- | ---: | --- | --- |
| Sable · WebGL victory | 1,082 | `effbe001` | `3e8d57ae` |
| Sable · WebGL defeat | 763 | `0984f60f` | `3ab526b9` |
| Sable · Fine victory | 709 | `c50246d6` | `a03e8b9a` |
| Sable · fixed controls in each renderer schedule | 442 | `56d28634` | `79014d08` |
| Long Watch · WebGL victory | 8,574 | `e89ac679` | `c5e986b0` |
| Frostline Run · WebGL victory | 9,484 | `df8637de` | `44381947` |
| Long Watch · exposed-hover defeat | 1,632 | `8b5c07bb` | `b817db28` |

Both long sorties completed every beacon in order and replayed in the recording browser. Long Watch recorded 12 enemy launches and Frostline recorded 18. Cross-runtime results are recorded per flight. [Route receipts](flights.json) · [Exposure defeat](exposure.json)

The fixed-command comparison drew 37 times per schedule. Original WebGL, Survey, and alternating WebGL/Survey reproduced the same terminal state and ordered event digest. At the same starting pose, 54,452 of 64,000 framebuffer pixels changed between the two views. A separate depth probe placed two markers at the same screen location on opposite sides of a ridge. In voxel mode, 0 marker pixels appeared behind the ridge, 103 appeared in front, and 99 appeared behind the ridge with depth testing disabled. The probe used the accepted field to verify each ray crossing and queried WebGL directly to confirm deletion of the extra buffer, texture and program after switching and teardown. [Pixel readbacks and replay receipts](terrain.json)

## Measurements

Chrome/158.0.8127.36 on an AMD Ryzen 9 5950X 16-Core Processor used ANGLE Vulkan SwiftShader software rendering on Linux at 1100 × 720. Each row covers 72 Sable masked-hover frames after 12 warm-up frames. Times are p50 / p95 in ms. Terrain CPU time covers sampling, upload and terrain draw submission. View CPU covers the whole view call. RAF intervals also include work outside the view, display scheduling and browser timing. A measured zero is below the browser timer’s resolution.

| Terrain | Terrain working size | Terrain CPU | View CPU | Frame interval | Height queries in sampled frame | Retained column arrays |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original WebGL | 1100 × 720 | 0.0 / 0.0 | 0.2 / 0.3 | 16.7 / 16.8 | 0 | 0 B |
| Survey | 256 × 160 | 2.1 / 3.0 | 2.2 / 3.2 | 16.7 / 16.7 | 22,002 | 275,712 B |
| Fine | 384 × 240 | 4.8 / 5.9 | 4.9 / 6.0 | 16.7 / 16.7 | 47,934 | 481,152 B |

The Sable hover had three actors and zero live projectiles. The voxel pass added two draw calls and one RGBA texture. Its CPU buffers persisted across frames. The field sampler and other game code still produce temporary objects. After forced GC at the end of each sample, debugger-reported backing storage was 690,770 B in WebGL, 966,490 B in Survey and 1,172,040 B in Fine. The raw report includes all measured frames and debugger heap snapshots before sampling, immediately afterward and after forcing GC. Those process observations cannot isolate bytes allocated per frame. [Raw measurements](terrain.json)

Native-GPU performance, mobile browsers, sustained allocation behaviour and long-session thermal effects were not run. The measurements cover the sampled hover. Finite angular and distance sampling can staircase ridge silhouettes and produce colour/depth edge differences during motion or strong camera pitch. [Camera and compositing contract](../../docs/ARCHITECTURE.md#terrain-views)
