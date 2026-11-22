# VW-GFX-003B · The Tactical Display Forge

| Revision | SHA |
| --- | --- |
| Geometry Coprocessor common ancestor | `6187c6a4b8ced335b724016819b2fb7875de06c3` |
| Reviewed main base after the owner merged #17 | `2e00e22d73066d11e23f849a9cbf98d08b0344cb` |
| Tested game and benchmark | `3793a0e5b1213f3bb66ffc2469cbb75a5f17be85` |
| Vendored VANILLAJS v3.5.0 | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

## Use the display

Choose **Retro tactical display** before deploying or in the pause panel. Use **M** or the chart switch during play and replay. The chart's canvas stays at 202 × 152. Six padded source columns stay outside the visible map. The player arrow, allied discs, enemy diamonds and gate ring remain distinct without colour. Each crew has its own palette. The source has 16 possible indices per pixel, and a Copper palette change can give an index a different colour on a later scanline. [Display contracts, palette and memory accounting](../../docs/RETRO_DISPLAY.md)

## Browser evidence

The driver exercised the mission board, four crews, live switches, held steering, pointer capture, resize, pause, restart, workshop playtest and replay. At a frozen workshop tick, switching away and back restored the decoded map pixels with SHA-256 `d548c080126f16422d8dcaea83db500a910965689b8985025f22b8e35c62e3df`. The three replay cameras reproduced the same map and receipt. The FX marker and retro chart switched independently. Each enabled view reported 198,076 bytes of owned retro typed arrays. That count fell to zero when the player disabled the chart or paused. [Actual capture hashes, receipts and full observations](visual/retro.json)

Moving a hidden defender or relay into the viewport produced the same decoded map pixels as the no-contact reference. Granting visibility changed the pixels. Removing visibility restored the original hash `e8e04ff6f9dfb86e34539e0c6da841f65abbb7e4c79e47af08db1ff7138dcf8d`. The numerical test also used throwing accessors to catch any attempted read of hidden health or position.

| Crew | Modern | Retro |
| --- | --- | --- |
| Helicopter | [Modern](visual/helicopter-modern.png) | [Retro](visual/helicopter-retro.png) |
| Tank | [Modern](visual/tank-modern.png) | [Retro](visual/tank-retro.png) |
| Mech | [Modern](visual/mech-modern.png) | [Retro](visual/mech-retro.png) |
| Ship | [Modern](visual/ship-modern.png) | [Retro](visual/ship-retro.png) |

[Resized tank chart](visual/tank-retro-resize.png) · [Frozen modern replay](visual/workshop-replay-modern.png) · [Frozen retro replay](visual/workshop-replay-retro.png)

## Reproduce

The first visual check could query the old document while Chrome navigated from **Watch** to the workshop replay. The revised check waits for the loaded replay document and retries the transient Chrome navigation error during that transition. The original packaged game at `4c7dc8512e57c28a97b7c4d3f0a96d4842be6b23` and the corrected driver revision have identical extracted contents. The headless driver also passes `--mute-audio` so test audio stays off the host speakers. The workshop still verifies the live Web Audio voices and separately renders the score to an offline WAV. All results here use the corrected, muted driver.

The extracted ZIP SHA-256 is `b8f1a65a7257622ce366ba7055b1c9a78543659b9324999b563fa9b6d35c52f5`. The browser verified 79 shipped runtime files against the commit with manifest digest `a9c53336af53a20b72ce4e502502efb68f63dd692f3a6a2ebf93551a5e44e172`. All 107 distinct released recordings independently verified in their recorded runtime family. Node 22.18.0 passed all 111 tests, including masked 0xCA compositing, invalid scanline programs, bounds, source immutability and deterministic restoration. [TAP](node.tap.gz) · [Archived receipts](archives.json.gz)

```sh
python3 tools/identity.py --check
node --test test/*.test.js
out=$(mktemp -d)
python3 tools/package.py "$out/game.zip"
python3 -m zipfile -e "$out/game.zip" "$out/unpacked"
export RIDGEFIRE_WEB_ROOT="$out/unpacked/Vehicular-Warfare"
export CHROMIUM=google-chrome
node tools/browser.mjs "$out/visual" retro
node tools/browser.mjs "$out/archives" archives
CHROMIUM_BACKEND=native node tools/browser.mjs "$out/native" profile-retro
CHROMIUM_BACKEND=software node tools/browser.mjs "$out/software" profile-retro
```

The paired benchmark fixes the camera schedule, vehicle detail and command recording and compares the modern chart to the retro chart. It reports their chart processing and canvas submission time separately from whole-view CPU and WebGL GPU timings. [Performance, actual backends and raw samples](performance/README.md) · [Historical missions and workshop verification](browser/README.md)

On the RTX 5060 Ti the retro chart took 0.30 ms median and 0.40 ms p95 for chart preparation and canvas submission. SwiftShader took 0.50 ms median and 0.60 ms p95. The modern chart measured 0.10 ms p95 on both. All four configurations recorded a 16.7 ms median frame interval, and both presentations submitted the same WebGL draws and vertices on each matched frame. The chart remains an optional visual treatment.
