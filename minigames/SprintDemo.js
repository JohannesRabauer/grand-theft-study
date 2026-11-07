import { QuizDemo } from './QuizDemo.js';

// Debug demo, the timed variant: no question limit, the round lasts the whole shared timer.
export class SprintDemo extends QuizDemo {
  constructor() {
    super('sprint-demo');
  }
}
