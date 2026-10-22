import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
const roles=[['miqad_app','DATABASE_URL'],['miqad_auth','AUTH_DATABASE_URL'],['miqad_platform','PLATFORM_DATABASE_URL']];
export function runtimeConnections(config){
 const admin=new URL(config.DATABASE_ADMIN_URL),connections={};
 for(const [role,key] of roles){if(config[key]){const url=new URL(config[key]);if(url.username!==role||url.hostname!==admin.hostname||url.port!==admin.port||url.pathname!==admin.pathname||!url.password)throw Error('Invalid runtime role configuration');connections[key]=url.toString();continue;}
 if(!config.DATABASE_ROLE_SECRET||config.DATABASE_ROLE_SECRET.length<32)throw Error('Runtime role secret required');
 const url=new URL(admin);url.username=role;url.password=createHmac('sha256',config.DATABASE_ROLE_SECRET).update(`${role}:${admin.hostname}:${admin.port}:${admin.pathname}`).digest('base64url');connections[key]=url.toString();}
 return connections;
}
// Called only from trusted startup configuration, never from an HTTP request.
export async function initializeDatabase(config=process.env){
 if(config.DATABASE_SETUP!=='initialize')return {status:'not_requested'};
 let connections;try{connections=runtimeConnections(config);}catch{return {status:'role_secret_required'};}
 const client=new pg.Client({connectionString:config.DATABASE_ADMIN_URL,connectionTimeoutMillis:5000,query_timeout:15000,statement_timeout:10000});let connected=false,transaction=false;
 try{
 await client.connect();connected=true;await client.query("SELECT pg_advisory_lock(hashtextextended('miqad-schema-bootstrap',0))");
 await client.query('BEGIN');transaction=true;
 const admin=(await client.query('SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];if(!admin?.rolsuper&&!admin?.rolcreaterole)throw Object.assign(Error(),{setupStatus:'role_creation_unavailable'});
 const tracked=(await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS tracked")).rows[0].tracked;
 if(!tracked){const existing=await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') LIMIT 1");if(existing.rowCount)throw Object.assign(Error(),{setupStatus:'untracked_schema'});}
 const applied=tracked?new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version)):new Set();
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){if(applied.has(file.slice(0,-4)))continue;const sql=await readFile(new URL(file,dir),'utf8');if(!/^BEGIN;\s/.test(sql)||! /COMMIT;\s*$/.test(sql))throw Error('Invalid migration wrapper');await client.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));}
 const attrs=(await client.query('SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])',[roles.map(([role])=>role)])).rows;
 if(attrs.length!==3||attrs.some(r=>r.rolsuper||r.rolbypassrls))throw Object.assign(Error(),{setupStatus:'runtime_roles_unsafe'});
 for(const [role,key] of roles){const password=decodeURIComponent(new URL(connections[key]).password);const statement=(await client.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) AS sql",[role,password])).rows[0].sql;await client.query(statement);}
 await verifyTenantIsolation(client);
 await client.query('COMMIT');transaction=false;return {status:'initialized'};
 }catch(error){if(transaction)try{await client.query('ROLLBACK');}catch{}return {status:error.setupStatus||'initialization_failed'};}
 finally{if(connected)try{await client.query("SELECT pg_advisory_unlock(hashtextextended('miqad-schema-bootstrap',0))");}catch{}try{await client.end();}catch{}}
}

async function verifyTenantIsolation(c){
 await c.query('SAVEPOINT isolation_verification');
 try{
  await c.query('SET LOCAL ROLE miqad_auth');
  const users=[],tenants=[];
  for(let i=0;i<2;i++){
   const user=(await c.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',[`probe-${randomUUID()}@example.invalid`,'not-a-login-credential'])).rows[0].id;
   const tenant=(await c.query('INSERT INTO tenants(name) VALUES($1) RETURNING id',['Temporary isolation verification'])).rows[0].id;
   await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[tenant,user]);users.push(user);tenants.push(tenant);
  }
  await c.query('SET LOCAL ROLE miqad_app');
  await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",[users[0],tenants[0]]);
  const event=(await c.query('INSERT INTO events(tenant_id,name) VALUES($1,$2) RETURNING id',[tenants[0],'Temporary event'])).rows[0].id;
  await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",[users[1],tenants[1]]);
  if((await c.query('SELECT id FROM events WHERE id=$1',[event])).rowCount)throw Error('Isolation verification failed');
  await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenants[0]]);
  if((await c.query('SELECT id FROM events WHERE id=$1',[event])).rowCount)throw Error('Forged scope accepted');
  await c.query('SAVEPOINT denied_insert');let denied=false;
  try{await c.query('INSERT INTO events(tenant_id,name) VALUES($1,$2)',[tenants[0],'Forbidden event']);}catch(error){if(error.code==='42501')denied=true;else throw error;}finally{await c.query('ROLLBACK TO SAVEPOINT denied_insert');}
  if(!denied)throw Error('Cross-company write accepted');
 }finally{await c.query('ROLLBACK TO SAVEPOINT isolation_verification');await c.query('RELEASE SAVEPOINT isolation_verification');}
}
