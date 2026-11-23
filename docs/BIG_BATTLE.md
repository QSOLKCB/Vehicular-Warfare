# The Big Battle

Choose **The Big Battle · 24 vehicles** on the mission board. Breakwater deploys three numbered sections on each side of the crossing. Each section has a Kestrel, Basalt, Kiln and Tern. The roster has 12 commandable Cobalt crews, 12 Ember crews and the original shore relay. Select individual crews, box-select a section or select all 12. The formation planner and shared 120 Hz encounter run on the same clock.

The shore relay, crossing, two-defender objective and two-minute time limit follow the War Room rules. The forward, central and rear deployment bays use separate track, flight, walking and water contacts. Crews keep their original hit points and ammunition. The entire encounter retains the shared bound of 32 live projectiles. Under saturation, a ready crew waits for a free slot before spending ammunition.

One opening is to select all 12 crews and designate the visible relay. Select **Basalt 2**, check **Queue**, then MOVE to X −16, Z 3. Follow the crew into the crossing. Orders and contacts at later ticks can produce different outcomes.

The 24-unit scenario has its own source-bound receipt and regenerates its full roster on replay. Live users have the same eight-entry per-crew queue, 1,024-order mission cap and bounded route searches as Formation Intelligence. The observer reserves silhouettes, shadows and wakes for three complete sections per faction. Camera filtering still depends on friendly observations.

Run the numerical tests with `node --test test/big-battle.test.js`. Run `node tools/big-battle-measure.mjs` for alternate 8- and 24-vehicle simulation samples. Run `node tools/browser.mjs /tmp/big-battle big-battle` with RIDGEFIRE_WEB_ROOT set to an extracted offline build for a mission, download/import replay check and live browser measurements. The 8- and 24-vehicle references use the same camera and map under their respective live encounter loads. The browser reports include query availability and actual renderer identification.
