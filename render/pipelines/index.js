// The registry of WebGL pipelines (AD-31): render/PostFx.js registers each entry once per game. Camera passes are
// listed in the order they run on the world camera; per-object pipelines (cast shadows, wind sway, water) join the same list.
import { BloomFx } from './BloomFx.js';
import { GradeFx } from './GradeFx.js';
import { ShadowFx } from './ShadowFx.js';
import { WindFx } from './WindFx.js';
import { WaterFx } from './WaterFx.js';

export const CAMERA_PASSES = [BloomFx, GradeFx];
export const OBJECT_PIPELINES = [ShadowFx, WindFx, WaterFx];
