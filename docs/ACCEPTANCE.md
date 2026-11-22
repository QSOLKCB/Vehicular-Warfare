# VW-001 acceptance contract (not executed by VW-000)

| Check | Required result |
| --- | --- |
| Terrain | Seed reproduces exact accepted surface; mesh height and authoritative samples agree within documented presentation tolerance |
| Concealed | AA line of sight, lock and fire do not pass a real ridge |
| Exposed | Climb establishes real sight; AA engages only after finite reaction delay |
| Retreat | Descend breaks sight; explicit target-memory/search policy controls response |
| Physics | Real 120 Hz hover, climb, yaw, pitch/roll and conservative body/ground contact; no tunnelling |
| Combat | Live finite rocket and AA projectile travel, cooldown, terrain and actor impacts, actual damage/score/death |
| Mission | AA and moving convoy target, full victory/defeat/restart path |
| Replay | Seeded commands and same-runtime state/event digests remain equal at different render frame schedules |
| Lifecycle | Pause, blur, hidden tab, pointer release and rematch clear input/time debt and GPU/audio/RAF resources |
| Input safety | Nonfinite/invalid/oversize/unknown content rejected atomically |
| Offline | Real HTTP Chromium launch and nested subpath, no runtime external fetch; WebGL failure path |
| Performance | Exact CPU/GPU/browser/backend/source/draw buffer and raw p50/p95; no unverified native 60 FPS |

**Evidence levels:** executable Node tests; real Chromium interaction plus screenshots; independent replay/state receipts; separately owner-run physical GPU assessment; explicit owner sign-off.

No tests, screenshots, CI or release claims are possible from a docs-only initial repository. An implementation PR must report exact tested SHA, commands and failures; not-run is not passed.
