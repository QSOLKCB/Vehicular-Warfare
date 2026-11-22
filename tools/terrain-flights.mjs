// This driver observes ordinary controls in the local game. The fixed-command
// comparison uses separate worlds and canvases in the same Chromium runtime.
import assert from 'node:assert/strict';
import {terrainDepthProbe} from './terrain-depth.mjs';

async function observeFrames() {
  const {View}=await import('./game/view.js');
  const {inspect}=await import('./game/main.js');
  const original=View.prototype.render;
  const count=72, warmup=12;
  const viewMs=new Float64Array(count), terrainMs=new Float64Array(count);
  let index=-warmup;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      View.prototype.render=original;
      reject(Error('Did not observe the requested flight frames'));
    },10000);
    View.prototype.render=function(world,camera,briefing,zoom,mode,profile){
      const start=performance.now();
      const draw=original.call(this,world,camera,briefing,zoom,mode,profile);
      if(index>=0){
        viewMs[index]=performance.now()-start;
        terrainMs[index]=draw.terrainCpuMs;
      }
      if(++index===count){
        clearTimeout(timeout);
        View.prototype.render=original;
        const {metrics}=inspect();
        resolve({draw,viewMs:Array.from(viewMs),terrainMs:Array.from(terrainMs),
          frameMs:metrics.frames.slice(-count),actors:metrics.actors,peakShots:metrics.peaks});
      }
      return draw;
    };
  });
}

async function compareRenderedReceipts(){
  const {createWorld,K,step,replay,receipt}=await import('./sim/world.js');
  const {View}=await import('./game/view.js');
  const results=[];
  let referencePixels;
  let changedPixels=0;
  // Keep this offscreen canvas laid out so Renderer.begin uses real dimensions.
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;left:-2000px;top:0;width:320px;height:200px;pointer-events:none';
  document.body.append(canvas);
  try{
    for(const schedule of ['webgl','voxel','switch']){
      const w=createWorld(),view=new View(canvas,w);
      try{
        let drawings=0;
        while(w.status==='flying' && w.tick<480){
          if(w.tick%12===0){
            const renderer=schedule==='switch'?(drawings%2?'voxel':'webgl'):schedule;
            const draw=view.render(w,'chase',false,false,renderer,'survey');
            if(draw.terrainMode!==renderer)throw Error('Unexpected terrain mode');
            if(w.tick===0 && schedule!=='switch'){
              const gl=view.r.gl;
              const pixels=new Uint8Array(canvas.width*canvas.height*4);
              gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
              if(schedule==='webgl')referencePixels=pixels;
              else for(let i=0;i<pixels.length;i+=4){
                if(pixels[i]!==referencePixels[i] || pixels[i+1]!==referencePixels[i+1] ||
                    pixels[i+2]!==referencePixels[i+2])changedPixels++;
              }
            }
            drawings++;
          }
          step(w,w.tick<140?K.up:K.fire);
        }
        const recording=receipt(w), verified=receipt(replay(JSON.stringify(recording)));
        results.push({schedule,drawings,outcome:w.status,recording,verified});
      }finally{view.dispose();}
    }
  }finally{canvas.remove();}
  return {results,changedPixels,pixelCount:referencePixels.length/4};
}

