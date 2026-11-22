// Acceptance flight for the two authored northbound routes. Reproduced through
// normal keyboard events in Chromium. Samples only mission and flight HUD data.
import {K} from '../sim/world.js';
export function routeControls(site,clear,p,v,target) {
  const [,x,z]=site;
  const goalZ=clear?z:z+62;
  // Fly at a fixed survey altitude and arrest translation before each beacon.
  const dx=x-p[0]-v[0]*1.8, dz=goalZ-p[2]-v[2]*1.8, dy=32.5-p[1]-v[1]*.58;
  let cmd=0;
  if(dx>2) cmd|=K.right;
  if(dx< -2) cmd|=K.left;
  if(dz>2) cmd|=K.back;
  if(dz< -2) cmd|=K.forward;
  if(dy>.8) cmd|=K.up;
  if(dy<-.8) cmd|=K.down;
  if(target) cmd|=K.fire;
  return cmd;
}
