// An open, two-piece waypoint. The four-sided lip and the separate pointer
// let terrain and passing units show through the gap between them.
import {FxGraphicsPipe} from '../vendor/vanillajs/modules/fx-pipe/index.js';
import {SCALE} from '../vendor/vanillajs/modules/integer-math/index.js';

const faces=4,trianglesPerFace=5;
const vertices=faces*trianglesPerFace*3;
const phaseCount=48,phaseTicks=6;
const q=value=>Math.round(value*SCALE);

// One retained object-space source per active view. Each triangle has nine Q16 coordinates
// and one index into the current gate palette.
function makeSource(){
  const source=new Int32Array(faces*trianglesPerFace*10);
  const corners=[[1,0],[0,1],[-1,0],[0,-1]];
  function corner(side,radius,height){
    const [x,z]=corners[side%faces];
    return [q(x*radius),q(height),q(z*radius)];
  }
  for(let side=0;side<faces;side++){
    const outer=corner(side,1.5,3.75),nextOuter=corner(side+1,1.5,3.75);
    const inner=corner(side,1.0625,3.75),nextInner=corner(side+1,1.0625,3.75);
    const lower=corner(side,1,3.125),nextLower=corner(side+1,1,3.125);
    let at=side*trianglesPerFace*10;
    function triangle(a,b,c,paint){source.set([...a,...b,...c,paint],at);at+=10;}
    triangle(outer,nextOuter,inner,0);
    triangle(inner,nextOuter,nextInner,0);
    triangle(outer,lower,nextOuter,1+side%2);
    triangle(nextOuter,lower,nextLower,1+side%2);
    triangle(corner(side,.875,2.8125),[0,q(1.625),0],corner(side+1,.875,2.8125),1+side%2);
  }
  return source;
}

export class FxGateBeacon{
  constructor(gate){
    this.source=makeSource();
    // Each gate state has a lit lip and two face shades.
    this.colors=new Uint8Array([255,229,167,243,155,69,171,86,45,
      223,255,215,100,239,176,38,151,129,
      223,250,255,111,207,236,56,128,159]);
    this.pipe=new FxGraphicsPipe(vertices);
    this.matrix=new Int32Array([SCALE,0,0,q(gate[0]),0,SCALE,0,q(gate[1]),0,0,SCALE,q(gate[2])]);
    this.phase=-1;
    this.palette=-1;
  }
  get retainedBytes(){
    // Typed-array payloads for this view.
    // The upstream pipe additionally holds a 12-number Float64 scratch array
    // and a 12-number Int32 transform.
    return this.source.byteLength+this.colors.byteLength+
      this.matrix.byteLength+this.pipe.retainedBytes+12*(Float64Array.BYTES_PER_ELEMENT+Int32Array.BYTES_PER_ELEMENT);
  }
  prepare(tick,relayActive,gateCaptured){
    const phase=Math.floor(tick/phaseTicks)%phaseCount;
    const palette=gateCaptured?18:relayActive?0:9;
    if(this.phase===phase && this.palette===palette)return false;
    const angle=phase*Math.PI*2/phaseCount,c=q(Math.cos(angle)),s=q(Math.sin(angle));
    this.matrix[0]=c;this.matrix[2]=s;this.matrix[8]=-s;this.matrix[10]=c;
    this.pipe.reset().setTransform(this.matrix);
    const source=this.source,colors=this.colors;
    for(let i=0;i<source.length;i+=10){
      const color=palette+source[i+9]*3;
      this.pipe.appendTriangleXYZRGB(source[i],source[i+1],source[i+2],
        source[i+3],source[i+4],source[i+5],source[i+6],source[i+7],source[i+8],
        colors[color],colors[color+1],colors[color+2]);
    }
    this.phase=phase;this.palette=palette;
    return true;
  }
}

export function configureFxControl(){
  const control=document.getElementById('fxBeacon');
  try{control.checked=localStorage.getItem('vw:fx-gate')==='on';}catch{}
  control.addEventListener('change',()=>{
    try{localStorage.setItem('vw:fx-gate',control.checked?'on':'off');}catch{}
  });
}
