// Ordered scenario list (AD-29). To add a scenario: create scripts/smoke/<area>.js exporting
// { name, run(game, assert, env) } and append it here. Scenarios share one running game and run in this
// order, so a new one starts from whatever state the previous one left; `env` (see env.js) has the helpers.
import { rideToSchool, slingshot, weather, language, quality, pause } from './prototype-core.js';
import { turfChase } from './chase.js';
import { pedestrians, crowdCleanup } from './crowd.js';
import { dayClock } from './day.js';
import { screenStack } from './screens.js';
import { hints } from './hints.js';
import { commute } from './commute.js';
import { shop } from './shop.js';
import { quests } from './quests.js';
import { missions } from './missions.js';
import { progress } from './progress.js';
import { stickers } from './stickers.js';
import { achievements } from './achievements.js';
import { lernbuch } from './lernbuch.js';
import { parent } from './parent.js';
import { activities } from './activities.js';
import { minimap } from './minimap.js';
import { phone } from './phone.js';
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
import { vehicles, newRides } from './vehicles.js';
import { throwingStick } from './tools.js';
import { stick } from './stick.js';
import { defense } from './defense.js';
import { karate } from './karate.js';
import { traffic } from './traffic.js';
import { coopMenu, coopCommute, coopChase } from './coop.js';
import { school } from './school.js';
import { schoolEvents } from './school-events.js';
import { dayFlow } from './dayflow.js';
import { zeugnis } from './zeugnis.js';
import { home } from './home.js';
import { openWorld } from './open-world.js';

export const scenarios = [rideToSchool, turfChase, pedestrians, slingshot, weather, dayClock, language, quality, pause, screenStack, hints, commute, shop, quests, missions, progress, stickers, achievements, lernbuch, parent, activities, minimap, phone, twoPlayers, characters, skateboard, tricks, skatepark, skates, crowdCleanup, worldDoors, quitAndSecondRun, coopMenu, coopCommute, coopChase, learning, grades, minigames, vehicles, newRides, throwingStick, stick, defense, traffic, karate, school, schoolEvents, dayFlow, zeugnis, home, openWorld];
