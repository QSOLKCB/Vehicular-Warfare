import {createCommandWorld,issueOrder,stepCommand,commandReceipt,openCommandReplay} from '../sim/command-world.js';
import {formationScenario} from '../sim/formation-world.js';

export const commandScenarios={
  classic:{createWorld:createCommandWorld,issueOrder,step:stepCommand,receipt:commandReceipt,openReplay:openCommandReplay},
  formation:formationScenario
};
