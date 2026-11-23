import test from 'node:test';
import assert from 'node:assert/strict';
import {bigBattle} from '../sim/big-battle.js';
import {canSee} from '../sim/combined-world.js';
import {createVehicle, targetPoint, vehicleGun} from '../sim/combined-vehicles.js';
import {sight} from '../sim/terrain.js';
import {CONTACT_LIFETIME, INTEL_PERIOD, contactBook, createIntelligence, rankContacts,
  sampleIntelligence} from '../sim/overlord-intel.js';

const crew = (w,id) => w.actors.find(a => a.id === id);
function place(w, a, x, z) {
  Object.assign(a, createVehicle(w, a.kind, a.id, a.faction, x, z));
}
function trap() { assert.fail('accessor invoked'); }
function record(id, source = 'cobalt-tank') {
  return {id, source, kind:'tank', p:[-26,3,10]};
}

test('each faction admits actual observations from a live crew; source and ID ties ignore roster order', () => {
  const w = bigBattle.createWorld(), intel = createIntelligence();
  assert.ok(sampleIntelligence(w,intel));
  for (const side of ['cobalt','ember']) {
    const confirmed = intel[side].contacts;
    assert.ok(confirmed.length > 0);
    for (const c of confirmed) {
      const target = crew(w,c.id), source = crew(w,c.source);
      assert.ok(canSee(w, source, target));
      assert.equal(source.faction, side);
      assert.notEqual(target.faction, side);
      assert.deepEqual(c.p,target.p);
      assert.notStrictEqual(c.p,target.p);
      assert.equal(c.observedTick,w.tick);
      assert.equal(c.visible,true);
    }
  }
  const again = createIntelligence();
  w.actors.reverse();
  sampleIntelligence(w,again);
  assert.deepEqual(again,intel);
  assert.equal(sampleIntelligence(w,intel),false);
  w.tick++;
  assert.equal(sampleIntelligence(w,intel),false);
  assert.ok(intel.evaluations <= 300);
});

test('island blocks an in-range contact, loss freezes its report, reacquisition and expiry use sweep ticks', () => {
  const w = bigBattle.createWorld(), intel = createIntelligence();
  const source = crew(w,'cobalt-ship'), target = crew(w,'ember-helicopter');
  for (const a of w.actors) if (a !== source && a !== target) a.hp = 0;
  place(w,source,38,-48);
  place(w,target,72,2);
  assert.ok(Math.hypot(...source.p.map((v,i) => v-target.p[i])) < 100);
  assert.equal(sight(w.field,vehicleGun(source).pivot,targetPoint(target)),false);
  sampleIntelligence(w,intel);
  assert.equal(intel.cobalt.contacts.length,0);
  w.tick += INTEL_PERIOD;
  place(w,target,38,-30);
  sampleIntelligence(w,intel);
  const known = structuredClone(intel.cobalt.contacts[0]);
  w.tick += INTEL_PERIOD;
  place(w,target,72,2);
  sampleIntelligence(w,intel);
  assert.deepEqual(intel.cobalt.contacts[0],{...known,visible:false});
  for (let age=2*INTEL_PERIOD; age<CONTACT_LIFETIME; age+=INTEL_PERIOD) {
    w.tick+=INTEL_PERIOD;
    place(w,target,73+age/CONTACT_LIFETIME,4);
    sampleIntelligence(w,intel);
    assert.deepEqual(intel.cobalt.contacts[0],{...known,visible:false});
  }
  w.tick+=INTEL_PERIOD;
  sampleIntelligence(w,intel);
  assert.deepEqual(intel.cobalt.contacts,[]);
  assert.deepEqual(intel.cobalt.changes.map(e=>[e.type,e.tick]),
    [['admitted',30],['lost',60],['expired',known.observedTick+CONTACT_LIFETIME]]);
  place(w,target,38,-30);
  w.tick+=INTEL_PERIOD;
  sampleIntelligence(w,intel);
  assert.equal(intel.cobalt.contacts[0].observedTick,w.tick);
  for (const z of [2,-30]) {
    w.tick+=INTEL_PERIOD;
    place(w,target,z===2?72:38,z);
    sampleIntelligence(w,intel);
  }
  assert.equal(intel.cobalt.changes.at(-1).type,'reacquired');
});

