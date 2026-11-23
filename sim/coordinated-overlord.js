import {makeOverlordScenario} from './overlord.js';
import {OVERLORD_SOURCE} from './coordinated-overlord-identity.js';
import {beforeGroupStep,groupPlan} from './overlord-groups.js';

export const overlord = makeOverlordScenario({
  id:'breakwater-overlord-v1',source:OVERLORD_SOURCE,groupPlan,beforeGroupStep
});
