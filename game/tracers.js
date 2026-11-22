import {add,cross,dot,length,normalize,rotate,scale,subtract} from '../vendor/vanillajs/modules/math/index.js';

// Two billboard ribbons per live shot. The tail follows already travelled
// positions and the camera-facing head keeps approaching rounds visible.
export class Tracers {
  constructor(renderer){
    this.data=new Float32Array(32*15*6);
    this.mesh=renderer.mesh([]);
  }
  draw(renderer,w,eye,camera){
    let cursor=0;
    const put=(p,c)=>{this.data.set(p,cursor);this.data.set(c,cursor+3);cursor+=6;};
    const right=rotate(camera,[1,0,0]),up=rotate(camera,[0,1,0]);
    let incoming=false;
    for(const shot of w.shots){
      const direction=normalize(shot.step),toEye=subtract(eye,shot.p);
      const enemy=shot.owner!=='player',tint=enemy?[1,.24,.07]:[1,.68,.15],core=[1,.94,.72];
      const toPlayer=subtract(w.player.p,shot.p);
      if(enemy && length(toPlayer)<100 && dot(toPlayer,direction)>0)incoming=true;
      const tail=add(shot.p,scale(shot.step,-Math.min(480-shot.life,enemy?22:13)));
      const axis=cross(direction,toEye),side=length(axis)>.001?normalize(axis):right;
      const width=enemy ? .38 : .26;
      for(const [size,col] of [[width,tint],[width*.38,core]]){
        const span=scale(side,size),left=add(shot.p,span),r=subtract(shot.p,span);
        const end=add(tail,scale(span,.16));
        put(left,col);put(r,col);put(end,col);put(end,col);put(r,col);put(subtract(tail,scale(span,.16)),col);
      }
      put(add(shot.p,scale(up,width)),core);
      put(add(shot.p,scale(right,width)),core);put(subtract(shot.p,scale(right,width)),core);
    }
    if(cursor){
      renderer.update(this.mesh,this.data.subarray(0,cursor));renderer.draw(this.mesh);
    }
    return {vertices:cursor/6,incoming};
  }
}
