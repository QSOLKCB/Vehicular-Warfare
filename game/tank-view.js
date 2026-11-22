// Basalt crawler. Geometry uses the hull's local +X/right, +Y/up, -Z/forward.
import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,dot,multiplyMatrices,perspective,rotate,scale,subtract,viewMatrix}
  from '../vendor/vanillajs/modules/math/index.js';
import {tankBasis,tankGun} from '../sim/tracks.js';
import {barrelClear,componentSight,pulseSweep} from '../sim/tank-combat.js';
import {landscape} from './scenery.js';
import {facet} from './models.js';
import {look,Model,turn} from './model-view.js';

const metal=[.17,.21,.22],tread=[.12,.14,.16],brass=[.99,.72,.25],glass=[.23,.8,.79];
const colors={player:[.22,.48,.46],enemy:[.83,.31,.17]};
function taperedShell(out,lower,upper,color){
  const ring=([width,y,length])=>[[-width,y,-length],[width,y,-length],[width,y,length],[-width,y,length]];
  const a=ring(lower),b=ring(upper);
  for(let i=0;i<4;i++){
    const j=(i+1)%4,shade=[.90,.72,.68,.82][i];
    facet(out,a[i],a[j],b[j],color,shade);facet(out,a[i],b[j],b[i],color,shade);
  }
  facet(out,b[0],b[1],b[2],color);facet(out,b[0],b[2],b[3],color);
}
function crawlerParts(renderer,id){
  const hull=[],turret=[],gun=[],color=colors[id];
  taperedShell(hull,[1.05,-.40,1.75],[1.19,.12,2.05],color);
  taperedShell(hull,[1.19,.12,2.05],[.94,.55,1.57],color);
  for(const side of [-1,1]){
    boxVertices([side*1.12,-.26,0],[.46,.70,3.69],tread,hull);
    boxVertices([side*1.12,.13,0],[.53,.15,3.85],color,hull);
    // Cast road-wheel faces and steel grousers are visible from either side.
    for(let wheel=0;wheel<5;wheel++){
      const z=(wheel-2)*.69,x=side*1.36;
      for(let i=0;i<10;i++){
        const rim=k=>[x,-.27+.27*Math.sin(k*Math.PI/5),z+.27*Math.cos(k*Math.PI/5)];
        facet(hull,[x,-.27,z],rim(i),rim(i+1),metal,.9+.14*Math.sin(i));
      }
      boxVertices([side*1.37,-.27,z],[.03,.12,.12],color,hull);
    }
    for(let z=-1.67;z<1.8;z+=.32)boxVertices([side*1.12,-.6,z],[.48,.07,.1],metal,hull);
    boxVertices([side*.76,.43,-1.55],[.28,.12,.12],brass,hull);
  }
  for(let z=.72;z<1.50;z+=.14)boxVertices([0,.565,z],[1.16,.045,.06],metal,hull);
  taperedShell(turret,[.79,-.40,.78],[.84,.02,.81],color);
  taperedShell(turret,[.84,.02,.81],[.63,.35,.64],color);
  boxVertices([.34,.38,.16],[.42,.10,.50],metal,turret);
  boxVertices([-.33,.31,-.54],[.27,.14,.11],glass,turret);
  for(const side of [-1,1])boxVertices([side*.84,-.02,.13],[.028,.15,.46],brass,turret);
  boxVertices([0,0,-1.16],[.23,.24,2.30],metal,gun);
  boxVertices([0,0,-2.47],[.29,.27,.46],color,gun);
  boxVertices([0,0,-2.69],[.14,.15,.035],brass,gun);
  return {hull:new Model(renderer,hull),turret:new Model(renderer,turret),gun:new Model(renderer,gun)};
}

