// The packed chart has six right-hand padding pixels. The public map stays 202×152.
import {BitplaneSurface,BLIT_COOKIE_CUT} from '../vendor/vanillajs/modules/blit/index.js';
import {CopperDisplay,createCopperProgram} from '../vendor/vanillajs/modules/copper/index.js';
import {EDGE} from '../sim/terrain.js';
import {GATE_RADIUS} from '../sim/combined-world.js';
import {chartScale,chartCenter,roadCover} from './combined-chart.js';

export const chartWidth=202,chartHeight=152,packedWidth=208;

// Terrain, ink and symbols retain their roles across the four crew palettes.
const base=['0d1c24','163947','24535a','ac9d71','4d6a59','405944','354d43','788264',
  'b39a65','7a937d','2f6572','a4fce7','ff966a','f7db8d','ffffdf','122326'];
const crewColors={
  helicopter:['123b44','255648','547454','85e5bf'],
  tank:['25382e','3e5341','67704a','d8e59f'],
  mech:['263447','3b5064','56627b','aeebff'],
  ship:['123348','1b5368','415f60','94eff4']
};
function rgba(hex){return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).concat(255);}

export function chartProgram(kind){
  const palette=base.map(rgba),tints=crewColors[kind];
  [1,2,4,11].forEach((slot,i)=>{palette[slot]=rgba(tints[i]);});
  const dim=color=>color.map((v,k)=>k===3?v:Math.round(v*.78));
  const commands=[];
  // Two terrain register changes every fourth line, then restore their colours.
  // Symbols are outside those registers and keep full contrast on every row.
  for(let line=3;line<chartHeight;line+=4){
    for(const index of [1,4])commands.push({op:'palette',line,index,color:dim(palette[index])});
    if(line+1<chartHeight)for(const index of [1,4])commands.push({op:'palette',line:line+1,index,color:palette[index]});
  }
  return createCopperProgram({height:chartHeight,palette,commands});
}

function terrainAtlas(w){
  const size=EDGE;  // One source pixel for each two game metres.
  const paper=new BitplaneSurface(size,size,4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const wx=2*x-EDGE,wz=2*y-EDGE,h=w.field.sample(wx,wz).height-w.water.heightAt(wx,wz);
    let index=h< -3?1:h<0?2:h<1?3:h<3?4:h<8?5:h<16?6:7;
    if(h>0 && roadCover(wx,wz)>.4)index=8;
    else if(h< -1 && (x+2*y)%23===0)index=10;
    if((wx%20===0 && Math.abs(wz%20)<=2) || (wz%20===0 && Math.abs(wx%20)<=2))index=9;
    paper.setPixel(x,y,index);
  }
  return paper.indices(); // One owned copy per chart; no per-frame atlas conversion.
}

// Colour and shape come from separate packed sources; soft-transparent gaps
// are a zero mask bit. The silhouette always has an opaque, dark outline.
function glyph(radius,color,inside){
  const size=radius*2+1,stride=Math.ceil(size/16)*16;
  const image=new BitplaneSurface(stride,size,4),mask=new BitplaneSurface(stride,size,1);
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
    const fill=inside(x,y);
    if(!fill && !inside(x-1,y) && !inside(x+1,y) && !inside(x,y-1) && !inside(x,y+1))continue;
    image.setPixel(x+radius,y+radius,fill?color:15);
    mask.setPixel(x+radius,y+radius,1);
  }
  return {image,mask,size,radius};
}

function symbols(){
  const friend=glyph(4,11,(x,y)=>x*x+y*y<=6);
  const foe=glyph(4,12,(x,y)=>Math.abs(x)+Math.abs(y)<=3);
  const relay=glyph(6,12,(x,y)=>Math.abs(x)+Math.abs(y)<=5 && (Math.abs(x)+Math.abs(y)>=3 || !x));
  const ring=GATE_RADIUS*chartScale;
  const gate=glyph(Math.ceil(ring+1),13,(x,y)=>Math.abs(Math.hypot(x,y)-ring)<.8 && (Math.abs(x)>3 || Math.abs(x)<1));
  const arrows=[];
  for(let bin=0;bin<16;bin++){
    const angle=bin*Math.PI/8,c=Math.cos(angle),s=Math.sin(angle);
    arrows.push(glyph(7,14,(x,y)=>{
      const across=x*c+y*s,forward=x*s-y*c;
      return forward>=-3.8 && forward<=5.7 && Math.abs(across)<=(6-forward)*.44 && (forward>-1 || Math.abs(across)>1);
    }));
  }
  return {friend,foe,relay,gate,arrows};
}

export class RetroChart{
  constructor(w){
    this.terrain=terrainAtlas(w);
    this.overlay=new BitplaneSurface(packedWidth,chartHeight,4);
    this.indexed=new Uint8Array(packedWidth*chartHeight);
    this.columns=new Uint8Array(chartWidth);
    this.display=new CopperDisplay(packedWidth,chartHeight);
    this.program=chartProgram(w.selection);
    this.symbols=symbols();
    const {friend,foe,relay,gate,arrows}=this.symbols;
    const glyphBytes=[friend,foe,relay,gate,...arrows].reduce((sum,g)=>sum+g.image.retainedBytes+g.mask.retainedBytes,0);
    this.retainedBytes=this.terrain.byteLength+this.overlay.retainedBytes+this.indexed.byteLength+
      this.columns.byteLength+this.display.retainedBytes+glyphBytes;
  }
  stamp(g,x,y){
    const dx=x-g.radius,dy=y-g.radius;
    if(dx>=chartWidth || dy>=chartHeight || dx+g.size<=0 || dy+g.size<=0)return;
    this.overlay.blit(g.image,{mask:g.mask,minterm:BLIT_COOKIE_CUT,dx,dy,width:g.size,height:g.size});
    const right=Math.min(chartWidth,dx+g.size),end=Math.min(chartHeight,dy+g.size);
    for(let row=Math.max(0,dy);row<end;row++)for(let col=Math.max(0,dx);col<right;col++){
      const index=this.overlay.getPixel(col,row);
      if(index)this.indexed[row*packedWidth+col]=index;
    }
  }
  draw(w,sight){
    const {cx,cz}=chartCenter(w.player,chartWidth,chartHeight);
    for(let x=0;x<chartWidth;x++){
      this.columns[x]=Math.floor((cx+EDGE+(x+.5-chartWidth/2)/chartScale)/2);
    }
    for(let y=0;y<chartHeight;y++){
      const src=EDGE*Math.floor((cz+EDGE+(y+.5-chartHeight/2)/chartScale)/2);
      for(let x=0,dst=y*packedWidth;x<chartWidth;x++)this.indexed[dst+x]=this.terrain[src+this.columns[x]];
    }
    this.overlay.clear();
    const u=x=>Math.round((x-cx)*chartScale+chartWidth/2),v=z=>Math.round((z-cz)*chartScale+chartHeight/2);
    this.stamp(this.symbols.gate,u(w.beacon[0]),v(w.beacon[2]));
    for(const actor of w.actors){
      const ally=actor.faction===w.player.faction;
      if(actor===w.player || (!ally && !sight.visible.includes(actor.id)) || !actor.hp)continue;
      const mark=ally?this.symbols.friend:actor.kind==='relay'?this.symbols.relay:this.symbols.foe;
      this.stamp(mark,u(actor.p[0]),v(actor.p[2]));
    }
    const heading=(Math.round(w.player.yaw*8/Math.PI)%16+16)%16;
    this.stamp(this.symbols.arrows[heading],u(w.player.p[0]),v(w.player.p[2]));
    return this.display.render(this.indexed,this.program);
  }
}
