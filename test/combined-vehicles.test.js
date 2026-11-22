import test from 'node:test';
import assert from 'node:assert/strict';
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {createEstuary} from '../sim/estuary.js';
import {BK,CLASSES,createVehicle,driveVehicle,aimVehicle,vehicleGun,targetPoint,vehicleParts,gunClear}
  from '../sim/combined-vehicles.js';
import {createWorld,step,K} from '../sim/world.js';
import {WaterSurface} from '../sim/vessel.js';
import {sight} from '../sim/terrain.js';

const make=(w,kind,side='spawns')=>createVehicle(w,kind,side+'-'+kind,side,...w[side][kind]);
const run=(w,a,n,mask,others=[])=>{for(let i=0;i<n;i++)driveVehicle(w,a,mask,others);};

test('Breakwater shares one accepted coast and navigable gates for every class',()=>{
  for(const seed of [0,509,0xffffffff]){
    const w=createEstuary(seed),copy=createEstuary(seed);
    assert.equal(w.field.sample(-73,0).height,copy.field.sample(-73,0).height);
    assert.ok(w.field.sample(-73,0).height>20);
    assert.ok(w.field.sample(19,-9).height>w.water.heightAt(19,-9));
    assert.ok(w.field.sample(12,3).height< -2);
    assert.ok(w.field.sample(...w.relay).height>0);
    for(const kind of CLASSES){
      const a=make(w,kind),b=make(w,kind,'opponents');
      assert.equal(a.kind,kind);assert.notEqual(a.id,b.id);
      for(const actor of [a,b]){
        assert.ok(gunClear(w,actor));
        const parts=vehicleParts(actor);
        assert.ok(parts.length>=1 && parts.every(({p,half})=>p.every(Number.isFinite)&&half.every(h=>h>0)));
      }
      const [x,,z]=w.gates[kind];
      const gateVehicle=createVehicle(w,kind,'test',a.faction,x,z);
      assert.ok(gateVehicle.p.every(Number.isFinite));
    }
    const vision=(a,b)=>sight(w.field,vehicleGun(a).pivot,targetPoint(b));
    assert.equal(vision(make(w,'tank'),make(w,'tank','opponents')),false);
    assert.equal(vision(make(w,'helicopter'),make(w,'helicopter','opponents')),true);
  }
  for(const invalid of [-1,Infinity,1.1,0x100000000])assert.throws(()=>createEstuary(invalid));
});

test('mixed Kestrel poses reproduce the released fixed-step rotor and terrain contact',()=>{
  const legacy=createWorld(),w={field:legacy.field,offset:legacy.offset,water:new WaterSurface(-100)};
  const a=createVehicle(w,'helicopter','flight','cobalt',0,38),p=legacy.player;
  a.p=p.p.slice();
  // Rise, advance, turn in a slide, coast and descend to terrain.
  const schedule=[[80,K.up,BK.up],[60,K.forward|K.aimDown,BK.forward|BK.depress],
    [95,K.right|K.yawLeft,BK.strafeRight|BK.left],
    [65,K.back|K.left|K.yawRight|K.aimUp,BK.back|BK.strafeLeft|BK.right|BK.elevate],
    [45,0,0],[600,K.down,BK.down]];
  let grounded=false;
  for(const [ticks,flightMask,mixedMask] of schedule){
    for(let t=0;t<ticks;t++){
      const crash=driveVehicle(w,a,mixedMask);
      step(legacy,flightMask);
      for(const key of ['p','v','pitch','bank','yaw','aim'])assert.deepEqual(a[key],p[key],key);
      if(crash){assert.equal(crash,'terrain');assert.equal(p.hp,0);grounded=true;break;}
      assert.equal(legacy.status,'flying');
    }
    if(grounded)break;
  }
  assert.ok(grounded);
});

test('a descending helicopter contacts the sea surface above the seabed',()=>{
  const w=createEstuary(19),a=createVehicle(w,'helicopter','flight','cobalt',32,-45);
  a.p[1]=12;
  let surface;
  for(let i=0;i<600&&!surface;i++)surface=driveVehicle(w,a,BK.down);
  assert.equal(surface,'water');
  assert.ok(Math.abs(a.p[1]-w.water.level-1.402)<1e-8);
  assert.deepEqual(a.v,[0,0,0]);
});

test('dry-ground adapters stop at the shoreline, recover and reject a wet interior track patch',()=>{
  const w=createEstuary(17);
  for(const kind of ['tank','mech']){
    assert.throws(()=>createVehicle(w,kind,'bad','cobalt',20,37));
    const a=createVehicle(w,kind,kind,'cobalt',-12,4,Math.PI/2);
    run(w,a,1100,BK.forward);
    const edge=a.p[0];assert.ok(a.blocked && edge<2 && edge> -6);
    if(kind==='mech')for(const f of a.feet)assert.ok(w.field.sample(f.p[0],f.p[2]).height>w.water.level);
    run(w,a,240,BK.back);assert.ok(a.p[0]<edge-1 && !a.blocked);
  }
  assert.throws(()=>createVehicle(w,'ship','dry-boat','cobalt',-18,37));
  const heights=Array(33*33).fill(.12);heights[16*33+16]=-.05;
  const field=new Heightfield({originX:-8,originZ:-8,cellSize:.5,cellsX:32,cellsZ:32,heights});
  assert.throws(()=>createVehicle({...w,field},'tank','wet-track','cobalt',.3,.3),/dry ground/);
});

test('four adapters expose their own control response and block overlapping live bodies',()=>{
  const w=createEstuary(5);
  const tank=make(w,'tank'),mech=make(w,'mech'),ship=make(w,'ship'),air=make(w,'helicopter');
  run(w,tank,75,BK.right|BK.aimLeft);
  assert.ok(tank.leftSpeed>0 && tank.rightSpeed<0 && tank.yaw>0 && tank.turretYaw<0);
  run(w,mech,65,BK.forward|BK.aimLeft);
  assert.ok(mech.steps>0 && mech.feet.length===6 && mech.torsoYaw<0);
  run(w,ship,200,BK.forward|BK.right|BK.aimLeft);
  assert.ok(ship.speed>2 && ship.yaw>0 && ship.mountYaw<0 && ship.wetPoints>0);
  const y=air.p[1];run(w,air,100,BK.up|BK.strafeLeft);
  assert.ok(air.p[1]>y+1 && air.bank<0);
  const moving=make(w,'tank'),b=createVehicle(w,'tank','parked','cobalt',moving.p[0],moving.p[2]-9);
  run(w,moving,600,BK.forward,[moving,b]);
  assert.ok(Math.hypot(moving.p[0]-b.p[0],moving.p[2]-b.p[2])>=5.4);
  assert.ok(moving.blocked);
  b.hp=0;run(w,moving,200,BK.forward,[moving,b]);assert.ok(moving.p[2]<b.p[2]);
  for(const a of [tank,mech,ship,air]){
    const before=structuredClone(a);
    for(const invalid of [NaN,-1,16384,.5])assert.throws(()=>driveVehicle(w,a,invalid));
    assert.throws(()=>aimVehicle(a,.4,Infinity));
    assert.deepEqual(a,before);
  }
});
