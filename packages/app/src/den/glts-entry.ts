// Entry for the IWER synthetic room. scripts/build-rooms.mjs bundles this with the den
// builder into public/rooms/<variant>.glts; `three` and `@drawcall/glts` stay external and
// are provided by IWER's GLTS loader.
import * as THREE from 'three';
// @ts-expect-error provided by the GLTS runtime inside the emulator
import { scene } from '@drawcall/glts';
import { buildDen, type DenVariant } from './den.js';

declare const __DEN_VARIANT__: DenVariant;

const den = buildDen(THREE, __DEN_VARIANT__);
scene.add(den.root);
