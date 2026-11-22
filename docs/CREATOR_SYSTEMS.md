# Mission workshop

The workshop creates missions on the Breakwater coast. An author controls the title, terrain seed, player crew, capture gate and shore relay. Both factions deploy their existing crews. The selected vehicle retains its normal controls and physics, and the game still requires a relay disable, a gate capture and two disabled mobile defenders. [Breakwater rules](COMBINED_ARMS.md)

## Author and share a mission

1. Open **Mission workshop** from the mission board. Change the title, seed or crew. Select **Gate** or **Shore relay** and click the chart. Arrow keys move the selected marker one metre when the chart has focus. The coordinate boxes provide the same precision.
2. Choose **Apply changes**. The chart shows the accepted surface and deployment positions. An invalid placement reports the reason and preserves the last accepted draft. **Restore starter mission** returns to the initial helicopter layout.
3. Choose **Playtest** to deploy, or **Export pack** to share a JSON file. **Import pack** opens it on another local copy of the game. The browser saves the accepted draft on its current origin; exporting a file keeps a portable copy.
4. **Watch replay** opens the current recording from pause or debrief. **Save replay** downloads it. From the workshop, **Open replay** accepts workshop recordings and VW-005 Breakwater recordings. The earlier standalone sorties have their own replay checkers.

## Pack v1

This complete example deploys a Basalt tank in Copper Crossing.

```json
{
  "version": 1,
  "title": "Copper Crossing",
  "seed": 2506,
  "crew": "tank",
  "gate": [-18, 4],
  "relay": [-4, -28]
}
```

The six fields are required. The seed is a uint32 and the crew is `helicopter`, `tank`, `mech` or `ship`. Titles accept up to 60 Unicode characters with letters, numbers, combining marks, spaces and selected punctuation. Both coordinate pairs give integer [X, Z] game metres between −136 and 136, with east along +X and north along −Z. The disk format is UTF-8 JSON, limited to 2,048 bytes.

The mission builder checks the entire relay foundation for dry land and limits its height variation. It checks the selected vehicle's contact at the gate centre, coast connectivity for ground or ship crews, and clearance from both teams' deployment positions. The chart samples the same triangular field and water level used by play. These checks establish placement validity. Playtesting establishes whether a crew can reach the gate and survive a particular mission.

## Numerical API

| Export from `sim/creator.js` | Contract |
| --- | --- |
| `defaultPack(crew, seed)` | Return the starting layout for the selected crew. Defaults to helicopter and seed 2505. |
| `acceptPack(input)` | Validate bounded JSON text or a plain record with data properties. Return a detached, deeply frozen canonical pack. |
| `createCreatorWorld(pack)` | Validate and build a new world with the two landmarks on the accepted surface. |
| `stepCreator(world, mask)` | Advance one accepted 120 Hz combined-arms tick. |
| `creatorReceipt(world)` | Return a workshop recording with its pack, source, accepted command changes, tick count and ordered event and state digests. |
| `replayCreator(text)` | Verify a workshop recording synchronously and return its reproduced world. |
| `await openReplay(text, {signal, onProgress})` | Verify a workshop or VW-005 recording in short batches. Resolve with the recording and a cursor at tick zero. |

The verified cursor exposes `world`, `receipt`, `ticks`, `seek(tick)` and `advance(count = 1)`. Clients read the world and change time through the cursor. The viewer restores simulation checkpoints spaced 120 ticks apart and re-executes accepted commands to reach the chosen tick. Immutable terrain, water and the accepted recording are shared. The 14,400-tick mission limit bounds checkpoints at 121. Recording imports are limited to 300,000 UTF-8 bytes. Any divergence in the source, terminal state or event checksum rejects the recording. Verification is scoped to the recording source and runtime.

## Replay and score

Use **Play** and **Pause** to control playback. **Start** rewinds to tick zero, and the timeline selects an intermediate tick. Chase, gun sight and overhead read the same world at the chosen tick. Overhead frames the selected crew and its current objective. The viewer releases the active animation loop, music and mesh buffers when paused. A partial recording ends at its last recorded tick.

**Music** enables three original synthesized voices, a melody, bass and harmony. The score reads acquisition, launches, damage, gate capture and mission outcome from the accepted world. Eighth notes follow a 36-tick clock at 100 BPM. Voice envelopes use the local Web Audio clock. A slow display can skip a note between draws. Pausing or reaching the debrief closes the live audio context; the exported evidence clip renders the final cue through its decay. Actual device audio timing is separate from deterministic simulation and replay checksums. [Playthrough, recorded audio and timings](../evidence/creator-systems/)
