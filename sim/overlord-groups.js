// Section tasks on Breakwater's 288 m board. The controller consumes ordinary
// formation legs. Only friendly positions and the immutable chart enter planning.
import {formationSlots, planFormationRoute, SLOT_SPACING} from './formation-routes.js';
import {resetCommandUnit} from './command-control.js';

const COVER_WAIT = 240;
const marking = actor => [actor.p[0], actor.p[2]];

function pointDistance(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / (dx*dx + dz*dz || 1)));
  return Math.hypot(p[0] - a[0] - t*dx, p[1] - a[1] - t*dz);
}

function planned(w, actor, goal, stats) {
  const route = planFormationRoute(w, actor, goal);
  stats.plans++;
  stats.visited += route.visited;
  return route.points;
}

// Route from a chart marker without moving the real actor. The original
// hull must also leave the planning view or it would obstruct its own route.
function fromMarker(w, actor, marker, goal, stats) {
  const start = {...actor, p:[marker[0], actor.p[1], marker[1]]};
  const chart = {field:w.field, water:w.water, actors:w.actors.map(a => a === actor ? start : a)};
  return planned(chart, start, goal, stats);
}

function approachRoute(w, actor, goal, baseline, stats) {
  const start = marking(actor), dx = goal[0]-start[0], dz = goal[1]-start[1];
  const length = Math.hypot(dx,dz);
  if (length < SLOT_SPACING) return null;
  const direct = [start, ...baseline];
  // Two game-board markers, two 12 m squares to either side of the
  // midpoint. A marker on the ordinary formation route is redundant.
  for (const side of [1, -1]) {
    const marker = [
      Math.round((start[0]+dx/2 - side*2*SLOT_SPACING*dz/length)/6)*6,
      Math.round((start[1]+dz/2 + side*2*SLOT_SPACING*dx/length)/6)*6
    ];
    if (baseline.some((end,i) => pointDistance(marker,direct[i],end) < SLOT_SPACING)) continue;
    const first = planned(w, actor, marker, stats);
    if (!first.length) continue;
    const last = fromMarker(w, actor, marker, goal, stats);
    if (!last.length) continue;
    // Reject an excursion which simply retraces the conventional final leg.
    const normalEnd = direct.at(-2), alternateEnd = last.at(-2) ?? marker;
    const ux = normalEnd[0]-goal[0], uz = normalEnd[1]-goal[1];
    const vx = alternateEnd[0]-goal[0], vz = alternateEnd[1]-goal[1];
    if (ux*vx+uz*vz >= .94*Math.hypot(ux,uz)*Math.hypot(vx,vz)) continue;
    return {marker, first, last};
  }
  return null;
}

function spatial(type, goal, route) {
  return {type,goal,route,x:route[0][0],z:route[0][1],replanned:false};
}

function findCover(w, group, anchor) {
  let closest = null, distance = Infinity;
  for (const id of Object.keys(w.units).sort()) {
    const assignment = w.tactical.crews[id].task;
    if (assignment?.task !== 'COVER' || group.includes(id) ||
        !w.units[id].queue[0]?.sectionTask ||
        w.units[id].queue[0]?.type !== 'DEFEND') continue;
    const slot = assignment.slot;
    const d = Math.hypot(slot[0]-anchor[0],slot[1]-anchor[1]);
    if (d <= SLOT_SPACING*6 && d < distance) { closest=id;distance=d; }
  }
  return closest;
}

// Called after scenario admission checks the entire submission. Prepare all
// paths before changing a queue. Each FLANK gets at most five grid searches.
export function groupPlan(w, accepted) {
  const {task,x,z,units} = accepted;
  if (!['ADVANCE','COVER','REGROUP','FLANK'].includes(task) || accepted.append) {
    throw RangeError('Unsupported section task');
  }
  const members = units.map(id => w.actors.find(a => a.id === id));
  const slots = formationSlots(w, members, x, z), anchor = [x,z];
  const cover = task === 'ADVANCE' ? findCover(w, units, anchor) : null;
  const stats = {plans:0,visited:0};
  const assignments = members.map(a => {
    const slot = slots.get(a.id);
    const assignment = {task,tick:w.tick,anchor,slot,approach:null,cover,waiting:false,reason:''};
    const route = slot ? planned(w,a,slot,stats) : [];
    const orders = [];
    if (!route.length) {
      assignment.reason = slot ? 'no traversable route' : 'no compatible slot';
    } else if (task === 'FLANK') {
      const alt = approachRoute(w,a,slot,route,stats);
      if (alt) {
        assignment.approach = alt.marker;
        assignment.reason = 'alternate approach validated';
        orders.push(spatial('MOVE',alt.marker,alt.first),spatial('MOVE',slot,alt.last));
      } else assignment.reason = 'no distinct traversable approach';
    } else {
      const type = task === 'COVER' ? 'DEFEND' : 'MOVE';
      orders.push(spatial(type,slot,route));
      if (cover && !w.units[cover].onStation) {
        // This one queue entry reserves the pending movement. Releasing it
        // replaces only the head, leaving any player-appended successor intact.
        orders[0] = {type:'HOLD',pendingAdvance:orders[0]};
        assignment.waiting = true;
        assignment.reason = 'waiting for covering crew';
      } else {
        assignment.reason = {COVER:'occupy cover slot',REGROUP:'join rally slot',
          ADVANCE:cover ? 'cover on station' : 'advance to objective'}[task];
      }
    }
    for (const order of orders) order.sectionTask = task;
    if (orders[0]?.pendingAdvance) orders[0].pendingAdvance.sectionTask = task;
    assignment.active = orders.length > 0;
    return {id:a.id,assignment,orders};
  });
  for (const {id,assignment,orders} of assignments) {
    const u = w.units[id];
    u.queue.splice(0,u.queue.length,...orders);
    resetCommandUnit(u);
    u.status = orders.length ? 'active' : 'blocked';
    if (!orders.length) u.lastResult = {tick:w.tick,type:task,status:'blocked',reason:assignment.reason,distance:null};
    w.tactical.crews[id].task = assignment;
  }
  w.navigation.plans += stats.plans;
  w.navigation.visited += stats.visited;
}

// At most 12 Cobalt entries. A disabled or retasked cover crew releases the
// remaining advance. The two-second limit also covers a slow or grounded crew.
export function beforeGroupStep(w) {
  for (const id of Object.keys(w.units)) {
    const task = w.tactical.crews[id].task;
    if (!task?.active) continue;
    const u = w.units[id];
    if (u.queue[0]?.sectionTask !== task.task) {
      task.active = false;
      task.waiting = false;
      continue;
    }
    if (!task.waiting) continue;
    const next = u.queue[0]?.pendingAdvance;
    if (!next) { task.waiting=false;continue; }
    const support = w.units[task.cover];
    const ready = support.onStation;
    const unavailable = w.tactical.crews[task.cover].task?.task !== 'COVER' ||
      support.queue[0]?.sectionTask !== 'COVER';
    if (!ready && !unavailable && w.tick-task.tick < COVER_WAIT && u.queue.length === 1) continue;
    u.queue[0] = next;
    resetCommandUnit(u);
    task.waiting = false;
    task.reason = unavailable ? 'cover unavailable' : ready ? 'cover on station' :
      u.queue.length > 1 ? 'commander queued next order' : 'cover wait expired';
    task.releaseTick = w.tick;
  }
}
