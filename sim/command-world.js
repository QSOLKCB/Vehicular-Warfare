import {CLASSES, COMBINED_LIMIT, createCombinedWorld} from './combined-world.js';
import {commandContacts, initializeCommand, resetCommandUnit, stepCommand} from './command-control.js';
import {COMMAND_SOURCE} from './command-identity.js';
import {EDGE} from './terrain.js';
import {receipt} from './world.js';

export {commandContacts, stepCommand};
export const SCENARIO = 'breakwater-command-v1';
export const MAX_ORDERS = 1024, MAX_QUEUE = 8, MAX_COMMAND_REPLAY_BYTES = 524288;
const friendlyIds = CLASSES.map(kind => 'cobalt-' + kind);
const boundedInteger = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const header = ['version', 'source', 'scenario', 'seed', 'roster', 'orders', 'ticks', 'stateHash', 'eventHash', 'outcome'];
const orderFields = ['tick', 'units', 'type', 'append'];

function dataValue(object, key) {
  const field = Object.getOwnPropertyDescriptor(object, key);
  if (!field?.enumerable || !Object.hasOwn(field, 'value')) throw TypeError('Expected a data field for ' + key);
  return field.value;
}

function checkFields(record, keys) {
  if (!record || Object.getPrototypeOf(record) !== Object.prototype ||
      Reflect.ownKeys(record).length !== keys.length) throw TypeError('Unexpected record fields');
  for (const key of keys) dataValue(record, key);
}

function unitIds(units) {
  if (!Array.isArray(units) || Object.getPrototypeOf(units) !== Array.prototype ||
      units.length < 1 || units.length > friendlyIds.length ||
      Reflect.ownKeys(units).length !== units.length + 1) throw RangeError('Select one to four Cobalt units');
  const ids = [];
  for (let i = 0; i < units.length; i++) {
    const id = dataValue(units, i);
    if (!friendlyIds.includes(id) || ids.includes(id)) throw RangeError('Unknown or repeated friendly unit');
    ids.push(id);
  }
  return Object.freeze(ids.sort());
}

function coordinate(value) {
  if (!Number.isFinite(value) || Math.abs(value) > EDGE) throw RangeError('Destination outside the coastal theatre');
  return value === 0 ? 0 : value;
}

export function createCommandWorld(pack) {
  const world = createCombinedWorld(pack);
  initializeCommand(world);
  world.orderLog = [];
  return world;
}

// Accept at the current tick boundary. Within one tick, call order breaks
// ties. A group expands in sorted ID order, after all recipients pass checks.
export function issueOrder(w, raw) {
  if (w.status !== 'active' || w.tick >= COMBINED_LIMIT) throw RangeError('Mission has ended');
  if (w.orderLog.length >= MAX_ORDERS) throw RangeError('Mission order limit reached');
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype) throw TypeError('Expected an order record');
  const type = dataValue(raw, 'type');
  let order;
  switch (type) {
    case 'MOVE':
    case 'DEFEND':
      checkFields(raw, [...orderFields, 'x', 'z']);
      order = {type, x:coordinate(raw.x), z:coordinate(raw.z)};
      break;
    case 'ATTACK':
      checkFields(raw, [...orderFields, 'target']);
      if (!commandContacts(w).includes(raw.target)) throw RangeError('Target is outside current friendly contact');
      order = {type, target:raw.target};
      break;
    case 'HOLD':
      checkFields(raw, orderFields);
      order = {type};
      break;
    default: throw RangeError('Unsupported command order');
  }
  if (raw.tick !== w.tick || typeof raw.append !== 'boolean') throw RangeError('Invalid order tick or queue mode');
  const ids = unitIds(raw.units);
  for (const id of ids) {
    if (!w.actors.find(a => a.id === id).hp) throw RangeError('Unit disabled: ' + id);
    if (raw.append && w.units[id].queue.length >= MAX_QUEUE) throw RangeError('Waypoint queue full: ' + id);
  }
  const accepted = Object.freeze({tick:w.tick, units:ids, append:raw.append, ...order});
  for (const id of ids) {
    const unit = w.units[id];
    if (!raw.append || unit.queue.length === 0) {
      unit.queue.length = 0;
      resetCommandUnit(unit);
      unit.status = 'active';
    }
    unit.queue.push({...order});
  }
  w.orderLog.push(accepted);
  return accepted;
}

