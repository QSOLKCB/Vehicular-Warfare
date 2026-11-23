// Usage: node tools/overlord-report.mjs paired.json native.json software.json
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

function read(path) {
  const bytes=readFileSync(path);
  return JSON.parse(path.endsWith('.gz')?gunzipSync(bytes):bytes);
}
const [paired,native,software]=process.argv.slice(2).map(read);
if(!paired || !native || !software)throw Error('Supply paired, native and software reports in order');
const scenarios=['breakwater-big-battle-v1','breakwater-overlord-v1'];
const name=id=>id===scenarios[0]?'Big Battle':'Overlord';
const group=id=>paired.runs.filter(r=>r.scenario===id);
const distribution=(values,p)=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
};
const fixed=(n,places=3)=>Number.isFinite(n)?n.toFixed(places):'—';
const mib=bytes=>(bytes/1048576).toFixed(1);
const pair=(values,places=2)=>[.5,.95].map(p=>fixed(distribution(values,p),places)).join(' / ');
const digest=r=>'\x60'+r.stateHash+'\x60 / \x60'+r.eventHash+'\x60';
function table(header,rows) {
  console.log('\n| '+header.join(' | ')+' |');
  console.log('| '+header.map(()=>'---').join(' | ')+' |');
  for(const row of rows)console.log('| '+row.join(' | ')+' |');
}
const line=s=>console.log('\n'+s);
const [big,tactical]=scenarios.map(id=>paired.outcomes.find(r=>r.scenario===id));
assert.deepEqual(big.deployment,tactical.deployment);
assert.deepEqual(big.orderLog,tactical.orderLog);
for(const report of [native,software])assert.deepEqual(report.recording,report.reopened);

console.log('# Operation Overlord performance');
line(`Node ${paired.node} ran both 24-vehicle scenarios at \`${paired.head}\` on the ${paired.cpu}. Both deployed seed 2505, ordered all twelve Cobalt crews to attack the visible relay at tick zero and queued a crossing move for Basalt 2. Each scenario retained the 120 Hz clock and 32-projectile cap. [Raw paired measurements](paired.json.gz)`);
line('## Simulation ticks');
line('The driver warmed each scenario for 60 ticks and alternated the run order over three 480-tick trials per scenario. The table pools tick samples across those trials. The p95 range gives the lowest and highest individual trial p95.');
const tickRows=scenarios.map(id=>{
  const runs=group(id),all=runs.flatMap(r=>r.tickSamplesMs),perRun=runs.map(r=>r.tickMs.p95);
  const heaps=runs.flatMap(r=>r.frames.map(f=>f.heap));
  return [name(id),all.length,fixed(distribution(all,.5)),fixed(distribution(all,.95)),
    fixed(Math.min(...perRun))+'–'+fixed(Math.max(...perRun)),fixed(Math.max(...all)),
    mib(Math.min(...heaps))+'–'+mib(Math.max(...heaps))];
});
table(['Scenario','Tick samples','p50 ms','p95 ms','Trial p95 range ms','Max ms','Node sampled heap MiB'],tickRows);
const p95=scenarios.map(id=>distribution(group(id).flatMap(r=>r.tickSamplesMs),.95));
const delta=p95[1]-p95[0];
const phases=group(scenarios[1]).flatMap(r=>r.phaseSamplesMs);
line(`Overlord’s pooled p95 was ${fixed(Math.abs(delta))} ms ${delta<0?'lower':'higher'} (${fixed(Math.abs(delta)*100/p95[0],1)}%). The measured tactical phase averaged ${fixed(phases.reduce((a,b)=>a+b,0)/phases.length,4)} ms per tick. Its p50 / p95 were ${pair(phases,4)} ms, with a ${fixed(Math.max(...phases))} ms maximum. That phase covers section readiness, scheduled doctrine decisions and faction sensor sampling. Formation route searches, movement, weapon resolution and the rest of the encounter contribute to total tick time. [Paired samples and phase timings](paired.json.gz)`);
line('The historical Big Battle p95 range on the Ryzen 9 5950X was about 1.06–1.15 ms. The fresh pair shares its starting conditions, but its two AI policies produce different contacts, routes, casualties and projectile loads. Overall tick differences include those workload changes, instrumentation, runtime warmup and host scheduling. [Historical Big Battle measurements](../big-battle/PERFORMANCE.md)');
line('## Accepted work and replay');
line('The 480-tick rows use the first trial of each scenario. Separate runs continued through the terminal outcome. Navigation plans include direct legs, and visited nodes count grid expansions. Blocked counts distinct crew, tick and reason combinations. Incoming sweeps count active projectiles entering the collision pass. The mobile crew counts exclude the relay.');
const rows=[...scenarios.map(id=>group(id)[0]),big,tactical];
table(['Scenario','Tick / outcome','Decisions / sim s','Sensor evaluations','Plans / visited / replans','Blocked','Live crews / casualties','Launches / peak live / sweeps','Verified state / event'],
  rows.map(r=>[name(r.scenario),r.ticks+' / '+r.outcome,r.decisions+' / '+fixed(r.decisionsPerSecond,1),
    r.contactEvaluations??'—',[r.navigation.plans,r.navigation.visited,r.navigation.replans].join(' / '),
    r.blockedRoutes.length,r.survivors.length+' / '+r.casualties,[r.launches,r.peakShots,r.sweeps].join(' / '),digest(r)]));
