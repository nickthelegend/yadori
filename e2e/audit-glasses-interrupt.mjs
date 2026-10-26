import{captureManaged}from'../packages/app/e2e/audit-network.mjs';import{chromium}from'playwright';
import{spawn,execFileSync}from'node:child_process';import{readFileSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{APP,cli,sleep,until}from'../packages/app/e2e/cli.mjs';
const startedAt=new Date().toISOString();
for(const suffix of['json','jsonl','ready'])rmSync('audit/browser/glasses-interrupt-network.'+suffix,{force:true});
const p=spawn(process.execPath,['e2e/run-glasses.mjs'],{cwd:APP,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',code,signal,capture,owned=[];const phases=[];
p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);const exited=new Promise(r=>p.on('exit',(c,s)=>{code=c;signal=s;r();}));
async function statusRequest(){const b=await chromium.connectOverCDP(cli('dev','status').state.session.browserAutomation.endpoint);try{for(const ctx of b.contexts())for(const page of ctx.pages())for(const f of page.frames())try{if(await f.evaluate(()=>!!window.__yadori))return await f.evaluate(async()=>{const r=await fetch('/api/status');return{status:r.status,body:await r.json()};});}catch{}throw Error('Application frame unavailable');}finally{await b.close();}}
try{
// Profile changes replace managed Chrome. Attach to the actual test child only
// after it has cold-loaded and entered the active Glasses immersive session.
await until(()=>stdout.includes('PASS  glasses profile active with gaze'),'running glasses test child',65,.1);
capture=await captureManaged('glasses-interrupt-active');const activeStatus=await statusRequest();
const rows=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));const family=new Set([p.pid]);let changed=true;while(changed){changed=false;for(const[pid,ppid]of rows)if(family.has(ppid)&&!family.has(pid)){family.add(pid);changed=true;}}owned=[...family];
p.kill('SIGINT');await exited;phases.push(await capture.stop());capture=null;
await until(()=>{try{return cli('dev','status').state.browserCommandReady&&cli('xr','status').deviceName==='Meta Quest 3'&&JSON.parse(readFileSync(join(APP,'iwsdk.config.json'))).dev.emulator.device==='metaQuest3';}catch{return false;}},'quest restored',60);
capture=await captureManaged('glasses-interrupt-restored');const restoredStatus=await statusRequest();await sleep(.3);phases.push(await capture.stop());capture=null;
const allLogs=cli('browser','logs','--input-json',JSON.stringify({count:200})),logs=Array.isArray(allLogs)?allLogs:allLogs.logs??[];
const network={startedAt,endedAt:new Date().toISOString(),responses:phases.reduce((n,p)=>n+p.responses,0),errors:phases.flatMap(p=>p.errors),phases};for(const log of logs)if(log.level==='error')network.errors.push({kind:'console',log});writeFileSync('audit/browser/glasses-interrupt-network.json',JSON.stringify(network,null,2));
await until(()=>owned.every(pid=>{try{process.kill(pid,0);return false;}catch{return true;}}),'interrupted child and CLI descendants stopped',10,.1);
const alive=owned.filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
const result={id:'G11',ok:code===130&&alive.length===0&&network.responses>0&&network.errors.length===0&&activeStatus.status===200&&restoredStatus.status===200,detail:{pid:p.pid,ownedPIDs:owned,alive,code,signal,stdout,stderr,network,activeStatus,restoredStatus,restoredLogs:logs,status:cli('dev','status')},at:new Date().toISOString(),startedAt};
writeFileSync('audit/browser/glasses-interrupt.json',JSON.stringify(result,null,2));console.log('G11',result.ok?'PASS':'FAIL');process.exitCode=result.ok?0:1;
}finally{if(code===undefined)p.kill('SIGTERM');if(capture)await capture.stop();}
