// Original geometry. The sea, shore, vessels, mount and chart read the same world as play.
import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,cross,dot,mix,multiplyMatrices,normalize,perspective,rotate,scale,
  seededRandom,subtract,viewMatrix} from '../vendor/vanillajs/modules/math/index.js';
import {EDGE} from '../sim/terrain.js';
import {vesselBasis} from '../sim/vessel.js';
import {BEACON_RADIUS,navalGun,sightNaval} from '../sim/naval-world.js';
import {Model,look} from './model-view.js';
import {facet} from './models.js';
import {skyMesh} from './scenery.js';

const ink=[.105,.16,.19],steel=[.48,.59,.62],ivory=[.88,.88,.77],glass=[.12,.33,.39];
const patrol=[.80,.32,.20],tern=[.18,.46,.49],mint=[.45,.98,.77],lamp=[1,.68,.31];
const sea=[.10,.39,.47],shallows=[.36,.68,.64];
const quad=(out,a,b,c,d,tint,light=1)=>{facet(out,a,b,c,tint,light);facet(out,a,c,d,tint,light);};

// Successive cross sections of a broad stern, stepped foredeck and fine bow.
// Model space is +X starboard, +Y up, -Z ahead. The keel is 1 m below the origin.
export function cutter(tint){
  const out=[],rings=[];
  for(const [z,width,deck] of [[3.95,1.17,.53],[2.8,1.53,.57],[-1.35,1.58,.65],[-2.95,.98,.79],[-4,.055,.95]]){
    rings.push([[-width,deck,z],[-width*.98,.07,z],[-width*.92,-.1,z],[-width*.67,-.7,z],
      [0,-1,z],[width*.67,-.7,z],[width*.92,-.1,z],[width*.98,.07,z],[width,deck,z]]);
  }
  for(let j=1;j<rings.length;j++){
    const a=rings[j-1],b=rings[j];
    for(let i=0;i<8;i++){
      const k=Math.min(i,7-i),col=[tint,ivory,ink,steel][k];
      quad(out,a[i],b[i],b[i+1],a[i+1],col,.79+.10*(i>3)+.08*(j%2));
    }
    quad(out,a[0],a[8],b[8],b[0],steel,.95);
  }
  for(const ring of [rings[0],rings.at(-1)])for(let i=1;i<8;i++)facet(out,ring[0],ring[i],ring[i+1],tint,.66);
  // Cabin, wraparound bridge glass and a funnel aft of the rotating mount.
  boxVertices([0,.93,.75],[1.78,.72,2.48],ivory,out);
  const corners=(w,y,front,back)=>[[-w,y,front],[w,y,front],[w,y,back],[-w,y,back]];
  const sill=corners(.87,1.30,-.28,1.43),roof=corners(.71,1.81,-.13,1.32);
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    quad(out,sill[i],sill[j],roof[j],roof[i],glass,.86+.12*i);
    for(const t of [.035,.52]){
      quad(out,mix(sill[i],sill[j],t),mix(sill[i],sill[j],t+.035),
        mix(roof[i],roof[j],t+.035),mix(roof[i],roof[j],t),ivory);
    }
  }
  boxVertices([0,1.84,.64],[1.78,.11,1.79],ivory,out);
  boxVertices([0,1.33,1.91],[.59,.93,.70],ink,out);
  boxVertices([0,1.72,1.91],[.61,.22,.72],tint,out);
  boxVertices([0,2.38,.77],[.085,1.05,.085],steel,out);
  boxVertices([0,2.66,.77],[.80,.064,.09],ink,out);
  boxVertices([.08,2.94,.75],[.21,.16,.15],lamp,out);
  for(const side of [-1,1]){
    for(const z of [-1.15,0,1.31,2.57])boxVertices([side*1.37,.86,z],[.048,.47,.048],ivory,out);
    boxVertices([side*1.37,1.08,.71],[.048,.055,3.77],ivory,out);
    boxVertices([side*1.08,.74,2.57],[.42,.25,.70],ink,out);
    boxVertices([side*.85,1.82,.28],[.12,.12,.14],side<0?patrol:mint,out);
    const ring=(i,r)=>[side*.91,1.01+r*Math.cos(i*Math.PI/4),.60+r*Math.sin(i*Math.PI/4)];
    for(let i=0;i<8;i++)quad(out,ring(i,.245),ring(i+1,.245),ring(i+1,.13),ring(i,.13),i%2?lamp:ivory);
  }
  boxVertices([0,.68,2.95],[1.05,.19,.75],tint,out);
  for(let i=0;i<5;i++)boxVertices([-.41+.20*i,.78,2.95],[.045,.033,.61],steel,out);
  boxVertices([0,.84,-1.8],[.68,.42,.61],ink,out);
  return out;
}

