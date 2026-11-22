// Runs in the acceptance page. The Sable Valley cockpit looks north across
// the first ridge. Two diagnostic magenta triangles have the same projection.
export async function terrainDepthProbe(){
  const {createWorld}=await import('./sim/world.js');
  const {View}=await import('./game/view.js');
  const w=createWorld(), p=w.player.p;
  const eye=[p[0],p[1]+.45,p[2]-1.15];  // Initial level, unbanked cockpit.
  const far=[[-3,4,-22],[3,4,-22],[0,8,-22]];
  const near=far.map(vertex=>vertex.map((n,i)=>eye[i]+.2*(n-eye[i])));
  const hit=vertex=>Boolean(w.field.castSegment(eye,vertex.map((n,i)=>n-eye[i])));
  if(!far.every(hit) || near.some(hit))throw Error('Occlusion probe no longer straddles the accepted ridge');
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:200px';
  document.body.append(canvas);
  let view;
  try{
    view=new View(canvas,w);
    const r=view.r,gl=r.gl;
    const marker=vertices=>r.mesh(vertices.flatMap(v=>[...v,1,0,1]));
    const ahead=marker(near),behind=marker(far);
    const count=()=>{
      const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let n=0;
      for(let i=0;i<pixels.length;i+=4){
        if(pixels[i]>160 && pixels[i+1]<24 && pixels[i+2]>160)n++;
      }
      return n;
    };
    const modes=[];
    for(const mode of ['webgl','voxel']){
      view.render(w,'cockpit',false,false,mode);
      const baseline=count();
      r.draw(behind);
      const hidden=count();
      r.draw(ahead);
      const visible=count();
      // Positive control at the far location. Clear the near marker and the
      // rest of the scene before drawing with exact terrain depth bypassed.
      view.render(w,'cockpit',false,false,mode);
      gl.disable(gl.DEPTH_TEST);r.draw(behind);gl.enable(gl.DEPTH_TEST);
      const withoutDepth=count();
      if(baseline!==0 || hidden!==0 || visible<20 || withoutDepth<20)throw Error('Unexpected '+mode+' marker coverage '+[baseline,hidden,visible,withoutDepth]);
      modes.push({mode,baseline,behindRidge:hidden,aheadOfRidge:visible,behindWithDepthDisabled:withoutDepth});
    }
    const resources=()=>{
      const {buffer,program,texture}=view.columns;
      return ()=>[gl.isBuffer(buffer),gl.isProgram(program),gl.isTexture(texture)];
    };
    const first=resources(), live=first();
    view.render(w,'cockpit',false,false,'webgl');
    const switched=first();
    view.render(w,'cockpit',false,false,'voxel');
    const second=resources();
    view.dispose();view=null;
    const disposed=second();
    if(!live.every(Boolean) || switched.some(Boolean) || disposed.some(Boolean))throw Error('Column GPU object lifetime mismatch');
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error during terrain probe');
    return {eye,far,near,modes,objects:['buffer','program','texture'],live,switched,disposed};
  }finally{
    view?.dispose();
    canvas.remove();
  }
}
