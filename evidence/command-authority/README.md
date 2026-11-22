# VW-CMD-001 verification

Tested gameplay and tooling at `828d1e310398d39e857f10eeb6aac91c63bcd1d6`, based on v0.3.0 at `5c3088953f983fadb2fade5f360de24f2d30cd2d`. The next commit adds this evidence. The archive built by tools/package.py had SHA-256 `8a3fd4bd2411bca3fd7c27917c0ec423ab7aba325b0b3548be59d923cc8f32d8`.

All 122 Node tests passed. The command suite covers pool visibility, individual sight, immutable admission, queue boundaries, direct travel and stalls, planted feet, differential tracks, grounding, rotor clearance, mission outcomes and replay tampering. Some isolated locomotion and concealment fixtures remove other combatants or their ammunition. The example encounter runs the untouched default scenario from deployment.

All four crews attacked the observed relay at tick zero. Basalt received a queued MOVE to the crossing. The resulting victory and replay appear in [measure.json](measure.json), including every launch, interception, hit and mission event. The same driver compared intermediate receipts across 3,959 released Breakwater ticks in separately loaded original and current implementations.

The [historical replay report](historical.json) covers 107 distinct recordings from 204 occurrences in the repository's archived catalogue, verified with the appropriate Node or Chromium runtime from the extracted game. Chromium qualified SwiftShader. Run the check with RIDGEFIRE_WEB_ROOT pointing at the unpacked Vehicular-Warfare directory and `node tools/browser.mjs /tmp/command-archives archives`.

The performance driver reports three 720-tick samples for each simulation, two order submissions per command sample, incoming projectile sweeps, concurrent order counts, heap snapshots and a separate sampled CPU profile. Timings are specific to those workloads and include JIT and garbage collection variability.
