// Local development only. Never deletes/reinitializes a database or overwrites .env.
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const root=fileURLToPath(new URL('../',import.meta.url));
const envPath=resolve(root,'.env'),dbEnv=resolve(root,'.local/postgres.env');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
 let existing=false;try{docker('inspect','miqad-saas-postgres');existing=true;}catch{}
 if(!existsSync(envPath)){
  if(existing)throw Error('An existing database container needs its original .env credentials; restore them, do not reset it.');
  const secret=()=>randomBytes(32).toString('hex'),admin=secret(),app=secret(),auth=secret(),platform=secret();
  mkdirSync(resolve(root,'.local'),{recursive:true,mode:0o700});
  writeFileSync(dbEnv,`POSTGRES_PASSWORD=${admin}\nPOSTGRES_DB=miqad\n`,{flag:'wx',mode:0o600});
  writeFileSync(envPath,`DATABASE_ADMIN_URL=postgresql://postgres:${admin}@127.0.0.1:15432/miqad\nDATABASE_URL=postgresql://miqad_app:${app}@127.0.0.1:15432/miqad\nAUTH_DATABASE_URL=postgresql://miqad_auth:${auth}@127.0.0.1:15432/miqad\nPLATFORM_DATABASE_URL=postgresql://miqad_platform:${platform}@127.0.0.1:15432/miqad\nPUBLIC_ORIGIN=http://127.0.0.1:8090\nNODE_ENV=development\nPORT=8090\n`,{flag:'wx',mode:0o600});
 }
 const config=parseEnv(readFileSync(envPath,'utf8'));
 const endpoint=new URL(config.DATABASE_ADMIN_URL);
 if(endpoint.hostname!=='127.0.0.1'||endpoint.port!=='15432')throw Error('This helper is limited to the documented local development database.');
 if(existing)docker('start','miqad-saas-postgres');
 else{
  if(!existsSync(dbEnv))throw Error('Database container is absent and its local initialization file is missing. Restore the original database and credentials; no reset was attempted.');
  // Named volume is retained across container restarts. Never run docker volume rm.
  docker('run','--name','miqad-saas-postgres','-p','127.0.0.1:15432:5432','--env-file',dbEnv,'--mount','type=volume,source=miqad-saas-data,target=/var/lib/postgresql/data','-d','postgres:17@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe');
 }
 const deadline=Date.now()+30000;let ready=false;
 while(Date.now()<deadline){const client=new pg.Client({connectionString:config.DATABASE_ADMIN_URL,connectionTimeoutMillis:1000});try{await client.connect();await client.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}finally{await client.end();}}
 if(!ready)throw Error('Local PostgreSQL did not become ready. Inspect container logs without exposing credentials.');
 console.log('Local PostgreSQL is ready. Existing data and credentials were preserved.');
}catch{console.error('Local database setup could not complete safely. Check Docker availability, original .env credentials and the existing container; no database was deleted or reset.');process.exitCode=1;}
