// Breakwater Reach is drawn from the accepted coastal field and the nine mission actors.
import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream,BOX_STREAM_FLOATS} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,cross,dot,multiplyMatrices,normalize,perspective,quatMultiply,rotate,scale,subtract,viewMatrix}
  from '../vendor/vanillajs/modules/math/index.js';
import {HZ} from '../sim/clock.js';
import {EDGE} from '../sim/terrain.js';
import {vesselBasis} from '../sim/vessel.js';
import {vehicleGun} from '../sim/combined-vehicles.js';
import {GATE_RADIUS,MAX_PULSES,sightCombined} from '../sim/combined-world.js';
import {aircraft,rotor} from './models.js';
import {look,Model,turn} from './model-view.js';
import {crawlerParts,drawCrawler} from './tank-view.js';
import {walkerParts,drawWalker,shadowDisc} from './mech-view.js';
import {coastMeshes,cutter,deckGun,foamRibbon,stationBody} from './naval-view.js';
import {EstuaryChart,roadCover} from './combined-chart.js';
import {FxGateBeacon} from './fx-gate.js';
import {RetroChart,packedWidth,chartWidth,chartHeight} from './retro-chart.js';
import {DistantFleet,useDistantActor} from './distant-fleet.js';

const cobalt=[.21,.53,.52],ember=[.83,.32,.19],mint=[.57,1,.76],lamp=[1,.66,.34],steel=[.32,.40,.43];
const up=[0,1,0],east=[1,0,0],south=[0,0,1],north=[0,0,-1];
const cameraDistance={helicopter:12.8,tank:8,mech:9.4,ship:13.3};
const spray=[.80,.95,.89];

const profiles={
  full:{boxes:128,fragments:128,burst:6,shadowDiscs:18},
  balanced:{boxes:MAX_PULSES+32,fragments:32,burst:4,shadowDiscs:12}
};

