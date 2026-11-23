# Breakwater doctrine authority

The numerical scenario `breakwater-doctrine-v1` creates the 24 Big Battle vehicles and relay, with the released 120 Hz integrators, 32-pulse limit, crossing objective and 14,400-tick deadline. The deployment and roster are regenerated from the accepted seed. Either faction's mobile crews use the same four board policies.

| Doctrine | Destination | Mount |
| --- | --- | --- |
| ASSAULT | Crossing marker, or the cutter's home channel at the crossing latitude | Highest ranked individually visible contact |
| DEFEND | Crew position when assigned, or its original station | Engage within individual sight while returning or on station |
| SUPPORT | Own home lane, one 12 m cell behind the advancing section crew's quantized latitude, or assigned station when no crew qualifies | Engage individually visible contacts while moving or settled |
| RECON | Investigate a lost contact's frozen chart position, otherwise visit alternating survey points on its own lane | Engage individually visible contacts |
| MANUAL | Stop, hover or brake until the commander gives an order | Wait for an explicit order |

An AI destination requests a Formation route on the 47 × 47 grid. The shared steering routines, individual locomotion solvers and body contacts determine actual motion. If the crew has made no progress for five seconds, its route gets one fresh search. The solver can still ground or block it. A failed AI request waits at least 360 ticks before attempting another destination. The fixed Ember relay can engage through its own sight.

## Command and replay API

Import `doctrineScenario` from `sim/overlord.js`. It exposes `createWorld`, `issueOrder`, `step`, `receipt`, `replay` and asynchronous `openReplay`. Give a friendly crew a doctrine with the following command.

~~~js
doctrineScenario.issueOrder(world, {
  tick:world.tick, type:'DOCTRINE', doctrine:'SUPPORT', units:['cobalt-mech'], append:false
});
~~~

A doctrine change records the chosen policy and assignment position at the command boundary. Active and queued player instructions take priority. MOVE withholds fire and ATTACK designates the player's individual target. A shooter checks its own sight every tick, resets acquisition on contact loss, trains its physical mount and requests a launch only after 100 consecutive sighted ticks. The existing pulse ledger enforces muzzle clearance, cooldown, ammunition and swept damage.

Each roster entry has a unique slot in a fixed 50-tick round. At most one piece chooses an action in a tick. Disabled pieces skip their slot. A crew ranks at most 13 shared snapshots. The controller stores its latest action, reason, candidate IDs and scores, observation source, goal, accepted tick and most recent input mask. The bounded faction books and decision cadence have no wall-clock inputs. An optional instrumentation callback `step(world,{onTactics:ms=>{...}})` measures doctrine and sensor work. Navigation and physics run outside that interval.

Format 3 binds the deployment, controllers, source closure and order stream to the recording. The state checksum covers the movement and combat state, queues, contact snapshots, current decisions and an incremental digest of prior accepted decisions. Contact notification histories belong to presentation. The event checksum covers the actual game events. Verification reissues the recorded orders in accepted order and reconstructs the run in the same runtime. Imports accept compact and indented JSON with a 1 MiB bound. Unit IDs within a group are canonicalized, and imports reject duplicate keys and alternative number spellings.

The older command module exposes four existing functions with a trailing named-export declaration. The identity checker strips this exact declaration when reproducing older identities, including the original intelligence fixture. The new scenario identity covers those exports and the implementation bytes.

Run `node --test test/overlord-doctrine.test.js` for paired manoeuvres, physically eligible shots, an empty-magazine counterexample, contact loss and reacquisition, player precedence, disabled crews, bounded imports and terminal replay. The contact-loss counterexample places the relay beyond range and restores its original position. The [intelligence fixtures](OVERLORD_INTEL.md) exercise terrain occlusion.

Run `node tools/overlord-doctrine-measure.mjs` to reproduce the paired DEFEND and RECON runs. The [raw observations](../evidence/overlord-doctrine/measure.json) include both commands, early accepted positions and masks, phase timings, terminal receipts and their verification results.
