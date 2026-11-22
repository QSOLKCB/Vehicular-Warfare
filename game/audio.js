// Local synthesizer. One rotor voice and at most eight short event voices.
export class FlightAudio {
  constructor(){
    this.ctx=new AudioContext();
    const c=this.ctx;
    this.mix=c.createGain();this.mix.gain.value=.14;this.mix.connect(c.destination);
    this.rotor=c.createOscillator();this.rotor.type='triangle';this.rotor.frequency.value=38;
    this.rotor.connect(this.mix);this.rotor.start();
    this.voices=new Set();
    this.ctx.resume().catch(()=>{});
  }
  update(w,events){
    const c=this.ctx,t=c.currentTime;
    this.rotor.frequency.setTargetAtTime(38+w.player.v[1]*.5+Math.abs(w.player.pitch)*10,t,.14);
    for(const e of events){
      if(this.voices.size>=8)break;
      let freq,end,duration;
      if(e.type==='launch'){freq=e.owner==='player'?190:420;end=65;duration=.14;}
      else if(e.type==='destroy'){freq=135;end=32;duration=.48;}
      else if(e.type==='damage' && e.target==='player'){freq=225;end=105;duration=.27;}
      else if(e.type==='beacon'){freq=380;end=680;duration=.34;}
      else continue;
      const osc=c.createOscillator(),gain=c.createGain();
      osc.type=e.type==='beacon'?'sine':'triangle';
      osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(end,t+duration);
      gain.gain.setValueAtTime(.42,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
      osc.connect(gain);gain.connect(this.mix);this.voices.add(osc);
      osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(osc);};
      osc.start(t);osc.stop(t+duration);
    }
  }
  dispose(){
    this.rotor.stop();this.rotor.disconnect();for(const osc of this.voices)osc.stop();
    this.mix.disconnect();this.ctx.close().catch(()=>{});
  }
}
