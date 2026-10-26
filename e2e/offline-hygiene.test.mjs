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
test('the exact Chrome wake 502 resource line is not a runtime failure when the S16 proof is present',()=>{
  const chrome={kind:'console',group:'S16',level:'error',text:'Failed to load resource: the server responded with a status of 502 ()',location:{url:'https://localhost:8091/api/wake'}};
  assert.equal(isRuntimeFailure(chrome,proof,source),false);
  assert.equal(isRuntimeFailure(chrome,proof,'audit/browser/offline-502/network.json'),false);
  assert.equal(isRuntimeFailure({...chrome,text:'Failed to load resource: 502'},proof,source),true);
  assert.equal(isRuntimeFailure({...chrome,text:'unrelated error'},proof,source),true);
  assert.equal(isRuntimeFailure({...chrome,kind:'pageerror'},proof,source),true);
  assert.equal(isRuntimeFailure({...chrome,kind:'requestfailed'},proof,source),true);
  assert.equal(isRuntimeFailure(chrome,null,source),true);
  assert.equal(isRuntimeFailure(chrome,proof,'audit/browser/another-events.jsonl'),true);
  assert.equal(isRuntimeFailure({...chrome,location:{url:'https://localhost:8091/api/status'}},proof,source),true);
  assert.equal(isRuntimeFailure(chrome,{...proof,detail:{...proof.detail,network:{...proof.detail.network,status:500}}},source),true);
});
test('all other console errors, page errors and failed requests remain failures',()=>{
  for(const e of[{kind:'console',level:'error',text:'Failed to load resource: 502'}, {kind:'console',level:'error',text:'unrelated error'},{kind:'pageerror',text:'error'},{kind:'requestfailed',url:event.url}])assert.equal(isRuntimeFailure({...event,...e},proof,source),true);
});
