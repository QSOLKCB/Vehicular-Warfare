import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyRenderer} from '../tools/release-profile.mjs';

test('release measurements distinguish the active renderer from a requested GPU backend',()=>{
  const hardware='ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)';
  const software='ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
  qualifyRenderer('native',hardware);
  qualifyRenderer('software',software);
  for(const name of [software,'Intel OpenGL Mesa llvmpipe','Microsoft Basic Render Driver','Generic WebGL','',null])
    assert.throws(()=>qualifyRenderer('native',name));
  assert.throws(()=>qualifyRenderer('software',hardware));
  assert.throws(()=>qualifyRenderer('unclassified',hardware));
});
