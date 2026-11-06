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

export function addStaticWall(scene, x, y, w, h) {
  return addRect(scene, x, y, w, h, 'STATIC', { isStatic: true });
}

// Trigger zone: reports overlaps with player and bullies, never pushes anything.
export function addSensor(scene, x, y, w, h) {
  return addRect(scene, x, y, w, h, 'SENSOR', { isStatic: true, isSensor: true });
}

export function addProp(scene, x, y, w, h, options = {}) {
  return addRect(scene, x, y, w, h, 'PROP', options);
}

// Hits only PROP and STATIC, so tools can never affect people or animals.
export function addProjectile(scene, x, y, radius, options = {}) {
  return addCircle(scene, x, y, radius, 'PROJECTILE', options);
}
