# Vehicular-Warfare roadmap

**VW-000:** documentation only. **VANILLAJS pin:** v3.4.0 at 0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466.

| Phase | Delivery | Acceptance |
| --- | --- | --- |
| VW-000 — Charter | README, AGENTS, design, technical audit, Codex handoff | Owner reviews docs PR |
| VW-001A — RIDGEFIRE authority | 120 Hz rotorcraft, immutable heightfield, LOS, AA, real rockets/damage, replay | Numerical hide→expose→hide, collision, AI, score and replay tests |
| VW-001B — Playable RIDGEFIRE | Original mountain valley, cockpit/chase, CPU AA and convoy, real mission | Complete browser win/loss/restart, source receipts, no external runtime |
| VW-VIS-001 — Voxel Terrain Laboratory | Accepted in [PR #8](https://github.com/QSOLKCB/Vehicular-Warfare/pull/8). Optional Survey and Fine height-column views on all three sorties | [Numerical, replay and Chromium evidence](evidence/voxel-terrain/) |
| VW-002 — Tracked Warfare | Accepted in [PR #9](https://github.com/QSOLKCB/Vehicular-Warfare/pull/9). Cutbank Relay, a playable tracked-vehicle encounter with independent turret aim | [Numerical and Chromium checks](evidence/tracked-warfare/) |
| VW-003 — Mech Warfare | Accepted in [PR #10](https://github.com/QSOLKCB/Vehicular-Warfare/pull/10). Glassworks Crossing, a six-legged walker with independent torso aim and a survey objective | [Numerical contact tests and playable Chromium run](evidence/mech-warfare/) |
| VW-004 — Naval Warfare | Lantern Sound, a buoyant surface cutter, patrol, shore relay and navigable channel | [Water, grounding and mission verification](evidence/naval-warfare/) |
| VW-005 — Combined arms (planned) | Shared encounters across air/ground/sea | Cross-domain target/damage parity |
| VW-006 — Creator systems | Seeded editor, replay views, original dynamic music | Inert validated content and repeatable replay |
| VW-007 — Release/performance | Native GPU profiling, LOD, effect budgets, polish | CI, owner acceptance and manually approved tag |

**Implementation sequencing:** one playable helicopter game first; avoid tackling all vehicle categories in one PR. VW-001A and VW-001B should be separate PRs if that increases reviewability. The v3.4.0 GC Observatory is development tooling, not a built-in game performance boost.

Future DOS-era inspirations include Stunts-style level editing/replays, Frontier-like seeded generation, TIE Fighter-like event-driven original music, Descent-style manoeuvring and Magic Carpet-like terrain changes. Deformation is future-only: physics, rendering, LOS, AI routes and replay would all need a single atomic terrain update.