export async function terrainFlights({read,key,click,screenshot,evaluate,send,until,quantiles}){
  const select=(id,value)=>evaluate(`(()=>{
    const s=document.getElementById(${JSON.stringify(id)});
    s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change'));
  })()`);
  const modeIs=(mode,profile)=>s=>s.metrics.lastDraw?.terrainMode===mode &&
    (!profile || s.metrics.lastDraw.terrainProfile===profile);
  const press=async code=>{await key(code,true);await key(code,false);};
  const verifyRecorded=s=>evaluate(`import('./sim/world.js').then(m=>m.receipt(m.replay(${JSON.stringify(JSON.stringify(s.receipt))})))`);

  await select('sortie','sable');
  assert.equal(await evaluate("document.querySelector('#terrain').value"),'webgl');
  await select('terrain','voxel');
  await until(modeIs('voxel'),'mission board voxel preview');
  await select('terrain','webgl');
  await until(modeIs('webgl'),'mission board WebGL preview');
  await click('primary');
  const measurements=[];
  async function measure(mode,profile){
    await until(modeIs(mode,profile),'live '+mode+' '+profile);
    await send('HeapProfiler.collectGarbage');
    const before=await send('Runtime.getHeapUsage');
    const sample=await evaluate('('+observeFrames.toString()+')()');
    const after=await send('Runtime.getHeapUsage');
    await send('HeapProfiler.collectGarbage');
    const afterGc=await send('Runtime.getHeapUsage');
    assert.equal(sample.draw.terrainMode,mode);
    assert.ok(sample.draw.terrainWidth>0 && sample.draw.terrainHeight>0);
    if(mode==='voxel')assert.ok(sample.draw.terrainSamples>0 && sample.draw.columnBytes>0);
    const summary={};
    for(const series of ['terrainMs','viewMs','frameMs']){
      assert.equal(sample[series].length,72);
      assert.ok(sample[series].every(x=>Number.isFinite(x) && x>=0));
      summary[series]=quantiles(sample[series]);
    }
    measurements.push({mode,profile,...sample,summary,heap:{before,after,afterGc}});
  }
  await measure('webgl','native');await screenshot('sable-webgl');
  await click('terrainToggle');
  await measure('voxel','survey');await screenshot('sable-voxel');

  await key('KeyW',true);
  await until(s=>s.held!==0,'forward movement');
  await press('KeyT');await until(modeIs('webgl'),'switch with held input');
  assert.notEqual((await read()).held,0);
  await press('KeyT');await until(modeIs('voxel'),'return to voxel');
  await press('KeyP');await key('KeyW',false);
  const paused=await until(s=>s.mode==='paused','pause voxel');
  assert.deepEqual([paused.held,paused.metrics.buffers,paused.metrics.columnResources,
    paused.metrics.rafActive,paused.metrics.sessionActive],[0,0,0,false,false]);
  await select('terrain','voxel-fine');
  assert.deepEqual((await read()).receipt,paused.receipt);
  await click('primary');await until(modeIs('voxel','fine'),'resume fine');
  await click('pause');
  await click('again');
  const restarted=await until(s=>s.mode==='flying' && s.tick>0,'restart');
  assert.equal(restarted.metrics.lastDraw.terrainProfile,'fine');
  assert.equal(restarted.held,0);assert.equal(restarted.hp,100);assert.equal(restarted.ammo,16);
  assert.ok(restarted.tick<paused.tick);
  await measure('voxel','fine');

  // Real input, including a rocket into the ridge, then an exposed cockpit shot.
  await key('Space',true);await until(s=>s.ammo===15,'fire below ridge');await key('Space',false);
  await until(s=>s.events.some(e=>e.type==='impact' && e.target==='terrain'),'terrain impact');
  await key('KeyE',true);await until(s=>s.position[1]>21,'unmask');await key('KeyE',false);
  await press('KeyC');await press('KeyV');
  const sight=await until(s=>s.camera==='cockpit' && s.metrics.lastDraw.zoom &&
    s.metrics.lastDraw.target && s.aa.visible,'visible target in zoomed cockpit');
  await screenshot('sable-voxel-cockpit');
  await key('Space',true);
  const win=await until(s=>s.mode==='victory','voxel combat victory');
  await key('Space',false);
  assert.equal(win.metrics.buffers,0);assert.equal(win.metrics.columnResources,0);
  assert.deepEqual(await verifyRecorded(win),win.receipt);

  await click('menu');await select('sortie','frostline');await click('primary');
  await key('KeyE',true);await key('KeyW',true);
  const winter=await until(s=>s.position[1]>21 && s.velocity[2]<-1 &&
    s.metrics.lastDraw.terrainProfile==='fine','Frostline cockpit flight');
  await key('KeyE',false);await key('KeyW',false);
  assert.equal(winter.camera,'cockpit');assert.equal(winter.route.id,'frostline');
  await screenshot('frostline-voxel-cockpit');
  await click('pause');
  const winterPause=await read();
  assert.equal(winterPause.metrics.columnResources,0);
  assert.deepEqual(await verifyRecorded(winterPause),winterPause.receipt);

  const parity=await evaluate('('+compareRenderedReceipts.toString()+')()');
  assert.ok(parity.changedPixels>parity.pixelCount*.05,'terrain modes produce visibly different frames');
  for(const row of parity.results){
    assert.equal(row.outcome,'victory');assert.ok(row.drawings>1);
    assert.deepEqual(row.recording,parity.results[0].recording);
    assert.deepEqual(row.verified,row.recording);
  }
  const depthProbe=await evaluate('('+terrainDepthProbe.toString()+')()');
  return {measurements,depthProbe,pausedTick:paused.tick,restartTick:restarted.tick,cockpit:sight.metrics.lastDraw,
    victory:win.receipt,events:win.events,frostline:{draw:winter.metrics.lastDraw,
      recording:winterPause.receipt},parity};
}
