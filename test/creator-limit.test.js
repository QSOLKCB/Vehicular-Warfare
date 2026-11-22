import test from 'node:test';
import assert from 'node:assert/strict';
import {BK,COMBINED_LIMIT,combinedReceipt,createCombinedWorld,stepCombined} from '../sim/combined-world.js';
import {createCreatorWorld,creatorReceipt,defaultPack,MAX_REPLAY_BYTES,openReplay} from '../sim/creator.js';

test('both replay formats seek across a full two-minute recording with one change every tick',async()=>{
  const order=[COMBINED_LIMIT,7199,7200,7201,120,14399,0,COMBINED_LIMIT];
  for(const [world,receipt] of [[createCombinedWorld(),combinedReceipt],[createCreatorWorld(defaultPack()),creatorReceipt]]){
    const expected=new Map();
    // Climb and retreat to the chart edge. Alternate aim to exercise the command limit.
    while(world.status==='active'){
      if(order.includes(world.tick))expected.set(world.tick,receipt(world).stateHash);
      stepCombined(world,BK.up|BK.back|(world.tick%2?BK.elevate:0));
    }
    const end=receipt(world),text=JSON.stringify(end);
    assert.equal(world.reason,'held too long');
    assert.equal(end.ticks,COMBINED_LIMIT);
    assert.equal(end.commands.length,COMBINED_LIMIT);
    assert.ok(Buffer.byteLength(text)<=MAX_REPLAY_BYTES);
    expected.set(world.tick,end.stateHash);
    const cursor=await openReplay(text);
    for(const tick of order){
      const restored=cursor.seek(tick);
      assert.equal(restored.tick,tick);
      assert.equal(receipt(restored).stateHash,expected.get(tick));
    }
    assert.deepEqual(receipt(cursor.advance()),end);
    await assert.rejects(openReplay(JSON.stringify({...end,commands:[...end.commands,[COMBINED_LIMIT,0]]})));
  }
});
