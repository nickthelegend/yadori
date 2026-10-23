import { PCFSoftShadowMap, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { emulatorPresent, loadEmulatorRoom } from './dev-room.js';
import { installPerfProbe } from './perf-probe.js';
import { YadoriSystem } from './yadori-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = PCFSoftShadowMap;
  world.registerSystem(YadoriSystem);
  installPerfProbe(world);
  if (emulatorPresent()) void loadEmulatorRoom();
  // canvas text uses the brand fonts; redraws happen on change, so wait for them once
  void document.fonts?.ready;
});
