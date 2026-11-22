# RIDGEFIRE

Pilot the Kestrel through Sable Valley. A ridgeline hides you from a fixed AA emplacement and a moving convoy carrier. Both can see and fire once you climb into view. Destroy both units and survive the sortie.

## Launch locally

From the repository root, run the following command with Python 3.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [RIDGEFIRE on localhost](http://127.0.0.1:8080/) in desktop Chromium with WebGL enabled, then select **Launch mission**. All executable code, geometry and shaders are local. The same files can be served below a directory prefix.

| Control | Action |
| --- | --- |
| R / F | Raise / lower collective. Release to settle into hover. |
| W / S and A / D | Pitch forward / back and bank left / right to translate. |
| Left / right arrows | Turn the helicopter. |
| Up / down arrows | Adjust sight elevation. |
| Space or left mouse | Launch a rocket. Hold for repeated fire. |
| Right mouse | Capture mouse steering and sight elevation. Escape releases capture and pauses. |
| C | Switch between chase and cockpit cameras. |
| P or Escape | Pause. Resume, restart or save a replay from the panel. |

Begin in cover and tap Space to see a rocket hit the ridge. Hold R until the threat indicator reads **EXPOSED**, then release. A named reticle identifies a visible target inside the assisted sight cone. Rockets fly straight from launch. Hold F briefly to break contact. The defenders search the last observed position while their airborne shots continue. A hard descent can destroy the aircraft. The mission ends on destruction of both targets, loss of the Kestrel, exhaustion of usable rockets, or the three-minute time limit.

## Verification

The separately tested authority runs at 120 Hz. Run the numerical tests with Node 22 and Python 3. The browser acceptance driver starts an ephemeral loopback server and an isolated headless Chromium profile, flies via keyboard and mouse, captures screenshots and writes raw measurements to the chosen directory.

```sh
node --test test/authority.test.js
node tools/measure.mjs
CHROMIUM=google-chrome node tools/browser.mjs /tmp/ridgefire-verification
```

**Save replay** downloads the seed, accepted control changes, elapsed ticks, source identity and state/event checksums. To verify a saved receipt in Node from the repository root, run

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {replay} from './sim/world.js'; console.log(replay(readFileSync(process.argv[1],'utf8')).status)" ridgefire-replay.json
```

The [numerical evidence](evidence/authority/) records eight passing tests at `91eb991ba861a772fe616ee0ae5b16179b4c8836`. [PR #2](https://github.com/QSOLKCB/Vehicular-Warfare/pull/2) merged that authority and its evidence into main at `3e37e8b66d998f083b5f1872c9531b5b25a53d8d`. See the [simulation contract](docs/AUTHORITY.md) for replay scope, sweep geometry and sensor timers.

## Source and scope

VANILLAJS v3.4.0 is pinned at `0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466`. The [per-file SHA-256 manifest](vendor/vanillajs/provenance.json), [upstream license](vendor/vanillajs/LICENSE) and [notice](vendor/vanillajs/NOTICE) accompany the exact source closure. Reproduce this branch's closure with `python3 tools/vendor.py /path/to/VANILLAJS render-webgl render-packing`. The renderer retains the landscape and sky and reuses model and effect buffers. Aircraft motion, targeting and mission outcomes come entirely from the numerical world.

This release candidate has one fictional aircraft, one seeded mission and two ground opponents. The hull uses conservative terrain clearance and assisted lift. The presentation is silent. Keyboard-only flight works without mouse capture. Replay is scoped to the tested runtime. Native GPU performance, mobile touch controls and other vehicle classes are outside the verified scope.

[Agent instructions](AGENTS.md) · [Roadmap](ROADMAP.md) · [Original handoff](docs/CODEX_CLI_HANDOFF.md) · [Game design](docs/GAME_DESIGN.md) · [Architecture](docs/ARCHITECTURE.md) · [Engine baseline](docs/ENGINE_BASELINE.md) · [DOS-era techniques](docs/DOS_TECHNIQUES.md) · [Acceptance contract](docs/ACCEPTANCE.md)
