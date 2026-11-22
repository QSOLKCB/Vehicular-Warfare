# Command authority · Breakwater Reach

Deploy four Cobalt crews on the original 288 m estuary. Disable the shore relay and two mobile defenders, and occupy the marked crossing with a surviving crew after the relay falls. A helicopter must be within 10 m of gate altitude, a cutter afloat, and a walker out of recovery. The gate radius is 8 m. Losing every crew or running out of time (14,400 ticks) ends the operation. A disabled crew drops its orders. The selected camera has no role in these decisions.

## Give an order

In an ES module, the following sequence starts the default encounter, designates the observed relay and gives the tank a waypoint after that engagement.

~~~js
import {createCommandWorld, issueOrder, stepCommand, commandReceipt, replayCommand}
  from './sim/command-world.js';

const world = createCommandWorld();
issueOrder(world, {
  tick: 0, units: Object.keys(world.units), type: 'ATTACK', target: 'relay', append: false
});
issueOrder(world, {
  tick: 0, units: ['cobalt-tank'], type: 'MOVE', x: -16, z: 3, append: true
});
while (world.status === 'active') stepCommand(world);
const saved = JSON.stringify(commandReceipt(world));
const verified = replayCommand(saved);
~~~

Orders enter at the boundary between fixed ticks and affect the next step. Each order must name the current tick and one to four distinct operational Cobalt IDs. The log preserves the order of submissions within a tick. Group members are canonicalized by ID. Each receives its own instruction and advances in the original battlefield actor order. A group sent to a single point may obstruct itself.

| Order | Additional fields | Crew behaviour |
| --- | --- | --- |
| MOVE | x, z | Travel directly using the class controls. Stop within 3 m at less than 0.65 m/s, with supported walker stance or an afloat cutter. Withhold fire while travelling. |
| ATTACK | target | Designate a hostile currently seen by a surviving friendly. Move towards a shared contact until the crew has its own sight. Engage from there with the original acquisition, mount, ammunition, cooldown and travelling cells. |
| HOLD | none | Brake, settle, or hover. Engage locally visible threats. A queued successor can begin after stopping. |
| DEFEND | x, z | Reach the point under local defensive fire rules. Stay on station within 8 m, returning if displaced. A queued successor releases the crew after arrival. |

Coordinates are finite game metres inside the theatre, east along +X and south along +Z. Each queue holds eight entries including the active order. Replacement discards the previous queue. Admission checks every recipient before changing any queue. A mission accepts up to 1,024 submissions. Unsupported verbs, including PATROL and RETREAT, are rejected in scenario v1.

## Direct navigation and contact

Controllers request movement through BK masks. The existing vehicle solvers retain track inertia, foot placement, rotor clearance, keel contact and body obstruction. Waypoints specify direct legs. Seven seconds without 0.35 m of progress or 90 seconds on one approach ends a stalled leg and clears dependent waypoints. A grounded cutter reports its grounding. ATTACK also expires after 45 seconds or on exhaustion of ammunition. The crew reports completion, obstruction or cancellation through its lastResult and queue status.

The commander's hostile-contact list is the union of surviving friendly crews' 100 m terrain- and water-filtered sensors. Each shooter still needs its own sight and acquisition. Loss of the last observation cancels pursuit. Idle crews engage using the released CPU rule. The original Kestrel lead retains the shorter launch cooldown of the Breakwater player seat. The simulation advances all eight vehicles, pulses and the shore relay on one 120 Hz clock.

## Verification

Command receipts carry scenario and format versions, the simulation source digest, seed, initial roster, accepted orders, tick count, state and event digests, and outcome. Replay checks current visibility and queue bounds again at every recorded admission. Source and runtime scope match the other missions. The legacy combined module gains a named-export declaration for the shared routines. Its released executable bytes continue to determine the historical identity. The command identity covers the full module, declaration included.

Run the following checks with Node 22 and Python 3.

~~~sh
python3 tools/identity.py --check
node --test test/*.test.js
node tools/command-measure.mjs
~~~

The numerical driver loads the exact v0.3.0 reference from Git, compares intermediate Breakwater receipts for all four crews, samples the two simulations, and verifies the example encounter.
