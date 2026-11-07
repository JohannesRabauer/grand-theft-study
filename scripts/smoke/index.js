// Ordered scenario list (AD-29). To add a scenario: create scripts/smoke/<area>.js exporting
// { name, run(game, assert, env) } and append it here. Scenarios share one running game and run in this
// order, so a new one starts from whatever state the previous one left; `env` (see env.js) has the helpers.
import { rideToSchool, slingshot, weather, language, quality, pause } from './prototype-core.js';
import { turfChase } from './chase.js';
import { pedestrians, crowdCleanup } from './crowd.js';
import { dayClock } from './day.js';
import { screenStack } from './screens.js';
import { twoPlayers } from './players.js';
import { worldDoors } from './world.js';
import { quitAndSecondRun } from './state.js';

export const scenarios = [rideToSchool, turfChase, pedestrians, slingshot, weather, dayClock, language, quality, pause, screenStack, twoPlayers, crowdCleanup, worldDoors, quitAndSecondRun];
