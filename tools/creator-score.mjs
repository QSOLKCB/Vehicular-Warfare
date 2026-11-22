import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// This function runs inside the recording Chromium and uses its audio engine.
async function renderRecording(recording){
  const {openReplay}=await import('./sim/creator.js');
  const {CreatorMusic}=await import('./game/creator-music.js');
  const cursor=await openReplay(JSON.stringify(recording));
  const ticks=Math.min(cursor.ticks,1440),rate=22050;
  const audio=new OfflineAudioContext(1,Math.ceil((ticks/120+.6)*rate),rate);
  const music=new CreatorMusic(cursor.world,audio),changes=[];
  for(let tick=0;tick<=ticks;tick++){
    const w=cursor.world;
    music.update(w,tick/120);
    const cue=music.inspect().cue;
    if(changes.at(-1)?.cue!==cue)changes.push({tick,cue});
    if(tick<ticks)cursor.advance(1);
  }
  const info=music.inspect();
  const result=await audio.startRendering();music.dispose();
  const data=result.getChannelData(0),bytes=new Uint8Array(2*data.length),samples=new DataView(bytes.buffer);
  let peak=0,total=0;
  for(let i=0;i<data.length;i++){
    peak=Math.max(peak,Math.abs(data[i]));total+=data[i]**2;
    samples.setInt16(2*i,Math.round(Math.max(-1,Math.min(1,data[i]))*32767),true);
  }
  let binary='';
  for(let i=0;i<bytes.length;i+=16000)binary+=String.fromCharCode(...bytes.subarray(i,i+16000));
  return {rate,sampleCount:data.length,peak,rms:Math.sqrt(total/data.length),changes,info,pcm:btoa(binary)};
}

export async function captureScore(io,recording){
  const {pcm,...report}=await io.evaluate('('+renderRecording.toString()+')('+JSON.stringify(recording)+')');
  assert.ok(report.peak>.02 && report.peak<1 && report.rms>.002);
  assert.ok(report.changes.length>=3 && report.info.voices===3);
  const data=Buffer.from(pcm,'base64');
  assert.equal(data.length,report.sampleCount*2);
  const header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
  header.writeUInt32LE(report.rate,24);header.writeUInt32LE(report.rate*2,28);
  header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
  await writeFile(join(io.output,'workshop-score.wav'),Buffer.concat([header,data]));
  return report;
}
