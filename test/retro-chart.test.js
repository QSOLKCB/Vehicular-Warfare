import test from 'node:test';
import assert from 'node:assert/strict';
import {BitplaneSurface,BLIT_COOKIE_CUT} from '../vendor/vanillajs/modules/blit/index.js';
import {CopperDisplay,createCopperProgram} from '../vendor/vanillajs/modules/copper/index.js';
import {createCombinedWorld,sightCombined,combinedReceipt} from '../sim/combined-world.js';
import {RetroChart,chartWidth,chartHeight,packedWidth} from '../game/retro-chart.js';
import {chartCenter,chartScale} from '../game/combined-chart.js';

test('masked contact blit preserves source, mask and transparent destination pixels',()=>{
  const src=new BitplaneSurface(16,1,4).clear(12),mask=new BitplaneSurface(16,1,1).setPixel(1,0,1);
  const dst=new BitplaneSurface(16,1,4).clear(5);
  const sourceBytes=src.words(),maskBytes=mask.words();
  assert.equal(BLIT_COOKIE_CUT,0xca);
  assert.equal(dst.blit(src,{mask,minterm:BLIT_COOKIE_CUT}),1);
  assert.equal(dst.getPixel(0,0),5);assert.equal(dst.getPixel(1,0),12);
  assert.deepEqual(src.words(),sourceBytes);assert.deepEqual(mask.words(),maskBytes);
  assert.throws(()=>new BitplaneSurface(chartWidth,chartHeight,4));
});

test('Copper validates its bounded program and restores palette and scroll on each render',()=>{
  const palette=Array.from({length:16},(_,i)=>[i,0,0,255]),color=[100,2,3,255];
  const commands=[{line:1,op:'palette',index:2,color},{line:1,op:'scroll',x:1}];
  const program=createCopperProgram({height:2,palette,commands});
  const display=new CopperDisplay(3,2),source=Uint8Array.of(1,2,3,1,2,3),bytes=source.slice();
  const frame=display.render(source,program),expected=frame.slice();
  assert.deepEqual([...frame.subarray(12,16)],color);
  color[0]=8;commands[1].x=-1;
  assert.equal(display.render(source,program),frame);
  assert.deepEqual(frame,expected);assert.deepEqual(source,bytes);
  for(const bad of [{line:2,op:'scroll',x:0},{line:0,op:'scroll',x:512},{line:0,op:'palette',index:16,color},
    {line:0,op:'palette',index:2,color:[0,0,-1,255]}]){
    assert.throws(()=>createCopperProgram({height:2,palette,commands:[bad]}));
  }
  assert.throws(()=>display.render(Uint8Array.of(1,2,3,1,16,1),program));
  assert.deepEqual(frame,expected);
});

test('north-up projection uses the original view centre, shape and cropped bounds',()=>{
  assert.equal(packedWidth,208);assert.equal(chartWidth,202);assert.equal(chartHeight,152);
  assert.deepEqual(chartCenter({p:[0,0,0]},202,152),{cx:0,cz:-152/chartScale*.30});
  const w=createCombinedWorld(undefined,'ship'),radar=new RetroChart(w),receipt=combinedReceipt(w);
  const frame=radar.draw(w,sightCombined(w)),copy=frame.slice();
  assert.equal(frame.byteLength,208*152*4);assert.deepEqual(combinedReceipt(w),receipt);
  assert.equal(radar.draw(w,sightCombined(w)),frame);assert.deepEqual(frame,copy);
  for(let y=0;y<152;y++)for(let x=202;x<208;x++)assert.equal(radar.indexed[y*208+x],0);
});

test('hidden contacts including the relay cannot contribute position, health, or stale pixels',()=>{
  const w=createCombinedWorld(undefined,'tank'),r=new RetroChart(w),hidden={visible:[]};
  const baseline=r.draw(w,hidden).slice();
  const enemy=w.actors.find(a=>a.faction!==w.player.faction && a.kind!=='relay');
  const hostile=[enemy,w.relay];
  for(const actor of hostile){
    actor.p=[w.player.p[0]-20,actor.p[1],w.player.p[2]-20];
    assert.deepEqual(r.draw(w,hidden),baseline);
    assert.notDeepEqual(r.draw(w,{visible:[actor.id]}),baseline);
    assert.deepEqual(r.draw(w,hidden),baseline);
    // Denied contacts must not even have their live position or health read.
    Object.defineProperty(actor,'hp',{get(){throw Error('hidden contact hp read');}});
    Object.defineProperty(actor,'p',{get(){throw Error('hidden contact position read');}});
  }
  assert.deepEqual(r.draw(w,hidden),baseline);
});

test('a visible contact crossing the right crop still paints its in-bounds pixels',()=>{
  const w=createCombinedWorld(undefined,'tank'),r=new RetroChart(w);
  const enemy=w.actors.find(a=>a.faction!==w.player.faction && a.kind!=='relay');
  const {cx,cz}=chartCenter(w.player,chartWidth,chartHeight);
  enemy.p=[cx+(203-chartWidth/2)/chartScale,enemy.p[1],cz];
  r.draw(w,{visible:[enemy.id]});
  assert.equal(r.indexed[76*packedWidth+201],12);
  assert.equal(r.indexed[76*packedWidth+202],0);
  r.draw(w,{visible:[]});
  assert.notEqual(r.indexed[76*packedWidth+201],12);
});

test('crew palettes differ and world state survives all four charts',()=>{
  const frames=new Set();
  for(const kind of ['helicopter','tank','mech','ship']){
    const w=createCombinedWorld(undefined,kind),r=new RetroChart(w),before=combinedReceipt(w);
    const bytes=r.draw(w,sightCombined(w));
    assert.deepEqual(combinedReceipt(w),before);
    // Compare one deep-water swatch at the same register and row for each crew.
    r.indexed.fill(1);r.display.render(r.indexed,r.program);
    frames.add(bytes.slice(0,4).join(','));
  }
  assert.equal(frames.size,4);
});
