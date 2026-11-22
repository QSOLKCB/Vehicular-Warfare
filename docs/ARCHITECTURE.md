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

## Terrain views

`View.render(world, camera, briefing = false, zoom = false, terrainMode = "webgl", profile = "survey")` reads the live world without advancing it. The optional `"voxel"` mode accepts `"survey"` or `"fine"`. Terrain selection belongs to the page and survives pause, restart and sortie changes within that page. Switching in flight takes effect on the next draw. Selecting a profile on pause takes effect on resume.

Both terrain paths start with `world.field`. WebGL draws its triangles directly. The software renderer traverses columns from near to far and fills only the rows newly exposed above the previous horizon. It prepares a colour texture at bounded resolution. The compositor maps camera rays back into this texture. The existing sky, trees, beacon lamps, helicopter, targets and effects retain their 3D geometry. The terrain triangles write depth so geometry behind a ridge stays occluded.

The colour map contains four texels per cell axis. Each texel gets its colour from the field’s height and normal, with separate winter and dry-valley palettes. Per-frame height samples go directly through `Heightfield.sample(x, z)`. The two profiles have explicit bounds.

| Profile | Azimuth columns × elevation rows | Initial distance step | Maximum step |
| --- | ---: | ---: | ---: |
| Survey | 256 × 160 | 0.6 m | 0.65 cell widths |
| Fine | 384 × 240 | 0.4 m | 0.45 cell widths |

Each column clips to the field boundary and a 1,200 m radial limit, with at most 640 samples. The colour map, RGBA upload buffer and elevation slopes are reused while a profile is active. The pinned sampler returns a height, normal and cell record for each query. The column layer also owns one WebGL texture, one program and one triangle buffer. A profile change, return to Original WebGL, or disposal of the view releases those resources.

A heightfield has one surface elevation per horizontal location. It cannot represent overhangs, tunnels or overlapping floors. Camera pitch, bank and sight zoom change the texture projection. At steep angles or close to a ridge the limited angular and distance samples can produce stair steps, stretching and colour/depth edge differences. The attitude indicator and sight continue to use the aircraft state and camera. Each live projectile still sweeps the authoritative world at 120 Hz.

**Lifecycle:** malformed mission rejection before committing state; pause/blur/capture loss clears held inputs/time debt; teardown GPU/audio/RAF; same-source/runtime replay with raw evidence. Separate CI/headless software results from native GPU claims.
