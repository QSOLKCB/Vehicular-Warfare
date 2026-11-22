// Compact, articulated silhouettes for the eight mobile actors on the Breakwater chart.
import {boxVertices} from '../vendor/vanillajs/modules/render-webgl/index.js';
import {cross,normalize,quatMultiply,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';
import {tankBasis} from '../sim/tracks.js';
import {legJoints} from '../sim/walker.js';
import {vesselBasis} from '../sim/vessel.js';
import {vehicleGun} from '../sim/combined-vehicles.js';
import {facet} from './models.js';
import {look,turn} from './model-view.js';

const east=[1,0,0],up=[0,1,0],back=[0,0,1];
const dark=[.14,.18,.20],steel=[.50,.61,.61],glass=[.19,.39,.42];
const chaseScale=Math.tan(.89/2);

// Equivalent distance in a chase camera. Magnifying the sight also magnifies
// the actor's silhouette, so a narrow FOV retains detail over a longer range.
export function useDistantActor(actor,player,eye,fov,wasDistant){
  if(actor===player || actor.kind==='relay')return false;
  const x=actor.p[0]-eye[0],y=actor.p[1]-eye[1],z=actor.p[2]-eye[2];
  const scale=Math.tan(fov/2)/chaseScale;
  const threshold=wasDistant?44:54;
  return (x*x+y*y+z*z)*scale*scale>=threshold*threshold;
}

function parts(color){
  const tank=[],turret=[],walker=[],torso=[],link=[],gun=[],ship=[],aircraft=[],rotor=[];
  boxVertices([0,.04,0],[2.24,.87,3.72],color,tank);
  for(const x of [-1.13,1.13])boxVertices([x,-.26,0],[.45,.68,3.7],dark,tank);
  boxVertices([0,0,0],[1.58,.70,1.53],color,turret);
  boxVertices([0,0,0],[1.85,.84,1.98],color,walker);
  boxVertices([0,.03,0],[1.84,1.19,1.88],color,torso);
  boxVertices([0,.30,-.95],[.93,.23,.10],glass,torso);
  // Unit-length link and barrel templates are stretched to physical endpoints.
  boxVertices([0,.5,0],[.28,1,.26],steel,link);
  boxVertices([0,0,-.5],[.24,.23,1],dark,gun);

  // Stern, keel and bow meet at the actual hull's silhouette.
  const left=[-1.49,.57,3.91],right=[1.49,.57,3.91],tip=[0,.94,-4];
  const port=[-1.51,.66,-1.72],starboard=[1.51,.66,-1.72],keel=[0,-.96,0];
  const rim=[left,right,starboard,tip,port];
  for(let i=0;i<rim.length;i++){
    facet(ship,rim[i],rim[(i+1)%rim.length],keel,color,.72+.06*i);
    if(i>0 && i<rim.length-1)facet(ship,left,rim[i],rim[i+1],steel);
  }
  boxVertices([0,1.23,.65],[1.73,1.20,2.10],[.88,.88,.77],ship);
  boxVertices([0,1.50,-.41],[1.62,.41,.09],glass,ship);
  facet(ship,[-.075,1.80,.73],[0,2.92,.73],[.075,1.80,.73],dark);
  facet(ship,[0,1.80,.65],[0,2.92,.73],[0,1.80,.81],dark);
  // Three short sections give the sloped glazing and tail a readable outline
  // head-on, in profile and from above.
  const nose=[0,-.14,-2.44],tail=[0,.64,4.84];
  const cabin=[[.44,.95,-.87],[1.02,.16,-.87],[.67,-.68,-.87],[-.67,-.68,-.87],
    [-1.02,.16,-.87],[-.44,.95,-.87]];
  const aft=cabin.map(([x,y])=>[x*.78,.12+y*.77,1.27]);
  for(let i=0;i<cabin.length;i++){
    const j=(i+1)%cabin.length,canopy=i===0||i>=4;
    facet(aircraft,nose,cabin[i],cabin[j],canopy?glass:color,.89);
    const flank=i===2?dark:color;
    facet(aircraft,cabin[i],aft[i],cabin[j],flank,.76+.035*i);
    facet(aircraft,cabin[j],aft[i],aft[j],flank,.76+.035*i);
    facet(aircraft,aft[i],tail,aft[j],flank,.8+.03*i);
  }
  boxVertices([0,1.14,0],[.22,.77,.22],dark,aircraft);
  facet(aircraft,[0,.58,3.6],[0,2.12,4.8],[0,.58,4.8],color);
  for(const x of [-1,1]){
    boxVertices([x,-.97,0],[.14,.15,3.24],dark,aircraft);
    for(const z of [-.85,.82]){
      const a=[x*.60,-.40,z],b=[x*.66,-.40,z],foot=[x,-.96,z];
      facet(aircraft,a,b,foot,steel);
      facet(aircraft,[x*.63,-.40,z-.08],[x*.63,-.40,z+.08],foot,steel);
    }
  }
  boxVertices([0,1.52,0],[8,.055,.18],dark,rotor);
  boxVertices([0,1.52,0],[.18,.055,8],dark,rotor);
  return Object.fromEntries(Object.entries({tank,turret,walker,torso,link,gun,ship,aircraft,rotor})
    .map(([name,data])=>[name,new Float32Array(data)]));
}

export class DistantFleet{
  constructor(cobalt,ember){
    this.colors={cobalt:parts(cobalt),ember:parts(ember)};
    this.templateBytes=0;
    let capacity=0;
    for(const p of Object.values(this.colors)){
      for(const geometry of Object.values(p))this.templateBytes+=geometry.byteLength;
      // One actor of each class per faction, six two-link legs on each walker.
      capacity+=p.tank.length+p.turret.length+p.walker.length+p.torso.length+12*p.link.length+
        3*p.gun.length+p.ship.length+p.aircraft.length+p.rotor.length;
    }
    this.data=new Float32Array(capacity);
    this.reset();
  }
  reset(){this.used=0;this.count=0;}
  meshView(){return this.data.subarray(0,this.used);}

  put(geometry,origin,right,vertical,zAxis){
    for(let i=0,j=this.used;i<geometry.length;i+=6,j+=6){
      const x=geometry[i],y=geometry[i+1],z=geometry[i+2];
      this.data[j]=origin[0]+right[0]*x+vertical[0]*y+zAxis[0]*z;
      this.data[j+1]=origin[1]+right[1]*x+vertical[1]*y+zAxis[1]*z;
      this.data[j+2]=origin[2]+right[2]*x+vertical[2]*y+zAxis[2]*z;
      this.data[j+3]=geometry[i+3];this.data[j+4]=geometry[i+4];this.data[j+5]=geometry[i+5];
    }
    this.used+=geometry.length;
  }
  oriented(shape,origin,q){
    this.put(shape,origin,rotate(q,east),rotate(q,up),rotate(q,back));
  }
  leg(shape,a,b,across){
    const delta=subtract(b,a),z=normalize(cross(across,delta));
    this.put(shape,a,normalize(cross(delta,z)),delta,z);
  }
  append(actor,tick){
    const p=this.colors[actor.faction];
    const heading=turn(1,-actor.yaw);
    if(actor.kind==='helicopter'){
      const body=quatMultiply(heading,quatMultiply(turn(0,-actor.pitch),turn(2,-actor.bank)));
      this.oriented(p.aircraft,actor.p,body);
      this.oriented(p.rotor,actor.p,quatMultiply(body,turn(1,.45+tick*.21)));
    }else{
      const mount=vehicleGun(actor);
      if(actor.kind==='mech'){
        const body=quatMultiply(heading,quatMultiply(turn(0,actor.pitch),turn(2,actor.roll)));
        this.oriented(p.walker,actor.p,body);
        this.oriented(p.torso,mount.pivot,turn(1,-actor.torsoYaw));
        const across=rotate(heading,east);
        for(let i=0;i<actor.feet.length;i++){
          const {hip,knee,foot}=legJoints(actor,i);
          this.leg(p.link,hip,knee,across);this.leg(p.link,knee,foot,across);
        }
      }else{
        const ship=actor.kind==='ship';
        const basis=ship?vesselBasis(actor):tankBasis(actor);
        this.put(ship?p.ship:p.tank,actor.p,basis.right,basis.up,scale(basis.forward,-1));
        if(!ship)this.oriented(p.turret,mount.pivot,turn(1,-actor.turretYaw));
      }
      const aim=look(mount.direction);
      this.put(p.gun,mount.pivot,rotate(aim,east),rotate(aim,up),subtract(mount.pivot,mount.muzzle));
    }
    this.count++;
  }
}