function roster(w) {
  return w.actors.map(({id, kind, faction}) => ({id, kind, faction}));
}

export function commandReceipt(w) {
  const {stateHash, eventHash} = receipt(w);
  return {version:1, source:COMMAND_SOURCE, scenario:SCENARIO, seed:w.seed, roster:roster(w),
    orders:w.orderLog.slice(), ticks:w.tick, stateHash, eventHash, outcome:w.status};
}

// Both entry points consume the same verifier. Periodic yields let the
// browser paint verification progress and cancel an import on page exit.
function* reconstruct(text) {
  if (typeof text !== 'string' || text.length > MAX_COMMAND_REPLAY_BYTES ||
      new TextEncoder().encode(text).length > MAX_COMMAND_REPLAY_BYTES) throw RangeError('Command replay exceeds file limit');
  const r = JSON.parse(text);
  checkFields(r, header);
  if (r.version !== 1 || r.source !== COMMAND_SOURCE || r.scenario !== SCENARIO ||
      !boundedInteger(r.seed, 0xffffffff) || !boundedInteger(r.ticks, COMBINED_LIMIT) ||
      !Array.isArray(r.orders) || r.orders.length > MAX_ORDERS ||
      ![r.eventHash, r.stateHash].every(s => typeof s === 'string' && /^[0-9a-f]{8}$/.test(s)) ||
      !['active', 'victory', 'defeat'].includes(r.outcome)) throw RangeError('Invalid command replay header');
  const w = createCommandWorld({seed:r.seed});
  const initial = roster(w);
  if (!Array.isArray(r.roster) || r.roster.length !== initial.length) throw RangeError('Unknown command roster');
  initial.forEach((actor, index) => {
    const entry = r.roster[index];
    checkFields(entry, ['id', 'kind', 'faction']);
    if (entry.id !== actor.id || entry.kind !== actor.kind || entry.faction !== actor.faction)
      throw RangeError('Unknown command roster member');
  });
  let previousTick = 0;
  for (const group of r.orders) {
    if (!boundedInteger(group?.tick, r.ticks) || group.tick < previousTick)
      throw RangeError('Invalid command replay order tick');
    previousTick = group.tick;
  }
  let i = 0;
  while (true) {
    while (i < r.orders.length && r.orders[i]?.tick === w.tick) {
      const group = r.orders[i++];
      const accepted = issueOrder(w, group);
      if (accepted.units.some((id, index) => id !== group.units[index])) throw RangeError('Noncanonical group order');
    }
    if (w.tick === r.ticks) break;
    if (w.status !== 'active') throw RangeError('Replay exceeds mission duration');
    stepCommand(w);
    if (w.tick % 32 === 0) yield w.tick;
  }
  const result = commandReceipt(w);
  if (i !== r.orders.length || result.outcome !== r.outcome ||
      result.stateHash !== r.stateHash || result.eventHash !== r.eventHash) throw Error('Command replay diverged');
  return w;
}

export function replayCommand(text) {
  const run = reconstruct(text);
  let result;
  do { result = run.next(); } while (!result.done);
  return result.value;
}

export async function openCommandReplay(text, {signal, onProgress} = {}) {
  const run = reconstruct(text);
  while (true) {
    signal?.throwIfAborted();
    const start = performance.now();
    let result;
    do {
      result = run.next();
      if (result.done) return result.value;
    } while (performance.now() - start < 8);
    onProgress?.(result.value);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
