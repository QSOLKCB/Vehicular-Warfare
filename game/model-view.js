import {normalize,quatMultiply,rotate} from '../vendor/vanillajs/modules/math/index.js';

export function turn(axis, radians) {
  const q=[0,0,0,Math.cos(radians/2)]; q[axis]=Math.sin(radians/2); return q;
}
export function look(direction) {
  const d=normalize(direction);
  return quatMultiply(turn(1,Math.atan2(-d[0],-d[2])),turn(0,Math.asin(d[1])));
}
export class Model {
  constructor(renderer, vertices) {
    this.src=new Float32Array(vertices); this.data=this.src.slice(); this.mesh=renderer.mesh(this.data);
  }
  draw(renderer,p,q) {
    const x=rotate(q,[1,0,0]),y=rotate(q,[0,1,0]),z=rotate(q,[0,0,1]);
    this.drawBasis(renderer,p,x,y,z);
  }
  drawBasis(renderer,p,x,y,z) {
    for(let i=0;i<this.src.length;i+=6) {
      const a=this.src[i],b=this.src[i+1],c=this.src[i+2];
      for(let k=0;k<3;k++) this.data[i+k]=p[k]+x[k]*a+y[k]*b+z[k]*c;
    }
    renderer.update(this.mesh,this.data); renderer.draw(this.mesh);
  }
}
