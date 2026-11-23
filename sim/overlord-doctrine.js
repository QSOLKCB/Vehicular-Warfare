// Breakwater board policies. All destinations use game metres on the authored chart.
import {canSee} from './combined-world.js';
import {rankContacts} from './overlord-intel.js';
import {resetCommandUnit} from './command-control.js';

export const DOCTRINES=Object.freeze(['ASSAULT','DEFEND','SUPPORT','RECON','MANUAL']);
export const DECISION_PERIOD=50;

export function newController(){
  const u={queue:[],status:'idle',lastResult:null};
  resetCommandUnit(u);
  return u;
}

export function newCrew(a){
  const doctrine={tank:'ASSAULT',helicopter:'RECON',mech:'SUPPORT',ship:'DEFEND',relay:'DEFEND'}[a.kind];
  return {doctrine,station:[a.p[0],a.p[2]],task:null,decision:null,controller:newController(),
    candidateCount:0,mask:0};
}

function course(w,a,crew,contacts){
  const {doctrine,station}=crew;
  if(doctrine==='DEFEND')return {action:'defend station',reason:'assigned station',goal:station};
  const sign=a.faction==='cobalt'?-1:1;
  if(doctrine==='ASSAULT'){
    const goal=a.kind==='ship'?[a.home[0],w.beacon[2]]:[w.beacon[0],w.beacon[2]];
    return {action:'advance',reason:'crossing objective',goal};
  }
  if(doctrine==='RECON'){
    const lost=contacts.find(c=>!c.contact.visible);
    const goal=lost?[lost.contact.p[0],lost.contact.p[2]]:
      [a.home[0],a.home[1]+sign*(Math.floor(w.tick/600)%2?9:26)];
    return {action:'investigate',reason:lost?'last observed position':'charted survey point',goal};
  }
  if(doctrine==='SUPPORT'){
    const advance=w.actors.find(b=>b.faction===a.faction && b.section===a.section &&
      b!==a && b.hp && (w.units[b.id]?.queue[0]?.sectionTask==='ADVANCE' ||
      (w.units[b.id]?.queue[0]?.type==='MOVE') ||
      (!w.units[b.id]?.queue.length && w.tactical.crews[b.id]?.decision?.action==='advance')));
    const goal=advance?[a.home[0],Math.round(advance.p[2]/12)*12-sign*12]:station;
    return {action:advance?'support advance':'hold station',reason:advance?advance.id:'no advancing section crew',goal};
  }
  return {action:'hold',reason:'manual control',goal:null};
}

function setCourse(w,crew,goal){
  const u=crew.controller,prior=u.queue[0];
  if(!goal){if(prior){u.queue.length=0;resetCommandUnit(u);}return;}
  if(prior?.goal && prior.goal[0]===goal[0] && prior.goal[1]===goal[1])return;
  if(u.lastResult?.status==='blocked' && w.tick-u.lastResult.tick<360)return;
  resetCommandUnit(u);
  u.queue=[{type:'DEFEND',goal:goal.slice(),x:goal[0],z:goal[1],route:null,replanned:false}];
  u.status='active';
}

// Only a crew's own board state, shared contact snapshots and public objectives
// enter its decision. Individual sight is checked again when its mount operates.
export function decide(w,a){
  const crew=w.tactical.crews[a.id],explicit=w.units[a.id]?.queue[0];
  const ranked=rankContacts(w.tactical.intel,a.faction,a.p,w.beacon);
  const eligible=crew.doctrine==='MANUAL' && !explicit?null:ranked.find(row=>row.contact.visible &&
    canSee(w,a,w.actors.find(b=>b.id===row.contact.id)));
  const intent=explicit?{action:explicit.type,reason:'commander order',goal:explicit.goal?.slice()??null}:
    a.kind==='relay'?{action:'hold relay',reason:'fixed game piece',goal:null}:course(w,a,crew,ranked);
  if(!explicit)setCourse(w,crew,intent.goal);
  const contact=explicit?.type==='MOVE'?null:explicit?.type==='ATTACK'?
    ranked.find(c=>c.contact.id===explicit.target):eligible;
  crew.candidateCount=ranked.length;
  const decision={tick:w.tick,doctrine:crew.doctrine,...intent,contact:contact?.contact.id??null,
    observedTick:contact?.contact.observedTick??null,source:contact?.contact.source??null,
    score:contact?.score??null,candidates:ranked.map(c=>[c.contact.id,c.score])};
  crew.decision=decision;
  w.tactical.decisions++;
  // Retain the complete decision history as an incremental replay digest.
  for(const c of JSON.stringify([a.id,decision])){
    w.tactical.decisionHash=Math.imul(w.tactical.decisionHash^c.charCodeAt(0),16777619)>>>0;
  }
}
