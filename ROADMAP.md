# Vehicular-Warfare roadmap

**VW-000:** documentation only. **VANILLAJS pin:** v3.4.0 at 0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466.

| Phase | Delivery | Acceptance |
| --- | --- | --- |
| VW-000 — Charter | README, AGENTS, design, technical audit, Codex handoff | Owner reviews docs PR |
| VW-001A — RIDGEFIRE authority | 120 Hz rotorcraft, immutable heightfield, LOS, AA, real rockets/damage, replay | Numerical hide→expose→hide, collision, AI, score and replay tests |
| VW-001B — Playable RIDGEFIRE | Original mountain valley, cockpit/chase, CPU AA and convoy, real mission | Complete browser win/loss/restart, source receipts, no external runtime |
| VW-VIS-001 — Optional voxel-view | Original 2.5D height-column terrain renderer, same accepted heightfield | Compare visuals and measured costs without changing hits/physics |
| VW-002 — Tank | Tracks/traction, independently aimed turret, hull-down tactics | Verified contact and ballistics |
| VW-003 — Mech | Tested stepping, balance, torso aiming | Real leg/ground physics and contact |
| VW-004 — Naval | Buoyancy, hull drag, rudder, weapons | Water/terrain and combat replay |
| VW-005 — Combined arms | Shared encounters across air/ground/sea | Cross-domain target/damage parity |
| VW-006 — Creator systems | Seeded editor, replay views, original dynamic music | Inert validated content and repeatable replay |
| VW-007 — Release/performance | Native GPU profiling, LOD, effect budgets, polish | CI, owner acceptance and manually approved tag |

**Implementation sequencing:** one playable helicopter game first; avoid tackling all vehicle categories in one PR. VW-001A and VW-001B should be separate PRs if that increases reviewability. The v3.4.0 GC Observatory is development tooling, not a built-in game performance boost.

Future DOS-era inspirations include Stunts-style level editing/replays, Frontier-like seeded generation, TIE Fighter-like event-driven original music, Descent-style manoeuvring and Magic Carpet-like terrain changes. Deformation is future-only: physics, rendering, LOS, AI routes and replay would all need a single atomic terrain update.
