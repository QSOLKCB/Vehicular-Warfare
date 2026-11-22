# Flight control check

At `91fb640fc414df8f85c1ef6525ba179a10340f5f`, all twelve numerical tests passed. In Chrome the input check held W+D while flying, observed a changing heading, exercised A to turn left, overlapped old and new keys for the same action, and confirmed pause cleared held input. The Sable Valley flight used E and Q for ridge exposure and retreat, fired with both mouse and Space, and completed victory and defeat. Its recorded state checksums were `8a3a56b3` and `cc98ddfd`.

Both extended sorties completed in the cockpit using W/S, Z/X, E/Q and Space. Long Watch took 71.6 simulation seconds and Frostline Run took 79.0. Their command receipts verified in the recording browser. The separate exposed-hover run recorded 9 enemy hits. See flights.json for the route traces and runtime.json for the software renderer and browser identity.

Executed commands from the repository root:

```sh
node --test test/*.test.js
node tools/browser.mjs /tmp/ridgefire-onehand-classic
node tools/browser.mjs /tmp/ridgefire-onehand-routes routes
```

The optional RIDGEFIRE_TEST_REPLAY file-picker check was also exercised with previously recorded local flights. The screenshot shows the in-flight key reference.
