# Breakwater Reach

Cobalt and Ember each deploy a Kestrel helicopter, Basalt tank, Kiln walker and Tern cutter. Ember also holds the shore relay. Choose a Cobalt crew on the briefing screen. The remaining crews operate under CPU control. Your team must disable the relay and two mobile defenders. Your selected crew must also enter its green gate after the relay falls. Crew selection takes effect before deployment and travels with the recording.

## Shared theatre

`createEstuary(seed)` builds a 288 m square chart from 96 × 96 Heightfield cells. World units are game metres, +Y points up, north is −Z, and yaw zero faces north. A western mountain ridge overlooks the land corridor. An intertidal bank separates the corridor from the eastern channel and islands. Each class has a named spawn and gate. The heightfield includes the seabed. One immutable flat water surface is queried by the simulation and the coastal renderer.

| Crew | Movement | Contact |
| --- | --- | --- |
| Kestrel | Assisted rotor lift, collective, yaw, bank and translation | Swept terrain clearance and hull contact with the waterline |
| Basalt | Independent drives, braking, steering and turret | Track contact against the heightfield and a dry hull footprint |
| Kiln | Planted and swinging tripods with independent torso aim | Supported, reachable footholds on dry ground |
| Tern | Six buoyancy columns, heave, pitch, roll, drag and rudder | Water displacement and keel clearance over the seabed |

`createVehicle(world,kind,id,faction,x,z,yaw)` creates a mobile unit. `driveVehicle(world,actor,mask,others)` advances its family solver. The historical flight step is private to RIDGEFIRE. The mixed adapter preserves its motion equations and is tested step by step against the released solver, with water contact added for the estuary. Tracks, walker and vessel use their accepted simulation modules directly. Each actor exposes a stable ID, class, faction, pose, velocity, HP, ammunition and cooldown. `vehicleGun`, `targetPoint` and `vehicleParts` expose mount geometry and contact bounds to the world.

## Encounter and controls

W/S and A/D operate the selected crew's movement controls. E/Q change helicopter collective and Z/X move it laterally. Shift brakes the tracks. The arrow keys adjust aim and Space fires. C changes camera and P pauses. The HUD shows the current objective and the north-up chart locates the gate. Use **Choose vehicle** to start a new deployment.

The shared world advances at 120 Hz. Actor IDs and processing order stay fixed. Factions govern target selection and damage attribution. Physical obstacles and intervening bodies can intercept pulses. The tank uses its oriented hull, turret and game armour plates. The walker has pelvis and torso volumes. The ship has a hull and deckhouse, the helicopter an airframe, and the relay a static body. The world owns damage, destruction, score and gate entry.

All seven mobile CPU crews patrol around their deployment lanes using their class controls. The relay can track from shore. CPU crews check the shared heightfield and water for visibility at up to 100 game metres. Losing sight resets acquisition. A crew needs 100 consecutive visible ticks and a trained mount before it can fire. Ember crews have 240 extra cooldown ticks and Cobalt CPU crews have 115. Mobile defenders start with 120 HP, Cobalt crews with 100 and the relay with 80. The player can aim with the arrows or hold the trigger to slew toward a visible target already in the forward cone. Once launched, a cell travels from the mount and can strike another body or the landscape. Cutter cells also drop under game gravity. Friendly bodies intercept cells.

A disabled Ember unit earns the team 100 points. Gate capture earns 50 and replenishes up to eight cells. The gate has an eight-metre horizontal radius. The helicopter also has to approach within ten metres of its indicated altitude, the cutter must be afloat, and the walker must have recovered its footing. A captured gate can restore up to 30 HP per second while occupied, drawing from a 120 HP reserve. Mobile defenders disabled before capture count toward the total. A disabled player or an expired two-minute clock ends the sortie in defeat.

Breakwater uses flat water, short patrol lanes and simplified game hit volumes. The mixed collision ledger queries component bounds swept over a tick. Thin visual features such as antennae, rotor blades and individual leg links sit outside the scoring volumes. Destroyed units leave the target list. Pilot selection stays fixed until the next deployment.

## Replay and measurements

`createCombinedWorld({seed},selection)` accepts the validated seed record and one of `helicopter`, `tank`, `mech` or `ship`. `stepCombined(world,mask)` takes a bounded integer mask. `sightCombined(world)` reads the selected crew's sight without advancing the world. `combinedReceipt(world)` records mission, class, seed, accepted commands, elapsed ticks, source identity and state/event digests. `replayCombined(jsonText)` validates those fields and recreates the run in the recording runtime. The debrief downloads a JSON file that can be checked on the Breakwater briefing.

Run `node tools/measure.mjs combined` for four complete mixed battles, including per-step CPU timings, peak live projectiles and accepted events. Run the Chromium driver with the `combined` argument for real keyboard playthroughs, saved-replay checks and rendering measurements. [Acceptance runs and resource budgets](../evidence/combined-arms/)
