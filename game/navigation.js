import {enemyIds,zone,zoneRadius} from '../sim/missions.js';

// North-up cockpit instrument. Only hostiles with current sight appear.
export function drawNavigation(canvas,w){
  const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height;
  const cx=width/2,cy=height*.65,scale=.95,p=w.player;
  const x=v=>cx+(v-p.p[0])*scale,z=v=>cy+(v-p.p[2])*scale;
  ctx.fillStyle='#172827';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#37514a';ctx.lineWidth=1;ctx.beginPath();
  for(let gx=Math.floor((p.p[0]-width)/25)*25;gx<p.p[0]+width;gx+=25){
    ctx.moveTo(x(gx),0);ctx.lineTo(x(gx),height);
  }
  for(let gz=Math.floor((p.p[2]-height)/25)*25;gz<p.p[2]+height;gz+=25){
    ctx.moveTo(0,z(gz));ctx.lineTo(width,z(gz));
  }
  ctx.stroke();
  const site=zone(w);
  if(site){
    const bx=x(site[1]),bz=z(site[2]);
    ctx.strokeStyle='#83f3cd';ctx.setLineDash([3,5]);
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(bx,bz);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(bx,bz,zoneRadius*scale,0,Math.PI*2);ctx.stroke();
  }
  ctx.fillStyle='#ff9466';
  for(const id of enemyIds(w)){
    const e=w[id];if(e.hp && e.visible)ctx.fillRect(x(e.p[0])-2,z(e.p[2])-2,5,5);
  }
  ctx.save();ctx.translate(cx,cy);ctx.rotate(p.yaw);ctx.fillStyle='#fff1b2';
  ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,5);ctx.lineTo(0,2);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
}
