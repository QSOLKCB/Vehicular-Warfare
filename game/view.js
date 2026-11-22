import {Tracers} from './tracers.js';
import {Renderer} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,dot,normalize,perspective,viewMatrix,multiplyMatrices,quatMultiply,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {enemyIds,unitType,minZ,zone,zoneRadius} from '../sim/missions.js';
import {aim} from '../sim/world.js';
import {aircraft,groundUnit,rotor} from './models.js';
import {landscape} from './scenery.js';
import {ColumnLayer} from './column-layer.js';

function turn(axis, radians) {
  const q=[0,0,0,Math.cos(radians/2)]; q[axis]=Math.sin(radians/2); return q;
}
function look(direction) {
  const d=normalize(direction);
  return quatMultiply(turn(1,Math.atan2(-d[0],-d[2])),turn(0,Math.asin(d[1])));
}
class Model {
  constructor(renderer, vertices) {
    this.src=new Float32Array(vertices); this.data=this.src.slice(); this.mesh=renderer.mesh(this.data);
  }
  draw(renderer,p,q) {
    const x=rotate(q,[1,0,0]),y=rotate(q,[0,1,0]),z=rotate(q,[0,0,1]);
    for(let i=0;i<this.src.length;i+=6) {
      const a=this.src[i],b=this.src[i+1],c=this.src[i+2];
      for(let k=0;k<3;k++) this.data[i+k]=p[k]+x[k]*a+y[k]*b+z[k]*c;
    }
    renderer.update(this.mesh,this.data); renderer.draw(this.mesh);
  }
}

