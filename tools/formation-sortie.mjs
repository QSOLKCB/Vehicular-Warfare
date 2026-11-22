// Drive the same form, selection and replay file input used by a local player.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

export async function formationSortie({click, send, evaluate, screenshot, sleep, output}) {
  async function state() {
    return evaluate("import('./game/war-room.js').then(m => m.inspect())");
  }
  async function until(read, accept, label) {
    const deadline = Date.now() + 35000;
    while (Date.now() < deadline) {
      const current = await read();
      if (accept(current)) return current;
      await sleep(40);
    }
    const location = await evaluate("location.pathname + location.search");
    throw Error('Timed out waiting for ' + label + ' at ' + location);
  }
  async function clickSelector(selector, modifiers = 0) {
    const [x, y] = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({block:'nearest'});
      const r = el.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {type, x, y, modifiers, button:'left', clickCount:1});
    }
  }
  async function openFile(file) {
    const {root} = await send('DOM.getDocument');
    const {nodeId} = await send('DOM.querySelector', {nodeId:root.nodeId, selector:'#openReplay'});
    await send('DOM.setFileInputFiles', {nodeId, files:[file]});
    return until(state, s => s.mode === 'verified', 'verified replay');
  }
  await clickSelector('#formationRoom');
  await until(() => evaluate("location.search.includes('formation') && document.readyState==='complete'"),
    Boolean, 'formation briefing');
  await click('primary');
  const ids = ['cobalt-tank', 'cobalt-mech'];
  const initial = await state();
  await clickSelector('[data-unit="cobalt-tank"]');
  await clickSelector('[data-unit="cobalt-mech"]', 8);
  assert.deepEqual((await state()).selected.sort(), ids.slice().sort());
  await evaluate("document.getElementById('east').value=-18; document.getElementById('south').value=16");
  await clickSelector('#issue');
  const started = await until(state, s => s.receipt.orders.length === 1 && ids.every(id => s.units[id].queue[0]?.route?.length), 'formation order admission');
  const plans = ids.map(id => started.units[id].queue[0]);
  assert.ok(plans.every(p => p && Array.isArray(p.route) && p.route.length), 'each crew has a route');
  assert.notDeepEqual(plans[0].goal, plans[1].goal, 'crews have separate destinations');
  const origin = new Map(initial.visible.map(a => [a.id, a]));
  function moved(s, id) {
    const a = s.visible.find(a => a.id === id), b = origin.get(id);
    return a ? Math.hypot(a.x - b.x, a.z - b.z) : 0;
  }
  const underway = await until(state, s => ids.every(id => moved(s, id) > 2), 'both crews moving');
  await screenshot('01-formation-underway');
  await clickSelector('#pause');
  const paused = await until(state, s => s.mode === 'paused', 'pause');
  const replayFile = join(output, 'formation-replay.json');
  await writeFile(replayFile, JSON.stringify(paused.receipt, null, 2) + '\n');
  const reproduced = await openFile(replayFile);
  assert.deepEqual(reproduced.receipt, paused.receipt);

  // Sail east across the direct line of the channel island. The v1 direct
  // controller grounds here on seed 2505. The v2 course must finish afloat.
  await click('primary');
  await clickSelector('[data-unit="cobalt-ship"]');
  await evaluate("document.getElementById('east').value=66; document.getElementById('south').value=25");
  await clickSelector('#issue');
  const course = await until(state, s => s.units['cobalt-ship'].queue[0]?.route?.length >= 2,
    'cutter detour around the island');
  await screenshot('02-cutter-route');
  const arrived = await until(state, s => s.units['cobalt-ship'].status === 'completed', 'cutter arrival');
  const cutter = arrived.visible.find(a => a.id === 'cobalt-ship');
  assert.ok(cutter && Math.hypot(cutter.x-66, cutter.z-25) < 3.5, 'accepted cutter position at destination');
  await screenshot('03-cutter-arrival');
  await clickSelector('#pause');
  await clickSelector('#boardReturn');
  await until(() => evaluate("document.readyState==='complete' && document.getElementById('station')?.dataset.mode==='briefing' && document.getElementById('warRoom')?.offsetWidth>0"), Boolean, 'mission board');
  await clickSelector('#warRoom');
  await until(() => evaluate("location.pathname.endsWith('/war-room.html') && !location.search && document.readyState==='complete'"),
    Boolean, 'classic War Room');
  const legacyFile = resolve('evidence/war-room/browser/native-replay.json');
  const historical = await openFile(legacyFile);
  assert.deepEqual(historical.receipt, JSON.parse(await readFile(legacyFile, 'utf8')));
  return {historical:historical.receipt, cutter:{route:course.units['cobalt-ship'].queue[0],
    position:[cutter.x, cutter.z], tick:arrived.tick, result:arrived.units['cobalt-ship'].lastResult},
    plans, fromTick:initial.tick, movementTick:underway.tick,
    distances:ids.map(id => ({id, metres:moved(underway, id)})), reopened:reproduced.receipt,
    orderMs:paused.metrics.orderMs, tickMs:paused.metrics.tickMs, frameMs:paused.metrics.frames};
}
