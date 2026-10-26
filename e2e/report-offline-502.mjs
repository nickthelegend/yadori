import {readFileSync,writeFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isExpectedS16Response,isRuntimeFailure} from './offline-hygiene.mjs';

export function reportOffline502(){
  const dir='audit/browser/offline-502',source=dir+'/events.jsonl';
  const results=JSON.parse(readFileSync(dir+'/results.json')),run=JSON.parse(readFileSync(dir+'/run.json'));
  const ids=['S13','S14','S15','S16','P11'];
  if(results.length!==5||!ids.every(id=>results.some(r=>r.id===id)))throw Error('Incomplete offline verification');
  const s16=results.find(r=>r.id==='S16');
  const events=readFileSync(source,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const expected=events.filter(e=>isExpectedS16Response(e,s16,source));
  if(expected.length!==1)throw Error('Exactly one observed S16 POST /api/wake 502 is required');
  const problems=events.filter(e=>isRuntimeFailure(e,s16,source));
  for(const result of results){
    if(result.at<run.startedAt)throw Error('Stale offline evidence '+result.id);
    const rowProblems=problems.filter(e=>e.group===result.id);
    result.ok=!!result.ok&&rowProblems.length===0;
    result.detail.errors=rowProblems;
    const row={id:result.id,status:result.ok?'PASS':'FAIL',runStartedAt:run.startedAt,observations:[{ok:result.ok,source:dir+'/results.json',detail:result.detail,at:result.at,shot:result.shot,capture:source}]};
    writeFileSync('audit/rows/'+result.id+'.json',JSON.stringify(row,null,2));
  }
  writeFileSync(dir+'/results.json',JSON.stringify(results,null,2));
  const hygiene={at:new Date().toISOString(),scope:ids,expectedResponses:expected,problems};
  writeFileSync(dir+'/hygiene.json',JSON.stringify(hygiene,null,2));
  const lines=readFileSync('AUDIT.md','utf8').split('\n').map(line=>{
    const id=/^\| ([A-Z]+\d+) \|/.exec(line)?.[1];
    if(!ids.includes(id))return line;
    const result=results.find(r=>r.id===id),cells=line.split('|').slice(1,-1).map(s=>s.trim());
    // The Phase 1 expected-result cell is deliberately left byte-for-byte intact.
    cells[3]=result.ok?'PASS':'FAIL';
    cells[4]=`[Fresh offline rerun](audit/rows/${id}.json) · [UI](${dir}/${result.shot})`;
    if(id==='S16')cells[5]='Restored expected HTTP 502. Chromium emits a resource console error; UI recovers locally, but the zero-console-error requirement remains FAIL.';
    return '| '+cells.join(' | ')+' |';
  });
  const rows=lines.filter(l=>/^\| [A-Z]+\d+ \|/.test(l)),counts=Object.fromEntries(['PASS','FAIL','UNTESTED','PENDING'].map(s=>[s,rows.filter(r=>r.includes('| '+s+' |')).length]));
  const text=lines.join('\n').replace(/\*\*\d+ PASS \/ \d+ FAIL \/ \d+ UNTESTED \/ \d+ PENDING\*\*/,`**${counts.PASS} PASS / ${counts.FAIL} FAIL / ${counts.UNTESTED} UNTESTED / ${counts.PENDING} PENDING**`)
    .replace('No mocks or stubs, browser console/page errors, or unexpected network errors remain on the tested surface.','No mocks or stubs remain. The offline follow-up preserves the expected S16 wake HTTP 502; Chromium emits one resource console error, so S16 remains FAIL. Every other unexpected HTTP, console or page error remains a failure.');
  writeFileSync('AUDIT.md',text);
  writeFileSync('audit/totals.json',JSON.stringify({at:new Date().toISOString(),pass:counts.PASS,fail:counts.FAIL,untested:counts.UNTESTED,pending:counts.PENDING,rows:rows.length,missing:[],offlineFollowup:dir+'/run.json'},null,2));
  writeFileSync('audit/runtime-hygiene.json',JSON.stringify({...hygiene,baseline:'Full-suite captures remain unchanged; only S13–S16 and P11 were re-verified.'},null,2));
  const files=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path+'/'+e.name):[path+'/'+e.name]);
  const all=files('audit'),shots=all.filter(p=>/\.(jpg|jpeg|webp)$/.test(p));
  const bytes=all.reduce((sum,p)=>sum+statSync(p).size,0),maxScreenshotBytes=Math.max(...shots.map(p=>statSync(p).size));
  if(bytes>15*1024*1024||maxScreenshotBytes>200000)throw Error('Evidence budget exceeded');
  const packaging=JSON.parse(readFileSync('audit/packaging.json'));writeFileSync('audit/packaging.json',JSON.stringify({...packaging,bytes,maxScreenshotBytes,offlineFollowup:dir+'/run.json'},null,2));
  writeFileSync(dir+'/source-sha256.txt',['packages/app/vite.config.ts','e2e/audit-report.mjs','e2e/offline-hygiene.mjs','e2e/report-offline-502.mjs','e2e/audit-offline-502.mjs'].map(p=>createHash('sha256').update(readFileSync(p)).digest('hex')+'  '+p).join('\n')+'\n');
  console.log(results.map(r=>r.id+' '+(r.ok?'PASS':'FAIL')).join('\n'));
  return results.every(r=>r.ok);
}
