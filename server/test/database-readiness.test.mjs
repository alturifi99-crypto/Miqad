import test from 'node:test';import assert from 'node:assert/strict';import {inspectDatabase} from '../src/database-readiness.mjs';import {createSetupApp} from '../src/setup-app.mjs';
const config={DATABASE_ADMIN_URL:'postgresql://fixture:secret@localhost/fixture'};
test('managed account capability checks stop before migrations and never expose driver details',async()=>{
 for(const [role,status] of [[{rolsuper:false,rolcreaterole:false,rolbypassrls:false},'role_creation_unavailable'],[{rolsuper:false,rolcreaterole:true,rolbypassrls:false},'migration_required']]){let closed=false;class Client{constructor(options){assert.equal(options.options,'-c default_transaction_read_only=on');}async connect(){}async query(sql){assert.match(sql,/^SELECT /);return {rows:[sql.includes('pg_roles')?role:{tracked:false}]};}async end(){closed=true;}}
 assert.deepEqual(await inspectDatabase(config,{Client}),{status});assert.ok(closed);}
 class Broken{async connect(){throw Error(config.DATABASE_ADMIN_URL);}async end(){}}
 assert.deepEqual(await inspectDatabase(config,{Client:Broken}),{status:'unavailable'});
 const app=createSetupApp({readiness:{status:'role_creation_unavailable',secret:config.DATABASE_ADMIN_URL}});try{const r=await app.inject('/api/setup/database');assert.equal(r.json().readiness.status,'role_creation_unavailable');assert.equal(r.json().productionReady,false);assert.doesNotMatch(r.body,/fixture|postgresql/);assert.match((await app.inject('/')).body,/لا يتيح إنشاء الأدوار/);}finally{await app.close();}
});
