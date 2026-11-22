// Compare the released direct controller and formation routing on the same
// command opening. Simulation and order admission are timed separately.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import {
  createCommandWorld, issueOrder, stepCommand, commandReceipt, replayCommand
} from '../sim/command-world.js';
import {
  createFormationWorld, issueFormationOrder, stepFormation, formationReceipt, replayFormation
} from '../sim/formation-world.js';

const units = ['cobalt-tank', 'cobalt-mech'];
const move = {tick:0, units, type:'MOVE', append:false, x:-18, z:16};
const island = {tick:0, units:['cobalt-ship'], type:'MOVE', append:false, x:66, z:25};
const versions = [
  {name:'direct', create:createCommandWorld, issue:issueOrder, step:stepCommand,
    receipt:commandReceipt, replay:replayCommand},
  {name:'formation', create:createFormationWorld, issue:issueFormationOrder, step:stepFormation,
    receipt:formationReceipt, replay:replayFormation}
];

function distribution(values) {
  const sorted = values.slice().sort((a,b) => a-b);
  return {count:sorted.length, p50:sorted[Math.floor(sorted.length*.5)],
    p95:sorted[Math.floor(sorted.length*.95)], max:sorted.at(-1)};
}
function run(api, order=move, limit=1200) {
  const start = performance.now();
  const w = api.create();
  const beforeOrder = performance.now();
  api.issue(w, order);
  const admitted = performance.now();
  const tickUs = [];
  let peakShots = 0;
  for(let i=0; i<limit && w.status==='active'; i++) {
    const t = performance.now();
    api.step(w);
    tickUs.push((performance.now()-t)*1000);
    peakShots = Math.max(peakShots, w.shots.length);
  }
  const receipt = api.receipt(w);
  assert.deepEqual(api.receipt(api.replay(JSON.stringify(receipt))), receipt);
  return {worldBuildMs:beforeOrder-start, orderMs:admitted-beforeOrder, tickUs:distribution(tickUs),
    ticks:w.tick, peakShots, receipt,
    navigation:w.navigation, crews:order.units.map(id => {
      const actor = w.actors.find(a => a.id===id);
      return {id, position:actor.p, hp:actor.hp, status:w.units[id].status, result:w.units[id].lastResult};
    })};
}
for(const api of versions) run(api);
const crossings = versions.map(api => ({controller:api.name, ...run(api, island, 2500)}));
assert.equal(crossings[0].crews[0].status, 'blocked');
assert.equal(crossings[1].crews[0].status, 'completed');
const samples = [];
for(let i=0; i<3; i++) {
  for(const api of (i%2 ? versions.slice().reverse() : versions)) {
    samples.push({controller:api.name, repetition:i+1, ...run(api)});
  }
}
console.log(JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  machine:cpus()[0].model, node:process.version, move, samples, island, crossings}, null, 2));
