import test from 'node:test';
import assert from 'node:assert/strict';
import {crewKeys,SimpleSteering} from '../game/drive-controls.js';
import {assertHeldYaw} from '../tools/control-sortie.mjs';
import {createTankWorld,stepTank,tankReceipt,replayTank,componentSight,TK} from '../sim/tank-world.js';
import {createMechWorld,stepMech,mechReceipt,replayMech,MK} from '../sim/mech-world.js';
import {createNavalWorld,stepNaval,navalReceipt,replayNaval,NK} from '../sim/naval-world.js';
import {createCombinedWorld,stepCombined,BK} from '../sim/combined-world.js';

const stations=[
  {kind:'tank',keys:TK,left:TK.turretLeft,right:TK.turretRight,mount:'turretYaw',
    create:createTankWorld,step:stepTank,receipt:tankReceipt,replay:replayTank},
  {kind:'mech',keys:MK,left:MK.torsoLeft,right:MK.torsoRight,mount:'torsoYaw',
    create:createMechWorld,step:stepMech,receipt:mechReceipt,replay:replayMech},
  {kind:'ship',keys:NK,left:NK.mountLeft,right:NK.mountRight,mount:'mountYaw',
    create:createNavalWorld,step:stepNaval,receipt:navalReceipt,replay:replayNaval}
];

test('manual aim hold accepts idle roundoff and detects one tick of mount traverse',()=>{
  const released=0.11249999999999961;
  assertHeldYaw(0.11249999999999945,released); // Observed after release in Chromium 157.
  assertHeldYaw(-Math.PI,Math.PI);
  assert.throws(()=>assertHeldYaw(NaN,released),assert.AssertionError);
  for(const {create,step,mount,right} of stations){
    const world=create();
    world.player[mount]=released;
    for(let tick=0;tick<12;tick++)step(world,0);
    assertHeldYaw(world.player[mount],released);
    step(world,right);
    assert.throws(()=>assertHeldYaw(world.player[mount],released),assert.AssertionError);
  }
});

test('one-handed surface aliases use the same command bits as arrows and preserve helicopter flight keys',()=>{
  for(const {kind,keys,left,right} of stations){
    for(const [k,l,r] of [[keys,left,right],[BK,BK.aimLeft,BK.aimRight]]){
      const input=crewKeys(kind,k,l,r);
      assert.deepEqual([input.KeyW,input.KeyS,input.KeyA,input.KeyD,input.Space],[k.forward,k.back,k.left,k.right,k.fire]);
      assert.deepEqual([input.KeyQ,input.KeyE,input.KeyR,input.KeyF],[l,r,k.elevate,k.depress]);
      assert.deepEqual([input.ArrowLeft,input.ArrowRight,input.ArrowUp,input.ArrowDown],[l,r,k.elevate,k.depress]);
      assert.equal(input.ShiftLeft,kind==='tank'?k.brake:undefined);
      assert.equal(input.ShiftRight,input.ShiftLeft);
    }
  }
  const flight=crewKeys('helicopter',BK,BK.aimLeft,BK.aimRight);
  assert.deepEqual([flight.KeyE,flight.KeyQ,flight.KeyZ,flight.KeyX],[BK.up,BK.down,BK.strafeLeft,BK.strafeRight]);
});

test('an aim override lasts through the current turn and release, and a new turn can follow again',()=>{
  const k=MK,p={yaw:Math.PI-.2,torsoYaw:-Math.PI+.1},steering=new SimpleSteering('mech',k,k.torsoLeft,k.torsoRight);
  assert.equal(steering.command(k.left,p),k.left|k.torsoLeft); // Short path through ±π.
  assert.equal(steering.command(k.left|k.torsoRight,p),k.left|k.torsoRight);
  assert.equal(steering.command(k.left,p),k.left);
  assert.equal(steering.command(0,p),0);
  assert.equal(steering.command(k.left,p),k.left|k.torsoLeft);
  assert.equal(steering.command(k.fire,p),k.fire); // Return to ordinary fire when steering stops.
  assert.equal(steering.command(0,p),0);
  assert.equal(steering.command(k.left|k.elevate,p),k.left|k.elevate);
  assert.equal(steering.command(k.left,p),k.left);
  assert.equal(steering.command(k.right,p),k.right|k.torsoLeft);
  steering.reset();assert.equal(steering.command(0,p),0);
});

test('rudder headway yields to manual reverse, grounding and existing astern motion',()=>{
  const k=NK,steering=new SimpleSteering('ship',k,k.mountLeft,k.mountRight);
  const player={speed:0,yaw:0,mountYaw:0,grounded:false};
  assert.equal(steering.command(k.right,player),k.right|k.forward);
  assert.equal(steering.command(k.right|k.back,player),k.right|k.back);
  assert.equal(steering.command(k.right,{...player,grounded:true}),k.right);
  assert.equal(steering.command(k.right,{...player,speed:-1}),k.right);
  assert.equal(steering.command(k.right,{...player,speed:2}),k.right);
  assert.equal(steering.command(0,player),0);
});

for(const {kind,keys,left,right,mount,create,step,receipt,replay} of stations){
  test(kind+' steers with its own locomotion and brings the mount around without a second hand',()=>{
    const w=create(),steering=new SimpleSteering(kind,keys,left,right),p=w.player;
    const steer=keys.right|(kind==='ship'?0:keys.forward);
    for(let tick=0;tick<180;tick++)step(w,steering.command(steer,p));
    assert.ok(p.yaw>.1 && p[mount]>.1 && p.speed>0);
    const r=receipt(w);
    assert.ok(r.commands.some(([,mask])=>Boolean(mask&right)));
    assert.deepEqual(receipt(replay(JSON.stringify(r))),r);
  });
  test(kind+' can finish the standalone and mixed missions with W and Space',()=>{
    const w=create(),steering=new SimpleSteering(kind,keys,left,right),active=w.status;
    let hullDown=false;
    while(w.status===active && w.tick<3000){
      const move=kind!=='tank' || w.player.p[2]>24;
      step(w,steering.command(keys.fire|(move?keys.forward:0),w.player));
      if(kind==='tank' && !move && w.player.speed===0){
        const exposure=componentSight(w.field,w.enemy,w.player);
        hullDown||=!exposure.hull && exposure.turret;
      }
    }
    assert.equal(w.status,'victory');
    if(kind==='tank'){
      assert.ok(hullDown);
      assert.ok(w.commands.some(([,mask])=>Boolean(mask&keys.brake)));
    }
    const mixed=createCombinedWorld(undefined,kind);
    const mixedSteering=new SimpleSteering(kind,BK,BK.aimLeft,BK.aimRight);
    while(mixed.status==='active' && mixed.tick<3000){
      stepCombined(mixed,mixedSteering.command(BK.fire|(mixed.captured?0:BK.forward),mixed.player));
    }
    assert.equal(mixed.status,'victory');
  });
}
