# Vehicular-Warfare — Codex CLI agent instructions

Read README.md, ROADMAP.md and all docs linked by README before editing. VW-000 is the historical planning baseline. Check the revision-specific evidence under `evidence/` for implemented milestones.

## Purpose and pin

- Build an original offline-first combined-arms game, starting with **VW-001: a genuinely playable 3D helicopter-vs-ground encounter** where terrain is tactical concealment. Tanks, mechs and ships require their own later physics and acceptance gates.
- Immutable VANILLAJS **v3.5.0** at **9d95d74b355ec17add32db0b55f0f71130f9c004**. Inspect source exports and MODULES.json, vendor the required transitive source closure with SHA-256 per-file receipts, LICENSE and NOTICE. Do not follow upstream main silently.
- Existing VANILLAJS flight is a 6DOF integrator **not** helicopter physics. Airframe is not rotorcraft lift. Vehicle3d models four wheels, not tank tracks. Ships and mechs need separate models.
- Use **120 Hz fixed authoritative simulation** for initial flight and projectiles. Combat3D advances at 60 Hz; either explicitly bridge rates with an independently tested contract or keep a bounded game-owned 120 Hz weapon/damage ledger. Never call Combat3D as if it were a 120 Hz vehicle solver.

## Correctness

- Terrain Heightfield must govern sampled altitudes, ground contact and physical line-of-sight. Graphics, LOD and cameras cannot decide AI knowledge, shots, damage or score.
- CPU AA must lose line of sight behind accepted terrain and regain it only when exposed, with explicit reaction/search timers.
- Projectile travel, terrain impact, swept collision, ammo, cooldown, damage attribution and win/loss must arise from actual accepted events. No fake hit animations as gameplay.
- Bound terrain, actors, particles, commands, coordinates, time and memory. Validate data-only packs and reject invalid/NaN/accessor/oversized content without mutating the accepted world.
- Save seed, accepted commands, game state/event digest and exact source identity; promise same-runtime deterministic replay only within tested scope.
- Blur, pause, hidden tab, pointer unlock and rematch must clear held inputs and wall-time debt, and release GPU/audio/RAF/listeners.

## Development/review

- Native HTML/CSS/ES modules/WebGL1, Python standard-library local HTTP server and Node developer tests. No Docker, Kubernetes, CDN, required npm runtime, telemetry, accounts or unapproved cloud.
- Original content only. Do not import Comanche commercial maps, artwork, sounds, shaders or game assets; historical technique is inspiration, not a licence.
- Build small reviewable PRs with executed numerical tests, real browser interaction, screenshots, exact source SHA, provenance and honest untested limits.
- **Do not merge, tag, publish, deploy or edit VANILLAJS/OPT/Boomer-Shooter or any other repo without explicit owner authorization.**
- **Correctness outranks speed.**