// Gun geometry is unit length along local -Z, stretched to the authoritative muzzle.
export function deckGun(){
  const out=[];
  boxVertices([0,-.24,-.03],[.75,.59,.29],steel,out);
  boxVertices([0,-.08,-.08],[.68,.33,.26],ivory,out);
  boxVertices([0,0,-.50],[.17,.17,.90],ink,out);
  boxVertices([0,0,-.91],[.22,.22,.18],steel,out);
  return out;
}
export function stationBody(shore){
  const out=[],[x,y,z]=shore.half;
  boxVertices([0,-y*.54,0],[x*1.9,y*.92,z*1.8],steel,out);
  boxVertices([0,y*.03,0],[x*1.48,y*.62,z*1.35],ivory,out);
  boxVertices([0,y*.29,0],[x*1.55,y*.13,z*1.41],patrol,out);
  for(const s of [-1,1])boxVertices([s*x*.44,y*.62,0],[x*.12,y*.60,z*.14],ink,out);
  boxVertices([0,y*.85,0],[x*1.3,y*.20,z*.27],patrol,out);
  boxVertices([0,y*.85,z*.16],[x*.87,y*.13,z*.06],lamp,out);
  return out;
}

export function coastMeshes(w){
  const land=[],water=[],rng=seededRandom(w.seed+41),light=normalize([-.46,.73,-.49]);
  const {field}=w,level=w.water.level;
  for(let iz=0;iz<field.cellsZ;iz++)for(let ix=0;ix<field.cellsX;ix++){
    for(const [a,b,c] of field.triangleAt(ix,iz)){
      if(Math.max(a[1],b[1],c[1])>=level){
        const n=normalize(cross(subtract(b,a),subtract(c,a))),h=(a[1]+b[1]+c[1])/3-level;
        const tint=h<.9?[.79,.69,.52]:n[1]<.83?[.46,.42,.38]:h>4?[.40,.48,.36]:[.56,.58,.42];
        facet(land,a,b,c,tint,.68+.31*Math.max(0,dot(n,light))+rng()*.04);
      }
      if(Math.min(a[1],b[1],c[1])<=level){
        for(const [x,y,z] of [a,b,c]){
          const t=clamp(1-(level-y)/8,0,1),col=mix(sea,shallows,t);
          const tone=.96+.026*Math.sin(.39*z+.08*x)+.015*Math.cos(.82*z-.11*x);
          water.push(x,w.water.heightAt(x,z),z,col[0]*tone,col[1]*tone,col[2]*tone);
        }
      }
    }
  }
  // The far sea continues the horizon beyond the playable chart.
  const ring=r=>[[-r,level,-r],[r,level,-r],[r,level,r],[-r,level,r]];
  const inner=ring(EDGE),outer=ring(640);
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(water,inner[i],inner[j],outer[j],outer[i],sea,.96);}
  // Small wind streaks are paint on the flat sea. Depth testing clips them at islands.
  for(let i=0;i<1700;i++){
    const x=(rng()-.5)*EDGE*2,z=(rng()-.5)*EDGE*2;
    const h=w.water.heightAt(x,z);
    if(field.sample(x,z).height>h-.34)continue;
    const width=.2+rng()*.9,s=rng()*.045+.025;
    facet(water,[x-width,h+.015,z+s],[x+width,h+.015,z],[x,h+.015,z-s],[.31,.57,.60],.94);
  }
  return {land,water,sky:skyMesh(false,rng)};
}
function harbour(w){
  const scene=coastMeshes(w),{land}=scene;
  const [bx,,bz]=w.beacon;
  for(const side of [-1,1]){
    const x=bx+side*BEACON_RADIUS,y=w.water.heightAt(x,bz);
    boxVertices([x,y+.12,bz],[.78,.61,.78],ink,land);
    boxVertices([x,y+.62,bz],[.47,.62,.47],mint,land);
    boxVertices([x,y+1.24,bz],[.11,.67,.11],ivory,land);
    boxVertices([x,y+1.62,bz],[.28,.18,.28],mint,land);
  }
  return scene;
}

