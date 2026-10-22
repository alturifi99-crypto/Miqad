import test from 'node:test';import assert from 'node:assert/strict';
import {probeDatabase} from '../src/database-probe.mjs';import {createSetupApp} from '../src/setup-app.mjs';
const config={DATABASE_ADMIN_URL:'postgresql://fixture:fixture-secret@localhost/fixture'};
test('database check is read-only, bounded, closes connections and returns no credentials',async()=>{
 let closed=false;class Client{constructor(options){assert.equal(options.options,'-c default_transaction_read_only=on');assert.equal(options.connectionTimeoutMillis,5000);assert.equal(options.query_timeout,3000);}async connect(){}async query(sql){assert.equal(sql,'SELECT 1 AS connection_check');}async end(){closed=true;}}
 const result=await probeDatabase(config,{Client});assert.equal(result.status,'connected');assert.ok(closed);assert.deepEqual(Object.keys(result).sort(),['checkedAt','status']);
 const app=createSetupApp({database:{...result,password:'must-not-appear',url:config.DATABASE_ADMIN_URL}});try{const r=await app.inject('/api/setup/database');assert.equal(r.json().database.status,'connected');assert.equal(r.json().productionReady,false);assert.doesNotMatch(r.body,/fixture|must-not-appear|postgresql/);assert.match((await app.inject('/')).body,/نجح الاتصال/);}finally{await app.close();}
});
test('database probe handles missing configuration and redacts all driver failures',async()=>{
 assert.equal((await probeDatabase({})).status,'not_configured');assert.equal((await probeDatabase({DATABASE_ADMIN_URL:'invalid'})).status,'invalid_configuration');
 for(const [code,status] of [['28P01','authentication_failed'],['3D000','database_not_found'],['ECONNREFUSED','unavailable']]){let closed=false;class Client{async connect(){throw Object.assign(Error(config.DATABASE_ADMIN_URL),{code});}async end(){closed=true;}}const result=await probeDatabase(config,{Client});assert.equal(result.status,status);assert.ok(closed);assert.doesNotMatch(JSON.stringify(result),/fixture|postgresql/);}
});
