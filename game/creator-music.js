// Three original voices share an eighth-note clock at 100 BPM (36 simulation ticks).
// MIDI pitches are local composition data. A zero leaves a rest in that voice.
const scores={
  departure:{lead:[62,0,69,0,0,67,0,64,0,0,65,0,69,0,0,0],bass:[38,0,0,0,0,0,45,0],pad:[53,0,0,0,57,0,0,0]},
  contact:{lead:[62,69,0,70,0,65,69,0,62,0,72,69,0,65,67,0],bass:[38,0,45,0,41,0,45,0],pad:[53,0,0,0,55,0,0,0]},
  exchange:{lead:[74,0,69,72,74,65,0,69,77,0,76,69,72,0,67,69],bass:[38,38,0,45,41,0,43,45],pad:[53,0,57,0,55,0,57,0]},
  crossing:{lead:[69,0,72,74,0,77,0,76,72,0,69,0,67,69,0,0],bass:[41,0,0,48,0,43,0,0],pad:[57,0,0,0,60,0,0,0]},
  secured:{lead:[74,77,81,0,79,77,74,0],bass:[38,0,0,0,45,0,0,0],pad:[57,0,0,0,62,0,0,0]},
  lost:{lead:[65,0,63,0,62,0,0,0],bass:[38,0,0,0,0,0,0,0],pad:[50,0,0,0,0,0,0,0]}
};

export function scoreCue(world){
  if(world.status==='victory')return 'secured';
  if(world.status==='defeat')return 'lost';
  if(world.captured)return 'crossing';
  for(let i=world.events.length-1;i>=0;i--){
    const e=world.events[i];
    if(world.tick-e.tick>108)break;
    if(e.type==='launch' || e.type==='damage')return 'exchange';
  }
  if(world.actors.some(a=>a.hp>0 && a.faction!==world.player.faction && a.target===world.player.id && a.seen>0))
    return 'contact';
  return 'departure';
}

const parts=[['lead','triangle',.080,.23],['bass','sine',.11,.27],['pad','sine',.048,.54]];

export class CreatorMusic{
  constructor(world,context=new AudioContext()){
    this.ctx=context;
    this.voices=parts.map(([part,type,level,duration])=>{
      const osc=context.createOscillator(),gain=context.createGain();
      osc.type=type;gain.gain.value=0;
      osc.connect(gain);gain.connect(context.destination);osc.start();
      return {part,osc,gain,level,duration};
    });
    this.slot=-1;this.cue=null;this.changes=0;this.notes=0;
    if(context.state==='suspended' && !context.startRendering)context.resume().catch(()=>{});
    if(world)this.update(world);
  }

  update(world,time=this.ctx.currentTime){
    if(!this.voices.length)return;
    const cue=scoreCue(world),slot=Math.floor(world.tick/36);
    if(cue===this.cue && slot===this.slot)return;
    if(cue!==this.cue)this.changes++;
    this.cue=cue;this.slot=slot;
    const shift=[0,0,5,-2][Math.floor(slot/16)%4];
    for(const {osc,gain,part,level,duration} of this.voices){
      const line=scores[cue][part],pitch=line[slot%line.length];
      if(!pitch)continue;
      const g=gain.gain;
      osc.frequency.setValueAtTime(440*2**((pitch+shift-69)/12),time);
      g.cancelScheduledValues(time);g.setValueAtTime(.0001,time);
      g.linearRampToValueAtTime(level,time+.018);
      g.exponentialRampToValueAtTime(.0001,time+duration);
      this.notes++;
    }
  }

  inspect(){
    return {cue:this.cue,voices:this.voices.length,changes:this.changes,notes:this.notes,contextState:this.ctx.state};
  }

  dispose(){
    if(!this.voices.length)return;
    for(const {osc,gain} of this.voices){osc.stop();osc.disconnect();gain.disconnect();}
    this.voices.length=0;
    if(this.ctx.close)this.ctx.close().catch(()=>{});
  }
}
