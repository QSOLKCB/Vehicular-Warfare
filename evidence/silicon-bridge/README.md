# VW-ENG-001 · The Silicon Bridge

| Revision | Commit |
| --- | --- |
| Released game v0.2.0 | `0132dd22191ebfeddfce8bc76651e09eb2f12b48` |
| Tested engine bridge | `873638925a0bb2a6110c6adfb70a3578a270e596` |
| Previous engine v3.4.0 | `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466` |
| Approved engine v3.5.0 | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

## Source and package

All five previously imported module entries, LICENSE and NOTICE had identical Git blobs in both upstream tags and the same SHA-256 as the released game. The importer checked each registered dependency against the public module source. The new closure has seven roots, nine modules and two licence files. The source identities were checked before and after the import. The game, simulation, HTML and assets match v0.2.0. [Per-file audit](legacy-engine.json) · [Registered dependency graph and SHA-256 receipts](../../vendor/vanillajs/provenance.json)

The extracted bridge ZIP served 76 verified runtime files, with combined SHA-256 `7c14e4e78bf791eae4d94b925b3ab4f4bf1b00d51525907e64f58e5e5e4fd812`. Its archive SHA-256 was `097a3e4ae16d6d6311856732f850ca3057d5d84f31a8c4fc0498fce54d79175a`. Compared with the baseline archive, the content differences were the four added modules and the provenance manifest. [ZIP inventories and per-file hashes](zip-comparison.json)

## Simulation and replay

Node 22.18.0 passed all 101 released tests and all 103 bridge tests. The baseline and upgraded 801-tick Sable mission produced identical commands, events and outcome hashes, state `e97f4002` and events `7aca9422`. `base.tap.gz`, `bridge.tap.gz` and both flight JSON files preserve the executed results.

The archive verifier discovered 204 complete recording occurrences in the release’s tracked JSON evidence. After deduplication it verified 107 recordings through their actual simulation replay entry points. Ninety recordings used Chromium and seventeen used Node, including three receipts using the original Sable source identifier. The in-package workshop victory and defeat examples duplicate the loose recordings. Each recording verified on both the original extracted game and the upgraded extracted game in its applicable runtime. The original Sable importer emits the later compatible source identifier when saving its reproduced world. Commands, ticks, state and event checksums are compared. [Released game results](base-archives.json.gz) · [Bridge results](bridge-archives.json.gz)

## Reproduction

Check out the **tested engine bridge** above for these commands. Use an upstream clone containing both engine tags. `archives` reads the v0.2.0 game's tracked evidence directly from Git and therefore requires its commit in the local history. Every browser run verifies the served ZIP's runtime files against the chosen game checkout. The results include browser and driver versions, graphics backend, CPU, drawing-buffer size and observed requests.

```sh
python3 tools/vendor.py /path/to/VANILLAJS --check
python3 tools/identity.py --check
node --test test/*.test.js
node tools/measure.mjs
out=$(mktemp -d)
python3 tools/package.py "$out/game.zip"
python3 -m zipfile -e "$out/game.zip" "$out/unpacked"
export RIDGEFIRE_WEB_ROOT="$out/unpacked/Vehicular-Warfare"
export CHROMIUM=google-chrome
node tools/browser.mjs "$out/archives" archives
CHROMIUM_BACKEND=native node tools/browser.mjs "$out/native" profile
CHROMIUM_BACKEND=software node tools/browser.mjs "$out/software" profile
```

For the baseline, work from a second checkout at the released game SHA and build its own ZIP. For the archive check, invoke the bridge checkout’s `tools/browser.mjs` by absolute path with the baseline working directory and unpacked baseline web root. The ordinary mission and profile drivers are available directly in the release. [Historical playthroughs and reproduction](browser/README.md) · [Native and software Breakwater comparison](performance/README.md)
