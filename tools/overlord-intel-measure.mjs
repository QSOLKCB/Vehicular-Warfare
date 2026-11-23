// Paired read-only sensor workload on the released 24-piece board.
import {cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {bigBattle} from '../sim/big-battle.js';
import {createIntelligence, INTEL_PERIOD, rankContacts, sampleIntelligence} from '../sim/overlord-intel.js';
import {OVERLORD_INTEL_SOURCE} from '../sim/overlord-intel-identity.js';

function quantiles(samples) {
  const sorted=samples.toSorted((a,b)=>a-b);
  if (!sorted.length) return null;
  return {count:sorted.length,p50:sorted[Math.floor(sorted.length*.50)],
    p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};
}

function run(withSensors, length) {
  const w=bigBattle.createWorld(), intel=createIntelligence(), ticks=[], sweeps=[], samples=[];
  const heapBefore=process.memoryUsage().heapUsed;
  let pairs=0, candidates=0, projectileSweeps=0, peakShots=0;
  for (let i=0; i<length && w.status==='active'; i++) {
    const start=performance.now();
    if (withSensors && w.tick%INTEL_PERIOD===0) {
      const begin=performance.now();
      sampleIntelligence(w,intel);
      for (const a of w.actors) {
        if (!a.hp || a.kind==='relay') continue;
        const ranked=rankContacts(intel,a.faction,a.p,w.beacon);
        candidates+=ranked.length;
        pairs++;
      }
      sweeps.push((performance.now()-begin)*1000);
      samples.push({tick:w.tick,cobalt:intel.cobalt.contacts.length,
        ember:intel.ember.contacts.length,totalSightQueries:intel.evaluations});
    }
    projectileSweeps+=w.shots.length;
    bigBattle.step(w);
    ticks.push((performance.now()-start)*1000);
    peakShots=Math.max(peakShots,w.shots.length);
  }
  const {stateHash,eventHash,outcome}=bigBattle.receipt(w);
  return {withSensors, ticks:w.tick, tickUs:quantiles(ticks), sweepAndRankUs:quantiles(sweeps),
    sweepUsRaw:sweeps, crewRankings:pairs, candidates, sightQueries:intel.evaluations,samples,
    heapBefore,heapAfter:process.memoryUsage().heapUsed,projectileSweeps,peakShots,launches:w.serial,
    navigation:w.navigation,survivingCrews:w.actors.filter(a=>a.kind!=='relay' && a.hp).length,
    stateHash,eventHash,outcome};
}

run(false,60);run(true,60);
const runs=[false,true,true,false,false,true].map(enabled=>run(enabled,480));
for (const row of runs) {
  assert.equal(row.stateHash,runs[0].stateHash);
  assert.equal(row.eventHash,runs[0].eventHash);
}
const world=bigBattle.createWorld(), intel=createIntelligence();
sampleIntelligence(world,intel);
const scout=world.actors.find(a=>a.id==='cobalt-helicopter');
console.log(JSON.stringify({
  testedHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  source:OVERLORD_INTEL_SOURCE, board:bigBattle.receipt(world).source,
  cpu:cpus()[0].model,node:process.version,seed:world.seed,
  opening:{intel,ranking:rankContacts(intel,'cobalt',scout.p,world.beacon)},runs
},null,2));
