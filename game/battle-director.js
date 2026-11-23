// The camera follows the presentation snapshot supplied by the War Room.
import {clamp, subtract} from '../vendor/vanillajs/modules/math/index.js';
import {EDGE} from '../sim/terrain.js';
import {HZ} from '../sim/clock.js';
import {look} from './model-view.js';

export function directorSubject(visible, pinnedId, selected) {
  const crews = visible.filter(a => a.faction === 'cobalt' && a.hp > 0);
  return crews.find(a => a.id === pinnedId) ??
    crews.find(a => selected.has(a.id)) ?? crews[0] ?? null;
}

export function directorAngle(bearing, tick, sweepStart) {
  const elapsed = sweepStart === null ? 0 : Math.max(0, tick - sweepStart);
  return (bearing + elapsed * 15 / HZ) % 360;
}

export function directorPose(scene, subject, bearing, tilt, range) {
  const center = subject?.p ?? scene.beacon;
  const rad = Math.PI / 180;
  const azimuth = bearing * rad;
  const elevation = clamp(tilt, 6, 78) * rad;
  const radius = clamp(range, 6, 80);
  const horizontal = radius * Math.cos(elevation);
  const x = clamp(center[0] + horizontal * Math.sin(azimuth), -EDGE, EDGE);
  const z = clamp(center[2] + horizontal * Math.cos(azimuth), -EDGE, EDGE);
  const floor = Math.max(scene.field.sample(x, z).height, scene.water.heightAt(x, z));
  const eye = [x, Math.max(center[1] + radius * Math.sin(elevation), floor + .7), z];
  return {eye, q:look(subtract(center, eye)), fov:.78};
}