function mapSymbol(ctx,x,z,radius,color,filled){
  ctx.beginPath();ctx.moveTo(x,z-radius);ctx.lineTo(x+radius,z);
  ctx.lineTo(x,z+radius);ctx.lineTo(x-radius,z);ctx.closePath();
  if(filled){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}
}

// Two spreading foam ribbons lie on the accepted surface. Speed changes their
// length and rudder motion curves the trace gently aft. They have no collision.
const foamCorners=[[0,0],[0,1],[.97,1],[0,0],[.97,1],[.97,0]];
const froth=[.65,.86,.82];
export function foamRibbon(out,cursor,w,ship){
  if(!ship.hp || ship.grounded || Math.abs(ship.speed)<.3)return cursor;
  const {right,forward}=vesselBasis(ship),sign=Math.sign(ship.speed);
  const distance=Math.min(12,Math.abs(ship.speed)*1.6);
  for(const side of [-1,1])for(let i=0;i<8;i++){
    for(const [fraction,edge] of foamCorners){
      const t=(i+fraction)/8;
      const width=side*(1.12+2.3*t+(1-t)*(.12*Math.sin(17*t-w.tick/13)+.30*edge));
      const trail=-sign*(3.5+t*distance),bend=ship.yawRate*t*t*distance*.45;
      const x=ship.p[0]+right[0]*(width+bend)+forward[0]*trail;
      const z=ship.p[2]+right[2]*(width+bend)+forward[2]*trail;
      out[cursor++]=x;out[cursor++]=w.water.heightAt(x,z)+.025;out[cursor++]=z;
      for(let c=0;c<3;c++)out[cursor++]=froth[c]+t*(sea[c]-froth[c]);
    }
  }
  return cursor;
}
class ChannelChart{
  constructor(w){
    this.canvas=document.getElementById('seaMap');this.ctx=this.canvas.getContext('2d');
    const {width,height}=this.canvas,back=document.createElement('canvas');
    back.width=width;back.height=height;this.back=back;
    const ctx=back.getContext('2d');
    this.scale=Math.min(width,height)/(2*EDGE);
    for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
      const wx=(x-width*.5)/this.scale,wz=(y-height*.5)/this.scale;
      let color='#123441';
      if(Math.abs(wx)<=EDGE && Math.abs(wz)<=EDGE){
        const depth=w.water.heightAt(wx,wz)-w.field.sample(wx,wz).height;
        color=depth<=0?'#899282':depth<1?'#77aaa3':depth<4?'#376769':'#204953';
      }
      ctx.fillStyle=color;ctx.fillRect(x,y,2,2);
    }
    ctx.strokeStyle='#c4eee023';ctx.beginPath();
    for(let k=-120;k<=120;k+=40){
      const x=width*.5+k*this.scale,y=height*.5+k*this.scale;
      ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.moveTo(0,y);ctx.lineTo(width,y);
    }
    ctx.stroke();
  }
  draw(w,sight){
    const ctx=this.ctx,{width,height}=this.canvas;
    const at=([x,,z])=>[width*.5+x*this.scale,height*.5+z*this.scale];
    ctx.drawImage(this.back,0,0);
    mapSymbol(ctx,...at(w.beacon),3.5,'#a7ffe1',false);
    if(w.shore.hp)mapSymbol(ctx,...at(w.shore.p),3,'#ffb087',true);
    if(w.enemy.hp && sight.visible)mapSymbol(ctx,...at(w.enemy.p),2.5,'#ffb087',true);
    ctx.save();ctx.translate(...at(w.player.p));ctx.rotate(w.player.yaw);
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3,4);ctx.lineTo(0,2);ctx.lineTo(-3,4);ctx.closePath();
    ctx.fillStyle='#fff6de';ctx.fill();ctx.strokeStyle='#16333b';ctx.stroke();ctx.restore();
  }
}

