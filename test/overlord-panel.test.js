import test from 'node:test';
import assert from 'node:assert/strict';
import {chartContacts,contactReport,decisionReport} from '../game/overlord-panel.js';

test('a sampled contact occluded before the next sweep has a detached last-known symbol',()=>{
  const report={id:'ember-tank',kind:'tank',source:'cobalt-ship',observedTick:60,p:[5,2,7],visible:true};
  const w={tactical:{intel:{cobalt:{contacts:[report]}}},get actors(){throw Error('panel requested world actors');}};
  const contacts=chartContacts(w,[]);
  assert.equal(contacts[0].current,false);
  assert.match(contactReport(contacts,72),/last known\n12 ticks since report/);
  assert.deepEqual(contacts[0].position,[5,2,7]);
  contacts[0].position[0]=-88;
  assert.equal(report.p[0],5);
  assert.equal(chartContacts(w,[{id:report.id}])[0].current,true);
});

test('inspection reports the accepted decision tick, source and score for the selected crew',()=>{
  const id='cobalt-tank',crew={doctrine:'SUPPORT',controller:{},decision:{
    tick:70,action:'hold station',doctrine:'SUPPORT',reason:'no advancing section crew',
    contact:'ember-tank',score:615,source:'cobalt-ship',observedTick:60
  }};
  const world={tactical:{crews:{[id]:crew}},units:{[id]:{queue:[]}}};
  assert.match(decisionReport(world,new Set([id])),/Tick 70 · SUPPORT · hold station[\s\S]*615\nObserved by cobalt-ship at tick 60/);
});
