# Browser compatibility

The release and engine-upgrade checkouts each built their own offline ZIP. Chromium loaded each extracted game from a nested loopback HTTP path. All nine suites passed on both revisions. Each suite compared the served runtime files against its own checkout before launch. The reports contain no browser exceptions or failed network requests. The driver rejected external requests.

| Snapshot | Commit | Runtime files | Archive SHA-256 |
| --- | --- | ---: | --- |
| Retail v0.2.0 | `0132dd22191ebfeddfce8bc76651e09eb2f12b48` | 72 | `4e8d35bce41042f6da12ffabbf98ff4341f36cf92f6ddf260129050da382a547` |
| Silicon Bridge | `873638925a0bb2a6110c6adfb70a3578a270e596` | 76 | `097a3e4ae16d6d6311856732f850ca3057d5d84f31a8c4fc0498fce54d79175a` |

## Playthroughs

Each entry links the raw driver output compressed with gzip. The standalone and workshop rows show victory / defeat ticks. The route row shows the two fresh victory ticks. The mixed row lists helicopter, tank, mech and ship victories. The controls row lists tank, mech and ship victories. Live keyboard input and screen capture are scheduled by Chromium, so separately flown runs can produce different accepted command sequences. The terrain parity check uses a fixed recording and compares all three schedules.

| Suite | Retail | Silicon Bridge |
| --- | --- | --- |
| Original Sable Valley | [1,056 / 767](base/sable-playthrough.json.gz) | [1,096 / 767](engine/sable-playthrough.json.gz) |
| Long Watch / Frostline Run | [8,553 / 9,447](base/routes-flights.json.gz) | [8,589 / 9,378](engine/routes-flights.json.gz) |
| Original / Survey / switched terrain | [442 / 442 / 442](base/terrain.json.gz) | [442 / 442 / 442](engine/terrain.json.gz) |
| Cutbank Relay | [489 / 1,056](base/tank.json.gz) | [484 / 1,056](engine/tank.json.gz) |
| Glassworks Crossing | [1,154 / 1,134](base/mech.json.gz) | [1,154 / 1,135](engine/mech.json.gz) |
| Lantern Sound | [1,251 / 959](base/naval.json.gz) | [1,250 / 959](engine/naval.json.gz) |
| Breakwater Reach | [1,095 / 1,149 / 820 / 978](base/combined.json.gz) | [1,095 / 1,149 / 820 / 978](engine/combined.json.gz) |
| Mission workshop | [958 / 1,054](base/creator.json.gz) | [958 / 1,054](engine/creator.json.gz) |
| Packaged controls | [485 / 1,154 / 1,251](base/controls.json.gz) | [484 / 1,154 / 1,250](engine/controls.json.gz) |

Both browser checkers accepted the original Long Watch victory at 8,551 ticks (state `cf43059f`, events `9797f091`) and Frostline Run at 9,491 ticks (state `d97c7f24`, events `e8b4fc93`). Fresh route receipts also verified in their recording browser. Node produced different digests for those fresh recordings, as documented for the released game. Both workshop runs accepted the earlier mixed tank recording. The five vehicle/workshop suites exercised restart, cleanup and WebGL failure handling. [Original recordings](../../valley-missions/flights.json) · [Retail route runtime](base/routes-runtime.json.gz) · [Bridge route runtime](engine/routes-runtime.json.gz) · [Retail exposure](base/routes-exposure.json.gz) · [Bridge exposure](engine/routes-exposure.json.gz)

## Captures and environment

The suites ran under Chrome/158.0.8127.36 on AMD Ryzen 9 5950X 16-Core Processor at 1100 × 720 using `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Each summary includes every captured screenshot’s SHA-256 over decoded RGBA pixels, suite elapsed times and the source/served-tree receipt. The release captured 61 images and the candidate captured 61. [Retail summary](base/summary.json) · [Bridge summary](engine/summary.json)

| Captured scene | Retail | Silicon Bridge | Decoded RGBA |
| --- | --- | --- | --- |
| Breakwater Reach briefing | [PNG](base/01-breakwater-briefing.png) | [PNG](engine/01-breakwater-briefing.png) | Pixel-identical |
| Frostline Run briefing | [PNG](base/frostline-briefing.png) | [PNG](engine/frostline-briefing.png) | Pixel-identical |

## Reproduce

From the repository root, create a worktree at each tested commit. The original route files supplied to the in-game checker come from the tracked historical receipt collection. The commands run the same checks sequentially and preserve every report and screenshot under a fresh temporary directory.

```sh
scratch=$(mktemp -d)
for rev in 0132dd22191ebfeddfce8bc76651e09eb2f12b48 873638925a0bb2a6110c6adfb70a3578a270e596
do
  git worktree add --detach "$scratch/src-$rev" "$rev"
  (
    set -e
    cd "$scratch/src-$rev" || exit 1
    run="$scratch/evidence-$rev"
    mkdir -p "$run"
    python3 tools/package.py "$run/game.zip"
    python3 -m zipfile -e "$run/game.zip" "$run/unpacked"
    export CHROMIUM=google-chrome CHROMIUM_BACKEND=software
    export RIDGEFIRE_WEB_ROOT="$run/unpacked/Vehicular-Warfare"
    python3 - "$run" <<'PYTHON'
import json, pathlib, sys
for item in json.loads(pathlib.Path("evidence/valley-missions/flights.json").read_text()):
    path = pathlib.Path(sys.argv[1]) / (item["mission"] + ".json")
    path.write_text(json.dumps(item["receipt"]))
PYTHON
    RIDGEFIRE_TEST_REPLAY="$run/longwatch.json" node tools/browser.mjs "$run/sable"
    RIDGEFIRE_TEST_REPLAY="$run/frostline.json" node tools/browser.mjs "$run/routes" routes
    for mode in terrain tank mech naval combined creator controls
    do
      node tools/browser.mjs "$run/$mode" "$mode" || exit 1
    done
  ) || exit 1
done
```
