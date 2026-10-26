import { captureManaged } from './audit-network.mjs';
import{writeFileSync}from'node:fs';import{join}from'node:path';import{APP,cli,xr,page,state,sleep,until,enterXR,pinchAt}from'./cli.mjs';
const dir=join(APP,'../../audit/browser');
const capture = await captureManaged('capacity');
try{if(xr('status').sessionActive)xr('exit');page('page-reset.mjs',{room:'den'});await sleep(4);page('audit-capacity-room.mjs');await sleep(2);await enterXR();xr('set-input-mode',{mode:'hand'});await until(async()=>(await state()).targets.length===7,'seven bounded boxes');const targets=(await state()).targets;let counts=[];for(const t of targets){await pinchAt(t.center);await sleep(1.7);counts.push((await state()).spirits.length);}const snapshot=page('audit-probe.mjs',{shot:'xr-capacity'});const result={id:'Q34',ok:JSON.stringify(counts)==='[1,2,3,4,5,6,6]'&&snapshot.body.includes('At most 6 spirits (persistent anchors are limited); forget one first.'),counts,snapshot,shot:'xr-capacity.jpg',at:new Date().toISOString()};writeFileSync(join(dir,'capacity.json'),JSON.stringify(result,null,2));console.log(result.id,result.ok,result.counts);xr('exit');}catch(e){writeFileSync(join(dir,'capacity.json'),JSON.stringify({id:'Q34',ok:false,detail:String(e),at:new Date().toISOString()},null,2));console.error(e);}

await capture.stop();
