// Original vertex-coloured models. Local forward is -Z. Build once per mount.
import {boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {cross, dot, normalize, subtract} from '../vendor/vanillajs/modules/math/index.js';
export const paint={sand:[.75,.53,.31],gold:[1,.65,.19],dark:[.12,.14,.15],teal:[.20,.47,.5],
  red:[.99,.28,.13],light:[.87,.84,.66],rubber:[.095,.09,.095]};
const {sand,gold,dark,teal,red,light,rubber}=paint;

export function facet(out,a,b,c,color,shade=1) {
  for (const p of [a,b,c]) out.push(...p,color[0]*shade,color[1]*shade,color[2]*shade);
}
function shell(out,rings,canopy=false,tint=sand) {
  const points=rings.map(([z,y,rx,ry])=>Array.from({length:8},(_,i)=>{
    const a=(i+.5)*Math.PI/4;
    return [Math.cos(a)*rx,y+Math.sin(a)*ry,z];
  }));
  for(let j=1;j<points.length;j++) for(let i=0;i<8;i++) {
    const next=(i+1)%8,a=points[j-1][i],b=points[j-1][next],c=points[j][i],d=points[j][next];
    const color=canopy && j<4 && i<4?teal:(i>3 && i<7?dark:tint);
    const n=normalize(cross(subtract(c,a),subtract(b,a)));
    const shade=.74+.24*dot(n,[-.5,.8,.25]);
    facet(out,a,b,c,color,shade); facet(out,b,d,c,color,shade);
  }
}
function rod(out,a,b,r,color) {
  const axis=normalize(subtract(b,a)),ref=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
  const u=normalize(cross(axis,ref)),v=cross(axis,u);
  const ring=(p,i)=>p.map((n,k)=>n+r*(u[k]*Math.cos(i*Math.PI/3)+v[k]*Math.sin(i*Math.PI/3)));
  for(let i=0;i<6;i++) {
    const x=ring(a,i),y=ring(a,i+1),z=ring(b,i),t=ring(b,i+1);
    facet(out,x,y,z,color,.8+i*.032); facet(out,y,t,z,color,.8+i*.032);
  }
}
export function aircraft(tint=sand) {
  const out=[];
  shell(out,[[-2.45,-.14,.025,.05],[-2.03,-.04,.72,.56],[-1.02,.12,1,.86],
    [-.18,.1,1.04,.88],[1.15,.15,.83,.67],[1.82,.24,.41,.41],[1.85,.24,.01,.01]],true,tint);
  // Cockpit rails follow the wraparound glazing, with a central windscreen spar.
  rod(out,[0,.42,-2.08],[0,.98,-1.02],.045,dark);
  for(const s of [-1,1]) {
    rod(out,[s*.65,.20,-2.06],[s*.90,.52,-1.02],.045,light);
    rod(out,[s*.90,.52,-1.02],[s*.38,.96,-1.02],.055,dark);
    rod(out,[s*.9,.52,-1.02],[s*1.0,.15,-.23],.055,dark);
    boxVertices([s*.98,-.26,-.29],[.09,.09,1.46],gold,out);
  }
  shell(out,[[1.25,.24,.43,.40],[2.7,.39,.30,.27],[4.85,.64,.13,.16],[4.9,.64,.01,.01]],false,tint);
  for(const s of [-1,1]) {
    boxVertices([s*.52,.83,.42],[.58,.55,1.8],tint,out);
    boxVertices([s*.52,.83,1.33],[.38,.30,.08],dark,out);
    boxVertices([s*1.05,-.20,.22],[.82,.12,1.52],tint,out);
    rod(out,[s*1.45,-.28,-.85],[s*1.45,-.28,1.04],.22,dark);
    for(const z of [-.93,.82]) rod(out,[s*.64,-.46,z],[s*1.03,-.99,z],.065,dark);
    rod(out,[s*1.03,-.99,-1.6],[s*1.03,-.99,1.65],.085,light);
    rod(out,[s*1.03,-.99,-1.6],[s*1.03,-.75,-1.97],.085,light);
    boxVertices([s*1.46,-.11,.8],[.12,.11,.25],s<0?[1,.15,.08]:[.26,1,.65],out);
    boxVertices([s*.96,.12,.1],[.1,.16,.9],gold,out);
    boxVertices([s*1.2,.65,3.65],[1.05,.1,.42],tint,out);
  }
  facet(out,[0,.6,3.92],[0,2.15,4.85],[0,.62,4.85],gold);
  rod(out,[-.26,1.45,4.66],[.26,1.45,4.66],.095,dark);
  rod(out,[.29,.90,4.24],[.29,1.99,5.07],.066,light);
  rod(out,[.29,1.85,4.12],[.29,1.04,5.20],.066,dark);
  rod(out,[0,.6,0],[0,1.53,0],.13,dark);
  return out;
}
export function rotor() {
  const out=[];
  for(const sign of [-1,1]) {
    boxVertices([sign*2,1.52,0],[4,.055,.17],dark,out);
    boxVertices([sign*3.92,1.52,0],[.2,.06,.18],gold,out);
    boxVertices([0,1.52,sign*2],[.17,.055,4],dark,out);
    boxVertices([0,1.52,sign*3.92],[.18,.06,.2],gold,out);
  }
  return out;
}
export function groundUnit(id) {
  const out=[];
  if(id==='aa') {
    boxVertices([0,-1.45,0],[4.6,1.25,4.2],dark,out);
    boxVertices([0,-.36,0],[3.6,1.12,2.9],sand,out);
    boxVertices([0,.44,0],[2.3,.7,2.15],red,out);
    for(const s of [-1,1]) rod(out,[s*.7,.5,0],[s*.7,1.48,2.6],.22,dark);
    rod(out,[0,.5,-.7],[0,2,-.7],.08,light);
  } else if(id==='scout'){
    shell(out,[[-1.6,-.4,.04,.04],[-.8,-.14,.90,.53],[.65,-.18,1,.48],[1.4,-.35,.3,.20]]);
    for(const sign of [-1,1]){
      boxVertices([sign*1.12,-.55,0],[.45,.47,2.6],dark,out);
      boxVertices([sign*1.12,-.32,-.85],[.45,.09,.48],red,out);
    }
    rod(out,[0,.16,.38],[0,1.15,.38],.11,dark);
    boxVertices([0,1.08,.38],[1.5,.25,.42],gold,out);
  } else {
    boxVertices([0,-.48,0],[4.9,.7,2.6],dark,out);
    boxVertices([1.55,.20,0],[1.5,1.55,2.4],sand,out);
    boxVertices([2.29,.50,0],[.1,.55,2.0],teal,out);
    boxVertices([-.83,.43,0],[2.95,1.65,2.5],red,out);
    for(const x of [-1.6,1.5]) for(const s of [-1,1])
      rod(out,[x,-.9,s*1.05],[x,-.9,s*1.4],.69,rubber);
  }
  return out;
}
