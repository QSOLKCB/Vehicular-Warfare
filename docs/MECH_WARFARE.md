# Glassworks Crossing

The Kiln walks up a causeway, engages a patrolling sentinel and links a survey beacon on the far terrace. Both machines use the same walking model. The mission owns their movement, contacts, aim, shots and objectives. The camera and synthesizer consume the accepted poses and events.

## Feet and support

`createWalker(field, x, z, yaw)` creates a supported pelvis and six feet on the accepted Heightfield. `stepWalker(walker, field, throttle, steer)` takes finite inputs in [−1, 1] and advances one 120 Hz tick. Zero yaw faces −Z. The six shoe positions are world coordinates. A stance shoe stays planted while the opposite tripod swings. The leg frame turns independently of the torso.

A stride lasts 24 ticks. Its plan identifies the three fixed contacts, a candidate horizontal path for the pelvis, and three landing sites. The walker tests those sites against the field boundary, local grade, change in height, and terrain between the old and new footprints. Planted contacts establish a support plane for pelvis height and tilt. The horizontal projection of the centre of mass must stay inside the support triangle, with a margin for motion. The model checks leg reach before accepting a pose. Speed and turn are bounded and new drive inputs are sampled at stride boundaries.

Each leg has two 1.55 m links. The planner accepts up to 0.62 m of height change per step and a local rise/run of 0.56. Full speed is 4 m/s in either direction. The support check projects 8% beyond the intended displacement. During load transfer, pelvis height can change by up to 4 m/s and pitch or roll by up to 1.6 rad/s.

When contacts disappear, horizontal motion stops. The shoes lower within reach and the unsupported pelvis falls under gravity, up to 6 m/s, until it finds a supporting tripod or rests on its underside. A stride can resume once all the shoes are planted and the pelvis has settled. This quasi-static approximation uses point soles and a pelvis centre of mass. Momentum-driven tipovers, foot friction and joint torques are outside its scope.

`legJoints(walker, index)` gives the world-space hip, knee and sole for each accepted leg. Two equal links meet at the outward solution of the hip-to-foot inverse kinematics. Render frames use these same endpoints. The foot display and step sounds use the stance flags.

## Torso, encounter and replay

`aimWalker(walker, traverse, lift)` changes absolute torso bearing and gun elevation. `walkerGun(walker)` returns the mount, muzzle and forward vector. The independent mount lets the pilot continue straight or turn the leg frame while holding aim on a different bearing.

Plasma pulses travel straight from a clear muzzle. The simulation sweeps the segment for each tick against the Heightfield and the translating pelvis and torso boxes. Earlier terrain contact blocks damage. Damage requires an accepted actor hit. The boxes are axis-aligned approximations. Legs and muzzle geometry participate in locomotion and presentation and have no independent damage pool.

The CPU patrol and its sensor run on the fixed clock. Acquisition requires 120 consecutive visible ticks. Losing sight clears acquisition and the last observation expires after 120 hidden ticks. Disabling the sentinel scores 100 points. Reaching within 2.8 m of the survey beacon with a supporting tripod then scores 50 points and completes the sortie. Loss of the player, exhaustion of usable cells while the enemy survives, or reaching the two-minute time limit ends the sortie.

The mission bounds its working set at two walkers, twelve live pulses and 96 recent events. The event digest includes earlier events as well. The optional synthesizer supports eight simultaneous voices for footfalls, launches, impacts and destruction. Pause and debrief close the sound context and release the scene buffers.

`createMechWorld({seed})` accepts a validated uint32 seed. `stepMech(world, mask)` accepts the nine-bit mech control mask. `mechReceipt(world)` records the mission, source identity, seed, accepted controls, elapsed ticks and state/event digests. `replayMech(jsonText)` checks a bounded versioned receipt in the recording runtime. The ground station shares lifecycle and replay UI with Cutbank. Both keep their own simulation and receipt entry points. Run `python3 tools/identity.py --check` to verify the per-family source identities. [Pinned engine closure](../vendor/vanillajs/provenance.json)
