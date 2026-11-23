# Offline play and release verification

## Play the offline candidate

Unzip the candidate and change into the extracted `Vehicular-Warfare` directory. Run the following command with Python 3, then open `http://127.0.0.1:8080/` in desktop Chromium with WebGL enabled.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Choose a sortie on the mission board. For a surface vehicle, start with **Simple**. W/S drive and reverse, A/D turn and bring the mount toward the new heading, and Space fires. Release W/S and A/D to brake a tank. A walker plants its feet at the end of its stride. A slow cutter steers under light ahead power. Q/E aim left/right and R/F raise/lower the mount. Manual aim holds until your next steering turn. Arrow keys work as well. C changes camera and P pauses. Choose **Independent** before deployment or while paused to steer and aim separately. Helicopter crews use E/Q for collective and Z/X to slide.

The archive includes every mission, the local assets, the simulation, vendored engine and licence notices. The `evidence/creator-systems` folder inside the archive includes the Copper Crossing pack and two workshop recordings. Use **Import pack** or **Open replay** in Mission workshop. Replay verification uses the recording source and runtime.

## Build and check a candidate from source

From a Git checkout, run the commands below with Node 22.18.0, Python 3, Git and a local Chromium installation. The packager reads the committed tree, writes a ZIP with the source SHA in its archive comment, validates its CRCs and prints its SHA-256. Uncommitted workspace files stay outside the archive.

```sh
output=$(mktemp -d)
python3 tools/identity.py --check
node --test test/*.test.js
python3 tools/package.py "$output/Vehicular-Warfare.zip"
python3 -m zipfile -e "$output/Vehicular-Warfare.zip" "$output/unpacked"
RIDGEFIRE_WEB_ROOT="$output/unpacked/Vehicular-Warfare" CHROMIUM=google-chrome \
  node tools/browser.mjs "$output/controls" controls
CHROMIUM_BACKEND=software node tools/browser.mjs "$output/software" profile
CHROMIUM_BACKEND=native node tools/browser.mjs "$output/native" profile
```

The mixed benchmark draws the same accepted tank recording with full and balanced detail. Balanced detail keeps the player and shore relay detailed and combines distant mobile crews into one mesh submission. Zooming in retains detailed models farther away. All live projectiles keep a render slot. The report separates JavaScript draw preparation, HUD work, animation-frame intervals and available GPU timer-query samples. The native command checks the actual WebGL renderer and rejects software fallback. Hardware availability and driver configuration determine which native reports a host can produce.

## Owner review

The **Release verification** workflow runs on pull requests to main and pushes to main. It checks source identities, vendored bytes and numerical tests, builds the candidate ZIP, then drives the extracted game in software Chromium. The **offline-game** and **control-acceptance** workflow artifacts contain the tested ZIP and browser observations.

For release approval, compare the intended commit and archive checksum, inspect the native and software measurements, and try the controls on the target machine. Each tag requires a separate owner decision on its name and exact commit. The candidate workflow ends after verification and artifact upload.

## Operation Overlord

Select **Operation Overlord · Tactical Intelligence** on the mission board. The [commander guide](OVERLORD.md) ships inside the ZIP. From a source checkout, run `node tools/browser.mjs /tmp/overlord-check overlord` with RIDGEFIRE_WEB_ROOT pointed at that extracted copy.
