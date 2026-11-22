import {Renderer,boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {BoxVertexStream} from '../vendor/vanillajs/modules/render-packing/index.js';
import {add,clamp,cross,dot,multiplyMatrices,normalize,perspective,quatMultiply,rotate,scale,
  seededRandom,subtract,viewMatrix} from '../vendor/vanillajs/modules/math/index.js';
import {walkerGun,legJoints} from '../sim/walker.js';
import {BEACON_RADIUS,sightMech} from '../sim/mech-world.js';
import {EDGE} from '../sim/terrain.js';
import {Model,look,turn} from './model-view.js';
import {facet} from './models.js';
import {skyMesh} from './scenery.js';

const basalt=[.20,.24,.28],joint=[.13,.17,.19],steel=[.57,.66,.65],stripe=[.98,.83,.62];
const blue=[.21,.89,.99],amber=[.96,.56,.16],sentinel=[.69,.22,.22];

function shell(out,bottom,top,tint){
  // Clipped corners give each casting a low, octagonal shoulder.
  const ring=([x,y,z])=>[[-x*.66,y,-z],[x*.66,y,-z],[x,y,-z*.62],[x,y,z*.62],
    [x*.66,y,z],[-x*.66,y,z],[-x,y,z*.62],[-x,y,-z*.62]];
  const a=ring(bottom),b=ring(top);
  for(let i=0;i<8;i++){
    const j=(i+1)%8,shade=.72+.16*Math.cos(i*Math.PI/4);
    facet(out,a[i],b[i],b[j],tint,shade);facet(out,a[i],b[j],a[j],tint,shade);
    if(i>0 && i<7){facet(out,b[0],b[j],b[i],tint,1.06);facet(out,a[0],a[i],a[j],tint,.59);}
  }
}

function chassis(renderer,color){
  const pelvis=[],torso=[],gun=[];
  shell(pelvis,[.81,-.44,1.00],[1,.14,1.04],basalt);
  shell(pelvis,[1,.14,1.04],[.74,.42,.88],color);
  for(const x of [-.77,.77]){
    for(const z of [-.82,0,.82])boxVertices([x,.18,z],[.41,.22,.30],steel,pelvis);
  }
  boxVertices([0,.46,0],[.85,.32,.90],joint,pelvis);
  shell(torso,[.67,-.59,.68],[.97,-.04,1.03],color);
  shell(torso,[.97,-.04,1.03],[.67,.66,.74],color);
  boxVertices([0,.35,-.88],[.98,.31,.18],joint,torso);
  boxVertices([0,.35,-.985],[.77,.13,.06],blue,torso);
  for(const x of [-.78,.78]){
    boxVertices([x,-.05,-.04],[.35,.56,1.03],basalt,torso);
    boxVertices([x,.21,-.24],[.34,.10,.57],stripe,torso);
    for(let j=0;j<4;j++)boxVertices([x,.16,.22+j*.13],[.31,.10,.055],steel,torso);
  }
  for(let k=0;k<4;k++)boxVertices([0,.12+k*.13,.86-.04*k],[.75,.065,.10],joint,torso);
  boxVertices([-.35,.69,.35],[.28,.17,.37],steel,torso);
  boxVertices([.48,.85,.44],[.056,.67,.056],basalt,torso);
  boxVertices([.48,1.19,.44],[.10,.10,.10],amber,torso);
  // Tube coordinates end at the authoritative 2.15 m muzzle.
  boxVertices([0,0,-1.23],[.32,.27,1.46],basalt,gun);
  boxVertices([0,0,-1.94],[.38,.34,.42],color,gun);
  boxVertices([0,0,-2.14],[.21,.17,.02],blue,gun);
  const upper=[],lower=[],shoe=[];
  // Links run from local y=0 to y=1. drawLink maps the endpoints to IK joints.
  boxVertices([0,.5,0],[.23,.98,.23],joint,upper);
  boxVertices([0,.40,0],[.36,.57,.40],color,upper);
  boxVertices([0,.66,0],[.37,.06,.42],stripe,upper);
  boxVertices([0,1,0],[.38,.16,.34],basalt,upper);
  boxVertices([0,.47,0],[.23,.94,.24],steel,lower);
  boxVertices([0,.67,0],[.31,.50,.32],color,lower);
  boxVertices([0,.95,0],[.28,.12,.30],joint,lower);
  shell(shoe,[.27,0,.41],[.20,.17,.32],basalt);
  boxVertices([0,.18,0],[.26,.12,.30],color,shoe);
  return Object.fromEntries(Object.entries({pelvis,torso,gun,upper,lower,shoe})
    .map(([key,data])=>[key,new Model(renderer,data)]));
}

function drawLink(r,model,a,b,across){
  const axis=subtract(b,a);
  const z=normalize(cross(across,axis)),x=normalize(cross(axis,z));
  model.drawBasis(r,a,x,axis,z);
}

// Small ambient shadows follow the local terrain plane under the chassis and each sole.
// Depth testing and alpha blending keep the underlying heightfield triangles visible.
const shadowRing=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
function shadowDisc(data,offset,field,p,rx,rz){
  const {height,normal}=field.sample(p[0],p[2]);
  const cx=p[0],cy=height+.018,cz=p[2];
  for(let i=0;i<shadowRing.length;i++){
    data[offset]=cx;data[offset+1]=cy;data[offset+2]=cz;offset+=6;
    for(let j=i;j<=i+1;j++){
      const end=shadowRing[j%shadowRing.length],x=end[0]*rx,z=end[1]*rz;
      data[offset]=cx+x;data[offset+1]=cy-(x*normal[0]+z*normal[2])/normal[1];
      data[offset+2]=cz+z;offset+=6;
    }
  }
  return offset;
}

function glassworks(w){
  const land=[],rng=seededRandom(w.seed+531);
  for(let row=0;row<w.field.cellsZ;row++)for(let col=0;col<w.field.cellsX;col++){
    for(const [a,b,c] of w.field.triangleAt(col,row)){
      const n=normalize(cross(subtract(b,a),subtract(c,a)));
      const y=(a[1]+b[1]+c[1])/3;
      const slate=n[1]<.8?[.36,.39,.44]:y>4?[.54,.57,.55]:[.48,.52,.54];
      const shade=.68+.26*Math.max(0,dot(n,[-.52,.71,-.47]))+.05*rng();
      facet(land,a,b,c,slate,shade);
    }
  }
  const [bx,,bz]=w.beacon;
  // An open ring of ground lamps leaves a clear physical path to the beacon.
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5,x=bx+BEACON_RADIUS*Math.sin(a),z=bz+BEACON_RADIUS*Math.cos(a),y=w.field.sample(x,z).height;
    boxVertices([x,y+.22,z],[.48,.44,.48],basalt,land);
    boxVertices([x,y+.49,z],[.40,.14,.40],blue,land);
  }
  const sky=skyMesh(true,rng);
  // The abandoned kilns are painted into the distant skyline, beyond the field.
  for(let i=0;i<7;i++){
    const x=-122+i*26,z=-322-i%2*6,h=41+(i*13)%22;
    boxVertices([x,0,z],[15,h*2,18], [.38,.46,.51],sky);
    boxVertices([x,h+2,z],[17,4,19], [.48,.53,.54],sky);
  }
  return {land,sky};
}

