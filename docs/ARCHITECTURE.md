# Architecture — authoritative terrain first

~~~text
Seeded original mission data -> validate -> one immutable Heightfield + actors
Trusted controls -> accepted 120 Hz step -> vehicle physics + CPU perception
                                               |              |
                                        clearance/LOS   shots/damage
                                               \              /
                                             event ledger
                                                  |
                                      replay receipts + snapshots
                                                  |
                             WebGL terrain, vehicle, cockpit, sound
                                        (presentation only)
~~~

**World space:** metres, +Y up, -Z forward, finite bounds. One canonical 120 Hz simulation tick and explicitly bounded presentation catch-up. Fixed accepted commands and seeded decisions, never render-callback timing, drive the game.

**Terrain:** use the pinned Heightfield triangles for height, normal and world-space ray crossings. The existing vertical-offset segment routine is not a conservative full-body sweep; implement/test aircraft clearance independently. Mesh geometry is generated from the same accepted samples; never maintain unrelated visual heights.

**Concealment and targeting:** test emitter-to-target segments against the actual hill. Hidden→visible→hidden transitions govern AA acquisition/reaction, cooldown, memory and rocket terrain impacts. Camera zoom and render culling must not affect AI/weapon sight.

**Vehicle motion:** generic flight primitives + original bounded helicopter collective, hover, damped translation and attitude adapter; do not reuse fixed-wing airframe as a fake rotorcraft. Record actual position/velocity/orientation. Make cockpit/chase cameras read-only.

**Combat:** first mission needs a small real 120 Hz authority for missile/AA travel, swept hits, finite damage and attribution. If reusing Combat3D, make an explicit tested 2:1 tick bridge; its default cadence is 60 Hz. Do not silently change upstream source or fabricate hit events.

**Visual modes:** the first playable uses real WebGL1 3D. Later optional Comanche-style 2.5D height-column software rendering must read the same terrain and cannot replace physical collision or genuine 3D structures. Respect RGB vs lit-vertex layout distinctions.

**Lifecycle:** malformed mission rejection before committing state; pause/blur/capture loss clears held inputs/time debt; teardown GPU/audio/RAF; same-source/runtime replay with raw evidence. Separate CI/headless software results from native GPU claims.