export function packMixedEffects(stream,w,detail){
  const profile=profiles[detail];
  stream.reset();
  for(const shot of w.shots){
    const [x,y,z]=shot.p,color=shot.faction==='cobalt'?mint:lamp;
    stream.appendXYZRGB(x,y,z,.24,.24,.24,...color);
  }
  const limit=Math.min(stream.capacityBoxes,w.shots.length+profile.fragments);
  for(let i=w.events.length-1;i>=0 && stream.boxCount+profile.burst<=limit;i--){
    const e=w.events[i],age=(w.tick-e.tick)/HZ;
    if(age>.42)break;
    if(e.type!=='impact' && e.type!=='destroy')continue;
    const color=e.target==='water'?spray:lamp,size=e.type==='destroy'?.4:.15;
    const distance=age*(e.type==='destroy'?9:5);
    for(let j=0;j<profile.burst;j++){
      const angle=e.tick+j*(2*Math.PI/profile.burst);
      stream.appendXYZRGB(e.point[0]+Math.cos(angle)*distance,e.point[1]+age*(4+j)-age*age*10,
        e.point[2]+Math.sin(angle)*distance,size,size,size,...color);
    }
  }
  return stream.boxCount-w.shots.length;
}

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
  if(mode==='overview'){
    const target=w.relay.hp?w.relay.p:w.beacon;
    focus=p.p.map((value,i)=>value+(target[i]-value)*.38);
    const distance=clamp(Math.hypot(p.p[0]-target[0],p.p[2]-target[2]),44,150);
    eye=add(focus,[distance*.22,distance*1.12,distance*.65]);
  }else if(mode==='briefing'){
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
  constructor(canvas,w,{detail='balanced',fx,retro=false,crewSets=1}={}){
    if(!Number.isInteger(crewSets) || crewSets<1 || crewSets>3)throw RangeError('Unsupported crew count');
    if(!Object.hasOwn(profiles,detail))throw RangeError('Unknown scene detail');
    this.detail=detail;
    this.setRetro(retro);
    this.fx=fx;
    this.fxControl=fx===undefined?document.getElementById('fxBeacon'):null;
    this.beacon=null;
    this.beaconMesh=null;
    const profile=profiles[detail];
    const r=this.r=new Renderer(canvas);
    try{
      const mesh=scene(w);
      this.land=r.mesh(mesh.land);this.sea=r.mesh(mesh.water);this.sky=r.mesh(mesh.sky);
      this.chart=new EstuaryChart(document.getElementById('theatreMap'),w);
      this.fleets={cobalt:fleet(r,cobalt,'player'),ember:fleet(r,ember,'enemy')};
      this.rotor=new Model(r,rotor());this.barrel=new Model(r,deckGun());this.relay=new Model(r,stationBody(w.relay));
      this.distant=detail==='balanced'?new DistantFleet(cobalt,ember,crewSets):null;
      this.distantMesh=this.distant?r.mesh([]):null;
      this.farActors=new Set();
      this.shadows=r.mesh([]);this.shadowData=new Float32Array(crewSets*profile.shadowDiscs*8*3*6);
      this.foam=r.mesh([]);this.foamData=new Float32Array(crewSets*2*2*8*6*6);
      this.effects=r.mesh([]);this.stream=new BoxVertexStream(profile.boxes);
      const models=[this.rotor,this.barrel,this.relay];
      for(const f of Object.values(this.fleets))models.push(f.ship,f.helicopter,...Object.values(f.tank),...Object.values(f.mech));
      this.staticBytes=(this.land.count+this.sea.count+this.sky.count)*24;
      this.modelBytes=models.reduce((bytes,m)=>bytes+m.src.byteLength,0);
      this.dynamicBytes=this.stream.capacityBoxes*BOX_STREAM_FLOATS*Float32Array.BYTES_PER_ELEMENT+
        this.foamData.byteLength+this.shadowData.byteLength+(this.distant?.data.byteLength??0);
    }catch(error){r.dispose();throw error;}
  }
  setRetro(enabled){
    this.retroEnabled=Boolean(enabled);
    if(!enabled){this.retro=null;this.retroImage=null;}
  }
  draw(w,mode,pose){
    const r=this.r,gl=r.gl,{eye,q,fov}=pose??cameraPose(w,mode);
    r.begin([0,0,0],q,{fov,fog:0});r.draw(this.sky);gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect=r.canvas.width/r.canvas.height;
    gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,aspect),viewMatrix(eye,q)));
    gl.uniform1f(r.fog,.00125);r.draw(this.sea);r.draw(this.land);
    let draws=3,vertices=this.sea.count+this.land.count+this.sky.count,foamEnd=0;
    const fxEnabled=this.fx??this.fxControl?.checked??false;
    let fxUpdated=false,fxPrepMs=0,fxVertices=0;
    if(fxEnabled){
      const start=performance.now();
      this.beacon??=new FxGateBeacon(w.beacon);
      fxUpdated=this.beacon.prepare(w.tick,w.relay.hp>0,w.captured);
      fxPrepMs=performance.now()-start;
      if(fxUpdated){
        this.beaconMesh??=r.mesh([]);
        r.update(this.beaconMesh,this.beacon.pipe.view());
      }
      r.draw(this.beaconMesh);
      fxVertices=this.beaconMesh.count;vertices+=fxVertices;draws++;
    }
    const fxRetainedBytes=this.beacon?.retainedBytes??0;
    let shadowEnd=0,nearActors=0;
    this.distant?.reset();
    for(const a of w.actors){
      if(!a.hp || (a===w.player && mode==='sight'))continue;
      if(this.distant){
        if(useDistantActor(a,w.player,eye,fov,this.farActors.has(a.id))){
          this.farActors.add(a.id);this.distant.append(a,w.tick);continue;
        }
        this.farActors.delete(a.id);
      }
      if(a.kind==='mech'){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.5,1.55);
        if(!this.distant || a===w.player){
          for(const foot of a.feet)shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,foot.p,.47,.56);
        }
      }else if(a.kind==='tank'){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.6,2.12);
      }else if(a.kind==='helicopter' && a.p[1]-w.field.sample(a.p[0],a.p[2]).height<17){
        shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,a.p,1.45,2.20);
      }
    }
    if(shadowEnd>this.shadowData.length)throw RangeError('Crew shadow capacity exceeded');
    if(shadowEnd){
      gl.enable(gl.BLEND);gl.blendColor(0,0,0,.28);gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.depthMask(false);r.update(this.shadows,this.shadowData.subarray(0,shadowEnd));r.draw(this.shadows);
      gl.depthMask(true);gl.disable(gl.BLEND);draws++;vertices+=this.shadows.count;
    }
    for(const a of w.actors){
      if(!a.hp || this.farActors.has(a.id))continue;
      if(a.kind==='ship')foamEnd=foamRibbon(this.foamData,foamEnd,w,a);
      if(a===w.player && mode==='sight')continue;
      nearActors++;
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
    if(this.distant?.count){
      r.update(this.distantMesh,this.distant.meshView());r.draw(this.distantMesh);
      vertices+=this.distantMesh.count;draws++;
    }
    if(foamEnd>this.foamData.length)throw RangeError('Crew wake capacity exceeded');
    if(foamEnd){r.update(this.foam,this.foamData.subarray(0,foamEnd));r.draw(this.foam);vertices+=this.foam.count;draws++;}
    const stream=this.stream,debrisBoxes=packMixedEffects(stream,w,this.detail);
    if(stream.boxCount){r.update(this.effects,stream.view());r.draw(this.effects);vertices+=stream.vertexCount;draws++;}
    const sight=sightCombined(w);
    let chartPrepMs=0;
    if(mode!=='briefing'){
      const start=performance.now();
      if(this.retroEnabled){
        if(!this.retro){
          this.retro=new RetroChart(w);
          this.retroImage=new ImageData(this.retro.display.view(),packedWidth,chartHeight);
        }
        this.retro.draw(w,sight);
        this.chart.ctx.putImageData(this.retroImage,0,0,0,0,chartWidth,chartHeight);
      }else this.chart.draw(w,sight);
      chartPrepMs=performance.now()-start;
    }
    const delta=subtract(sight.point,eye),depth=dot(delta,rotate(q,north)),f=.5/Math.tan(fov/2);
    const x=depth>.1?.5+dot(delta,rotate(q,east))*f/(depth*aspect):0;
    const y=depth>.1?.5-dot(delta,rotate(q,up))*f/depth:0;
    return {x,y,sight,aimVisible:sight.clear && depth>.1 && x>=0 && x<=1 && y>=0 && y<=1,
      width:r.canvas.width,height:r.canvas.height,draws,vertices,waterLevel:w.water.level,
      retroEnabled:this.retroEnabled,chartPrepMs,retroPrepMs:this.retroEnabled?chartPrepMs:0,retroRetainedBytes:this.retro?.retainedBytes??0,
      detailProfile:this.detail,nearActors,farActors:this.distant?.count??0,projectileBoxes:w.shots.length,debrisBoxes,
      shadowDiscs:shadowEnd/(8*3*6),wakeVertices:foamEnd/6,
      fxEnabled,fxUpdated,fxPrepMs,fxVertices,fxRetainedBytes,
      geometryBytes:fxRetainedBytes+this.staticBytes+2*this.modelBytes+this.dynamicBytes+(this.distant?.templateBytes??0),
      cpuGeometryBytes:fxRetainedBytes+2*this.modelBytes+this.dynamicBytes+(this.distant?.templateBytes??0),
      gpuGeometryMaxBytes:(this.beacon?.pipe.retainedBytes??0)+this.staticBytes+this.modelBytes+this.dynamicBytes,
      effectCapacity:this.stream.capacityBoxes};
  }
  dispose(){this.setRetro(false);this.r.dispose();this.beacon=null;this.beaconMesh=null;}
}