export class MechView {
  constructor(canvas,w){
    const r=this.r=new Renderer(canvas);
    try{
      const {land,sky}=glassworks(w);
      this.land=r.mesh(land);this.sky=r.mesh(sky);
      this.parts={player:chassis(r,amber),enemy:chassis(r,sentinel)};
      this.effects=r.mesh([]);this.stream=new BoxVertexStream(96);
      this.shadows=r.mesh([]);this.shadowData=new Float32Array(2*7*8*3*6);
      this.bytes=(land.length+sky.length)*4+this.stream.capacityBoxes*216*4+this.shadowData.byteLength;
      for(const parts of Object.values(this.parts))for(const m of Object.values(parts))
        this.bytes+=m.src.byteLength+m.data.byteLength;
    }catch(error){r.dispose();throw error;}
  }
  draw(w,mode){
    const r=this.r,gl=r.gl,p=w.player,gun=walkerGun(p);
    const forward=[Math.sin(p.torsoYaw),0,-Math.cos(p.torsoYaw)];
    const right=[Math.cos(p.torsoYaw),0,Math.sin(p.torsoYaw)];
    let eye,focus;
    if(mode==='briefing'){
      eye=add(p.p,[5.8,2.25,-7.4]);focus=add(p.p,[1.65,-.03,1.76]);
    }else if(mode==='sight'){
      eye=gun.muzzle;focus=add(eye,gun.direction);
    }else{
      eye=add(add(p.p,scale(forward,-14.5)),scale(right,3.6));eye[1]+=3.05;
      for(const axis of [0,2])eye[axis]=clamp(eye[axis],-EDGE,EDGE);
      eye[1]=Math.max(eye[1],w.field.sample(eye[0],eye[2]).height+.7);
      focus=add(p.p,scale(forward,9));focus[1]+=1.7*Math.sin(p.elevation)-1.25;
    }
    const camera=look(subtract(focus,eye)),fov=mode==='sight'?.59:.85;
    r.begin([0,0,0],camera,{fov,fog:0});r.draw(this.sky);gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect=r.canvas.width/r.canvas.height;
    gl.uniformMatrix4fv(r.vp,false,multiplyMatrices(perspective(fov,aspect),viewMatrix(eye,camera)));
    gl.uniform1f(r.fog,.0019);r.draw(this.land);
    let draws=2,vertices=this.land.count+this.sky.count;
    let shadowEnd=0;
    for(const actor of [p,w.enemy]){
      if(!actor.hp || (actor===p && mode==='sight'))continue;
      shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,actor.p,1.45,1.48);
      for(const foot of actor.feet)shadowEnd=shadowDisc(this.shadowData,shadowEnd,w.field,foot.p,.44,.53);
    }
    if(shadowEnd){
      gl.enable(gl.BLEND);gl.blendColor(0,0,0,.27);gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.depthMask(false);r.update(this.shadows,this.shadowData.subarray(0,shadowEnd));r.draw(this.shadows);
      gl.depthMask(true);gl.disable(gl.BLEND);draws++;vertices+=this.shadows.count;
    }
    for(const a of [p,w.enemy]){
      if(!a.hp || (mode==='sight' && a===p))continue;
      const part=this.parts[a.id],mounted=walkerGun(a),heading=turn(1,-a.yaw);
      const body=quatMultiply(heading,quatMultiply(turn(0,a.pitch),turn(2,a.roll)));
      const across=rotate(heading,[1,0,0]);
      part.pelvis.draw(r,a.p,body);part.torso.draw(r,mounted.pivot,turn(1,-a.torsoYaw));
      part.gun.draw(r,mounted.pivot,look(mounted.direction));
      draws+=3;vertices+=part.pelvis.mesh.count+part.torso.mesh.count+part.gun.mesh.count;
      for(let i=0;i<a.feet.length;i++){
        const {hip,knee,foot}=legJoints(a,i);
        drawLink(r,part.upper,hip,knee,across);drawLink(r,part.lower,knee,foot,across);
        part.shoe.draw(r,foot,heading);
        draws+=3;vertices+=part.upper.mesh.count+part.lower.mesh.count+part.shoe.mesh.count;
      }
    }
    const s=this.stream.reset();
    for(const shot of w.shots)s.append(shot.p,[.23,.23,.23],shot.owner==='player'?blue:amber);
    for(let i=w.events.length-1;i>=0 && s.boxCount+6<=s.capacityBoxes;i--){
      const e=w.events[i],age=(w.tick-e.tick)/120;
      if(age>.34)break;
      if(e.type!=='impact')continue;
      for(let j=0;j<6;j++){
        const a=e.tick+j*2.4;
        s.append(add(e.point,[Math.cos(a)*age*4,age*(4+j)-age*age*11,Math.sin(a)*age*4]),
          [.14,.14,.14],j%2?stripe:amber);
      }
    }
    if(s.boxCount){r.update(this.effects,s.view());r.draw(this.effects);draws++;vertices+=s.vertexCount;}
    const sight=sightMech(w),d=subtract(sight.point,eye);
    const depth=dot(d,rotate(camera,[0,0,-1])),f=.5/Math.tan(fov/2);
    const x=.5+dot(d,rotate(camera,[1,0,0]))*f/(depth*aspect),y=.5-dot(d,rotate(camera,[0,1,0]))*f/depth;
    return {x,y,sight,aimVisible:sight.clear && depth>.1 && x>=0 && x<=1 && y>=0 && y<=1,
      draws,vertices,width:r.canvas.width,height:r.canvas.height,geometryBytes:this.bytes};
  }
  dispose(){this.r.dispose();}
}
