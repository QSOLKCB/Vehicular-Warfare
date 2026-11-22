// All map coordinates and hit tolerances use CSS pixels, independently of backing resolution.
import {EDGE} from '../sim/terrain.js';
import {GATE_RADIUS} from '../sim/combined-world.js';
import {roadCover} from './combined-chart.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function projection(width,height,cx=0,cz=0,zoom=1){
  const scale=Math.min(width,height)*zoom/(2*EDGE);
  return {
    scale,
    screen:(x,z)=>[(x-cx)*scale+width/2,(z-cz)*scale+height/2],
    world:(u,v)=>[(u-width/2)/scale+cx,(v-height/2)/scale+cz]
  };
}
export const callSign={helicopter:'Kestrel',tank:'Basalt',mech:'Kiln',ship:'Tern',relay:'Relay'};

function relief(world){
  const size=576,atlas=document.createElement('canvas');
  atlas.width=atlas.height=size;
  const ctx=atlas.getContext('2d'),pixels=ctx.createImageData(size,size);
  const heights=new Float32Array(size);
  for(let j=0;j<size;j++){
    let left=0;
    for(let i=0;i<size;i++){
      const x=(i+.5)*2*EDGE/size-EDGE,z=(j+.5)*2*EDGE/size-EDGE;
      const {height,normal}=world.field.sample(x,z),h=height-world.water.heightAt(x,z);
      const water=h<0,band=Math.floor(h/(water?2:3));
      const contour=(i && left!==band)||(j && heights[i]!==band);
      let r,g,b;
      if(water){const d=clamp(-h/8,0,1);r=84-48*d;g=137-45*d;b=143-35*d;}
      else{
        const light=normal[0]*12+normal[2]*18;
        r=135+h*.72+light;g=150+h*.32+light;b=115+h*.50+light;
        const road=roadCover(x,z);
        r+=23*road;g+=13*road;b+=15*road;
      }
      const shade=contour?.80:1,k=4*(j*size+i);
      pixels.data[k]=r*shade;pixels.data[k+1]=g*shade;pixels.data[k+2]=b*shade;pixels.data[k+3]=255;
      heights[i]=left=band;
    }
  }
  ctx.putImageData(pixels,0,0);return atlas;
}

const shapes={
  helicopter:[[0,-8],[3,-2],[8,0],[8,2],[2,2],[1,7],[-1,7],[-2,2],[-8,2],[-8,0],[-3,-2]],
  tank:[[-5,-6],[-2,-6],[-2,-9],[1,-9],[1,-6],[5,-6],[5,7],[-5,7]],
  mech:[[0,-7],[4,-3],[8,-4],[6,0],[8,5],[3,4],[0,7],[-3,4],[-8,5],[-6,0],[-8,-4],[-4,-3]],
  ship:[[0,-9],[5,-2],[4,7],[-4,7],[-5,-2]],relay:[[0,-8],[8,0],[0,8],[-8,0]]
};

