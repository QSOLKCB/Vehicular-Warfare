// Two reusable voices. Only accepted motion and transient mission events feed the mix.
export class VehicleAudio{
  constructor(w){
    const c=this.ctx=new AudioContext();
    this.motor=c.createOscillator();this.motor.type='triangle';
    this.motor.frequency.value=46;
    const gain=c.createGain();gain.gain.value=.037;this.motor.connect(gain);gain.connect(c.destination);
    this.signal=c.createOscillator();this.signal.type='sine';
    this.volume=c.createGain();this.volume.gain.value=0;
    this.signal.connect(this.volume);this.volume.connect(c.destination);
    this.tick=w.tick;this.motor.start();this.signal.start();c.resume().catch(()=>{});
  }
  update(w){
    const t=this.ctx.currentTime;
    this.motor.frequency.setTargetAtTime(40+Math.abs(w.player.speed??Math.hypot(...w.player.v))*5,t,.12);
    for(const e of w.events){
      if(e.tick<=this.tick)continue;
      let pitch;
      if(e.type==='launch')pitch=e.owner===w.player.id?285:175;
      else if(e.type==='impact')pitch=e.target==='water'?126:95;
      else if(e.type==='destroy')pitch=70;
      else continue;
      const freq=this.signal.frequency,volume=this.volume.gain;
      freq.cancelScheduledValues(t);freq.setValueAtTime(pitch,t);freq.exponentialRampToValueAtTime(33,t+.17);
      volume.cancelScheduledValues(t);volume.setValueAtTime(.14,t);volume.exponentialRampToValueAtTime(.0001,t+.20);
    }
    this.tick=w.tick;
  }
  dispose(){
    this.motor.stop();this.motor.disconnect();this.signal.stop();this.signal.disconnect();
    this.volume.disconnect();this.ctx.close().catch(()=>{});
  }
}
