import test from 'node:test';
import assert from 'node:assert/strict';
import {createSetupApp} from '../src/setup-app.mjs';
test('public hosting setup serves Arabic status without exposing company or authentication routes',async()=>{
 const app=createSetupApp();try{
 const page=await app.inject('/');assert.equal(page.statusCode,200);assert.match(page.body,/dir="rtl"/);assert.match(page.body,/جارٍ تجهيز/);assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
 assert.deepEqual((await app.inject('/api/health')).json(),{status:'ok',mode:'setup',productionReady:false});
 for(const url of ['/api/auth/register','/api/auth/login','/api/me','/console','/site/','/.env','/server/.env']){const response=await app.inject({method:url.includes('/auth/')?'POST':'GET',url,payload:url.includes('/auth/')?{email:'test@example.test'}:undefined});assert.equal(response.statusCode,503,url);assert.doesNotMatch(response.body,/postgresql:|password_hash/);}
 }finally{await app.close();}
});
