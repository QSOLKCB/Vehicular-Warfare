import {cross,dot,normalize,subtract,seededRandom} from '../vendor/vanillajs/modules/math/index.js';
import {facet} from './models.js';
export function landscape(w) {
  const out=[],rng=seededRandom(w.seed+17);
  for(let j=0;j<w.field.cellsZ;j++) for(let i=0;i<w.field.cellsX;i++) for(const tri of w.field.triangleAt(i,j)) {
    const [a,b,c]=tri, n=normalize(cross(subtract(b,a),subtract(c,a)));
    const h=(a[1]+b[1]+c[1])/3;
    const sunlight=Math.max(0,dot(n,normalize([-.65,.8,-.55])));
    const shade=.65+.38*sunlight+rng()*.045;
    const base=h>38?[.54,.49,.50]:h>19?[.61,.46,.39]:h>8?[.64,.49,.36]:[.59,.53,.37];
    facet(out,a,b,c,base,shade);
  }
  // Angular junipers give the ridgeline scale. Keep the convoy corridor open.
  for(let i=0;i<(w.route?2000:850);i++){
    const x=(rng()-.5)*270,z=w.route?132-rng()*930:(rng()-.5)*270;
    if(Math.abs(x)<19 && z<50 && z>-44) continue;
    const y=w.field.sample(x,z).height, h=1.5+rng()*4, radius=h*.31;
    for(let side=0;side<5;side++) {
      const v=(k,r,alt)=>[x+Math.cos(k*1.25664)*r,alt,z+Math.sin(k*1.25664)*r];
      const tint=[.25,.32,.24];
      facet(out,v(side,radius,y),v(side+1,radius,y),[x,y+h*.78,z],tint,.72+side*.09);
      facet(out,v(side,radius*.74,y+h*.32),v(side+1,radius*.74,y+h*.32),[x,y+h,z],tint,.88+side*.08);
    }
  }
  // Painted sky, distant foothills and cut-disc sun share one static mesh.
  const sky=[], latitude=[[-.55,[.71,.53,.50]],[-.025,[.89,.64,.48]],
    [.12,[.96,.71,.48]],[.26,[.76,.58,.57]],[.56,[.38,.43,.53]],[1.58,[.16,.23,.34]]];
  const pos=(a,b)=>[510*Math.sin(a)*Math.cos(b),510*Math.sin(b),-510*Math.cos(a)*Math.cos(b)];
  for(let j=1;j<latitude.length;j++) for(let i=0;i<96;i++) {
    const [lo,lc]=latitude[j-1],[hi,hc]=latitude[j],a=i*Math.PI/48,b=(i+1)*Math.PI/48;
    for(const [az,el,col] of [[a,lo,lc],[a,hi,hc],[b,lo,lc],[b,lo,lc],[a,hi,hc],[b,hi,hc]])
      sky.push(...pos(az,el),...col);
  }
  for(let layer=0;layer<2;layer++){
    const r=390-60*layer,col=layer?[.49,.41,.43]:[.66,.50,.49];
    const rim=Array.from({length:120},(_,i)=>{
      const a=i*Math.PI/60,h=27+12*Math.sin(5*a+.8*layer)+15*Math.cos(9*a)+rng()*9-8*layer;
      return [r*Math.sin(a),h,-r*Math.cos(a)];
    });
    rim.forEach((a,i)=>{
      const b=rim[(i+1)%rim.length],c=[a[0],-80,a[2]],d=[b[0],-80,b[2]];
      facet(sky,a,b,c,col);facet(sky,c,b,d,col);
    });
  }
  for(let i=0;i<72;i++){
    const v=k=>[96+37*Math.cos(k*Math.PI/36),65+37*Math.sin(k*Math.PI/36),-416];
    facet(sky,[96,65,-416],v(i),v(i+1),[1,.86,.58]);
  }
  return {land:out,sky};
}