line(`The complete Overlord run ended ${Math.abs(tactical.ticks-big.ticks)} ticks ${tactical.ticks>big.ticks?'later':'earlier'} and launched ${Math.abs(tactical.launches-big.launches)} ${tactical.launches>=big.launches?'more':'fewer'} projectiles. Every measured run replayed in the recording Node runtime. The raw reports include source identities, spawn positions, accepted commands, survivors and each blocked result. [Paired receipts and work counters](paired.json.gz)`);
line('## Packaged Chromium');
for(const report of [native,software]){
  const [tag,file]=report.backend==='native'?['Native','native.json.gz']:['Software','software.json.gz'];
  line(`${tag} used ${report.version.product}, ${report.gpu.width} × ${report.gpu.height} and ${report.gpu.backend} at \`${report.source}\`. Its player-driven operation reached ${report.recording.outcome} at tick ${report.recording.ticks} and reproduced state / event ${digest(report.recording)} in that browser. [${tag} report](${file})`);
}
line('Each renderer profiled separate live Big Battle and Overlord sessions on the strategic map and in the overhead camera. Entries are p50 / p95 in milliseconds. Map CPU covers the chart draw, 3D CPU covers draw submission, and WebGL time uses completed disjoint-timer extension queries issued every sixth observed draw. GPU n is the number of usable query samples. Heap is the DevTools used-size snapshot after the observer sample.');
const profiles=[];
for(const report of [native,software]){
  for(const p of report.profiles){
    const rows=p.observer.rows,gpu=rows.map(r=>r.gpuMs).filter(Number.isFinite);
    profiles.push([report.backend,name(p.scenario),pair(p.mapIntervals),pair(p.mapMs),pair(rows.map(r=>r.intervalMs)),
      pair(rows.map(r=>r.drawMs)),pair(gpu),gpu.length,mib(p.heap.usedSize)]);
  }
}
table(['Renderer','Scenario','Map interval','Map CPU','3D interval','3D CPU','WebGL GPU','GPU n','Heap MiB'],profiles);
line('Node sampled its process heap every 60 ticks. Browser and Node heaps include runtime and collector activity. Allocation rates, retained growth over long sessions and performance on other hardware remain unmeasured. Browser input reached the two acceptance playthroughs at different ticks. Replay verification compares each recording with its reconstruction in the same runtime.');
line('Regenerate the tables with `node tools/overlord-report.mjs evidence/overlord/paired.json.gz evidence/overlord/native.json.gz evidence/overlord/software.json.gz`.');