export class View {
  constructor(canvas,w) {
    this.r=new Renderer(canvas);
    const {land,terrainVertices,sky}=landscape(w),r=this.r;
    this.sky=r.mesh(sky); this.land=r.mesh(land);
    // The first range contains only Heightfield triangles. The original
    // landscape stays in one GPU allocation in both presentation modes.
    this.surface={...this.land,count:terrainVertices};
    this.columns=null;
    this.models={player:new Model(r,aircraft()),rotor:new Model(r,rotor()),
      aa:new Model(r,groundUnit('aa')),convoy:new Model(r,groundUnit('convoy'))};
    this.tracers=new Tracers(r);
    if(w.route){
      this.models.scout=new Model(r,groundUnit('scout'));
      const ring=[];
      for(let i=0;i<48;i++) for(const j of [i,i+1]){
        const a=j*Math.PI/24;
        ring.push(zoneRadius*Math.cos(a),1,zoneRadius*Math.sin(a),.45,1,.85);
      }
      this.beacon=new Model(r,ring);
      this.beacon.mesh.mode=r.gl.LINES;
    }
    this.stream=new BoxVertexStream(512); this.fx=r.mesh([]);
    this.bytes=this.tracers.data.byteLength+(this.beacon?this.beacon.data.byteLength*2:0)+land.length*4+sky.length*4+this.stream.capacityBoxes*216*4+
      Object.values(this.models).reduce((n,m)=>n+m.data.byteLength+m.src.byteLength,0);
  }
  get columnResources() {
    const layer=this.columns;
    return {programs:Number(Boolean(layer?.program)),buffers:Number(Boolean(layer?.buffer)),
      textures:Number(Boolean(layer?.texture)),bytes:layer?.atlas?.bytes??0};
  }
  render(w,mode,briefing=false,zoom=false,terrainMode='webgl',profile='survey') {
    const r=this.r,p=w.player, yaw=turn(1,-p.yaw);
    const body=quatMultiply(yaw,quatMultiply(turn(0,-p.pitch),turn(2,-p.bank)));
    const fov=briefing ? .90 : (zoom && mode==='cockpit'?2*Math.atan(Math.tan(.51)/1.6):1.02);
    let eye, camera;
    if(briefing) {
      eye=add(p.p,[7.8,2.2,-8.8]);
      camera=look(subtract(add(p.p,[3.0,.8,2.65]),eye));
    } else if(mode==='chase') {
      eye=add(p.p,rotate(yaw,[0,6.8,13]));
      eye[0]=clamp(eye[0],-144,144); eye[2]=clamp(eye[2],minZ(w),144);
      eye[1]=Math.max(eye[1],w.field.sample(eye[0],eye[2]).height+1.5);
      camera=look(subtract(add(p.p,rotate(yaw,[0,0,-18])),eye));
    } else {
      eye=add(p.p,rotate(body,[0,.45,-1.15]));
      // Lower the zoomed optical axis so a downhill contact stays above
      // the instrument rail. Sight elevation also pans this read-only view.
      camera=quatMultiply(body,turn(0,zoom ? p.aim*.85-.30 : p.aim*.45-.13));
    }
    r.begin([0,0,0],camera,{fov,fog:0});
    r.draw(this.sky);
    r.gl.clear(r.gl.DEPTH_BUFFER_BIT);
    r.gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,r.canvas.width/r.canvas.height),viewMatrix(eye,camera)));
    r.gl.uniform1f(r.fog,.00165);
    let calls=2,vertices=this.sky.count+this.land.count;
    const terrainStart=performance.now();
    if(this.columns && (terrainMode!=='voxel' || this.columns.profile!==profile)){
      this.columns.dispose();
      this.columns=null;
    }
    if(terrainMode==='voxel'){
      this.columns??=new ColumnLayer(r,w.field,w.route?.id==='frostline',profile);
      this.columns.draw(eye,camera,fov);
      // Columns supply colour. The original triangles supply full-resolution
      // camera-space depth for models, trees, lamps, tracers and terrain hits.
      const gl=r.gl;
      gl.colorMask(false,false,false,false);
      r.draw(this.surface);
      gl.colorMask(true,true,true,true);
      gl.drawArrays(this.land.mode,this.surface.count,this.land.count-this.surface.count);
      calls+=2;
      vertices+=3;
    }else{
      r.draw(this.land);
    }
    const terrainCpuMs=performance.now()-terrainStart;
    const draw=(id,pos,q)=>{
      const m=this.models[id]; m.draw(r,pos,q); calls++; vertices+=m.mesh.count;
    };
    if((briefing || mode==='chase') && p.hp) {
      draw('player',p.p,body);
      draw('rotor',p.p,quatMultiply(body,turn(1,w.tick*.21+.46)));
    }
    for(const id of enemyIds(w)){
      const e=w[id],kind=unitType(e);
      if(e.hp) draw(kind,e.p,[0,0,0,1]);
    }
    const site=zone(w);
    if(site){
      const [,x,z]=site;
      this.beacon.draw(r,[x,w.field.sample(x,z).height+1,z],[0,0,0,1]);
      calls++;vertices+=this.beacon.mesh.count;
    }
    const stream=this.stream.reset();
    const trails=this.tracers.draw(r,w,eye,camera);
    if(trails.vertices){calls++;vertices+=trails.vertices;}
    for(let j=w.events.length-1;j>=0;j--) {
      const e=w.events[j],age=(w.tick-e.tick)/120;
      if(age>.55 || stream.boxCount+12>stream.capacityBoxes) break;
      if(e.type!=='impact' && e.type!=='destroy') continue;
      for(let i=0;i<12;i++) {
        const a=i*2.4+e.tick,dist=(.1+age*5)*(e.type==='destroy'?2:1);
        const pos=add(e.point,[Math.cos(a)*dist,dist*(.32+i%4*.23),Math.sin(a)*dist]);
        const size=.10+(.55-age)*(e.type==='destroy'?1.5:.55);
        stream.append(pos,[size,size,size],i%3?[1,.47,.13]:[.40,.34,.32]);
      }
    }
    if(stream.boxCount) { r.update(this.fx,stream.view()); r.draw(this.fx); calls++; vertices+=this.fx.count; }
    const {target,direction}=aim(w);
    const point=target?w[target].p:add(p.p,scale(direction,70)),delta=subtract(point,eye);
    const forward=dot(delta,rotate(camera,[0,0,-1])), f=1/Math.tan(fov/2);
    const x=.5+.5*dot(delta,rotate(camera,[1,0,0]))*f/forward*r.canvas.height/r.canvas.width;
    const y=.5-.5*dot(delta,rotate(camera,[0,1,0]))*f/forward;
    const atlas=this.columns?.atlas,resources=this.columnResources;
    return {target,zoom:zoom && mode==='cockpit',incoming:trails.incoming,x,y,calls,vertices,
      buffers:r.meshes.size+resources.buffers,terrainMode,terrainProfile:atlas?profile:'native',
      terrainWidth:atlas?.width??r.gl.drawingBufferWidth,terrainHeight:atlas?.height??r.gl.drawingBufferHeight,
      terrainSamples:atlas?.samples??0,terrainCpuMs,columnBytes:resources.bytes,
      columnTextures:resources.textures,columnPrograms:resources.programs};
  }
  dispose(){this.columns?.dispose();this.columns=null;this.r.dispose();}
}
