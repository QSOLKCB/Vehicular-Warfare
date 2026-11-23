// Breakwater fog of war. Only the sensor adapter receives the physical world.
import {canSee, CLASSES, COMBINED_LIMIT} from './combined-world.js';
import {EDGE} from './terrain.js';

export const INTEL_PERIOD = 30;
export const CONTACT_LIFETIME = 360;
const factions = ['cobalt', 'ember'];
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const crews = new Map();
for (const faction of factions) {
  for (const kind of CLASSES) {
    for (const suffix of ['', '-2', '-3']) crews.set(faction+'-'+kind+suffix, {kind, faction});
  }
}
crews.set('relay', {kind:'relay', faction:'ember'});

export function createIntelligence() {
  return {lastTick:-1, evaluations:0, cobalt:{contacts:[], changes:[]}, ember:{contacts:[], changes:[]}};
}

function field(value, key) {
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw TypeError('Expected observation data');
  return d.value;
}

function plainArray(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > max || Reflect.ownKeys(value).length !== value.length+1) {
    throw RangeError('Invalid observation array');
  }
}

function point(value) {
  plainArray(value, 3);
  if (value.length !== 3) throw RangeError('Expected a Breakwater position');
  const p = [field(value, 0), field(value, 1), field(value, 2)];
  if (p.some(n => !Number.isFinite(n) || Math.abs(n) > EDGE)) throw RangeError('Invalid Breakwater position');
  return p;
}

// Each batch contains one positive report per sighted piece. A missing piece
// ages from its last positive report even when the opposing actor still exists.
export function contactBook(previous, faction, tick, sightings) {
  if (!factions.includes(faction) || !Number.isInteger(tick) || tick < 0 || tick > COMBINED_LIMIT ||
      tick % INTEL_PERIOD !== 0) throw RangeError('Invalid contact sweep');
  plainArray(sightings, faction === 'cobalt' ? 13 : 12);
  const current = new Map();
  for (let i = 0; i < sightings.length; i++) {
    const report = field(sightings, i);
    if (!report || Object.getPrototypeOf(report) !== Object.prototype || Reflect.ownKeys(report).length !== 4) {
      throw TypeError('Invalid sight report');
    }
    const id = field(report, 'id'), kind = field(report, 'kind'), source = field(report, 'source');
    const target = crews.get(id), observer = crews.get(source);
    if (!target || target.kind !== kind || target.faction === faction ||
        observer?.faction !== faction || observer.kind === 'relay' || current.has(id)) {
      throw RangeError('Invalid contact or observation source');
    }
    current.set(id, {id, kind, source, observedTick:tick, p:point(field(report, 'p')), visible:true});
  }
  const old = new Map(previous.contacts.map(c => [c.id, c]));
  const changes = previous.changes.slice();
  const record = (type, c) => changes.push({tick, type, id:c.id, source:c.source, observedTick:c.observedTick});
  for (const c of Array.from(current.values()).sort(compareId)) {
    if (!old.get(c.id)?.visible) record(old.has(c.id) ? 'reacquired' : 'admitted', c);
  }
  for (const c of previous.contacts) {
    if (current.has(c.id)) continue;
    if (tick - c.observedTick >= CONTACT_LIFETIME) {
      record('expired', c);
    } else {
      if (c.visible) record('lost', c);
      current.set(c.id, c.visible ? {...c, visible:false} : c);
    }
  }
  return {contacts:Array.from(current.values()).sort(compareId), changes:changes.slice(-32)};
}

export function sampleIntelligence(w, intel) {
  if (w.tick % INTEL_PERIOD !== 0 || w.tick === intel.lastTick) return false;
  if (!Number.isSafeInteger(w.tick) || w.tick < intel.lastTick || w.tick < 0 || w.tick > COMBINED_LIMIT ||
      w.actors.length > 25) throw RangeError('Invalid sensor boundary');
  // canSee owns the physical sight query, including target eligibility, range,
  // emitter/target geometry, terrain and water. Only successful queries export
  // a snapshot. Taking the first observer in ID order bounds both work and data.
  const ordered = w.actors.slice().sort(compareId);
  const books = {};
  let evaluations = 0;
  for (const faction of factions) {
    const observers = ordered.filter(a => a.faction === faction && a.kind !== 'relay' && a.hp > 0);
    const reports = [];
    for (const target of ordered) {
      if (target.faction === faction) continue;
      for (const observer of observers) {
        evaluations++;
        if (!canSee(w, observer, target)) continue;
        reports.push({id:target.id, kind:target.kind, source:observer.id, p:target.p});
        break;
      }
    }
    books[faction] = contactBook(intel[faction], faction, w.tick, reports);
  }
  Object.assign(intel, books, {lastTick:w.tick, evaluations:intel.evaluations+evaluations});
  return true;
}

export function rankContacts(intel, faction, crewPosition, objectivePosition) {
  if (!factions.includes(faction)) throw RangeError('Unknown faction');
  const own = point(crewPosition), goal = point(objectivePosition);
  const proximity = (p, q) => Math.max(0, 100 - Math.floor(Math.hypot(p[0]-q[0], p[2]-q[2])));
  return intel[faction].contacts.map(contact => {
    const factors = {
      observed:contact.visible ? 512 : 0,
      relay:contact.kind === 'relay' ? 128 : 0,
      objective:proximity(contact.p, goal),
      crew:proximity(contact.p, own),
      freshness:Math.max(0, (CONTACT_LIFETIME - (intel.lastTick-contact.observedTick)) / INTEL_PERIOD)
    };
    const score = factors.observed + factors.relay + factors.objective + factors.crew + factors.freshness;
    const reason = (contact.visible ? 'observed' : 'last known') + (factors.relay ? ' relay' : ' crew');
    return {contact, score, reason, factors};
  }).sort((a,b) => b.score - a.score || compareId(a.contact, b.contact));
}
