// Breakwater's front crews retain the released starting positions. Two more
// sections occupy separate bays on each side of the same 288 m game board.
import {createCombinedWorld, CLASSES} from './combined-world.js';
import {createVehicle} from './combined-vehicles.js';
import {initializeCommand} from './command-control.js';
import {makeFormationScenario} from './formation-world.js';
import {BIG_BATTLE_SOURCE} from './big-battle-identity.js';

const bays = {
  cobalt: [
    [[-43,23], [-31,21], [-15,22], [27,19]],
    [[-45,51], [-30,52], [-18,54], [34,53]]
  ],
  ember: [
    [[-46,-21], [-33,-24], [-16,-23], [29,-26]],
    [[-51,-53], [-36,-54], [-19,-55], [34,-54]]
  ]
};

function deploy(pack) {
  const world = createCombinedWorld(pack);
  const mobile = world.actors.filter(actor => actor.kind !== 'relay');
  for (const actor of mobile) actor.section = 1;
  for (const faction of ['cobalt','ember']) {
    for (const [bay, positions] of bays[faction].entries()) {
      const section = bay + 2;
      for (const [i, kind] of CLASSES.entries()) {
        const template = mobile.find(actor => actor.kind === kind && actor.faction === faction);
        const [x,z] = positions[i];
        const crew = createVehicle(world, kind, template.id + '-' + section, faction, x, z, template.yaw);
        Object.assign(crew, {section, home:[x,z], seen:0, target:null,
          ammo:template.ammo, hp:template.hp, maxHp:template.maxHp});
        mobile.push(crew);
      }
    }
  }
  world.actors = [...mobile, world.relay];
  world.crewSets = 3;
  initializeCommand(world);
  world.orderLog = [];
  return world;
}

export const bigBattle = makeFormationScenario({
  id:'breakwater-big-battle-v1', source:BIG_BATTLE_SOURCE, create:deploy, maxUnits:12
});
