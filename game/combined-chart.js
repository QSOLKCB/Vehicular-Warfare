// North is -Z. Cache the terrain once and pan the chart as the player leaves the central lanes.
import {clamp} from '../vendor/vanillajs/modules/math/index.js';
import {EDGE} from '../sim/terrain.js';
import {GATE_RADIUS} from '../sim/combined-world.js';

// Packed gravel follows the western bank, with a branch to the relay apron.
export function roadCover(x,z){
  if(z< -65 || z>66 || x< -28 || x>0)return 0;
  const route=-18+2.8*Math.sin(z/23);
  const spur=x>route && x< -3?Math.abs(z+28):Infinity;
  const distance=Math.min(Math.abs(x-route),spur);
  return clamp((3.9-distance)/2.1,0,1)*clamp((65-Math.abs(z))/6,0,1);
}

export const chartScale=1.45;
export function chartCenter(player,width,height){
  const mw=width/chartScale,mh=height/chartScale;
  return {cx:clamp(player.p[0],-EDGE+mw/2,EDGE-mw/2),
    cz:clamp(player.p[2]-mh*.30,-EDGE+mh/2,EDGE-mh/2)};
}

export class EstuaryChart{
  constructor(canvas,w){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    const paper=this.paper=document.createElement('canvas');
    paper.width=paper.height=2*EDGE;
    const ctx=paper.getContext('2d');
    for(let z=0;z<paper.height;z+=2)for(let x=0;x<paper.width;x+=2){
      const wx=x-EDGE,wz=z-EDGE,h=w.field.sample(wx,wz).height-w.water.heightAt(wx,wz);
      ctx.fillStyle=h< -3?'#204e57':h<0?'#438181':h<1?'#b7a889':h<3?'#70846c':h<8?'#5a705b':h<16?'#475e52':'#89927d';
      if(h>0 && roadCover(wx,wz)>.4)ctx.fillStyle='#a99b7f';
      ctx.fillRect(x,z,2,2);
    }
    ctx.beginPath();ctx.strokeStyle='#b4d0bd40';
    for(let n=EDGE%20;n<2*EDGE;n+=20){
      ctx.moveTo(n,0);ctx.lineTo(n,paper.height);ctx.moveTo(0,n);ctx.lineTo(paper.width,n);
    }
    ctx.stroke();
  }
  draw(w,sight){
    const {width,height}=this.canvas,ctx=this.ctx,scale=chartScale;
    const mw=width/scale,mh=height/scale;
    const {cx,cz}=chartCenter(w.player,width,height);
    const u=x=>(x-cx)*scale+width/2,v=z=>(z-cz)*scale+height/2;
    ctx.drawImage(this.paper,cx+EDGE-mw/2,cz+EDGE-mh/2,mw,mh,0,0,width,height);
    const gate=w.beacon,side=GATE_RADIUS*scale;
    ctx.beginPath();ctx.arc(u(gate[0]),v(gate[2]),side,0,Math.PI*2);
    ctx.strokeStyle='#b5ffd5';ctx.setLineDash([3,2]);ctx.stroke();ctx.setLineDash([]);
    for(const a of w.actors){
      if(!a.hp || a===w.player || (a.faction!=='cobalt' && a.kind!=='relay' && !sight.visible.includes(a.id)))continue;
      const x=u(a.p[0]),y=v(a.p[2]);
      ctx.beginPath();
      if(a.faction==='cobalt'){
        ctx.arc(x,y,2.65,0,Math.PI*2);ctx.fillStyle='#8af0db';
      }else{
        const r=a.kind==='relay'?5:3;
        ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fillStyle='#ffa06a';
      }
      ctx.fill();ctx.strokeStyle='#20383a';ctx.stroke();
      if(a.kind==='relay'){
        ctx.fillStyle='#1d302c';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('R',x,y+3);
      }
    }
    ctx.save();ctx.translate(u(w.player.p[0]),v(w.player.p[2]));ctx.rotate(w.player.yaw);
    ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();
    ctx.fillStyle='#fff8d8';ctx.fill();ctx.strokeStyle='#12353b';ctx.stroke();ctx.restore();
  }
}
