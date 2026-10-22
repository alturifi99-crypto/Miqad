import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {checkMail} from '../src/mail-check.mjs';import {createSetupApp} from '../src/setup-app.mjs';
test('startup mail check sends once, persists outcome across starts and exposes no recipient',async()=>{
 const config={...process.env,MAIL_FROM:'onboarding@resend.dev',MAIL_TEST_TO:`test-${randomUUID()}@example.test`};let calls=0;const send=async message=>{calls++;assert.equal(message.to,config.MAIL_TEST_TO);assert.match(message.idempotencyKey,/^miqad-test-[a-f0-9]{64}$/);};
 assert.deepEqual(await checkMail(config,{send}),{status:'accepted'});assert.deepEqual(await checkMail(config,{send}),{status:'accepted'});assert.equal(calls,1);
 const concurrent={...config,MAIL_TEST_ID:'concurrent'};await Promise.all([checkMail(concurrent,{send}),checkMail(concurrent,{send})]);assert.equal(calls,2);assert.deepEqual(await checkMail(concurrent,{send}),{status:'accepted'});
 const app=createSetupApp({mail:{status:'accepted',email:config.MAIL_TEST_TO,key:'private'}});try{const result=await app.inject('/api/setup/mail');assert.deepEqual(result.json(),{mail:{status:'accepted'},productionReady:false});assert.doesNotMatch(result.body,/example.test|private/);}finally{await app.close();}
});
test('failed mail attempts are not silently repeated and invalid setup sends nothing',async()=>{
 assert.deepEqual(await checkMail({}),{status:'not_requested'});assert.deepEqual(await checkMail({MAIL_TEST_TO:'bad'}),{status:'invalid_configuration'});let calls=0;const config={...process.env,MAIL_FROM:'onboarding@resend.dev',MAIL_TEST_TO:`failure-${randomUUID()}@example.test`},send=async()=>{calls++;throw Error('secret provider response');};assert.deepEqual(await checkMail(config,{send}),{status:'failed'});assert.deepEqual(await checkMail(config,{send}),{status:'failed'});assert.equal(calls,1);
});
