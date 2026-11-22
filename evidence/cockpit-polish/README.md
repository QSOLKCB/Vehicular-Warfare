# Cockpit acceptance

The flight source was e2725668276f6f2a3335414b09a6bffa64e94e7b. Both long sorties used the cockpit, the 1.6× sight and enabled procedural sound. The driver exercised the normal keyboard events and checked actual launches, mission events, health and replay digests. These rehearsal times measure accepted simulation ticks. The two screenshots were taken while enemy rounds were in flight.

- `flights.json` contains the two winning recordings, ordered beacon visits, enemy shot counts, frame-interval p95 and replay results.
- `exposure.json` records the Long Watch stationary-hover defeat, including shot IDs and remaining hull for each hit.
- `sable.json` records the original training mission, win, loss, repeated restart, input cancellation, tab switching and resource observations.
- `runtime.json` identifies the Chrome version, source revision, SwiftShader backend and drawing buffer used for the extended missions.
- `node.tap` records the twelve numerical tests at f2317d203d49ee2048cf1cbf1cd99b512df154fb. The subsequent camera change affects only presentation.

From the repository root, reproduce the campaign with `node tools/browser.mjs /tmp/ridgefire-polish routes` or the training sortie with `node tools/browser.mjs /tmp/ridgefire-training`. Chrome verified the campaign receipts in its own runtime. The browser test checks that the audio context opens during flight and closes on debrief. Physical speaker output and native GPU performance are untested.
