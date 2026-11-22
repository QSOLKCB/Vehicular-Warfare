# Lantern Sound

The cutter leaves a sheltered channel, disables a patrol vessel and a shore relay, then sails into the exit buoy. The simulation advances in 120 Hz steps. The bridge draws the accepted hull pose, mount, projectiles and waterline. The player and patrol use the same vessel solver.

## Water and buoyancy

`new WaterSurface(level)` creates an immutable horizontal surface. Its `heightAt(x,z)` supplies the elevation used by the hull and water mesh. Its `castSegment(start,delta)` returns the first water contact along a displacement. Islands and the seabed are the triangles of the mission Heightfield. Above-water terrain writes depth in front of the sea.

`createVessel(field,water,x,z,yaw)` creates the hull in trim. `stepVessel(ship,field,water,throttle,rudder)` accepts finite control axes in [−1, 1]. Six samples at port and starboard measure immersion fore, amidships and aft. Their displaced volumes support the hull's mass against gravity. Unequal support produces pitch and roll moments. A raised hull can fall into the water and settle back to its equilibrium draft. Heave and tilt velocities persist across ticks.

Yaw zero faces −Z. Positive yaw turns starboard, positive pitch raises the bow and positive roll raises the starboard side. `vesselPoint(ship,side,up,forward)` transforms hull coordinates into world space. The propulsion and water drag depend on hull heading. Rudder authority varies with the flow past the hull. The world holds the accepted position, velocity, angular rates, grounding state and displaced volume. The flat sea has a fixed level for the entire sortie. The model omits waves, capsize, flooding and deformable hulls.

The hull is 8 m long and 3.2 m wide with a 2 m vertical extent. In game units its mass is 78 and the water density is 10. Each of the six columns has area 2. Level trim occurs at a 0.65 m draft, where 7.8 units of displaced volume support the hull. A submerged column contributes upward force and damping according to immersion and local vertical speed. Thrust below the centre of mass changes pitch, and the offset rudder can heel a turning hull. Longitudinal and lateral drag damp motion independently.

Grounding uses a conservative box around the tilted hull. A per-cell maximum cheaply excludes deep cells. Near shoals the solver checks the terrain triangle edges and diagonals inside the footprint, including peaks between the six flotation points. It rejects horizontal moves that would cross the seabed, enter water shallower than the static draft or leave the chart. The conservative envelope can stop a ship short alongside a diagonal bank.

## Deck mount and mission

W and S control propulsion, A and D the rudder. The arrows turn and elevate the mount independently of the helm. Space or the left mouse button fires. C changes between chase and sight views. The HUD lists both opponents and the exit buoy. Press P to pause or press Escape to release mouse capture.

`createNavalWorld({seed})` accepts the game’s validated uint32 seed record. `stepNaval(world,mask)` consumes the nine-bit naval control mask. `navalGun(actor)` returns the mount, muzzle and direction. Projectile travel and impacts advance on the simulation clock. Hits use the first contact along each step, including islands and the water surface. The mission awards victory after both opponents are disabled and the cutter reaches the exit buoy.

The patrol moves behind an island at the channel entrance. It needs 100 consecutive visible ticks to acquire the player. Its last observation expires after 150 hidden ticks. The player starts with 32 signal cells. The mount follows an independent world bearing while its pivot moves with the deck. A blocked barrel, including one traversed into the cutter’s own bridge, leaves the magazine untouched. Cells descend under constant game gravity and expire after three seconds. The sight shows the barrel direction. Water, intervening land or a moving hull can intercept a cell before it reaches the sighted object.

A patrol hit uses a translating hull or deckhouse box, and a shore hit uses a box fixed to the island. Each accepted actor hit costs 20 health. Both objectives are worth 100 points apiece. An afloat arrival within 5 m of the exit awards the final 50. Losing the ship, running out of usable cells with an objective still active, or exhausting the two-minute mission clock ends the sortie. The ledger retains at most 12 live cells and the latest 96 events, and hashes the full event sequence.

`navalReceipt(world)` records the mission, seed, accepted commands, elapsed ticks, naval source identity and state/event digests. `replayNaval(jsonText)` verifies the receipt against the naval simulation. The bridge can save and check replay files at the debrief. Same-runtime replay is the tested scope. Use `python3 tools/identity.py --check` for the separate source identities and `node tools/measure.mjs naval` for a timed mission and a passive hull-settling trace. [Acceptance runs and screenshots](../evidence/naval-warfare/)
