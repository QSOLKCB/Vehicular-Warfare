# Cutbank Relay

Cutbank Relay is an original two-vehicle encounter. The Basalt crawler and the relay guard use the same terrain and gun geometry. The mission advances at 120 accepted ticks per second. The browser supplies controls and draws the state after simulation.

## Drive and contact

`createTracks(field, x, z, yaw)` creates a supported chassis on the accepted Heightfield. Y points up. A zero heading faces −Z and positive yaw turns right. `stepTracks(tank, field, left, right, brake)` accepts two finite track commands in [−1, 1] and a boolean service brake. Each track approaches its requested velocity independently. Their mean drives translation and their difference drives yaw, including a pivot on opposing inputs. Belt speed persists when the controls are released. Coast and brake have different deceleration limits. Grade and variation in support height reduce available traction.

The hull half-extents are 1.35 × 0.65 × 2.05 game metres. Four corner samples set a support plane. For each terrain cell under the axis-aligned projection enclosing the tipped hull, the solver evaluates terrain height relative to that plane at rectangle corners and triangle-diagonal crossings. The maximum residual sets chassis height. This conservative envelope can bridge an adjacent bump during a diagonal turn. The model treats the tracks as rigid belts with finite suspension travel. It omits individual links, wheel springs and airborne dynamics.

The solver rejects a candidate pose that leaves the field, exceeds grade 0.64, needs over 0.82 m of variation under the footprint, or changes centre height by more than 0.28 m in one tick. It arrests both tracks on rejection. The fixed-tick contact check applies at each accepted pose. The mission’s field has finite cells and a bounded speed. Continuous rotating-body dynamics and deformable ground are outside this model.

## Turret and sight

`aimTracks(tank, traverse, lift)` accepts two finite commands in [−1, 1]. Traverse changes absolute turret heading up to 1.05 radians per second, independent of hull yaw. The stabilised gun changes elevation at up to 0.42 radians per second, between −0.28 and +0.55 radians. `tankGun(tank)` supplies the turret pivot, world direction and physical muzzle from the same accepted pose used for drawing.

The observer tests the centre and eight corners of each oriented component box in stable order. One clear probe can enable acquisition. These point samples approximate component visibility. A separate segment from the gun pivot to the muzzle must clear the terrain for launch. A clear barrel and a sight cue still leave the entire route from muzzle to target to the projectile sweep.

## Encounter and replay

Cutbank has a seeded 288 × 288 m heightfield with 4 m cells. Its guard holds a fixed post. The sensor checks range and terrain segments to the component probes. Acquisition takes 100 consecutive visible ticks. Loss of contact resets acquisition and retains the last observed point for up to 150 ticks. The sensor and the gun are separate. The CPU traverses at the same limited rates as the player and needs alignment and a clear barrel before firing.

Pulses travel straight through game space at 44 m/s and expire after four seconds. Each accepted hit takes the earliest contact along the step with terrain, world boundary, or the opponent’s oriented hull and turret boxes. Terrain wins an equal-time tie. The sweep follows translating targets. Rotating component poses use a straight chord between endpoint coordinates in the component’s frame over one tick. The gun also checks clearance through the firing vehicle’s own hull.

A hit selects the struck face in the component’s local frame. Front, side, rear and top plates have game ratings 3, 2, 1 and 0. Damage points equal `10 × (5 − rating)`. The underside uses the side rating. Projectiles stop on contact. These fixed ratings describe the fictional game pieces. The player starts with 100 hull points and 16 pulses. The guard has 60 points and 30 pulses. Reload takes 72 ticks for the player and 165 for the guard. Both vehicles can have shots in flight at the same time. A kill awards 100 points. Disabled vehicles, spent player ammunition after its last shot resolves, and the two-minute limit end the encounter.

`createTankWorld({seed})` accepts the validated uint32 seed contract. `stepTank(world, mask)` accepts a ten-bit command mask. The ledger caps live projectiles at 12, stores the 96 most recent events and hashes every event in stable order. `tankReceipt(world)` records the Cutbank mission id, source hash, seed, accepted control changes, elapsed ticks and state/event digests. `replayTank(jsonText)` validates and replays a bounded, versioned receipt. Browser saves can be checked on the Cutbank board, pause panel or debrief. Replay equality is scoped to matching source and runtime.

Use `python3 tools/identity.py --check` to verify both simulation source identities. Running the same script without the flag regenerates them. The tracks and encounter share the existing pinned math, terrain and collision modules. [Source receipts](../vendor/vanillajs/provenance.json)
