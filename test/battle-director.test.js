import test from 'node:test';
import assert from 'node:assert/strict';
import {directorSubject,directorAngle,directorPose} from '../game/battle-director.js';
import {createCommandWorld,stepCommand,commandReceipt} from '../sim/command-world.js';
import {rotate} from '../vendor/vanillajs/modules/math/index.js';

test('a pinned friendly camera survives command selection and follows the fallback when its subject is lost',()=>{
  const crew=(id,hp=60)=>({id,hp,faction:'cobalt'});
  const enemy={id:'ember-mech',faction:'ember',get hp(){throw Error('hostile health read');}};
  const air=crew('cobalt-helicopter'),ship=crew('cobalt-ship'),dead=crew('cobalt-tank',0);
  const visible=[enemy,dead,air,ship],selected=new Set([ship.id]);
  assert.equal(directorSubject(visible,air.id,selected),air);
  assert.equal(directorSubject(visible,dead.id,selected),ship);
  assert.equal(directorSubject(visible,enemy.id,selected),ship);
  assert.equal(directorSubject(visible,'',new Set()),air);
  assert.equal(directorSubject([enemy,dead],dead.id,selected),null);
});

test('orbit geometry stays inside the chart and above land and water and looks back at the subject',()=>{
  const scene={field:{sample:()=>({height:25})},water:{heightAt:()=>30},beacon:[-3,4,5]};
  for(const p of [[-144,1,-144],[142,1,142],[-10,50,25]]){
    for(const tilt of [-6,35,110])for(const bearing of [0,89,220])for(const range of [1,29,140]){
      const {eye,q}=directorPose(scene,{p},bearing,tilt,range);
      assert.ok(Math.abs(eye[0])<=144 && Math.abs(eye[2])<=144 && eye[1]>=30.7);
      const distance=Math.hypot(...p.map((v,i)=>v-eye[i]));
      const actual=rotate(q,[0,0,-1]);
      assert.ok(actual.every((v,i)=>Math.abs(v-(p[i]-eye[i])/distance)<1e-7));
    }
  }
  assert.deepEqual(directorPose(scene,null,0,15,16),directorPose(scene,{p:scene.beacon},0,15,16));
});

test('automatic orbit has a fixed angular rate and camera inspection preserves the same command receipt',()=>{
  const w=createCommandWorld(),reference=createCommandWorld();
  assert.equal(directorAngle(357,120,0),12);
  assert.equal(directorAngle(357,120,null),357);
  const selected=new Set(['cobalt-helicopter']);
  for(let n=0;n<180;n++){
    stepCommand(w);stepCommand(reference);
    const subject=directorSubject(w.actors,'cobalt-ship',selected);
    const angle=directorAngle(40,w.tick,4);
    const pose=directorPose(w,subject,angle,19,16);
    assert.deepEqual(pose,directorPose(w,subject,angle,19,16));
  }
  assert.deepEqual(commandReceipt(w),commandReceipt(reference));
});
