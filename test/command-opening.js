// A short opening for the default Breakwater command scenario. All motion and
// contact after these orders is produced by stepCommand.
export function commandOpening(w){
  const ids=w.actors.filter(a=>a.faction==='cobalt').map(a=>a.id);
  return [
    {tick:0,units:ids,type:'ATTACK',target:'relay',append:false},
    {tick:0,units:['cobalt-tank'],type:'MOVE',x:-16,z:3,append:true}
  ];
}
