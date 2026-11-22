// Breakwater Reach. All heights, including the intertidal bank and seabed,
// live in this single triangular field. The sea occupies the same chart.
import {Heightfield} from '../vendor/vanillajs/modules/terrain/index.js';
import {clamp,seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {EDGE,HULL_HALF_HEIGHT,HULL_RADIUS,missionSeed} from './terrain.js';
import {WaterSurface} from './vessel.js';

const cell=3;
const bell=(x,z,rx,rz)=>Math.exp(-((x/rx)**2+(z/rz)**2));
const teamX={helicopter:-30,tank:-18,mech:-8,ship:12};
const opposingXZ={helicopter:[-35,-36],tank:[-23,-44],mech:[-12,-38],ship:[17,-44]};

export function createEstuary(seed){
  missionSeed({seed});
  const random=seededRandom(seed),phase=random()*Math.PI*2,heights=[];
  for(let z=-EDGE;z<=EDGE;z+=cell){
    for(let x=-EDGE;x<=EDGE;x+=cell){
      const coast=1.1*Math.sin(z/22)+.7*Math.sin(z/38+phase);
      const offshore=clamp((x-coast+4)/19.5,0,1);
      const channel=clamp((x-coast-8)/12,0,1);
      const western=clamp((-x-34)/28,0,1);
      const spine=bell(x+73,z+4,21,100)*(22+6*Math.cos(z/19+phase));
      const highlands=9*bell(x+45,z+82,25,27)+15*bell(x+107,z-62,30,42);
      const knoll=4.6*bell(x+23,z+12,5.5,10);
      const isle=18*bell(x-58,z+20,18,30)+10*bell(x-39,z-33,7,13)+14*bell(x-19,z+9,5.6,12);
      const spit=11*bell(x-23,z+95,28,15);
      const ripples=western*(1+.28*random())*(1.2+.7*Math.sin(x/9+z/15));
      heights.push(2-7*offshore-3*channel+western*(spine+highlands)+ripples+(1-offshore)*knoll+offshore*(isle+spit));
    }
  }
  const field=Object.freeze(new Heightfield({cellsX:96,cellsZ:96,cellSize:cell,
    originX:-EDGE,originZ:-EDGE,heights}));
  // Same conservative clearance calculation as the released flight solver.
  let slope=0;
  for(let j=0;j<field.cellsZ;j++)for(let i=0;i<field.cellsX;i++){
    for(const f of [.25,.75]){
      const {normal:n}=field.sample(-EDGE+(i+f)*cell,-EDGE+(j+f)*cell);
      slope=Math.max(slope,Math.hypot(n[0],n[2])/n[1]);
    }
  }
  const water=new WaterSurface(0),offset=HULL_HALF_HEIGHT+HULL_RADIUS*slope;
  const spawns={},opponents={},gates={};
  for(const [kind,x] of Object.entries(teamX)){
    spawns[kind]=Object.freeze([x,37,0]);
    opponents[kind]=Object.freeze([...opposingXZ[kind],Math.PI]);
    const gx=kind==='helicopter'?-16:x,gz=kind==='mech'?17:3;
    const surface=Math.max(water.heightAt(gx,gz),field.sample(gx,gz).height);
    gates[kind]=Object.freeze([gx,surface+(kind==='helicopter'?offset+2.5:0),gz]);
  }
  return {field,water,offset,spawns:Object.freeze(spawns),opponents:Object.freeze(opponents),
    gates:Object.freeze(gates),relay:Object.freeze([-3,-29])};
}