test('shared sight cannot grant personal visibility or acquisition', () => {
  const w=bigBattle.createWorld(), intel=createIntelligence();
  const blind=crew(w,'cobalt-ship'), scout=crew(w,'cobalt-helicopter'), target=crew(w,'ember-helicopter');
  for (const a of w.actors) if (![blind,scout,target].includes(a)) a.hp=0;
  place(w,blind,38,-48);
  place(w,scout,73,13);
  place(w,target,72,2);
  sampleIntelligence(w,intel);
  assert.equal(intel.cobalt.contacts[0].source,scout.id);
  assert.deepEqual(rankContacts(intel,'cobalt',blind.p,w.beacon)[0].contact.p,target.p);
  assert.equal(canSee(w,blind,target),false);
  assert.equal(blind.seen,0);
  assert.equal(blind.target,null);
  assert.equal(w.serial,0);
});

test('ranking uses snapshots, bounded additive scores and stable actor IDs', () => {
  const intel=createIntelligence();
  const later=record('ember-tank-2'), first=record('ember-tank');
  intel.lastTick=0;
  intel.cobalt=contactBook(intel.cobalt,'cobalt',0,[later,first]);
  later.p.fill(90);
  const ranks = () => rankContacts(intel,'cobalt',[-26,3,10],[-26,3,10]);
  assert.deepEqual(ranks().map(r=>[r.contact.id,r.score]),
    [['ember-tank',724],['ember-tank-2',724]]);
  const copy=structuredClone(ranks());
  assert.deepEqual(ranks(),copy);
  intel.lastTick=30;
  first.p=[100,4,12];
  intel.cobalt=contactBook(intel.cobalt,'cobalt',30,[first]);
  assert.equal(ranks()[0].contact.id,first.id);
  assert.equal(ranks()[1].contact.visible,false);
  assert.equal(ranks()[1].factors.observed,0);
});

test('concealed opponents cannot feed hidden orders, ammo, velocity or tracking into a report or score', () => {
  const w=bigBattle.createWorld(),intel=createIntelligence();
  for (const a of w.actors) {
    for (const key of ['ammo','v','target','seen','ready','orders','queue','home']) {
      Object.defineProperty(a,key,{get:trap});
    }
  }
  sampleIntelligence(w,intel);
  for (const a of w.actors) {
    // After sensor integration no world read is legitimate, even when scoring
    // remembered targets or exposing a previously sampled observation.
    for (const key of ['hp','p','faction','kind']) Object.defineProperty(a,key,{get:trap});
  }
  const before=rankContacts(intel,'cobalt',[0,0,0],[0,0,0]);
  assert.ok(before.length);
  intel.cobalt=contactBook(intel.cobalt,'cobalt',30,[]);
  intel.lastTick=30;
  const after=rankContacts(intel,'cobalt',[0,0,0],[0,0,0]);
  assert.ok(after.every(r=>!r.contact.visible));
  assert.deepEqual(after.map(r=>r.contact.p),before.map(r=>r.contact.p));
});

test('malformed, sparse, accessor and oversized observations reject without changing the contact book', () => {
  const good=record('ember-tank'), previous=contactBook(createIntelligence().cobalt,'cobalt',0,[good]);
  const getter={...good};
  Object.defineProperty(getter,'kind',{get:trap});
  const position=[1,2,3];Object.defineProperty(position,0,{get:trap});
  const array=[good];Object.defineProperty(array,0,{get:trap});
  for (const bad of [null,[{}],Array(14),[,],array,[getter],[good,good],[{...good,p:position}],
    [{...good,p:[1,NaN,3]}],[{...good,p:[1,2,145]}],[{...good,source:'ember-ship'}],
    [{...good,id:'cobalt-tank'}],[{...good,kind:'ship'}],[{...good,source:'relay'}],
    [{...good,id:'ember-tank-4'}],[{...good,health:9}],[Object.create(good)]]) {
    const before=structuredClone(previous);
    assert.throws(()=>contactBook(previous,'cobalt',30,bad),
      error=>error instanceof RangeError || error instanceof TypeError);
    assert.deepEqual(previous,before);
  }
  assert.throws(()=>rankContacts(createIntelligence(),'cobalt',[NaN,0,0],[0,0,0]));
});
