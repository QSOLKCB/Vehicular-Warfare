# Historical missions in the War Room package

Chrome 158.0.8127.36 ran the seven released missions and the workshop from the extracted ZIP built at `80e0b0aac2d737a3a5c0a05f5522611b8d2aad86`. The driver checked all 86 runtime files against that Git tree and selected SwiftShader with the Retro Tactical Display preference enabled. The summary records the archive digest, served-file digest, outcomes, screenshot hashes and host. [Run summary](summary.json)

| Sortie | Victory ticks | Defeat ticks |
| --- | ---: | ---: |
| Sable Valley | 1,086 | 768 |
| Long Watch | 8,561 | [1,633](routes-exposure.json.gz) |
| Frostline Run | 9,397 | |
| Cutbank Relay | 488 | 1,058 |
| Glassworks Crossing | 1,159 | 1,134 |
| Lantern Sound | 1,251 | 959 |
| Breakwater Reach | 1,095 helicopter, 1,149 tank, 820 mech, 978 ship | 1,064 |
| Workshop playtest | 958 | 1,054 |

The first Breakwater attempt wrote all four crew victory screenshots. Chrome then reported that the inspected target had navigated or closed. The error did not identify the triggering call. A fresh browser profile completed the full suite, including the defeat, export, verification, allocation sampling and unavailable-WebGL checks. [First attempt](combined-first-attempt.txt) · [Completed Breakwater report](combined.json.gz)

The release-specific check collected all 29 receipt occurrences from the Tactical Display browser reports in the pinned v0.3.0 Git tree. All 24 distinct recordings reproduced their complete receipts in the packaged game modules under Chromium. The repository's separate catalogue of 107 earlier recordings also passed in the corresponding browser or Node runtime. [v0.3.0 verification with source locations](v0.3.0-replays.json) · [Earlier catalogue](archives.json.gz)

From the tested checkout, serve the extracted build through the acceptance driver and run the release-specific checker with the same ZIP.

~~~sh
export RIDGEFIRE_WEB_ROOT=/path/to/unpacked/Vehicular-Warfare
export CHROMIUM=google-chrome CHROMIUM_BACKEND=software VW_TEST_PRESENTATION=retro
node tools/browser.mjs /tmp/war-history/sable
for suite in routes tank mech naval combined creator archives
do
  node tools/browser.mjs "/tmp/war-history/$suite" "$suite"
done
python3 evidence/war-room/historical/verify_release.py /path/to/Vehicular-Warfare.zip
~~~
