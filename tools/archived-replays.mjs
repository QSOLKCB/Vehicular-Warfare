// Read the released evidence from Git, including receipts nested in playthrough
// and benchmark reports. This verifier is developer tooling outside the ZIP.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const release='0132dd22191ebfeddfce8bc76651e09eb2f12b48';
const apis={
  sable:['world.js','replay','receipt'],
  longwatch:['world.js','replay','receipt'],
  frostline:['world.js','replay','receipt'],
  cutbank:['tank-world.js','replayTank','tankReceipt'],
  glassworks:['mech-world.js','replayMech','mechReceipt'],
  lantern:['naval-world.js','replayNaval','navalReceipt'],
  breakwater:['combined-world.js','replayCombined','combinedReceipt'],
  workshop:['creator.js','replayCreator','creatorReceipt']
};

function releaseCatalogue(){
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
  const files=git('ls-tree','-rz','--name-only',release,'--','evidence').split('\0').filter(f=>f.endsWith('.json'));
  const recordings=new Map();
  for(const name of files){
    // The two *-outcomes files were produced by the standalone Node mission
    // drivers. All other numerical reports identify Node in their metadata.
    function visit(value,pointer,runtime){
      if(!value || typeof value!=='object')return;
      if(typeof value.node==='string' && /^v\d+\./.test(value.node))runtime='node';
      if(Object.hasOwn(value,'commands')){
        assert.ok(Array.isArray(value.commands) && value.source && value.stateHash && value.eventHash,pointer);
        const text=JSON.stringify(value);
        const id=createHash('sha256').update(text).digest('hex');
        if(!recordings.has(id))recordings.set(id,{id,recording:value,locations:[]});
        recordings.get(id).locations.push({file:name,pointer,runtime});
        return;
      }
      for(const [key,item] of Object.entries(value)){
        if(item && typeof item==='object'){
          visit(item,pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),runtime);
        }
      }
    }
    visit(JSON.parse(git('show',release+':'+name)),'',name.endsWith('-outcomes.json')?'node':'chromium');
  }
  return [...recordings.values()];
}

// The browser executes this same function through CDP on the packaged page.
async function verifyInRuntime(moduleUrl,play,record,recording){
  const api=await import(moduleUrl);
  const world=api[play](JSON.stringify(recording));
  return {status:world.status,receipt:api[record](world)};
}

export async function archivedReplays({evaluate,webRoot}){
  const catalogue=releaseCatalogue();
  const occurrences=catalogue.reduce((count,item)=>count+item.locations.length,0);
  assert.equal(occurrences,204,'v0.2.0 archived receipt occurrences');
  assert.equal(catalogue.length,107,'v0.2.0 distinct archived receipts');
  const results=[];
  for(const {id,recording,locations} of catalogue){
    const mission=recording.mission??'sable';
    const [file,play,record]=apis[mission];
    const checked={};
    for(const runtime of new Set(locations.map(place=>place.runtime))){
      const args=[play,record,recording];
      const result=runtime==='node'?
        await verifyInRuntime(pathToFileURL(join(webRoot,'sim',file)).href,...args):
        await evaluate('('+verifyInRuntime+')('+['./sim/'+file,...args].map(v=>JSON.stringify(v)).join(',')+')',60000);
      // The original Sable importer validates its old source key and returns
      // the current source key when saving the reproduced world.
      const expectedSource=recording.source==='vw-001a:a9aee959be3e65883671613ea34c5ccb75628ea220ef935e75d92beb5e5986bc'?
        'vw-001a:510b596e40cc515d1ac9a6b8281fd4c06559258f83a1c179b082426954733ecb':recording.source;
      assert.deepEqual(result.receipt,{...recording,source:expectedSource},locations[0].file+'#'+locations[0].pointer);
      checked[runtime]=result.status;
    }
    results.push({id,mission,source:recording.source,ticks:recording.ticks,stateHash:recording.stateHash,
      eventHash:recording.eventHash,checked,locations});
  }
  return {release,node:process.version,occurrences,distinct:results.length,results};
}
