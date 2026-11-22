// Short original synthesized voices driven by landings and accepted events.
export class MechAudio {
  constructor(world){
    this.ctx=new AudioContext();
    this.ctx.resume().catch(()=>{});
    this.voices=new Set();
    this.tick=world.tick;
    this.feet=world.player.feet.map(f=>f.stance);
  }
  tone(type,start,end,duration,volume){
    if(this.voices.size>=8)return;
    const ctx=this.ctx,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(start,t);
    osc.frequency.exponentialRampToValueAtTime(end,t+duration);
    gain.gain.setValueAtTime(volume,t);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(ctx.destination);this.voices.add(osc);
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(osc);};
    osc.start(t);osc.stop(t+duration);
  }
  update(w){
    let landed=false;
    for(let i=0;i<this.feet.length;i++){
      const stance=w.player.feet[i].stance;
      if(stance && !this.feet[i])landed=true;
      this.feet[i]=stance;
    }
    if(landed)this.tone('sine',112,39,.15,.15);
    for(const event of w.events){
      if(event.tick<=this.tick)continue;
      if(event.type==='launch')this.tone('triangle',event.owner==='player'?540:360,98,.18,.11);
      if(event.type==='impact')this.tone('sawtooth',128,32,.22,.045);
      if(event.type==='destroy')this.tone('triangle',75,22,.5,.16);
    }
    this.tick=w.tick;
  }
  dispose(){
    for(const osc of this.voices){osc.stop();osc.disconnect();}
    this.voices.clear();this.ctx.close().catch(()=>{});
  }
}