export class StrategicMap{
  constructor(canvas,w){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.atlas=relief(w);
    this.cx=-6;this.cz=0;this.zoom=2.2;
  }
  transform(){
    return projection(this.canvas.clientWidth||1,this.canvas.clientHeight||1,this.cx,this.cz,this.zoom);
  }
  pan(dx,dy){
    const {scale}=this.transform();
    this.cx=clamp(this.cx-dx/scale,-EDGE,EDGE);this.cz=clamp(this.cz-dy/scale,-EDGE,EDGE);
  }
  zoomAt(u,v,factor){
    const before=this.transform().world(u,v);
    this.zoom=clamp(this.zoom*factor,.8,8);
    const after=this.transform().world(u,v);
    this.cx=clamp(this.cx+before[0]-after[0],-EDGE,EDGE);this.cz=clamp(this.cz+before[1]-after[1],-EDGE,EDGE);
  }
  hit(actors,u,v){
    const tr=this.transform();let best=null,limit=14;
    for(const a of actors){
      const [x,y]=tr.screen(a.p[0],a.p[2]),d=Math.hypot(u-x,v-y);
      if(d<limit){best=a;limit=d;}
    }
    return best;
  }
  draw(w,visible,selected,box,retro){
    const c=this.canvas,ctx=this.ctx,W=c.clientWidth,H=c.clientHeight;
    if(!W||!H)return;
    const dpr=Math.min(window.devicePixelRatio||1,2,2560/W,2048/H);
    const rw=Math.max(1,Math.round(W*dpr)),rh=Math.max(1,Math.round(H*dpr));
    if(c.width!==rw || c.height!==rh){c.width=rw;c.height=rh;}
    ctx.setTransform(rw/W,0,0,rh/H,0,0);
    const {screen,scale}=this.transform(),[left,top]=screen(-EDGE,-EDGE),side=2*EDGE*scale;
    ctx.fillStyle='#182e34';ctx.fillRect(0,0,W,H);
    ctx.imageSmoothingEnabled=!retro;
    ctx.drawImage(this.atlas,left,top,side,side);
    if(retro){ctx.fillStyle='#072e3d65';ctx.fillRect(left,top,side,side);}
    ctx.save();ctx.beginPath();ctx.rect(left,top,side,side);ctx.clip();
    ctx.lineWidth=1;ctx.strokeStyle='#193d3b44';ctx.fillStyle='#f5f5dcbb';ctx.font='11px monospace';
    for(let n=-120;n<=120;n+=24){
      const [x,y]=screen(n,n);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+side);ctx.moveTo(left,y);ctx.lineTo(left+side,y);ctx.stroke();
      ctx.fillText(String(n),x+3,Math.max(12,top+12));
    }
    ctx.font='italic 13px Georgia,serif';ctx.textAlign='center';ctx.fillStyle='#e6eee0b5';
    for(const [name,x,z] of [['Western ridge',-66,1],['Coastal channel',31,-51]]){
      const [u,v]=screen(x,z);ctx.fillText(name,u,v);
    }
    ctx.textAlign='left';
    const [gx,gy]=screen(w.beacon[0],w.beacon[2]);
    ctx.strokeStyle='#f5ffc7';ctx.setLineDash([5,4]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(gx,gy,GATE_RADIUS*scale,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.font='bold 11px monospace';ctx.strokeStyle='#233e35';ctx.lineWidth=3;
    ctx.strokeText('CROSSING',gx+GATE_RADIUS*scale+4,gy);ctx.fillText('CROSSING',gx+GATE_RADIUS*scale+4,gy);
    for(const a of visible){
      if(a.faction!=='cobalt')continue;
      let [px,py]=screen(a.p[0],a.p[2]);
      for(const order of w.units[a.id].queue){
        let goal=order;
        if(order.type==='ATTACK'){
          const target=visible.find(v=>v.id===order.target);
          if(!target)continue;
          goal={x:target.p[0],z:target.p[2]};
        }
        if(!Number.isFinite(goal.x))continue;
        const route=order.route??[[goal.x,goal.z]];
        ctx.lineWidth=1.5;ctx.strokeStyle=selected.has(a.id)?'#edffd4':'#d8f4d599';
        ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(px,py);
        for(const point of route){[px,py]=screen(...point);ctx.lineTo(px,py);}
        ctx.stroke();ctx.setLineDash([]);ctx.strokeRect(px-3,py-3,6,6);
      }
    }
    for(const a of visible){
      const [x,y]=screen(a.p[0],a.p[2]),ally=a.faction==='cobalt';
      ctx.save();ctx.translate(x,y);
      if(selected.has(a.id)){ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.strokeStyle='#f4ffcb';ctx.lineWidth=2;ctx.stroke();}
      ctx.rotate(a.yaw);ctx.beginPath();
      shapes[a.kind].forEach(([dx,dy],i)=>i?ctx.lineTo(dx,dy):ctx.moveTo(dx,dy));ctx.closePath();
      ctx.fillStyle=ally?(retro?'#5afad2':'#adffe0'):(retro?'#ffad52':'#ff965f');ctx.fill();ctx.strokeStyle='#183636';ctx.lineWidth=2;ctx.stroke();ctx.restore();
      if(ally && scale>=3.5){
        // Separate adjacent deployment labels on alternating rows.
        const row=['tank','ship'].includes(a.kind)?31:20;
        ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.lineWidth=3;
        ctx.strokeStyle='#1f3838';ctx.fillStyle='#e2f8e1';
        ctx.strokeText(callSign[a.kind].toUpperCase(),x,y+row);ctx.fillText(callSign[a.kind].toUpperCase(),x,y+row);
        ctx.textAlign='left';
      }
    }
    if(box){ctx.fillStyle='#b5fbd12a';ctx.strokeStyle='#efffd6';ctx.lineWidth=1;ctx.fillRect(...box);ctx.strokeRect(...box);}
    ctx.restore();
    ctx.font='bold 12px monospace';ctx.fillStyle='#112b2bec';ctx.fillRect(12,14,94,30);
    ctx.fillStyle='#e8f0db';ctx.fillText('↑ N',18,33);const metres=scale>4?5:10;
    ctx.fillRect(51,36,metres*scale,1);ctx.fillText(metres+' m',51,32);
  }
}
