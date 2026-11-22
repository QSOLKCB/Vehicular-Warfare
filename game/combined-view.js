// Breakwater Reach is drawn from the accepted coastal field and the nine mission actors.
import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream,BOX_STREAM_FLOATS} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,cross,dot,multiplyMatrices,normalize,perspective,quatMultiply,rotate,scale,subtract,viewMatrix}
  from '../vendor/vanillajs/modules/math/index.js';
import {HZ} from '../sim/clock.js';
import {EDGE} from '../sim/terrain.js';
import {vesselBasis} from '../sim/vessel.js';
import {vehicleGun} from '../sim/combined-vehicles.js';
import {GATE_RADIUS,sightCombined} from '../sim/combined-world.js';
import {aircraft,rotor} from './models.js';
import {look,Model,turn} from './model-view.js';
import {crawlerParts,drawCrawler} from './tank-view.js';
import {walkerParts,drawWalker,shadowDisc} from './mech-view.js';
import {coastMeshes,cutter,deckGun,foamRibbon,stationBody} from './naval-view.js';
import {EstuaryChart,roadCover} from './combined-chart.js';

const cobalt=[.21,.53,.52],ember=[.83,.32,.19],mint=[.57,1,.76],lamp=[1,.66,.34],steel=[.32,.40,.43];
const up=[0,1,0],east=[1,0,0],south=[0,0,1],north=[0,0,-1];
const cameraDistance={helicopter:12.8,tank:8,mech:9.4,ship:13.3};

function scene(w){
  const mesh=coastMeshes(w),[bx,,bz]=w.beacon;
  // Recolour the existing triangle vertices. The road follows every crest of the physical mesh.
  for(let i=0;i<mesh.land.length;i+=6){
    const x=mesh.land[i],z=mesh.land[i+2],coverage=roadCover(x,z);
    if(!coverage)continue;
    const gravel=.68+.07*Math.sin(.57*x+z*.24)*Math.sin(.44*z);
    const rgb=[gravel,gravel*.875,gravel*.68];
    for(let k=0;k<3;k++)mesh.land[i+3+k]+=coverage*(rgb[k]-mesh.land[i+3+k]);
  }
  // Ground lamps / buoys outline the same circular gate in every lane.
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,x=bx+GATE_RADIUS*Math.cos(angle),z=bz+GATE_RADIUS*Math.sin(angle);
    const y=Math.max(w.field.sample(x,z).height,w.water.heightAt(x,z));
    boxVertices([x,y+.17,z],[.40,.36,.40],steel,mesh.land);
    boxVertices([x,y+.43,z],[.30,.17,.30],mint,mesh.land);
    if(i%6===3){
      boxVertices([x,y+.95,z],[.14,1,.14],steel,mesh.land);
      boxVertices([x,y+1.55,z],[.38,.26,.38],mint,mesh.land);
    }
  }
  return mesh;
}

function cameraPose(w,mode){
  const p=w.player,d=cameraDistance[p.kind],gun=vehicleGun(p);
  if(mode==='sight')return {eye:gun.muzzle,q:look(gun.direction),fov:.62};
  let eye,focus;
  if(mode==='briefing'){
    eye=add(p.p,[d*.77,d*.30,-d*.82]);
    const right=normalize(cross(subtract(p.p,eye),up));
    focus=add(p.p,scale(right,-d*.27));focus[1]+=.35;
  }else{
    const forward=[Math.sin(p.yaw),0,-Math.cos(p.yaw)],right=[Math.cos(p.yaw),0,Math.sin(p.yaw)];
    const chase=p.kind==='mech'?d+5.4:d+2;
    eye=add(add(p.p,scale(forward,-chase)),scale(right,d*.22));
    eye[1]+=d*.36;
    focus=add(p.p,scale(forward,8));focus[1]+=.5;
  }
  for(const axis of [0,2])eye[axis]=clamp(eye[axis],-EDGE,EDGE);
  eye[1]=Math.max(eye[1],w.field.sample(eye[0],eye[2]).height+.7,w.water.heightAt(eye[0],eye[2])+.7);
  return {eye,q:look(subtract(focus,eye)),fov:mode==='briefing'?.78:.89};
}

function fleet(r,color,side){
  return {tank:crawlerParts(r,side),mech:walkerParts(r,color),helicopter:new Model(r,aircraft(color)),
    ship:new Model(r,cutter(color))};
}

