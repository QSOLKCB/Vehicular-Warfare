import {createCreatorWorld,defaultPack,MAX_PACK_BYTES,MAX_REPLAY_BYTES,openReplay} from '../sim/creator.js';
import {EDGE} from '../sim/terrain.js';
import {GATE_RADIUS} from '../sim/combined-world.js';

const el=id=>document.getElementById(id);
const map=el('terrainMap'),ctx=map.getContext('2d'),size=map.width;
const sheet=document.createElement('canvas');
sheet.width=sheet.height=320;
const worldToMap=n=>(n+EDGE)*size/(2*EDGE);
const draftKey='vw006:editor-pack';
let accepted,world,chartSeed,previousCrew,operation;

function message(text,error=false){
  el('editorStatus').textContent=text;
  el('editorStatus').dataset.error=String(error);
}
function cancelImport(){operation?.abort();operation=null;}

function buildTerrain(w){
  if(chartSeed===w.seed)return;
  const c=sheet.getContext('2d'),n=sheet.width,pixels=c.createImageData(n,n);
  const bands=new Int16Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=(i+.5)*2*EDGE/n-EDGE,z=(j+.5)*2*EDGE/n-EDGE;
    const {height,normal}=w.field.sample(x,z),h=height-w.water.heightAt(x,z);
    const wet=h<0;
    const t=wet?Math.min(1,-h/9):Math.min(1,h/34);
    const low=wet?[121,174,161]:[191,192,145],high=wet?[48,111,112]:[111,128,99];
    const shade=wet?0:13*(normal[0]+normal[2])+5*normal[1];
    const k=j*n+i,band=bands[k]=Math.floor(h/(wet?2:4));
    const contour=(i>0 && band!==bands[k-1]) || (j>0 && band!==bands[k-n]);
    for(let ch=0;ch<3;ch++)pixels.data[4*k+ch]=low[ch]+(high[ch]-low[ch])*t+shade-(contour?24:0);
    pixels.data[4*k+3]=255;
  }
  c.putImageData(pixels,0,0);
  chartSeed=w.seed;
}

function label(text,x,y){
  ctx.font='bold 13px monospace';
  const w=Math.ceil(ctx.measureText(text).width)+12;
  const left=x+w+15>size?x-w-12:x+12,top=Math.max(2,Math.min(size-22,y-10));
  ctx.fillStyle='#223632ec';ctx.fillRect(left,top,w,20);
  ctx.fillStyle='#fff8df';ctx.textAlign='left';ctx.fillText(text,left+6,top+14);
}

