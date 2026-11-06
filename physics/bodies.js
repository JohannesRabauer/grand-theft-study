import { CAT, MASK } from './categories.js';

// The only place that creates Matter bodies (AD-3); always sets collisionFilter.
function filter(body, name) {
  body.collisionFilter.category = CAT[name];
  body.collisionFilter.mask = MASK[name];
  return body;
}

export function addCircle(scene, x, y, radius, category, options = {}) {
  return filter(scene.matter.add.circle(x, y, radius, options), category);
}

export function addRect(scene, x, y, w, h, category, options = {}) {
  return filter(scene.matter.add.rectangle(x, y, w, h, options), category);
}

export function addStaticRect(scene, x, y, w, h) {
  return addRect(scene, x, y, w, h, 'STATIC', { isStatic: true });
}
