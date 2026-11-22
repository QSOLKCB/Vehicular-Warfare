import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync('vendor/vanillajs/provenance.json'));
const released=JSON.parse(readFileSync('evidence/release-performance/provenance.json'));

test('Silicon Bridge carries every v0.2.0 engine file at its released checksum',()=>{
  for(const [path,hash] of Object.entries(released.vendorSha256))
    assert.equal(manifest.sha256[path],hash,path);
});

test('the pinned graphics registry closure includes every selected root and dependency',()=>{
  assert.equal(manifest.commit,'9d95d74b355ec17add32db0b55f0f71130f9c004');
  assert.deepEqual(manifest.roots,['terrain','collision','render-webgl','render-packing','fx-pipe','blit','copper']);
  const modules=new Set(manifest.roots);
  for(const name of modules){
    for(const dep of manifest.dependencies[name])modules.add(dep);
  }
  assert.deepEqual(Object.keys(manifest.dependencies).sort(),[...modules].sort());
  const files=['LICENSE','NOTICE',...[...modules].map(name=>'modules/'+name+'/index.js')];
  assert.deepEqual(Object.keys(manifest.sha256).sort(),files.sort());
  assert.deepEqual(manifest.dependencies['fx-pipe'],['integer-math']);
});