export class TankView {
  constructor(canvas,w){
    const r=this.r=new Renderer(canvas);
    try{
      const {land,sky}=landscape(w);
      // The relay's signal mast marks the far bank.
      const [x,z]=[11,-35],y=w.field.sample(x,z).height;
      for(let i=0;i<8;i++)boxVertices([x,y+.5+i,z],[.52,1,.52],i%2?brass:metal,land);
      boxVertices([x,y+8.4,z],[2.2,.46,.8],metal,land);
      boxVertices([x,y+8.4,z+.41],[1.5,.19,.03],glass,land);
      this.land=r.mesh(land);this.sky=r.mesh(sky);
      this.models={player:crawlerParts(r,'player'),enemy:crawlerParts(r,'enemy')};
      this.stream=new BoxVertexStream(96);this.effects=r.mesh([]);
      this.bytes=(land.length+sky.length)*4+this.stream.capacityBoxes*216*4;
      for(const parts of Object.values(this.models))for(const model of Object.values(parts)){
        this.bytes+=model.src.byteLength+model.data.byteLength;
      }
    }catch(error){r.dispose();throw error;}
  }
  draw(w,mode='chase'){
    const r=this.r,gl=r.gl,p=w.player,gun=tankGun(p);
    const along=[Math.sin(p.turretYaw),0,-Math.cos(p.turretYaw)];
    let eye,focus;
    if(mode==='briefing'){
      eye=add(p.p,[4.8,2.0,-7.0]);focus=add(p.p,[1.7,.63,1.45]);
    }else if(mode==='sight'){
      eye=gun.muzzle;focus=add(eye,gun.direction);
    }else{
      eye=add(p.p,scale(along,-10.3));eye[1]+=3.7;
      for(const axis of [0,2])eye[axis]=clamp(eye[axis],-144,144);
      eye[1]=Math.max(eye[1],w.field.sample(eye[0],eye[2]).height+1.2);
      focus=add(gun.pivot,scale(along,22));focus[1]+=3*Math.sin(p.elevation)-1.0;
    }
    const camera=look(subtract(focus,eye)),fov=mode==='sight'?.59:.86;
    r.begin([0,0,0],camera,{fov,fog:0});r.draw(this.sky);gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect=r.canvas.width/r.canvas.height;
    gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,aspect),viewMatrix(eye,camera)));
    gl.uniform1f(r.fog,.002);r.draw(this.land);
    let draws=2,vertices=this.land.count+this.sky.count;
    for(const actor of [p,w.enemy]){
      if(actor.hp<=0 || actor===p && mode==='sight')continue;
      const {hull,turret,gun:barrel}=this.models[actor.id];
      const {right,up,forward}=tankBasis(actor),mount=tankGun(actor);
      hull.drawBasis(r,actor.p,right,up,scale(forward,-1));
      turret.draw(r,mount.pivot,turn(1,-actor.turretYaw));
      barrel.draw(r,mount.pivot,look(mount.direction));
      draws+=3;vertices+=hull.mesh.count+turret.mesh.count+barrel.mesh.count;
    }
    const s=this.stream.reset();
    for(const shot of w.shots)s.append(shot.p,[.20,.20,.20],shot.owner===p.id?[.32,1,.89]:[1,.40,.18]);
    for(let i=w.events.length-1;i>=0 && s.boxCount+6<=s.capacityBoxes;i--){
      const e=w.events[i],age=(w.tick-e.tick)/120;
      if(age>.35)break;
      if(e.type!=='impact' || !e.point)continue;
      for(let k=0;k<6;k++){
        const a=e.tick+k*2.4;
        s.append(add(e.point,[Math.cos(a)*age*4,age*(4+k)-age*age*12,Math.sin(a)*age*4]),
          [.13,.13,.13],k%2?brass:[.67,.56,.43]);
      }
    }
    if(s.boxCount){r.update(this.effects,s.view());r.draw(this.effects);draws++;vertices+=s.vertexCount;}
    const sight=componentSight(w.field,p,w.enemy),clear=barrelClear(w.field,p);
    const exposure=componentSight(w.field,w.enemy,p);
    const delta=scale(gun.direction,160);
    const hit=clear?pulseSweep(w.field,{p:gun.muzzle,step:delta},w.enemy,w.enemy):null;
    const direction=subtract(hit?.point??add(gun.muzzle,delta),eye);
    const depth=dot(direction,rotate(camera,[0,0,-1])),f=.5/Math.tan(fov/2);
    const x=.5+dot(direction,rotate(camera,[1,0,0]))*f/(depth*aspect);
    const y=.5-dot(direction,rotate(camera,[0,1,0]))*f/depth;
    return {x,y,aimVisible:clear && depth>.1 && x>=0 && x<=1 && y>=0 && y<=1,sight,exposure,clear,
      draws,vertices,width:r.canvas.width,height:r.canvas.height,geometryBytes:this.bytes};
  }
  dispose(){this.r.dispose();}
}
