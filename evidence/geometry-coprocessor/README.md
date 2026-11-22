# VW-GFX-003A · The Geometry Coprocessor

| Revision | SHA |
| --- | --- |
| Silicon Bridge review base | `5877ad1d873f91cd076b3c91bd2ae09008a39683` |
| Tested game and benchmark driver | `4855372aefc64b307b8088fbd6bdbffdf9e3611c` |
| Vendored VANILLAJS v3.5.0 | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

## Compare the marker

Deploy a crew in Breakwater Reach. Press **G** and look over the gate lamps for the coloured pointer. The checkbox is also available in the briefing, pause panel and workshop replay transport. The original lamps are the default. The marker tracks the public gate objective, with a different colour after capture. [Geometry, controls and memory contract](../../docs/FX_PIPE.md)

Chrome captured the same frozen tank replay at tick 240 with the marker off, on and off again. The marker changed 1,645 pixels in the 550 × 375 world-view crop. The SHA-256 of the decoded RGBA pixels was `e2a7802e7913ca6ae5eff807460a39f1088380d4ad15c8507f13b63f65f200d1` when disabled and `4aa6cf05afa00940b6d97ef0665c9f60ad3a2d10b69de7faa2aee8f4c6dfd3a6` when enabled. Disabling it restored the first hash exactly. The world receipt remained at state `88c0442d`, events `40bcf66a`. [Original screenshot](visual/01-gate-lamps.png) · [FX screenshot](visual/02-fx-gate.png) · [Raw browser run](visual/fx.json)

The enabled marker adds 60 vertices, one draw, 2,459 bytes of owned CPU typed arrays and a 1,440-byte GPU vertex payload. Its world triangles are independently checked against a floating-point analytic construction at three gate positions and all 48 rotations with a 0.00005-game-metre coordinate tolerance. The renderer reuses the batch for the six ticks of each rotation phase and uploads a new batch if the objective changes. The test covered live switching, pause, restart, workshop playtest and replay. [Numerical tests](node.tap.gz) · [Paired measurements](performance/README.md)

## Reproduction

Use the tested game SHA in the table above. The implementation leaves the authoritative simulation, its source identities, original vehicle models and engine bytes intact. Node 22.18.0 passed all 105 tests. The extracted game also verified all 107 distinct [released recordings](archives.json.gz). The extracted ZIP had SHA-256 `7abdbf92b27e6441d844de85e4eddd41a1eaee6b001453a369e54ca78abae209`.

```sh
python3 tools/identity.py --check
node --test test/*.test.js
out=$(mktemp -d)
python3 tools/package.py "$out/game.zip"
python3 -m zipfile -e "$out/game.zip" "$out/unpacked"
export CHROMIUM=google-chrome
export RIDGEFIRE_WEB_ROOT="$out/unpacked/Vehicular-Warfare"
node tools/browser.mjs "$out/visual" fx
CHROMIUM_BACKEND=native node tools/browser.mjs "$out/native" profile-fx
CHROMIUM_BACKEND=software node tools/browser.mjs "$out/software" profile-fx
```

The browser reports record their actual backend, resolution, source commit and ZIP runtime manifest digest. The benchmark holds vehicle detail and accepted commands fixed during the paired comparison. GL timer, CPU view preparation, geometry preparation, frame intervals, allocation sampling and draw counts have separate fields. [Historical suite results and commands](browser/README.md) · [Engine and replay compatibility](../silicon-bridge/README.md)

On the RTX 5060 Ti the median frame interval was 16.7 ms with either setting. The p95 CPU view time rose from 0.50 to 0.60 ms. SwiftShader also recorded a 16.7 ms median interval with both settings. The beacon stays optional for its visible gate cue. Allocation estimates cover whole passes. On the native FX pass, V8 attributed approximately 189 kB of samples to the upstream matrix conversion.
