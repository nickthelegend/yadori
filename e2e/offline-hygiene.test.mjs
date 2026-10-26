import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedS16Response, isRuntimeFailure} from './offline-hygiene.mjs';
const source='audit/browser/offline-502/events.jsonl';
const event={kind:'response',group:'S16',method:'POST',url:'https://localhost:8091/api/wake',status:502,requestId:42};
const proof={id:'S16',detail:{network:{...event,body:{gateway:'offline',error:'Gateway offline: start it with pnpm gateway'}},waking:null,spirits:[{id:'local-test',faceSource:'built-in',hasPersona:false}],body:'Gateway: Gateway offline. Waking with the built-in face.'}};
test('classifies only the observed expected S16 wake response as allowed',()=>{
  assert.equal(isExpectedS16Response(event,proof,source),true);
  assert.equal(isRuntimeFailure(event,proof,source),false);
  for(const changed of[{group:'S13'},{method:'GET'},{url:'https://localhost:8091/api/say'},{status:500},{status:404},{requestId:43}])assert.equal(isRuntimeFailure({...event,...changed},proof,source),true);
  assert.equal(isRuntimeFailure(event,proof,'audit/browser/another-events.jsonl'),true);
  assert.equal(isRuntimeFailure(event,null,source),true);
  assert.equal(isRuntimeFailure(event,{...proof,detail:{...proof.detail,waking:'pending'}},source),true);
});
test('all console errors, page errors and failed requests remain failures',()=>{
  for(const e of[{kind:'console',level:'error',text:'Failed to load resource: 502'}, {kind:'console',level:'error',text:'unrelated error'},{kind:'pageerror',text:'error'},{kind:'requestfailed',url:event.url}])assert.equal(isRuntimeFailure({...event,...e},proof,source),true);
});
