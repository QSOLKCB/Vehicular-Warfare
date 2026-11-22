// The authored routes are inert, bounded content. Each site lists the local
// formation from west to east. Bodies exist before the player reaches them.
const routes = {
  sable:{name:'Sable Valley',seed:417,brief:'A short training sortie. Pop over the ridge and destroy both ground units.'},
  longwatch:{name:'Long Watch',seed:868,hold:360,
    brief:'Survey four abandoned relay sites. Clear each patrol, then hold inside the beacon below 34 m AGL for three seconds to transmit and resupply.',
    sites:[
      ['Needle Post',0,40,['aa','convoy']],
      ['Copper Cut',-20,-138,['convoy','scout']],
      ['Twin Spires',24,-340,['aa','scout','convoy']],
      ['Last Light',0,-560,['aa','convoy']]
    ]},
  frostline:{name:'Frostline Run',seed:1203,hold:1,
    brief:'Open six mountain crossings. Clear each patrol and fly through its low beacon below 34 m AGL. The final crossing brings the Kestrel home.',
    sites:[
      ['Icefall',0,36,['convoy','scout']],['Blue Shelf',20,-98,['aa','convoy']],
      ['Coldwater',-24,-245,['scout','aa','convoy']],['Split Rock',12,-399,['convoy','scout']],
      ['North Fork',-20,-559,['aa','scout','convoy']],['Snowline',0,-750,['aa','convoy','scout']]
    ]}
};
function freeze(value){
  if(value && typeof value==='object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const MISSIONS=freeze(routes);
export function mission(id) {
  if(typeof id!=='string' || !Object.hasOwn(MISSIONS,id)) throw new RangeError('unknown mission');
  return MISSIONS[id];
}
export const CLASSIC_IDS=Object.freeze(['aa','convoy']);
export const enemyIds=w=>w.route?.ids ?? CLASSIC_IDS;
export const unitType=e=>e.kind ?? e.id;
export const zone=w=>w.route && mission(w.route.id).sites[w.route.site];
export const zoneRadius=18;
export const maxBeaconAGL=34;
export const minZ=w=>w.route?-816:-144;
