import {createCommandWorld,issueOrder,stepCommand,commandReceipt,openCommandReplay} from '../sim/command-world.js';
import {formationScenario} from '../sim/formation-world.js';

import {bigBattle} from '../sim/big-battle.js';

export const commandScenarios={
  classic:{createWorld:createCommandWorld,issueOrder,step:stepCommand,receipt:commandReceipt,openReplay:openCommandReplay},
  formation:{...formationScenario,title:'Formation command',
    briefing:'Select crews and give them a shared MOVE or DEFEND destination. Each crew receives a spaced slot and searches the terrain for a route. Disable the relay and two mobile defenders, then secure the crossing with a surviving crew.'},
  big:{...bigBattle,title:'The Big Battle',
    briefing:'Twelve Cobalt crews and twelve Ember crews are deployed. Each side has three numbered sections. Disable the shore relay and two mobile defenders, then secure the crossing with a surviving crew.'}
};
