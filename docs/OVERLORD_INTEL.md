# Breakwater faction observations

The Overlord sensor module samples the 24-vehicle Breakwater board at deployment and every 30 accepted ticks. Each operational mobile crew uses its existing 100-metre sensor and the authoritative terrain and water segment tests. The relay is an observable objective. Only mobile crews report contacts. Multiple observers of one piece produce a single report from the first eligible observer in actor ID order.

Each faction stores the opponent ID, observed class, sampled XYZ position, tick, source crew ID and whether the most recent sweep found the piece. Between sweeps the record describes the sampled tick. Health, ammo, orders, velocity and weapon readiness are unknown. Sight loss freezes the last observed point. A subsequent sighting refreshes the record. A piece missing for 360 ticks expires on that boundary. A disabled crew ceases reporting at the next sweep. This can leave an observed piece in memory after destruction.

A faction can use the sampled point to investigate. Firing still requires an individual acquisition in the game’s combat step. A renderer showing a live opposing mesh at its current pose must independently establish current visibility. The sampled position suffices for a report marker.

## Priority

The ranker receives a faction book, the querying crew’s position and its assigned objective. Every returned candidate includes the integer factors used to produce its score.

| Factor | Points |
| --- | --- |
| Observed on the latest sweep | 512 |
| Shore relay objective | 128 |
| Proximity to objective | 100 minus floored horizontal distance, minimum zero |
| Proximity to crew | Same distance rule |
| Freshness | 12 on observation, decreasing by one each missed sweep |

Higher totals rank first. Equal totals sort by ascending ASCII actor ID. Ranking a remembered contact leaves its clock and observed position untouched. There is room for 13 opposing pieces on Cobalt’s board and 12 on Ember’s. A sweep can issue up to 300 individual visibility queries across both factions. The most recent 32 admission, loss, reacquisition or expiry events per faction identify the reporting crew and observation tick.

## Verification

Run `node test/overlord-intel.test.js` for the island concealment fixture, individual versus shared sight, stable rankings and hostile getters. Run `node tools/overlord-intel-measure.mjs` for the paired 480-tick read-only workload. Each run uses the released deployment, default seed and zero commander inputs. All crews rank all known contacts on every sensor sweep during the instrumented run. The report includes per-sweep processing times, counts and matching Big Battle state and event digests. This benchmark measures perception alone. Later doctrine choices can change the combat workload.

The source identity covers the sensor code and the numerical modules used by this fixture. Reproduce it with `python3 tools/identity.py --check`. The new scenario rebuilds observations from source and accepted inputs. Presentation diagnostics need no player command or imported contact table.
