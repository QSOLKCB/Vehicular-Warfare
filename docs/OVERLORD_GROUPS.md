# Coordinated manoeuvre on Breakwater

Choose a group of Cobalt crews and a chart anchor. Every section task replaces the selected crews’ explicit orders. Crew IDs, the task, the anchor and its admission tick enter the recording. Other crews keep their orders. A disabled member drops its orders independently. An unreachable slot reports its failure in that crew’s result.

| Task | Accepted behaviour |
| --- | --- |
| ADVANCE | Move to spaced slots. If a previously assigned covering crew has a slot within 72 game metres of the anchor, wait for that crew to be on station before moving. Choose the nearest cover slot, then the first stable ID. |
| COVER | Use DEFEND to reach and occupy a cover slot. The mount can engage an individually visible contact while travelling or holding. |
| FLANK | Attempt a different approach to each compatible slot. Visit and settle at the validated intermediate marker, then travel to the slot. A crew without an alternate path reports a blocked task. |
| REGROUP | Route each member independently to its assigned rally slot. Different classes use the existing formation priority and terrain checks. |

An ADVANCE can wait up to 240 accepted ticks for its covering crew. The wait records the covering crew ID and the original COVER command’s index in the accepted order log. Loss or reassignment of that crew releases the movement on the next simulation step, including when the new COVER order has the same destination and tick. A queued player successor also releases it so the commander’s two orders can run in sequence. The assignment records the release reason and tick. Replacement takes effect immediately.

## Routes and bounds

The 47 × 47 formation grid supplies ordinary routes, terrain and friendly traffic tests. For FLANK, the planner first computes the ordinary route. It checks up to two six-metre grid markers located on either side of the midpoint between start and destination, two slot spacings from the straight line. Each marker needs at least 12 m clearance from the ordinary route. The planner checks the route to that marker and the onward route from a projected starting pose. The final approach must differ in heading by more than approximately 20 degrees from the ordinary final leg. The aircraft, track, gait or rudder controller executes each accepted leg. The real hull stays at its original position throughout planning.

A FLANK submission costs at most five formation searches per crew, each capped at 2,209 visited nodes. Other tasks require at most one initial search per crew. Searches run at command admission. Repeated twelve-crew flanks can incur visible admission latency. The game keeps the ordinary five-second stall replan and subsequent finite failure path per stage. FLANK consumes two of the eight queue entries. A wait consumes one. The twelve-entry check for advancing crews runs once per tick.

Water, slopes, traffic, and the two-marker bound can leave an otherwise reachable conventional destination without a distinct alternate approach. Slots reserve endpoints. Crews can still meet moving traffic on a shared lane. The covering unit can miss, run out of ammunition or lose contact. Selecting COVER requests an actual opportunity to fire.

## Reproducible fixtures

Run `node --test test/overlord-groups.test.js` and `node tools/overlord-groups-measure.mjs` on the default coast. The measurement includes accepted commands, the starting plans, sampled world positions, support launches, projectile impacts, stage completions, the mission outcome and a same-runtime replay verification.

Fixture A assigns Basalt 2 to cover (−30, 17) while Kestrel 1 advances to (−30, 3). The comparison issues ordinary DEFEND and MOVE orders to the same crews on the v0.5.0 Big Battle and on the doctrine scenario. The doctrine comparison isolates the coordination policy with the same opposing AI. The earlier scenario gives a historical behavioural comparison on the same deployment.

Fixture B assigns Basalt 2 a different cover position (−26, 15) and sends Basalt 3 and Kestrel 3 to (−6, 66) using FLANK. The ordinary route for Basalt 3 already bends around a friendly obstruction. The alternate task must produce a different intermediate marker and a different final leg. The test checks arrival at both members’ actual intermediate and final positions. A separate fixture orders a cutter inland, checks its blocked result and confirms the independent advance survives.

The `overlord-groups` Chromium suite runs the same fixture against the extracted ZIP, draws the accepted map at tick 240 and verifies its recording in Chromium. The Operation Overlord interface acceptance exercises the player controls separately.
