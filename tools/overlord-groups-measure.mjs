import assert from 'node:assert/strict';
import {overlord} from '../sim/coordinated-overlord.js';
import {bigBattle} from '../sim/big-battle.js';
import {doctrineScenario} from '../sim/overlord.js';
import {planFormationRoute} from '../sim/formation-routes.js';
import {groupFixture} from './overlord-groups-fixture.mjs';

const historical=groupFixture(bigBattle,'formation');
const uncoordinated=groupFixture(doctrineScenario,'doctrine');
const advance=groupFixture(overlord,'advance');
const alternate=groupFixture(overlord,'alternate');
assert.ok(advance.engagements.some(e=>e.advancing && e.advanceSpeed>1));
assert.ok(advance.release?.tick>0);
assert.equal(alternate.results.filter(r=>r.status==='completed' && r.id==='cobalt-tank-3').length,2);
assert.equal(alternate.results.filter(r=>r.status==='completed' && r.id==='cobalt-helicopter-3').length,2);
const initial=bigBattle.createWorld({seed:2505});
const ordinaryRoutes=alternate.plans.filter(row=>row.assignment?.task==='FLANK').map(({id,assignment})=>({
  id,slot:assignment.slot,...planFormationRoute(initial,initial.actors.find(a=>a.id===id),assignment.slot)
}));
console.log(JSON.stringify({node:process.version,historical,uncoordinated,advance,alternate,ordinaryRoutes},null,2));
