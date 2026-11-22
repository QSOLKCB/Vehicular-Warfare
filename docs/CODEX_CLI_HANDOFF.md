# Codex CLI — VW-001 RIDGEFIRE implementation handoff

**Repo:** https://github.com/QSOLKCB/Vehicular-Warfare  
**Status:** ready to paste *after the VW-000 documentation PR is merged*.  
**VANILLAJS baseline:** v3.4.0, commit **0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466**.

## Begin locally

Enter a checkout of the merged repository, start your already-installed Codex CLI, then paste the Assignment below:

~~~sh
git clone https://github.com/QSOLKCB/Vehicular-Warfare.git
cd Vehicular-Warfare
codex
~~~

No tool installation, cloud login, container or npm runtime is implied by the instructions.

## Assignment — paste into Codex CLI

> **Build VW-001: RIDGEFIRE**, a genuinely playable original helicopter-versus-ground-defence mission in QSOLKCB/Vehicular-Warfare. Work on a feature branch and deliver one reviewable PR, or two staged VW-001A (physics/combat authority) and VW-001B (actual browser game) PRs if a single review would be too large.
>
> **Read first:** AGENTS.md, ROADMAP.md, docs/GAME_DESIGN.md, docs/ARCHITECTURE.md, docs/ENGINE_BASELINE.md, docs/DOS_TECHNIQUES.md and docs/ACCEPTANCE.md. Their rules supersede convenient demos or unsupported assumptions.
>
> **The gameplay:** pilot one original fictional VTOL rotorcraft through an original seeded mountain valley. An AA unit and a mobile convoy must truly detect and attack based on world-space terrain line-of-sight. The player flies low behind a hill to break enemy detection, climbs to expose and fire a real travelling rocket, then retreats below the ridge. Finite ammunition, real projectile/terrain/actor contact, actual health/damage, target destruction, win/lose screens and clean restart are mandatory. This is not a pre-recorded flyover, fake damage demo or solely graphics test.
>
> **Engine:** pin VANILLAJS v3.4.0 to immutable commit 0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466. Inspect actual public modules, their transitive imports and licences. Vendor a minimal complete closure and publish SHA-256 source receipts. Never use a drifting upstream main or change VANILLAJS itself.
>
> **Authority:** choose one fixed **120 Hz** world/game/rotorcraft tick; implement original bounded helicopter collective/hover/attitude controls over suitable flight/math primitives, backed by one accepted immutable Heightfield. Terrain samples govern real ground clearance, enemy LOS and projectile contact. Generic flight is **not** rotor physics; airframe models fixed-wing; Combat3D has a different 60 Hz contract, so create a correct small game-owned vehicle damage/event ledger or a separately proven rate bridge. No physics from rendered pixels, HUD, audio or camera.
>
> **Game interface:** native ES modules/WebGL1, original procedural terrain and vehicles, cockpit/chase view, targeting, detection warning, real objective/HUD, optional original local audio. Local standard-library Python HTTP server; no mandatory npm runtime, CDN, telemetry, cloud service or external game engine. Optional 2.5D Comanche-inspired terrain columns are a later independent visual experiment, not required for VW-001.
>
> **Acceptance:** write independent numeric tests for seed/parity, hover and collision, hidden→exposed→hidden physical LOS, AA reaction/search, swept fast shots, damage/event provenance, true win/loss, replay at alternative draw frequencies, malformed missions and focus/capture lifecycle. Run an actual Chromium play-through of the packaged HTTP game, save screenshots, exact head SHA, source hashes, executed commands and known issues. Do not manufacture performance results or skip provenance. Preserve zero runtime-network behaviour.
>
> **Owner control:** No merging, tagging, deployment, editing other repositories or running on owner hardware without explicit approval. Later tracked tanks, walking mechs, buoyant ships and combined arms each require a separate phase.

### Definition of done

A reviewer can clone the implemented branch, serve it locally, fly an original helicopter behind a real ridge to break AA line of sight, pop up to shoot a genuine target, observe enemy return fire when exposed, finish or lose the mission, restart and independently inspect exact numerical/browser evidence.

**Correctness outranks speed.**
