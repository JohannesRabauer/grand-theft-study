import { resolveHud } from './hudList.js';
import { StatusModule } from './StatusModule.js';
import { AngerModule } from './AngerModule.js';
import { MoneyModule } from './MoneyModule.js';
import { ClockModule } from './ClockModule.js';
import { ToolModule } from './ToolModule.js';
import { FpsModule } from './FpsModule.js';
import { DebugModule } from './DebugModule.js';
import { RotateHintModule } from './RotateHintModule.js';
import { RestartNoteModule } from './RestartNoteModule.js';
import { ObjectiveModule } from './ObjectiveModule.js';
import { CaughtModule } from './CaughtModule.js';
import { TouchModule } from './TouchModule.js';
import { CoopModule } from './CoopModule.js';
import { ToastModule } from './ToastModule.js';

// Module id -> class. Later stories add a line here and an entry in data/hud.json; UIScene stays untouched.
export const HUD_REGISTRY = {
  fps: FpsModule,
  status: StatusModule,
  anger: AngerModule,
  money: MoneyModule,
  clock: ClockModule,
  tool: ToolModule,
  caught: CaughtModule,
  objective: ObjectiveModule,
  touch: TouchModule,
  rotateHint: RotateHintModule,
  restartNote: RestartNoteModule,
  debug: DebugModule,
  coop: CoopModule,
  toast: ToastModule
};

// Builds the modules of `mode` and returns them as a Map id -> module (insertion order = creation order).
export function createHud(scene, ctx, cfg, mode, opts) {
  const modules = new Map();
  for (const { id, Cls, opts: o } of resolveHud(cfg, mode, HUD_REGISTRY, opts)) modules.set(id, new Cls(scene, ctx, o));
  return modules;
}
