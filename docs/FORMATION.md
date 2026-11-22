# Formation Intelligence

Choose **Formation command** from the mission board. Box-select crews and give them a MOVE or DEFEND order. The indicated point becomes the group's anchor. Each crew receives a separate destination. Dashed chart lines show the remaining route, and the roster reports its leg count. Group selection, queues, combat, observation, controls and victory conditions use the [War Room controls](WAR_ROOM.md).

Try the cutter on its own. Order Tern to MOVE to X 66, Z 25. On the default chart, its first leg passes south of the island before it enters the eastern channel. To see crews take up separate positions, select Basalt and Kiln and order a MOVE to X −17, Z 16. Both crews can reach their assigned slots.

## Planning and movement

A group receives slots on a 12 m lattice around the anchor. The planner considers up to 49 candidates within three slots of each axis. Cutters choose water first, followed by ground crews and aircraft. Distance to the anchor and stable unit ID break ties within each domain. Slots on the closest available ring are preferred, with each crew favouring a shorter approach. Single-unit orders retain their exact destination. A crew with no compatible slot reports a blocked order.

A crew plans when its order reaches the front of its queue. A clear direct leg needs no search. Otherwise a breadth-first search explores up to 2,209 cells on a 47 × 47 grid with six-metre spacing. The search samples each leg every two metres, using a cached metre lattice for the surface checks and an exact endpoint check. Cutters need water depth over their footprint. Ground units need sufficiently level, dry samples. Air crews use the existing lift and clearance controller. Clear shortcuts remove unnecessary turns. The map only consults friendly positions during routing.

The physical solver advances each unit at 120 Hz and checks actual terrain, water and body contact. Crews settle at intermediate waypoints before proceeding. DEFEND retains its defensive engagement rules along the route. A crew that makes no progress for five seconds gets one further search against current friendly positions. If obstructed again the original controller's timeout clears the failed order and dependent waypoints. Narrow channels, changing traffic, steep terrain and moving hostiles can still block a crew. Assigned destinations provide spacing when units arrive. They do not synchronize speed or preserve a rigid group shape while in transit.

## Replay and numerical checks

Formation command uses scenario `breakwater-formation-v1` with a version 2 receipt. The recording stores the original anchor and crew IDs. Verification reissues the group's orders, recomputes slots and routes, and checks both digests. The War Room on the mission board opens the original command scenario and its version 1 recordings. Use the matching briefing to import a saved mission.

Run `node --test test/formation-world.test.js` with Node 22. The default-seed cutter test compares direct command grounding against a physically completed detour. Other tests exercise group slots, queue progression, an ally moving into an already planned lane, DEFEND, admission errors and replay corruption. The moving-obstruction fixture disables ammunition so the ground crews can demonstrate the complete reroute.
