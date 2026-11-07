import { QuizDemo } from './QuizDemo.js';
import { SprintDemo } from './SprintDemo.js';
import { MatheGame } from './MatheGame.js';
import { DeutschGame } from './DeutschGame.js';
import { EnglischGame } from './EnglischGame.js';
import { ErdkundeGame } from './ErdkundeGame.js';
import { ScienceGame } from './ScienceGame.js';

// Minigame id -> scene class. A new minigame adds its class here and an entry in data/minigames.json (scene MG_<id>).
export const MINIGAME_CLASSES = {
  'quiz-demo': QuizDemo,
  'sprint-demo': SprintDemo,
  'mathe': MatheGame,
  'deutsch': DeutschGame,
  'englisch': EnglischGame,
  'erdkunde': ErdkundeGame,
  'science': ScienceGame
};
