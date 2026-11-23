# Vehicular-Warfare roadmap

**VW-000:** documentation only. **VANILLAJS pin:** v3.5.0 at 9d95d74b355ec17add32db0b55f0f71130f9c004.

| Phase | Delivery | Acceptance |
| --- | --- | --- |
| VW-000 — Charter | README, AGENTS, design, technical audit, Codex handoff | Owner reviews docs PR |
| VW-001A — RIDGEFIRE authority | 120 Hz rotorcraft, immutable heightfield, LOS, AA, real rockets/damage, replay | Numerical hide→expose→hide, collision, AI, score and replay tests |
| VW-001B — Playable RIDGEFIRE | Original mountain valley, cockpit/chase, CPU AA and convoy, real mission | Complete browser win/loss/restart, source receipts, no external runtime |
| VW-VIS-001 — Voxel Terrain Laboratory | Accepted in [PR #8](https://github.com/QSOLKCB/Vehicular-Warfare/pull/8). Optional Survey and Fine height-column views on all three sorties | [Numerical, replay and Chromium evidence](evidence/voxel-terrain/) |
| VW-002 — Tracked Warfare | Accepted in [PR #9](https://github.com/QSOLKCB/Vehicular-Warfare/pull/9). Cutbank Relay, a playable tracked-vehicle encounter with independent turret aim | [Numerical and Chromium checks](evidence/tracked-warfare/) |
| VW-003 — Mech Warfare | Accepted in [PR #10](https://github.com/QSOLKCB/Vehicular-Warfare/pull/10). Glassworks Crossing, a six-legged walker with independent torso aim and a survey objective | [Numerical contact tests and playable Chromium run](evidence/mech-warfare/) |
| VW-004 — Naval Warfare | Accepted in [PR #11](https://github.com/QSOLKCB/Vehicular-Warfare/pull/11). Lantern Sound, a buoyant surface cutter, patrol, shore relay and navigable channel | [Water, grounding and mission verification](evidence/naval-warfare/) |
| VW-005 — Combined arms | Accepted in [PR #12](https://github.com/QSOLKCB/Vehicular-Warfare/pull/12). Breakwater Reach, a coastal relay encounter with four selectable vehicle classes and allied and hostile crews | [Cross-domain contact tests, mixed encounters and replays](evidence/combined-arms/) |
| VW-006 — Creator systems | Accepted in [PR #13](https://github.com/QSOLKCB/Vehicular-Warfare/pull/13). Mission workshop with editable seed, crew and objectives, local pack exchange, three replay cameras and an original adaptive score | [Validated packs, playable runs, timeline checks and audio](evidence/creator-systems/) |
| VW-007 — Release/performance | Simple surface controls, mixed-scene LOD and effect budgets, native GPU and SwiftShader profiling, offline candidate ZIP and PR verification | [Measured release candidate](evidence/release-performance/) · [Owner review and tagging](docs/RELEASE.md) |
| VW-ENG-001 — The Silicon Bridge | Import the v3.5.0 module closure, including FX-PIPE, BLIT and COPPER | [Engine baseline and dependency audit](docs/ENGINE_BASELINE.md) |
| VW-GFX-003A — The Geometry Coprocessor | Optional fixed-point gate beacon for the mixed theatre and workshop | [Geometry contract](docs/FX_PIPE.md) |
| VW-GFX-003B — The Tactical Display Forge | Optional packed 16-colour chart with scanline palettes | [Retro display, visibility and replay](docs/RETRO_DISPLAY.md) |
| VW-CMD-001 — Command Authority | Bounded per-crew orders using the original eight mobile actors and relay | [Authority and replay](docs/COMMAND_AUTHORITY.md) |
| VW-CMD-002 — The War Room | Strategic map, group selection, live 3D observation and command replay | [Play the operation](docs/WAR_ROOM.md) |
| VW-CMD-003 — Formation Intelligence | Spaced destinations and bounded routes through the Breakwater chart | [Routing and physical acceptance](docs/FORMATION.md) |
| VW-CMD-004 — Battle Director | Orbit an observed crew and inspect a paused or verified battle frame | [Camera controls](docs/WAR_ROOM.md) |
| VW-CMD-005 — The Big Battle | Playable 24-vehicle Breakwater scenario with twelve commandable crews | [Roster and scale measurements](docs/BIG_BATTLE.md) |

**Implementation sequencing:** one playable helicopter game first; avoid tackling all vehicle categories in one PR. VW-001A and VW-001B should be separate PRs if that increases reviewability. The v3.4.0 GC Observatory is development tooling, not a built-in game performance boost.

The mission workshop brings seeded generation, map editing, multi-camera replay and event-driven music into the game. Further inspirations include Descent-style manoeuvring and Magic Carpet-like terrain changes. Deformation is future-only: physics, rendering, LOS, AI routes and replay would all need a single atomic terrain update.
