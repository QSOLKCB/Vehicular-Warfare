// Developer acceptance driver for a local Chromium binary. All flight controls
// go through CDP Input events. The game exposes detached observations only.
import {routeFlights} from './route-flights.mjs';
import {terrainFlights} from './terrain-flights.mjs';
import {tankSortie} from './tank-sortie.mjs';
import {mechSortie} from './mech-sortie.mjs';
import {navalSortie} from './naval-sortie.mjs';
import {combinedSortie} from './combined-sortie.mjs';
import {creatorSortie} from './creator-sortie.mjs';
import {releaseProfile,qualifyRenderer} from './release-profile.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,symlink,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir,cpus,release} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {K,replay,receipt} from '../sim/world.js';

const chrome=process.env.CHROMIUM || 'google-chrome';
const backend=process.env.CHROMIUM_BACKEND ?? 'software';
if(!['native','software'].includes(backend))throw RangeError('CHROMIUM_BACKEND must be native or software');
const graphicsFlags=backend==='software'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:
  ['--enable-gpu','--disable-software-rasterizer',...(process.platform==='linux'?['--use-gl=angle','--use-angle=gl']:[])];
const webRoot=resolve(process.env.RIDGEFIRE_WEB_ROOT || process.cwd());
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// An extracted ZIP has no .git directory. Check the files used by the browser
// against the selected checkout, and give their bytes a location-independent ID.
async function identifyRuntime(){
  const manifest=createHash('sha256');
  let files=0;
  const tree=execFileSync('git',['ls-tree','-rz','--full-tree',source],{encoding:'utf8'});
  for(const entry of tree.split('\0')){
    if(!entry)continue;
    const [header,name]=entry.split('\t');
    if(!/^(?:assets|game|sim|vendor)\//.test(name) && !/^[^/]+\.html$/.test(name))continue;
    const expected=header.split(' ')[2],bytes=await readFile(join(webRoot,name));
    const oid=createHash(expected.length===40?'sha1':'sha256').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(oid,expected,'Packaged runtime file differs at '+name);
    manifest.update(name+'\0').update(createHash('sha256').update(bytes).digest());files++;
  }
  assert.ok(files>0,'Expected runtime files in the source tree');
  return {revision:source,files,sha256:manifest.digest('hex')};
}
const servedTree=process.env.RIDGEFIRE_WEB_ROOT?await identifyRuntime():undefined;
const output=resolve(process.argv[2] || 'evidence/browser');
await mkdir(output,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'ridgefire-browser-'));
const serve=join(temp,'www'); await mkdir(serve);
await symlink(webRoot,join(serve,'ridgefire'));
const server=spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1','--directory',serve]);
server.stderr.resume();
const line=String((await once(server.stdout,'data'))[0]);
const port=line.match(/port (\d+)/)[1],base='http://127.0.0.1:'+port;
const browser=spawn(chrome,['--headless=new','--disable-background-networking','--no-first-run',
  '--disable-default-apps',...graphicsFlags,
  '--window-size=1100,760','--remote-debugging-pipe','--user-data-dir='+join(temp,'profile'),
  'about:blank'],
  {stdio:['ignore','ignore','pipe','pipe','pipe']});
let stderr='',buffer='',seq=0,sessionId;
for(const stream of [browser.stdio[3],browser.stdio[4]]) stream.on('error',()=>{});
browser.stderr.on('data',v=>stderr=(stderr+v).slice(-4000));
const pending=new Map(),errors=[],urls=new Set();
browser.stdio[4].on('data',data=>{
  buffer+=data;
  for(let end;(end=buffer.indexOf('\0'))>=0;){
    const m=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
    if(m.id){const cb=pending.get(m.id);pending.delete(m.id);cb?.(m);}
    if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if(m.method==='Network.requestWillBeSent') urls.add(m.params.request.url);
    if(m.method==='Network.loadingFailed' && !m.params.canceled) errors.push(m.params.errorText);
  }
});
browser.once('exit',()=>{for(const cb of pending.values()) cb({error:{message:stderr||'Browser exited'}});});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={},session=sessionId,timeout=12000){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method+' '+stderr));},timeout);
    pending.set(id,m=>{clearTimeout(timer);m.error?fail(Error(m.error.message)):ok(m.result);});
    browser.stdio[3].write(JSON.stringify({id,method,params,sessionId:session??undefined})+'\0');
  });
}
async function evaluate(expression,timeout){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId,timeout);
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const read=()=>evaluate("import('./game/main.js').then(m=>m.inspect())");
async function until(check,label){
  let s;
  for(let i=0;i<170;i++){
    s=await read(); if(check(s))return s;
    await sleep(35);
  }
  throw Error(label+' timed out at '+JSON.stringify([s.mode,s.tick,s.position,s.aa.mode,s.hp,s.ammo,s.reason,errors]));
}
const key=(code,down)=>send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,
  key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code});