export class CombinedView{
  constructor(canvas,w){
    const r=this.r=new Renderer(canvas);
    try{
      const mesh=scene(w);
      this.land=r.mesh(mesh.land);this.sea=r.mesh(mesh.water);this.sky=r.mesh(mesh.sky);
      this.chart=new EstuaryChart(document.getElementById('theatreMap'),w);
      this.fleets={cobalt:fleet(r,cobalt,'player'),ember:fleet(r,ember,'enemy')};
      this.rotor=new Model(r,rotor());this.barrel=new Model(r,deckGun());this.relay=new Model(r,stationBody(w.relay));
      // Two walkers (body and six soles), two hulls and two low aircraft.
      this.shadows=r.mesh([]);this.shadowData=new Float32Array(18*8*3*6);
      this.foam=r.mesh([]);this.foamData=new Float32Array(2*2*8*6*6);
      this.effects=r.mesh([]);this.stream=new BoxVertexStream(128);
      const models=[this.rotor,this.barrel,this.relay];
      for(const f of Object.values(this.fleets))models.push(f.ship,f.helicopter,...Object.values(f.tank),...Object.values(f.mech));
      this.staticBytes=(this.land.count+this.sea.count+this.sky.count)*24;
      this.modelBytes=models.reduce((bytes,m)=>bytes+m.src.byteLength,0);
      this.dynamicBytes=this.stream.capacityBoxes*BOX_STREAM_FLOATS*Float32Array.BYTES_PER_ELEMENT+this.foamData.byteLength+this.shadowData.byteLength;
    }catch(error){r.dispose();throw error;}
  }
  draw(w,mode){
    const r=this.r,gl=r.gl,{eye,q,fov}=cameraPose(w,mode);
    r.begin([0,0,0],q,{fov,fog:0});r.draw(this.sky);gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect=r.canvas.width/r.canvas.height;
    gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,aspect),viewMatrix(eye,q)));
    gl.uniform1f(r.fog,.00125);r.draw(this.sea);r.draw(this.land);
    let draws=3,vertices=this.sea.count+this.land.count+this.sky.count,foamEnd=0;
    let shadowEnd=0;
    for(const a of w.actors){
      if(!a.hp || (a===w.player && mode==='sight'))continue;
      if(a.kind==='mech'){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.5,1.55);
        for(const foot of a.feet)shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,foot.p,.47,.56);
      }else if(a.kind==='tank'){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.6,2.12);
      }else if(a.kind==='helicopter' && a.p[1]-w.field.sample(a.p[0],a.p[2]).height<17){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.45,2.20);
      }
    }
    if(shadowEnd){
      gl.enable(gl.BLEND);gl.blendColor(0,0,0,.28);gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.depthMask(false);r.update(this.shadows,this.shadowData.subarray(0,shadowEnd));r.draw(this.shadows);
      gl.depthMask(true);gl.disable(gl.BLEND);draws++;vertices+=this.shadows.count;
    }
    for(const a of w.actors){
      if(!a.hp)continue;
      if(a.kind==='ship')foamEnd=foamRibbon(this.foamData,foamEnd,w,a);
      if(a===w.player && mode==='sight')continue;
      const f=this.fleets[a.faction];
      switch(a.kind){
      case 'tank':
        vertices+=drawCrawler(r,f.tank,a);draws+=3;break;
      case 'mech':
        vertices+=drawWalker(r,f.mech,a);draws+=3+a.feet.length*3;break;
      case 'helicopter': {
        const body=quatMultiply(turn(1,-a.yaw),quatMultiply(turn(0,-a.pitch),turn(2,-a.bank)));
        f.helicopter.draw(r,a.p,body);this.rotor.draw(r,a.p,quatMultiply(body,turn(1,.45+w.tick*.21)));
        vertices+=f.helicopter.mesh.count+this.rotor.mesh.count;draws+=2;break;
      }
      case 'ship':
      case 'relay': {
        if(a.kind==='ship'){
          const basis=vesselBasis(a);
          f.ship.drawBasis(r,a.p,basis.right,basis.up,scale(basis.forward,-1));vertices+=f.ship.mesh.count;
        }else{
          this.relay.drawBasis(r,a.p,east,up,south);vertices+=this.relay.mesh.count;
        }
        const gun=vehicleGun(a),qGun=look(gun.direction);
        this.barrel.drawBasis(r,gun.pivot,rotate(qGun,east),rotate(qGun,up),subtract(gun.pivot,gun.muzzle));
        vertices+=this.barrel.mesh.count;draws+=2;break;
      }
      }
    }
    if(foamEnd){r.update(this.foam,this.foamData.subarray(0,foamEnd));r.draw(this.foam);vertices+=this.foam.count;draws++;}
    const stream=this.stream.reset();
    for(const shot of w.shots)stream.append(shot.p,[.24,.24,.24],shot.faction==='cobalt'?mint:lamp);
    for(let i=w.events.length-1;i>=0 && stream.boxCount+6<=stream.capacityBoxes;i--){
      const e=w.events[i],age=(w.tick-e.tick)/HZ;
      if(age>.42)break;
      if(e.type!=='impact' && e.type!=='destroy')continue;
      const tint=e.target==='water'?[.80,.95,.89]:lamp,size=e.type==='destroy'?.4:.15;
      for(let j=0;j<6;j++){
        const a=e.tick+j*Math.PI/3,d=age*(e.type==='destroy'?9:5);
        stream.append(add(e.point,[Math.cos(a)*d,age*(4+j)-age*age*10,Math.sin(a)*d]),[size,size,size],tint);
      }
    }
    if(stream.boxCount){r.update(this.effects,stream.view());r.draw(this.effects);vertices+=stream.vertexCount;draws++;}
    const sight=sightCombined(w);
    if(mode!=='briefing')this.chart.draw(w,sight);
    const delta=subtract(sight.point,eye),depth=dot(delta,rotate(q,north)),f=.5/Math.tan(fov/2);
    const x=depth>.1?.5+dot(delta,rotate(q,east))*f/(depth*aspect):0;
    const y=depth>.1?.5-dot(delta,rotate(q,up))*f/depth:0;
    return {x,y,sight,aimVisible:sight.clear && depth>.1 && x>=0 && x<=1 && y>=0 && y<=1,
      width:r.canvas.width,height:r.canvas.height,draws,vertices,waterLevel:w.water.level,
      geometryBytes:this.staticBytes+2*this.modelBytes+this.dynamicBytes,
      cpuGeometryBytes:2*this.modelBytes+this.dynamicBytes,gpuGeometryMaxBytes:this.staticBytes+this.modelBytes+this.dynamicBytes,
      effectCapacity:this.stream.capacityBoxes};
  }
  dispose(){this.r.dispose();}
}
