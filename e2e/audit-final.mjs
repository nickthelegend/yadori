// Full fresh local audit; service ownership and slot release are in one finally.
import{spawn,execFileSync}from'node:child_process';
import{existsSync,mkdirSync,rmSync,writeFileSync,readFileSync,openSync,closeSync,copyFileSync}from'node:fs';
import{tmpdir,cpus,totalmem,platform,arch}from'node:os';import{join,resolve}from'node:path';
const root=process.cwd(),app=join(root,'packages/app'),at=new Date().toISOString(),run=join(tmpdir(),'yadori-final-'+Date.now()),slot='/Volumes/Extreme SSD/Projects/grokbot/tools/heavy-slot.sh';
if(existsSync('/tmp/yadori-audit-no-env'))throw Error('Required nonexistent env path exists');
rmSync('audit',{recursive:true,force:true});for(const d of['audit/suites','audit/browser','audit/server','audit/commands',run])mkdirSync(d,{recursive:true});
const env={...process.env,YADORI_ENV_FILE:'/tmp/yadori-audit-no-env',MODEL_API_KEY:'',YADORI_DATA_DIR:join(run,'data'),YADORI_RATE_PER_MIN:'10000',AUDIT_SUPERVISOR:join(run,'supervisor.json')};
const commands=[],children={},tracked=new Set();let held=false,current;
writeFileSync('audit/run.json',JSON.stringify({startedAt:at,localTimezone:'Asia/Kolkata',root,node:process.version,pnpm:execFileSync('pnpm',['--version'],{encoding:'utf8'}).trim(),os:execFileSync('sw_vers',[],{encoding:'utf8'}).trim(),platform:platform(),arch:arch(),cpu:cpus()[0].model,logicalCPUs:cpus().length,totalMemoryGiB:totalmem()/2**30,envFile:'/tmp/yadori-audit-no-env',envFileExists:false,MODEL_API_KEY:'empty',heavySlot:'yadori-audit-final',dataDirectory:env.YADORI_DATA_DIR},null,2));
async function command(name,cmd,args=[],cwd=root,extra={}){const startedAt=new Date().toISOString(),path=join(root,'audit/commands',name+'.txt'),fd=openSync(path,'w');console.log('START',name);const p=spawn(cmd,args,{cwd,env:{...env,...extra},stdio:['ignore',fd,fd],detached:true});current=p;tracked.add(p.pid);const code=await new Promise((r,j)=>{p.once('error',j);p.once('exit',c=>r(c??1));});closeSync(fd);current=null;commands.push({name,command:[cmd,...args],cwd,startedAt,endedAt:new Date().toISOString(),exitCode:code,log:'commands/'+name+'.txt'});writeFileSync('audit/commands.json',JSON.stringify(commands,null,2));console.log('END',name,code);if(code)throw Error(name+' failed; see '+path);}
function service(name,args,cwd){const fd=openSync(join(root,'audit/commands',name+'.txt'),'w'),p=spawn('pnpm',args,{cwd,env,stdio:['ignore',fd,fd],detached:true});closeSync(fd);children[name]=p.pid;tracked.add(p.pid);writeFileSync(env.AUDIT_SUPERVISOR,JSON.stringify({pid:process.pid,children,root}));return p;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function readiness(){for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:8440/api/status');if(!r.ok)throw Error('gateway');const s=JSON.parse(execFileSync(process.execPath,['node_modules/@iwsdk/cli/dist/cli.js','dev','status'],{cwd:app,encoding:'utf8',stdio:['ignore','pipe','pipe']}));if(s.data.state.browserCommandReady&&s.data.state.session.browserAutomation.enabled){writeFileSync('audit/browser/readiness.json',JSON.stringify({at:new Date().toISOString(),status:s,gateway:await r.json()},null,2));return;}}catch{}await sleep(1000);}throw Error('Runtime readiness timeout');}
function family(){const rows=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));let change=true;while(change){change=false;for(const[pid,ppid]of rows)if(tracked.has(ppid)&&!tracked.has(pid)){tracked.add(pid);change=true;}}}
let error;
try{
for(const[name,args]of[['room',['--filter','@yadori/room','test']],['rig',['--filter','@yadori/rig','test']],['server',['--filter','@yadori/server','test']],['typecheck',['typecheck']],['app-build',['--filter','app','build']]])await command(name,'pnpm',args);
await command('http-mcp-store','node',['e2e/audit-server.mjs']);
await command('rooms','pnpm',['--filter','app','rooms']);
// Declining is a real CLI run with stdin=N and expected exit 1, no downloads.
await command('fetch-decline','node',['--input-type=module','-e',`import{spawnSync}from'node:child_process';const r=spawnSync('bash',['scripts/fetch-models.sh'],{input:'N\\n',encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.status!==1||!r.stdout.includes('Not downloaded. The app keeps its labelled fallback voice.'))process.exit(1);`]);
await command('slot-acquire',slot,['acquire','yadori-audit-final']);held=true;
service('gateway',['--filter','@yadori/server','start'],root);
service('dev',['exec','iwsdk','dev','restart','--foreground','--ai-mode','agent','--allow-browser-automation'],app);
await readiness();family();
for(const[name,args,cwd]of[
['quest',['--filter','app','e2e:xr'],root],
['xr-details',['packages/app/e2e/audit-xr-details.mjs'],root],
['xr-fixes',['e2e/audit-xr-fixes.mjs'],app],
['xr-furniture',['e2e/audit-furniture.mjs'],app],
['xr-capacity',['e2e/audit-capacity.mjs'],app],
['xr-persistence',['e2e/audit-persistence.mjs'],app],
['xr-mode-label',['e2e/audit-mode-label.mjs'],app],
['xr-occlusion',['e2e/audit-occlusion.mjs'],root],
['glasses-interrupt',['e2e/audit-glasses-interrupt.mjs'],root],
['glasses',['--filter','app','e2e:glasses'],root],
['browser',['--filter','app','e2e:browser'],root],
['responsive',['e2e:responsive'],root],
['browser-checklist',['e2e/audit-browser.mjs'],root],
['browser-focused',['e2e/audit-focused.mjs'],root],
['browser-inputs',['e2e/audit-inputs.mjs'],root],
['browser-mobile',['e2e/audit-mobile.mjs'],root],
['landing-keyboard',['e2e/audit-keyboard.mjs'],root],
['built-browser',['e2e/audit-built.mjs'],root],
['browser-camera',['e2e/audit-recovery.mjs'],root],
])await command(name,['quest','glasses','browser','responsive'].includes(name)?'pnpm':'node',args,cwd);
await command('storage-denied','node',['e2e/audit-recovery.mjs'],root,{AUDIT_DENY_STORAGE:'1'});copyFileSync('audit/browser/recovery-results.json','audit/browser/storage-denied-results.json');
await command('silent-browser','node',['e2e/audit-recovery.mjs'],root,{AUDIT_SILENT:'1'});copyFileSync('audit/browser/recovery-results.json','audit/browser/silent-results.json');
await command('offline-recovery','node',['e2e/audit-recovery.mjs'],root,{AUDIT_OFFLINE:'1'});copyFileSync('audit/browser/recovery-results.json','audit/browser/offline-results.json');
for(const[src,dest]of[['packages/app/e2e/results/xr-quest3.json','quest-results.json'],['packages/app/e2e/results/xr-glasses.json','glasses-results.json'],['packages/app/e2e/results/browser-diorama.json','browser-results.json'],['e2e/results/responsive.json','responsive-results.json']])copyFileSync(src,join('audit/browser',dest));
}catch(e){error=String(e.stack??e);console.error(error);}finally{
try{family();}catch{}
if(current)try{process.kill(-current.pid,'SIGTERM');}catch{}
if(children.dev)try{execFileSync('pnpm',['exec','iwsdk','dev','down'],{cwd:app,env,timeout:20000,stdio:'ignore'});}catch{}
for(const pid of Object.values(children))try{process.kill(-pid,'SIGTERM');}catch{}
await sleep(1500);const survivors=[];for(const pid of tracked){try{process.kill(pid,0);survivors.push(pid);process.kill(pid,'SIGTERM');}catch{}}
await sleep(500);if(held)execFileSync(slot,['release','yadori-audit-final']);
const alive=[];for(const pid of tracked)try{process.kill(pid,0);alive.push(pid);}catch{}
writeFileSync('audit/cleanup.json',JSON.stringify({at:new Date().toISOString(),children,trackedPIDs:[...tracked],survivorsAfterStop:survivors,alive,slotReleased:held,configDevice:JSON.parse(readFileSync(join(app,'iwsdk.config.json'))).dev.emulator.device,error:error??null},null,2));
rmSync(run,{recursive:true,force:true});console.log('CLEANUP',alive.length,'owned PIDs alive; slot released');
}process.exitCode=error?1:0;
