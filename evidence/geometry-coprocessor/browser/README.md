# Packaged browser regression results

All nine historical suites passed with `VW_TEST_PRESENTATION=fx` on `4855372aefc64b307b8088fbd6bdbffdf9e3611c`. The driver served the extracted ZIP beneath a nested loopback path. It set the Q16 gate beacon preference from the mission board before selecting a sortie. The four live mixed-crew samples and the completed authored mission each reported the feature active in the actual draw. The standalone flight, tracked, walker and naval pages ran their ordinary interfaces. [Bridge default reference](../../silicon-bridge/browser/README.md)

| Suite | Observed ticks | Raw Chrome report |
| --- | --- | --- |
| Original Sable Valley | 1,086 / 767 | [JSON.gz](sable-playthrough.json.gz) |
| Long Watch / Frostline Run | 8,590 / 9,508 | [JSON.gz](routes-flights.json.gz) |
| Original / Survey / switched terrain | 442 / 442 / 442 | [JSON.gz](terrain.json.gz) |
| Cutbank Relay | 486 / 1,057 | [JSON.gz](tank.json.gz) |
| Glassworks Crossing | 1,153 / 1,135 | [JSON.gz](mech.json.gz) |
| Lantern Sound | 1,251 / 959 | [JSON.gz](naval.json.gz) |
| Breakwater Reach | 1,095 / 1,207 / 820 / 978 | [JSON.gz](combined.json.gz) |
| Mission workshop | 959 / 1,054 | [JSON.gz](creator.json.gz) |
| Packaged controls | 485 / 1,153 / 1,251 | [JSON.gz](controls.json.gz) |

Standalone and workshop rows give victory / defeat. Routes list Long Watch and Frostline Run. The mixed row lists helicopter, tank, mech and ship victories, and the controls row lists tank, mech and ship. All three terrain schedules replayed to the same state and event hashes. Fresh manual input timings depend on Chromium scheduling. The recording browser verified both fresh long routes and both original archived route files. Node produced different state digests for the fresh long routes, matching the release’s documented same-runtime scope. [Exposure](routes-exposure.json.gz) · [Route runtime](routes-runtime.json.gz)

The driver compared 77 served files with the Git tree, runtime manifest SHA-256 `c8b85d9d4104457718277629b9033f0dec46c30e1f38a78be9b0dada65221f6a`. The package SHA-256 was `7abdbf92b27e6441d844de85e4eddd41a1eaee6b001453a369e54ca78abae209`. All browser exception and loading error arrays were empty. Requests stayed under the local serving origin or used local data. Chrome recorded 61 screenshots. [Suite timings, replay receipts and decoded RGBA hashes](summary.json) · [Live mixed crew](02-helicopter-underway.png) · [Workshop replay overview](04-replay-overview.png)

Runs used Chrome/158.0.8127.36, AMD Ryzen 9 5950X 16-Core Processor, a 1100 × 720 drawing buffer and `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. The workshop also checked a 390 × 844 layout. Use the matched benchmark for timing comparisons. These nine suites test gameplay and rendering correctness.

## Reproduce

From a checkout of the tested commit, use the following commands with Node 22.18.0, Python 3 and Chromium installed.

```sh
set -e
run=$(mktemp -d)
python3 tools/package.py "$run/game.zip"
python3 -m zipfile -e "$run/game.zip" "$run/unpacked"
export RIDGEFIRE_WEB_ROOT="$run/unpacked/Vehicular-Warfare"
export CHROMIUM=google-chrome CHROMIUM_BACKEND=software
export VW_TEST_PRESENTATION=fx
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
  node tools/browser.mjs "$run/$mode" "$mode"
done
```
