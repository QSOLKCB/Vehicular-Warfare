# Game design — RIDGEFIRE and mixed-vehicle warfare

## Initial mission

A fictional VTOL rotorcraft enters an original procedurally seeded valley. Hostiles include one fixed AA gun and one convoy unit moving along a bounded valid route. Mission rules define which targets to destroy and what constitutes success/failure, with finite player health and ammunition.

**Core tactical cycle:** approach low → hide behind hill → raise collective to reveal target → fire a travelling rocket → retreat into cover while AA reacquires → repeat. Enemy sensing, tracking, firing and target damage must use actual terrain obstruction and physical trajectories.

**Vehicle controls:** bounded collective/hover acceleration, pitch, roll, yaw, translation and damping; cockpit and chase cameras both read the same physical pose. A game-oriented rotorcraft approximation is acceptable but should not be advertised as certified aerodynamics.

**Enemy AI:** patrol/acquire/track/fire/search states, deterministic scan timing, explicit reaction and sight-memory delays, and no firing through hills or unknown player positions. A full moving convoy requires an actual route and body pose, not an animation-only target.

**Weapons:** initial unguided rocket and bounded enemy AA projectile with real travel/collision, cooldown, damage attribution and win/loss. Guided homing can follow only after explicit terrain integration with the existing trajectory module.

**Presentation:** mountain scenery, original low-poly air/ground silhouettes, cockpit/chase reticle, health, ammo, altitude/clearance, warning/lock indicator and objective status. Original locally synthesized sound, muted fallback and independent rendering state.

## Vehicle family differences

- **Helicopter:** real terrain-masking and vertical pop-up attack.
- **Tracked tank:** separate chassis/turret, hull-down tactics, terrain traction.
- **Mech:** stepping and grounded balance, independent torso/weapon aim.
- **Fixed-wing aircraft:** lift/drag and bounded high-speed air combat.
- **Ship:** buoyancy, water drag, rudder, island cover and naval gunnery.

Do not sell one generalized collision or wheel model as physically correct for every vehicle. Each family shares finite world coordinates, targeting and a unified event contract while retaining its own authority.
