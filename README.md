# Vehicular-Warfare

**Mechs. Tanks. Aircraft. Ships. One original battlefield.**

A planned offline-first 3D warfare game built with [VANILLAJS](https://github.com/QSOLKCB/VANILLAJS). Its first playable experiment, **RIDGEFIRE**, draws a gameplay lesson from *Comanche: Maximum Overkill*: a ridgeline should conceal an aircraft from enemy sight and weapons, letting the pilot climb, fire, and retreat to cover.

**Current status: VW-000 planning only. No playable game or measured performance is claimed.**

**Starting engine:** VANILLAJS [v3.4.0](https://github.com/QSOLKCB/VANILLAJS/releases/tag/v3.4.0), pinned to commit **0cffbcfe2524bbf7f82190ef8ef0813aeb6bb466**.

## Start here

- [AGENTS.md](AGENTS.md) — engineering and owner-review rules.
- [Codex CLI handoff](docs/CODEX_CLI_HANDOFF.md) — ready-to-paste first implementation assignment.
- [Roadmap](ROADMAP.md) — helicopter → tanks → mechs → ships → combined arms.
- [Game design](docs/GAME_DESIGN.md), [architecture](docs/ARCHITECTURE.md), [engine baseline](docs/ENGINE_BASELINE.md).
- [DOS-era technical lessons](docs/DOS_TECHNIQUES.md) and [acceptance criteria](docs/ACCEPTANCE.md).

## First game: RIDGEFIRE

Pilot an original fictional rotorcraft through an original seeded valley. A hostile AA emplacement and a mobile convoy unit operate under physical line-of-sight rules. Fly behind terrain to avoid being tracked, pop above the ridge to attack, then descend before enemy fire can reach you. Shots, damage, collision, success, failure and replay must be **real authoritative simulation**, not visual scripts.

The planned Voxel Space-style column renderer is an **optional later experiment**, not an existing engine feature. A verified WebGL1 heightfield-based scene is enough for the first playable game.

Native browser JavaScript, original art/audio, no cloud or mandatory npm runtime, Apache-2.0. No engine or other repo may be changed without owner approval.

**QSOL-IMC — THIS IS NOT A PRODUCT. THIS IS INDEPENDENCE.**
