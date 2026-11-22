# Engine verification — VANILLAJS v3.4.0

**Exact source:** [VANILLAJS v3.4.0](https://github.com/QSOLKCB/VANILLAJS/releases/tag/v3.4.0) at commit **0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466**. This empty game repository has **no installed/vendored engine implementation yet**. Codex must examine MODULES.json, source APIs and dependency closure.

| Module | Existing capability | Do not assume |
| --- | --- | --- |
| terrain / Heightfield | Triangulated finite heightfield, sampled height/normal, segment crossing; ≤128 × 128 cells | General volumetric voxel renderer, full swept-hull collision or mutable terrain |
| flight | Generic finite 6DOF body force/orientation integration | Full helicopter rotor/collective dynamics |
| airframe | Simplified fixed-wing dynamics at 120 Hz | Hovering helicopter |
| vehicle3d | Four-contact wheeled motion, 120 Hz | Tracks/mech legs/ship buoyancy |
| cockpit-rig | Read-only cockpit/nose/chase cameras and weapon sights | Weapon/flight authority |
| trajectory | Guided 120 Hz step with bounded moving AABB and wall contact | Terrain heightfield integration or damage |
| sensing + geometry | Bounded AABB line-of-sight and static candidates | Automatic terrain occlusion adapter |
| combat3d | 60 Hz character combat, 16 actors and 64 projectiles | A drop-in 120 Hz universal vehicle combat engine |
| scenic3d / render-webgl / render-lit | Procedural scenery and native WebGL1 presentation | Authoritative height/LOS/physics |
| world-vis | Presentation-only retained static-world LOD | Omitting colliders or AI perception |
| render-packing | Reusable packed Float32 RGB box geometry | Projectile physics or automatic FPS gains |
| GC-PROFILE-001 | Development-only allocation and GC sampling | A replacement browser collector or performance guarantee |
| audio2d / soundtrack | Local original PCM and phrase playback | Weapon/mission authority |

The older Comanche height-column visual algorithm is a **new optional experiment**, not an existing VANILLAJS public API. Use original height/colour maps; never import commercial maps or proprietary game data.

**Starting choice:** one immutable accepted Heightfield + a game-owned bounded 120 Hz rotorcraft/mission authority, built from verified public math/flight/collision primitives. Treat cross-module tick-rate and geometry differences explicitly and test them.