function drawChart(){
  const units=size/(2*EDGE),g=accepted.gate,r=accepted.relay,p=world.player.p;
  const gx=worldToMap(g[0]),gy=worldToMap(g[1]),rx=worldToMap(r[0]),ry=worldToMap(r[1]);
  const px=worldToMap(p[0]),py=worldToMap(p[2]);
  ctx.drawImage(sheet,0,0,size,size);
  ctx.save();
  ctx.strokeStyle='#183c3838';ctx.fillStyle='#213d38';ctx.lineWidth=1;ctx.font='11px monospace';
  ctx.beginPath();
  for(let n=-108;n<=108;n+=36){
    const q=Math.round(worldToMap(n))+.5;
    ctx.moveTo(q,0);ctx.lineTo(q,size);ctx.moveTo(0,q);ctx.lineTo(size,q);
    ctx.fillText(String(n),q+4,14);ctx.fillText(String(n),4,q-4);
  }
  ctx.stroke();

  // A ring uses the actual gate radius. Both markers and crew starts use the world coordinate frame.
  for(const a of world.actors){
    if(a===world.player || a.kind==='relay')continue;
    const x=worldToMap(a.p[0]),y=worldToMap(a.p[2]);
    ctx.fillStyle=a.faction==='cobalt'?'#9ee2dc':'#f4aa84';
    ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle='#263b37';ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.beginPath();ctx.arc(gx,gy,units*GATE_RADIUS,0,2*Math.PI);
  ctx.fillStyle='#42754c40';ctx.fill();
  ctx.strokeStyle='#263c32';ctx.lineWidth=4;ctx.stroke();
  ctx.strokeStyle='#baffc3';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#243b2f';ctx.fillRect(gx-2,gy-2,4,4);
  ctx.beginPath();ctx.moveTo(rx,ry-8);ctx.lineTo(rx+8,ry);ctx.lineTo(rx,ry+8);ctx.lineTo(rx-8,ry);ctx.closePath();
  ctx.fillStyle='#ff9a77';ctx.fill();ctx.strokeStyle='#543927';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(px,py-9);ctx.lineTo(px+6,py+6);ctx.lineTo(px,py+3);ctx.lineTo(px-6,py+6);ctx.closePath();
  ctx.fillStyle='#fff5cc';ctx.fill();ctx.strokeStyle='#2b3d34';ctx.stroke();
  label('START',px,py);label('GATE',gx,gy);label('RELAY',rx,ry);

  ctx.fillStyle='#203633de';ctx.fillRect(12,size-34,106,23);
  ctx.fillStyle='#f1f0de';ctx.fillText('24 m',20,size-18);
  const x=55,y=size-20;
  ctx.strokeStyle='#f1f0de';ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(x,y-4);ctx.lineTo(x,y);ctx.lineTo(x+24*units,y);ctx.lineTo(x+24*units,y-4);ctx.stroke();
  ctx.restore();
}

function showPack(input){
  world=createCreatorWorld(input);
  const pack=world.pack;
  accepted=pack;
  el('packTitle').value=pack.title;el('packSeed').value=pack.seed;
  el('packCrew').value=pack.crew;previousCrew=pack.crew;
  for(const kind of ['gate','relay']){
    el(kind+'X').value=pack[kind][0];el(kind+'Z').value=pack[kind][1];
  }
  buildTerrain(world);
  drawChart();
}
function savePack(input){
  showPack(input);
  try{
    localStorage.setItem(draftKey,JSON.stringify(accepted));
    el('draftState').textContent='Saved locally';
  }catch{
    el('draftState').textContent='Session only';
  }
}
function fromForm(){
  return {version:1,title:el('packTitle').value,seed:el('packSeed').valueAsNumber,crew:el('packCrew').value,
    gate:[el('gateX').valueAsNumber,el('gateZ').valueAsNumber],relay:[el('relayX').valueAsNumber,el('relayZ').valueAsNumber]};
}
function applyForm(){
  cancelImport();
  try{
    savePack(fromForm());message('Mission ready to playtest.');return true;
  }catch(error){
    message(error.message,true);return false;
  }
}

el('packForm').addEventListener('submit',e=>{e.preventDefault();applyForm();});
el('packForm').addEventListener('input',e=>{
  cancelImport();
  if(e.target.type==='radio')return;
  el('draftState').textContent='Unapplied edits';
  message('Apply your changes to update the chart.');
});
el('packCrew').addEventListener('change',()=>{
  const seed=el('packSeed').valueAsNumber;
  // Carry a custom gate through crew edits. Move a template gate to its new crew's lane.
  if(Number.isInteger(seed) && seed>=0 && seed<=0xffffffff){
    const [x,z]=defaultPack(previousCrew,seed).gate;
    if(el('gateX').valueAsNumber===x && el('gateZ').valueAsNumber===z){
      const [nx,nz]=defaultPack(el('packCrew').value,seed).gate;
      el('gateX').value=nx;el('gateZ').value=nz;
    }
  }
  previousCrew=el('packCrew').value;
});
function activeMarker(){return el('placeGate').checked?'gate':'relay';}
function placeMarker(x,z){
  const kind=activeMarker(),xInput=el(kind+'X'),zInput=el(kind+'Z');
  const prior=[xInput.value,zInput.value];
  xInput.value=x;zInput.value=z;
  if(applyForm())message((kind==='gate'?'Gate':'Shore relay')+' placed at X '+x+', Z '+z+'.');
  else{xInput.value=prior[0];zInput.value=prior[1];}
}
map.addEventListener('click',e=>{
  const rect=map.getBoundingClientRect();
  placeMarker(Math.round((e.clientX-rect.left)/rect.width*2*EDGE-EDGE),
    Math.round((e.clientY-rect.top)/rect.height*2*EDGE-EDGE));
});
map.addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!Object.hasOwn(moves,e.key))return;
  e.preventDefault();const [dx,dz]=moves[e.key],kind=activeMarker();
  placeMarker(el(kind+'X').valueAsNumber+dx,el(kind+'Z').valueAsNumber+dz);
});
el('resetPack').addEventListener('click',()=>{
  cancelImport();savePack(defaultPack());el('placeGate').checked=true;message('Starter mission restored.');
});
el('exportPack').addEventListener('click',()=>{
  if(!applyForm())return;
  const file=new Blob([JSON.stringify(accepted,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(file),anchor=document.createElement('a');
  anchor.href=url;anchor.download='workshop-'+accepted.seed+'.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);message('Mission pack exported.');
});
el('playPack').addEventListener('click',()=>{
  if(!applyForm())return;
  try{sessionStorage.setItem('vw006:play-pack',JSON.stringify(accepted));location.assign('./creator-play.html');}
  catch{message('This browser could not store the playtest. Enable local storage and try again.',true);}
});

async function loadFile(input,replay){
  const file=input.files[0];if(!file)return;
  input.value='';
  cancelImport();const task=operation=new AbortController();
  try{
    if(file.size>(replay?MAX_REPLAY_BYTES:MAX_PACK_BYTES))throw Error('File exceeds the '+(replay?'replay':'mission pack')+' size limit.');
    const text=await file.text();
    if(task.signal.aborted)return;
    if(replay){
      message('Checking the recorded run…');
      await openReplay(text,{signal:task.signal});
      if(task.signal.aborted)return;
      sessionStorage.setItem('vw006:view-replay',text);
      location.assign('./creator-play.html?replay');
    }else{
      savePack(text);message('Mission pack imported.');
    }
  }catch(error){
    if(!task.signal.aborted)message('Could not open file. '+error.message,true);
  }finally{if(operation===task)operation=null;}
}
for(const [button,input,replay] of [['importButton','importPack',false],['replayButton','openReplay',true]]){
  el(button).addEventListener('click',()=>{cancelImport();el(input).click();});
  el(input).addEventListener('change',()=>loadFile(el(input),replay));
}
window.addEventListener('pagehide',cancelImport);

let saved;
try{
  saved=localStorage.getItem(draftKey);
  showPack(saved===null?defaultPack():saved);
  el('draftState').textContent=saved===null?'Starter mission':'Saved locally';
  message(saved===null?'Edit the starter mission or import a saved pack.':'Local mission restored.');
}catch(error){
  showPack(defaultPack());
  el('draftState').textContent='Starter mission';
  message('Could not restore the local mission. '+error.message,true);
}
