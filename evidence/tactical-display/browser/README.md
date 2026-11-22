# Packaged browser regression results

All nine historical suites passed with `VW_TEST_PRESENTATION=retro` on `3793a0e5b1213f3bb66ffc2469cbb75a5f17be85`. The driver served the extracted ZIP beneath a nested loopback path. It set the Retro Tactical Display preference from the mission board before selecting a sortie. The four live mixed-crew samples and the completed authored mission each reported the feature active in the actual draw. The standalone flight, tracked, walker and naval pages ran their ordinary interfaces. [Bridge default reference](../../silicon-bridge/browser/README.md)

| Suite | Observed ticks | Raw Chrome report |
| --- | --- | --- |
| Original Sable Valley | 1,098 / 768 | [JSON.gz](sable-playthrough.json.gz) |
| Long Watch / Frostline Run | 8,587 / 9,372 | [JSON.gz](routes-flights.json.gz) |
| Original / Survey / switched terrain | 442 / 442 / 442 | [JSON.gz](terrain.json.gz) |
| Cutbank Relay | 485 / 1,056 | [JSON.gz](tank.json.gz) |
| Glassworks Crossing | 1,153 / 1,134 | [JSON.gz](mech.json.gz) |
| Lantern Sound | 1,253 / 959 | [JSON.gz](naval.json.gz) |
| Breakwater Reach | 1,095 / 1,211 / 978 / 978 | [JSON.gz](combined.json.gz) |
| Mission workshop | 959 / 1,054 | [JSON.gz](creator.json.gz) |
| Packaged controls | 486 / 1,153 / 1,250 | [JSON.gz](controls.json.gz) |

Standalone and workshop rows give victory / defeat. Routes list Long Watch and Frostline Run. The mixed row lists helicopter, tank, mech and ship victories, and the controls row lists tank, mech and ship. All three terrain schedules replayed to the same state and event hashes. Fresh manual input timings depend on Chromium scheduling. The recording browser verified both fresh long routes and both original archived route files. Node produced different state digests for the fresh long routes, matching the release’s documented same-runtime scope. [Exposure](routes-exposure.json.gz) · [Route runtime](routes-runtime.json.gz)

The driver compared 79 served files with the Git tree, runtime manifest SHA-256 `a9c53336af53a20b72ce4e502502efb68f63dd692f3a6a2ebf93551a5e44e172`. The package SHA-256 was `b8f1a65a7257622ce366ba7055b1c9a78543659b9324999b563fa9b6d35c52f5`. All browser exception and loading error arrays were empty. Requests stayed under the local serving origin or used local data. Chrome recorded 61 screenshots. [Suite timings, replay receipts and decoded RGBA hashes](summary.json) · [Live mixed crew](02-helicopter-underway.png) · [Workshop replay overview](04-replay-overview.png)

Runs used Chrome/158.0.8127.36, AMD Ryzen 9 5950X 16-Core Processor, a 1100 × 720 drawing buffer and `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. The workshop also checked a 390 × 844 layout. Use the matched benchmark for timing comparisons. These nine suites test gameplay and rendering correctness.

The headless browser driver passed `--mute-audio` to Chromium on every launch. The workshop exercised three live music voices and rendered its recording separately through `OfflineAudioContext`. Its saved mono, 16-bit PCM score contains 189,447 samples at 22,050 Hz. Decoding the WAV gave a normalized peak of 0.20295 and RMS of 0.02077. The browser's pre-quantization measurements agreed to within one PCM step. [Recorded score](workshop-score.wav) · [Cue and energy observations](creator.json.gz)

## Reproduce

From a checkout of the tested commit, use the following commands with Node 22.18.0, Python 3 and Chromium installed.

```sh
set -e
run=$(mktemp -d)
python3 tools/package.py "$run/game.zip"
python3 -m zipfile -e "$run/game.zip" "$run/unpacked"
export RIDGEFIRE_WEB_ROOT="$run/unpacked/Vehicular-Warfare"
export CHROMIUM=google-chrome CHROMIUM_BACKEND=software
export VW_TEST_PRESENTATION=retro
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
