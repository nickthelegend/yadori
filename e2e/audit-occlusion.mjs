// Render-layer isolation measures the actual skinned IWSDK hand surface. The
// white hand-only image is a diagnostic mask, never product output or fake input.
import {chromium} from 'playwright';
import sharp from 'sharp';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {APP,cli,xr,page,state,sleep,enterXR,pinchAt} from '../packages/app/e2e/cli.mjs';
import {captureManaged} from '../packages/app/e2e/audit-network.mjs';
const dir=join(APP,'../../audit/browser');let browser,f;const capture=await captureManaged('occlusion');
try{
if(xr('status').sessionActive)xr('exit');page('page-reset.mjs',{room:'den'});await sleep(4);await enterXR();xr('set-input-mode',{mode:'hand'});await pinchAt((await state()).targets.find(t=>t.label==='couch').center);await sleep(4);
let c=(await state()).spirits[0];xr('set-transform',{device:'headset',position:{x:c.facePos[0],y:c.facePos[1]+.05,z:c.facePos[2]+.55},orientation:{x:0,y:0,z:0,w:1}});
xr('set-transform',{device:'hand-left',position:{x:-1,y:1.5,z:0}});
xr('set-hand-pose',{device:'hand-right',poseId:'flat'});
xr('set-transform',{device:'hand-right',position:{x:c.facePos[0]-.02,y:c.facePos[1]-.015,z:c.facePos[2]+.08},anchor:'grip',orientation:{fingers:'up',palm:'forward'}});
await sleep(3);cli('ecs','pause');
const st=cli('dev','status');browser=await chromium.connectOverCDP(st.state.session.browserAutomation.endpoint);const p=browser.contexts()[0].pages().find(p=>p.frames().some(f=>f.url().includes('8091')));for(const frame of p.frames())try{if(await frame.evaluate(()=>!!window.__yadori))f=frame;}catch{}
const details=await f.evaluate(()=>{const w=FRAMEWORK_MCP_RUNTIME.world,h=w.input.xr.visualAdapters.hand.right.visual.model,face=w.scene.getObjectByName('Face:Couch');let mesh;h.traverse(o=>{if(o.isSkinnedMesh&&o.material.depthWrite)mesh=o;});window.__auditLayers={h,mesh,face,original:mesh.material};return{faceDepthTest:face.material.depthTest,faceOrder:face.renderOrder,handDepthWrite:mesh.material.depthWrite,handDepthTest:mesh.material.depthTest,handOrder:mesh.renderOrder,handVertices:mesh.geometry.attributes.position.count,sessionActive:w.renderer.xr.isPresenting};});
const take=async(name)=>{await p.waitForTimeout(120);const b=await p.screenshot();await sharp(b).jpeg({quality:60}).toFile(join(dir,name+'.jpg'));return(await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true}));};
const composite=await take('occlusion-composite');
await f.evaluate(()=>{__auditLayers.h.visible=false;});const face=await take('occlusion-face');
await f.evaluate(()=>{__auditLayers.face.visible=false;__auditLayers.h.visible=true;});const hand=await take('occlusion-hand');
await f.evaluate(()=>{__auditLayers.h.visible=false;});const room=await take('occlusion-room');
await f.evaluate(()=>{const a=__auditLayers;a.h.visible=true;const m=a.original.clone();m.fragmentShader='void main(){gl_FragColor=vec4(1.0);}';m.transparent=false;a.mesh.material=m;a.mask=m;});const mask=await take('occlusion-hand-mask-diagnostic');
await f.evaluate(()=>{const a=__auditLayers;a.mesh.material=a.original;a.mask.dispose();a.face.visible=true;a.h.visible=true;delete window.__auditLayers;});
let overlap=0,leak=0;const A=face.data,B=composite.data,D=room.data,C=hand.data,M=mask.data;const dist=(a,b,i)=>Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]);
// Fully white diagnostic pixels select the solid hand interior (no outline AA).
for(let i=0;i<A.length;i+=3)if(M[i]>250&&M[i+1]>250&&M[i+2]>250&&dist(M,D,i)>80&&dist(A,D,i)>75){overlap++;if(dist(B,C,i)>45)leak++;}
const result={id:'Q35',ok:overlap>=100&&leak/overlap<=.05,detail:{...details,overlapPixels:overlap,leakPixels:leak,leakPercent:100*leak/Math.max(1,overlap),method:'Frozen ECS; actual face/room/composite plus white diagnostic of the same skinned hand geometry. Compare composite to the original hand-only render on face pixels inside the solid hand mask. Diagnostic material restored in finally. Emulator only; physical hand/depth remains UNTESTED.'},at:new Date().toISOString(),shot:'occlusion-composite.jpg'};writeFileSync(join(dir,'occlusion.json'),JSON.stringify(result,null,2));console.log(result);
}finally{try{await f?.evaluate(()=>{const a=window.__auditLayers;if(a){a.mesh.material=a.original;a.mask?.dispose();a.face.visible=true;a.h.visible=true;delete window.__auditLayers;}});cli('ecs','resume');}catch{}await browser?.close();await capture.stop();}
