import { QuizDemo } from './QuizDemo.js';
import { SprintDemo } from './SprintDemo.js';
import { MatheGame } from './MatheGame.js';

// Minigame id -> scene class. A new minigame adds its class here and an entry in data/minigames.json (scene MG_<id>).
export const MINIGAME_CLASSES = {
  'quiz-demo': QuizDemo,
  'sprint-demo': SprintDemo,
  'mathe': MatheGame
};