export class NavalView{
  constructor(canvas,w){
    const r=this.r=new Renderer(canvas);
    try{
      const scene=harbour(w);
      this.land=r.mesh(scene.land);this.sea=r.mesh(scene.water);this.sky=r.mesh(scene.sky);
      this.waterLevel=scene.water[1];this.chart=new ChannelChart(w);
      this.hulls={player:new Model(r,cutter(tern)),enemy:new Model(r,cutter(patrol))};
      this.gun=new Model(r,deckGun());this.station=new Model(r,stationBody(w.shore));
      this.effects=r.mesh([]);this.stream=new BoxVertexStream(96);
      this.foam=r.mesh([]);this.foamData=new Float32Array(2*2*8*6*6);
      this.bytes=24*(this.land.count+this.sea.count+this.sky.count)+this.stream.capacityBoxes*216*4+this.foamData.byteLength;
      for(const model of [this.hulls.player,this.hulls.enemy,this.gun,this.station])
        this.bytes+=model.src.byteLength+model.data.byteLength;
    }catch(error){r.dispose();throw error;}
  }
  draw(w,mode){
    const r=this.r,gl=r.gl,p=w.player,mount=navalGun(p),forward=[Math.sin(p.yaw),0,-Math.cos(p.yaw)];
    const right=[Math.cos(p.yaw),0,Math.sin(p.yaw)];
    let eye,focus;
    if(mode==='briefing'){
      eye=add(p.p,[10.4,3.7,8.2]);focus=add(p.p,[-2.4,.55,2.7]);
    }else if(mode==='sight'){
      eye=mount.muzzle;focus=add(eye,mount.direction);
    }else{
      eye=add(add(p.p,scale(forward,-14.8)),scale(right,3.7));eye[1]+=4.2;
      for(const i of [0,2])eye[i]=clamp(eye[i],-EDGE,EDGE);
      eye[1]=Math.max(eye[1],w.field.sample(eye[0],eye[2]).height+.8);
      focus=add(p.p,scale(forward,8));focus[1]+=.28;
    }
    const camera=look(subtract(focus,eye)),fov=mode==='sight'?.60:mode==='briefing'?.77:.86;
    r.begin([0,0,0],camera,{fov,fog:0});r.draw(this.sky);gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect=r.canvas.width/r.canvas.height;
    gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,aspect),viewMatrix(eye,camera)));
    gl.uniform1f(r.fog,.0012);r.draw(this.sea);r.draw(this.land);
    let draws=3,vertices=this.sky.count+this.sea.count+this.land.count;
    let end=foamRibbon(this.foamData,0,w,p);
    end=foamRibbon(this.foamData,end,w,w.enemy);
    if(end){r.update(this.foam,this.foamData.subarray(0,end));r.draw(this.foam);vertices+=this.foam.count;draws++;}
    if(w.shore.hp){
      this.station.drawBasis(r,w.shore.p,[1,0,0],[0,1,0],[0,0,1]);
      draws++;vertices+=this.station.mesh.count;
    }
    for(const actor of [p,w.enemy]){
      if(!actor.hp || (actor===p && mode==='sight'))continue;
      const basis=vesselBasis(actor),gun=navalGun(actor),hull=this.hulls[actor.id];
      hull.drawBasis(r,actor.p,basis.right,basis.up,scale(basis.forward,-1));
      const barrel=look(gun.direction);
      this.gun.drawBasis(r,gun.pivot,rotate(barrel,[1,0,0]),rotate(barrel,[0,1,0]),subtract(gun.pivot,gun.muzzle));
      vertices+=hull.mesh.count+this.gun.mesh.count;draws+=2;
    }
    const stream=this.stream.reset();
    for(const shot of w.shots)stream.append(shot.p,[.24,.24,.24],shot.owner==='player'?mint:lamp);
    for(let i=w.events.length-1;i>=0 && stream.boxCount+5<=stream.capacityBoxes;i--){
      const event=w.events[i],age=(w.tick-event.tick)/120;
      if(age>.35)break;
      if(event.type!=='impact')continue;
      const tint=event.target==='water'?ivory:lamp;
      for(let j=0;j<5;j++){
        const a=event.tick+j*1.257,dist=age*3;
        stream.append(add(event.point,[Math.cos(a)*dist,age*(4+j)-age*age*11,Math.sin(a)*dist]),[.12,.16,.12],tint);
      }
    }
    if(stream.boxCount){r.update(this.effects,stream.view());r.draw(this.effects);vertices+=stream.vertexCount;draws++;}
    const sight=sightNaval(w);
    if(mode!=='briefing')this.chart.draw(w,sight);
    const d=subtract(sight.point,eye),depth=dot(d,rotate(camera,[0,0,-1])),f=.5/Math.tan(fov/2);
    const x=.5+dot(d,rotate(camera,[1,0,0]))*f/(depth*aspect),y=.5-dot(d,rotate(camera,[0,1,0]))*f/depth;
    return {x,y,sight,aimVisible:sight.clear && depth>.1 && x>=0 && x<=1 && y>=0 && y<=1,
      draws,vertices,width:r.canvas.width,height:r.canvas.height,geometryBytes:this.bytes,waterLevel:this.waterLevel};
  }
  dispose(){this.r.dispose();}
}
