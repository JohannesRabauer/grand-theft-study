// Ordered scenario list (AD-29). To add a scenario: create scripts/smoke/<area>.js exporting
// { name, run(game, assert, env) } and append it here. Scenarios share one running game and run in this
// order, so a new one starts from whatever state the previous one left; `env` (see env.js) has the helpers.
import { rideToSchool, slingshot, weather, language, quality, pause } from './prototype-core.js';
import { turfChase } from './chase.js';
import { pedestrians, crowdCleanup } from './crowd.js';
import { dayClock } from './day.js';
import { screenStack } from './screens.js';
import { twoPlayers } from './players.js';
import { characters } from './characters.js';
import { skateboard } from './skate.js';
import { tricks } from './tricks.js';
import { skatepark } from './skatepark.js';
import { skates } from './skates.js';
import { worldDoors } from './world.js';
import { quitAndSecondRun } from './state.js';
import { learning } from './learning.js';
import { grades } from './grades.js';
import { minigames } from './minigames.js';
import { coopMenu, coopCommute, coopChase } from './coop.js';

export const scenarios = [rideToSchool, turfChase, pedestrians, slingshot, weather, dayClock, language, quality, pause, screenStack, twoPlayers, characters, skateboard, tricks, skatepark, skates, crowdCleanup, worldDoors, quitAndSecondRun, coopMenu, coopCommute, coopChase, learning, grades, minigames];
