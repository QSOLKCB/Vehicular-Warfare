# Retro Tactical Display

In Breakwater Reach or a workshop playtest, select **Retro tactical display** in the briefing or pause panel. During play or replay, use **Retro** on the chart or press **M**. The modern north-up chart is the initial setting. The browser remembers the choice locally. The workshop's placement chart continues to accept the same coordinates.

## Reading the chart

The arrow marks the selected crew and rounds its heading to the nearest of 16 directions. Allied crews use filled round symbols. A visible opponent is a diamond, and the shore relay uses a larger diamond with a central stroke when visible. The broken ring marks the mission gate. Hostile positions and health are consulted only after the crew's accepted sight query includes the actor's ID. Losing sight removes the symbol on the next draw. Combat messages, compass, objectives, contact warnings and replay transport keep their text labels.

Each crew has a different terrain palette. Sparse grid intersections mark twenty game metres. Deeper channels have a light stipple, and ridges, the shore and the gravel route have distinct indices. Copper dims two terrain colours every fourth scanline. The game program uses zero horizontal scroll so markers and their terrain stay aligned. Playback tick and camera settings can be changed independently of the display choice.

## Raster contract

The canvas is still 202 × 152 pixels. Both charts use the same north-up pan, clamp and scale of 1.45 chart pixels per game metre. The retro renderer rounds symbol centres to the nearest pixel and uses a two-metre indexed terrain atlas. The packed working surface is 208 × 152 × four bitplanes. Its six right-hand padding columns are outside the visible chart. A 202 × 152 dirty rectangle from the Copper image is presented at (0, 0) without resizing the canvas.

At chart creation the static atlas is classified through a four-plane BitplaneSurface. Its 144 × 144 index copy is kept for panning. The live overlay uses separate packed colour and one-plane mask sources for each original glyph. The BLIT cookie-cut minterm 0xCA writes source bits where the mask is set, preserving destination bits in transparent pixels. Only a glyph's small rectangle is read back into the current indexed frame. Indices and Copper RGBA output are retained across frames. ImageData uses the Copper output buffer directly. The palette programme is compiled once per chart. Upstream Copper copies 64 palette bytes on each render, and BLIT allocates option validation records per glyph. Whole-frame indices and RGBA copies occur only in acceptance probes.

A live map switch disposes its experimental arrays by dropping the view's references. The existing modern paper chart stays available. The station keeps its current RAF, audio session, held controls and simulation clock. Pause or exit releases the view. A paused replay draws one still frame on a map or camera switch and releases its temporary view immediately. Presentation choices are excluded from replay commands and checksums.

## Checking the display

Run `node --test test/retro-chart.test.js` for the packed mask, immutable source, Copper palette/scroll bounds, restoration, north-up cropping and hidden-contact tests. The visibility test makes hidden actors' health and position throw if read. The Chromium `retro` driver captures the map in both modes for all four vehicle classes, tests real inputs and hashes the actual canvas pixels. It repeats a fixed replay tick after a mode switch and camera changes. Switching the FX gate beacon independently gives the same chart pixels and simulation receipts when both graphics options are active. Run from the repository root with a fresh output directory.

```sh
out=$(mktemp -d)
python3 tools/package.py "$out/game.zip"
python3 -m zipfile -e "$out/game.zip" "$out/unpacked"
RIDGEFIRE_WEB_ROOT="$out/unpacked/Vehicular-Warfare" CHROMIUM=google-chrome \
  node tools/browser.mjs "$out/retro" retro
```

The browser's WebGL commands and vertex counters describe the 3D scene. The chart is CPU software rasterization into a 2D canvas. `chartPrepMs` measures the selected chart’s processing and canvas submission on the calling thread. `retroPrepMs` records that measurement for the retro chart. Both timers exclude simulation and read zero during briefing. `retroRetainedBytes` counts owned typed payloads for terrains, glyphs and masks, the overlay bits, index frame, column addresses and RGBA output. JavaScript objects, Copper's opaque program, browser canvas backing stores and the baseline modern chart sit outside that figure.