async function click(id){
  const [x,y]=await evaluate("(()=>{const r=document.getElementById("+JSON.stringify(id)+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
  await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);
}
const mouse=(type,x=515,y=390,button='left')=>send('Input.dispatchMouseEvent',{type,x,y,button,clickCount:1});
async function screenshot(name){
  const {data}=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(output,name+'.png'),Buffer.from(data,'base64'));
}
const marks=[];
function mark(name,s){marks.push({name,tick:s.tick,aa:s.aa.mode,convoy:s.convoy.mode,hp:s.hp,ammo:s.ammo,position:s.position,draw:s.metrics.lastDraw,geometryBytes:s.metrics.geometryBytes,liveBuffers:s.metrics.buffers});}
const quantiles=arr=>{
  const a=[...arr].sort((x,y)=>x-y);
  return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};
};
try{
  const version=await send('Browser.getVersion');
  const {targetInfos}=await send('Target.getTargets');
  const page=targetInfos.find(t=>t.type==='page');
  ({sessionId}=await send('Target.attachToTarget',{targetId:page.targetId,flatten:true}));
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/ridgefire/'});
  for(let i=0;i<100 && !await evaluate("document.querySelector('#primary')!==null && document.readyState==='complete'");i++) await sleep(60);
  const initial=await read();
  assert.equal(initial.mode,'briefing');
  const gpu=await evaluate("(()=>{const g=document.querySelector('canvas').getContext('webgl'),e=g.getExtension('WEBGL_debug_renderer_info');return {backend:g.getParameter(e.UNMASKED_RENDERER_WEBGL),width:g.drawingBufferWidth,height:g.drawingBufferHeight}})()");
  qualifyRenderer(backend,gpu.backend);
  if(process.env.RIDGEFIRE_TEST_REPLAY){
    const dom=await send('DOM.getDocument');
    const {nodeId}=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#checkFile'});
    await send('DOM.setFileInputFiles',{nodeId,files:[resolve(process.env.RIDGEFIRE_TEST_REPLAY)]});
    let message='';
    for(let i=0;i<100 && !message;i++){
      message=await evaluate("document.querySelector('#checkResult').textContent");await sleep(20);
    }
    assert.match(message,/^Verified ·/);console.log(message);
  }
  const family=process.argv[3];
  const stationSorties={tank:tankSortie,mech:mechSortie,naval:navalSortie,combined:combinedSortie,creator:creatorSortie};
  if(family==='profile' || family==='profile-base' || family==='controls'){
    const io={click,key,mouse,evaluate,send,screenshot,sleep,output};
    const result=family==='controls'?await (await import('./control-sortie.mjs')).controlSortie(io):
      await releaseProfile(io,{baseOnly:family==='profile-base',backend});
    assert.deepEqual(errors,[]);
    assert.ok([...urls].every(u=>u.startsWith(base+'/ridgefire/') || u.startsWith('blob:'+base+'/') || u==='data:,'));
    const {gpu:system}=await send('SystemInfo.getInfo',{},null);
    const report={source,servedTree,host:{platform:process.platform,arch:process.arch,osRelease:release()},
      driver:execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('.',import.meta.url),encoding:'utf8'}).trim(),
      version,cpu:cpus()[0].model,backend,graphicsFlags,gpu,devices:system.devices,webgl:system.featureStatus?.webgl,
      requests:[...urls].map(u=>u.replace(base,'')),errors,...result};
    await writeFile(join(output,family+'.json'),JSON.stringify(report,null,1)+'\n');
    console.log(family,backend,gpu.backend,'passed');
  }else if(Object.hasOwn(stationSorties,family)){
    const sortie=stationSorties[family];
    const result=await sortie({click,key,mouse,evaluate,send,screenshot,sleep,output});
    assert.deepEqual(errors,[]);
    assert.ok([...urls].every(u=>u.startsWith(base+'/ridgefire/') || u.startsWith('blob:'+base+'/') || u==='data:,'));
    const report={source,servedTree,
      version,cpu:cpus()[0].model,requests:[...urls].map(u=>u.replace(base,'')),errors,...result};
    await writeFile(join(output,family+'.json'),JSON.stringify(report,null,1)+'\n');
    if(family==='combined'){
      for(const run of result.runs)console.log(run.selection,run.win.receipt.ticks,'ticks to victory');
    }else console.log(family,result.win.receipt.ticks,'ticks to victory');
  }else if(process.argv[3]==='terrain'){
    const result=await terrainFlights({read,key,click,screenshot,evaluate,send,until,quantiles});
    assert.deepEqual(errors,[]);
    assert.ok([...urls].every(u=>u.startsWith(base+'/ridgefire/') || u==='data:,'));
    const report={source,servedTree,
      version,cpu:cpus()[0].model,gpu,requests:[...urls].map(u=>u.replace(base,'')),errors,...result};
    await writeFile(join(output,'terrain.json'),JSON.stringify(report,null,1)+'\n');
    console.log(report.measurements.map(({mode,summary})=>({mode,summary})));
  }else if(process.argv[3]==='routes'){
    await routeFlights({read,key,click,screenshot,evaluate,sleep,output});
    assert.deepEqual(errors,[]);
    assert.ok([...urls].every(u=>u.startsWith(base+'/ridgefire/') || u==='data:,'));
    await writeFile(join(output,'runtime.json'),JSON.stringify({version,gpu,cpu:cpus()[0].model,
      source,servedTree,errors},null,2));
  }else{
  await evaluate("const sel=document.querySelector('#sortie');sel.value='sable';sel.dispatchEvent(new Event('change'))");
  await screenshot('01-briefing');
  // Exercise the advertised turn keys in a real flight and verify that
  // releasing a legacy alias still leaves its companion key held.
  await click('primary');
  await key('KeyW',true);await key('KeyD',true);
  await until(v=>v.position[2]<37.8 && v.held===(K.forward|K.yawRight),'forward right turn');
  const heading=()=>evaluate("Number.parseInt(document.querySelector('#heading').textContent)");
  assert.ok(await heading()>0);
  await key('KeyW',false);await key('KeyD',false);
  await key('KeyA',true);
  await until(v=>v.held===K.yawLeft && v.position[2]<37.7,'left turn');
  await key('ArrowLeft',true);await key('KeyA',false);assert.equal((await read()).held,K.yawLeft);
  await key('ArrowLeft',false);
  await key('KeyE',true);await key('KeyR',true);await key('KeyR',false);
  assert.equal((await read()).held,K.up);
  await key('KeyP',true);await key('KeyP',false);assert.equal((await read()).held,0);
  await key('KeyE',false);await click('menu');
  await click('primary');
  let s=await until(v=>v.tick>=35,'startup');
  mark('concealed',s);assert.equal(s.aa.visible,false);assert.equal(s.aa.lastSeen,null);
  await screenshot('02-masked');
  await key('Space',true);await until(v=>v.ammo===15,'launch into ridge');await key('Space',false);
  await until(v=>v.events.some(e=>e.type==='impact'&&e.target==='terrain'),'ridge contact');
  await key('KeyE',true);s=await until(v=>v.aa.visible,'exposure');await key('KeyE',false);
  const first=s.tick-s.aa.seen+1; mark('acquiring',s);
  s=await until(v=>v.events.some(e=>e.type==='launch'&&e.owner==='aa'),'AA reaction');
  assert.equal(s.events.find(e=>e.type==='launch'&&e.owner==='aa').tick-first,119);
  await mouse('mousePressed');await until(v=>v.ammo===14,'mouse launch');await mouse('mouseReleased');
  await screenshot('03-exposed');
  await key('KeyQ',true);s=await until(v=>v.aa.mode==='search','search');await key('KeyQ',false);
  mark('search',s);
  await screenshot('04-search');
  await until(v=>v.aa.mode==='idle','memory expires');
  await key('KeyC',true);await key('KeyC',false);assert.equal((await read()).camera,'cockpit');
  await screenshot('05-cockpit');
  await key('KeyE',true);await until(v=>v.position[1]>21,'second climb');await key('KeyE',false);
  await key('Space',true);s=await until(v=>v.mode==='victory','victory');await key('Space',false);
  assert.equal(s.metrics.buffers,0);assert.equal(s.metrics.retired,0);assert.equal(s.metrics.rafActive,false);
  mark('victory',s); await screenshot('06-victory');
  const win=s;
  assert.deepEqual(receipt(replay(JSON.stringify(s.receipt))),s.receipt);
  await click('primary');s=await until(v=>v.tick>2,'rematch');
  assert.equal(s.held,0);assert.equal(s.hp,100);assert.equal(s.ammo,16);
  await key('KeyE',true);await until(v=>v.position[1]>20,'expose for defeat');await key('KeyE',false);
  s=await until(v=>v.mode==='defeat','combat defeat');assert.equal(s.hp,0);
  assert.ok(s.events.some(e=>e.type==='destroy'&&e.target==='player'&&e.shot>0));
  const loss=s;mark('defeat',s);await screenshot('07-defeat');
  assert.deepEqual(receipt(replay(JSON.stringify(s.receipt))),s.receipt);
  const lifecycle=[];
  for(const reason of ['pause','blur','hidden','unlock']){
    await click('primary');await key('KeyW',true);await until(v=>v.held!==0,'held movement');
    if(reason==='pause')await click('pause');
    if(reason==='blur')await evaluate("window.dispatchEvent(new Event('blur'))");
    if(reason==='hidden')await evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");
    if(reason==='unlock'){
      await mouse('mousePressed',515,390,'right');await mouse('mouseReleased',515,390,'right');
      assert.equal(await evaluate("document.pointerLockElement===document.querySelector('canvas')"),true);
      await evaluate('document.exitPointerLock()');
    }
    s=await until(v=>v.mode==='paused','pause on '+reason);
    assert.deepEqual([s.held,s.metrics.buffers,s.metrics.sessionActive,s.metrics.rafActive,s.metrics.retired],[0,0,false,false,0]);
    await sleep(180);assert.equal((await read()).tick,s.tick);
    await send('HeapProfiler.collectGarbage');
    lifecycle.push({reason,tick:s.tick,disposals:s.metrics.disposals,buffers:s.metrics.buffers,
      dom:await send('Memory.getDOMCounters'),heap:await send('Runtime.getHeapUsage')});
    await key('KeyW',false);await click('again');await until(v=>v.mode==='flying'&&v.tick>=1,'fresh sortie');
    assert.equal((await read()).held,0);await click('pause');
  }
  // An actual foreground-tab change in addition to isolated lifecycle notifications.
  await click('primary');await key('KeyW',true);await until(v=>v.held!==0,'tab switch input');
  const other=await send('Target.createTarget',{url:'about:blank',background:false},null);
  await send('Target.activateTarget',{targetId:other.targetId},null);
  s=await until(v=>v.mode==='paused','background tab pause');
  assert.equal(s.held,0); assert.equal(s.metrics.buffers,0);
  lifecycle.push({reason:'foreground tab switched',tick:s.tick,buffers:s.metrics.buffers});
  await send('Target.activateTarget',{targetId:page.targetId},null);
  await send('Target.closeTarget',{targetId:other.targetId},null);
  // Exercise the normal startup failure UI in a freshly navigated document.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k==='webgl'?null:orig.call(this,k,...a)}"});
  await send('Page.reload',{ignoreCache:true});await sleep(500);
  assert.equal((await read()).mode,'error');
  assert.deepEqual(errors,[]);
  assert.ok([...urls].every(u=>u.startsWith(base+'/ridgefire/') || u==='data:,'));
  const report={source,servedTree,
    version,cpu:cpus()[0].model,gpu,requests:[...urls].map(u=>u.replace(base,'')),errors,
    marks,lifecycle,renderIntervalsMs:quantiles(win.metrics.frames),tickTimeMs:quantiles(win.metrics.costs),
    win:{receipt:win.receipt,metrics:win.metrics,events:win.events},loss:{receipt:loss.receipt,metrics:loss.metrics,events:loss.events}};
  await writeFile(join(output,'playthrough.json'),JSON.stringify(report,null,1)+'\n');
  console.log(JSON.stringify({version:version.product,gpu,marks,frames:report.renderIntervalsMs,errors},null,2));
  }
}finally{
  browser.kill();server.kill();
  if(browser.exitCode===null && browser.signalCode===null) await once(browser,'exit');
  await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
