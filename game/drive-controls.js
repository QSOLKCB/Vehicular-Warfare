// The station records the ordinary command mask produced here on each tick.
// Steering reads only the player's own pose and motion.
export function crewKeys(crew,keys,aimLeft,aimRight){
  const controls={KeyW:keys.forward,KeyS:keys.back,KeyA:keys.left,KeyD:keys.right,
    ArrowLeft:aimLeft,ArrowRight:aimRight,ArrowUp:keys.elevate,ArrowDown:keys.depress,Space:keys.fire};
  if(crew==='helicopter'){
    return {...controls,KeyE:keys.up,KeyQ:keys.down,KeyZ:keys.strafeLeft,KeyX:keys.strafeRight};
  }
  Object.assign(controls,{KeyQ:aimLeft,KeyE:aimRight,KeyR:keys.elevate,KeyF:keys.depress});
  if(crew==='tank')Object.assign(controls,{ShiftLeft:keys.brake,ShiftRight:keys.brake});
  return controls;
}

export class SimpleSteering{
  constructor(crew,keys,aimLeft,aimRight){
    this.crew=crew;this.keys=keys;this.aimLeft=aimLeft;this.aimRight=aimRight;
    this.reset();
  }
  reset(){
    this.lastTurn=0;this.follow=false;this.ahead=false;
  }
  command(mask,player){
    const keys=this.keys;
    const turn=Number(Boolean(mask&keys.right))-Number(Boolean(mask&keys.left));
    const aiming=mask&(this.aimLeft|this.aimRight|keys.elevate|keys.depress);
    // Releasing a manual aim key keeps the chosen heading until the next turn.
    if(turn && turn!==this.lastTurn)this.follow=true;
    this.lastTurn=turn;
    if(aiming || (!turn && (mask&keys.fire)))this.follow=false;
    if(this.follow){
      const mount=player.turretYaw??player.torsoYaw??player.mountYaw;
      const angle=player.yaw-mount;
      const error=Math.atan2(Math.sin(angle),Math.cos(angle));
      // A dead band slightly wider than one traverse step prevents chatter.
      if(Math.abs(error)>.015)mask|=error>0?this.aimRight:this.aimLeft;
      else if(!turn)this.follow=false;
    }
    const throttle=mask&(keys.forward|keys.back);
    if(this.crew==='tank' && !throttle && !turn && (player.leftSpeed || player.rightSpeed))mask|=keys.brake;
    if(this.crew==='ship'){
      // A rudder needs headway. Pulse the ordinary ahead control between
      // 1 and 2 game m/s, yielding immediately to either manual engine key.
      const speedLimit=this.ahead?2:1;
      this.ahead=Boolean(turn && !throttle && !player.grounded && player.speed>=0 && player.speed<speedLimit);
      if(this.ahead)mask|=keys.forward;
    }
    return mask;
  }
}
