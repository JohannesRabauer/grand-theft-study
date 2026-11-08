// The registry of WebGL pipelines (AD-31): render/PostFx.js registers each entry once per game. Camera passes are
// listed in the order they run on the world camera; per-object pipelines (wind sway, water) join the same list.
import { BloomFx } from './BloomFx.js';
import { GradeFx } from './GradeFx.js';

export const CAMERA_PASSES = [BloomFx, GradeFx];
export const OBJECT_PIPELINES = [];
