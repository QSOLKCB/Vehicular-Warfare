# The War Room

Choose **War Room** on the mission board, then **Deploy crews**. The crossing is marked on the north-up strategic map. Disable the shore relay, occupy the crossing with any operational Cobalt vehicle and disable at least two Ember vehicles within two minutes. One surviving crew can finish the mission.

| Control | Action |
| --- | --- |
| Left-click / left-drag | Select one friendly crew or box-select several. |
| Shift + click | Add or remove a crew. |
| Right-click | Move to a point or attack a currently observed hostile. |
| Shift + right-click | Add an order to each selected crew's queue. |
| Ctrl + 1–9 / 1–9 | Store or recall a selection. The display controls include group buttons. |
| Wheel / middle-drag | Zoom around the pointer or pan. Arrow keys pan. Fit theatre restores the 288 m overview. |
| F | Follow the first selected operational crew in roster order. |
| Tab on the battlefield canvas / view button | Switch between map and live observation. |
| C / camera selector | Press C to cycle through overhead, crew chase, weapon sight and Battle Director. Choose any view directly in the selector. |
| M / G | Toggle retro display or the 3D FX gate beacon. |
| P / Escape | Pause or resume. |

The roster shows hull points, current orders, queue depth and completion or obstruction. Use **Select all** or toggle individual crews in the roster. The order form accepts MOVE and DEFEND coordinates in game metres, a visible ATTACK contact or HOLD. Check **Queue** to append an order from the form.

One opening is to select all four crews and right-click the shore relay while it is visible. Select Basalt and queue a MOVE to X −16, Z 3. The crews engage through their own sights. Basalt begins its move when the observed target falls. Issuing orders later can change who survives.

The presentation shares the live simulation while switching cameras. The strategic map samples Breakwater's heightfield and water once per terrain build. Friendly sensors determine the hostile symbols and available designations. Retro colours on the strategic canvas retain the same coordinates and selection. The 3D local chart supports the original indexed display. Direct waypoints can end in grounding or obstruction. Replace a blocked route or issue intermediate waypoints around the obstacle.

The debrief shows the accepted outcome. **Save replay** writes the accepted order stream. **Open replay** reconstructs the battle and compares state and event digests in the local runtime. The numerical API, finite limits and example are in the [authority contract](COMMAND_AUTHORITY.md).

## Battle Director

Choose **Observe in 3D**, then **Battle Director** from the camera selector. Pin an operational Cobalt crew to inspect it while issuing orders to a different selection. **Current selection** follows the first selected operational crew in roster order. If a pinned crew is lost, the director returns to the current selection or the first surviving crew. The crossing provides the camera focus when all crews are disabled.

Adjust bearing, tilt and distance to frame the scene. **Automatic orbit** circles the subject at 15 degrees per simulation second. The camera stays inside the chart and above the sampled ground and water surface. Terrain between the lens and the subject can still block the view.

**Inspect frame** opens the director from pause, debrief or a verified replay. Camera and subject controls redraw the held tick. **Return to pause**, **Return to debrief** or **Return to replay** closes the inspector and releases its WebGL resources. Command receipts record the same simulation regardless of camera settings.
