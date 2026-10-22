import {createApp} from './app.mjs';
import {createSetupApp} from './setup-app.mjs';
import {probeDatabase} from './database-probe.mjs';
import {inspectDatabase} from './database-readiness.mjs';
import {initializeDatabase,runtimeConnections} from './initialize-database.mjs';
import {checkMail} from './mail-check.mjs';
async function start(){
const mode=process.env.DEPLOYMENT_MODE||'application';
if(!['setup','application','pilot'].includes(mode))throw Error('Invalid deployment mode');
let app;
if(mode==='setup'){const database=await probeDatabase();const preparation=database.status==='connected'?await initializeDatabase():{status:'not_requested'};const readiness=!['not_requested','initialized'].includes(preparation.status)?preparation:database.status==='connected'?await inspectDatabase():{status:'not_checked'};if(preparation.status==='initialized'&&readiness.status==='schema_checks_passed')readiness.status='schema_verified';const mail=database.status==='connected'?await checkMail():{status:'not_requested'};app=createSetupApp({database,readiness,mail});}else if(mode==='pilot'){const config={...process.env,AUTH_SECURITY:'enabled'};if((await inspectDatabase(config)).status!=='schema_checks_passed')throw Error('Private pilot requires completed account-security migrations and database checks');const runtime=runtimeConnections(config);Object.assign(config,runtime);delete config.DATABASE_ADMIN_URL;delete config.DATABASE_ROLE_SECRET;delete process.env.DATABASE_ADMIN_URL;delete process.env.DATABASE_ROLE_SECRET;app=await createApp(config);}else app=await createApp();
const port=Number(process.env.PORT||8090);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid listening port');
await app.listen({host:process.env.RENDER==='true'?'0.0.0.0':'127.0.0.1',port});
console.log(mode==='setup'?'Miqad hosting setup is online. Company APIs are disabled.':mode==='pilot'?'Miqad owner-only pilot is online. Public registration remains disabled.':'Miqad development application is online. Production rollout is disabled.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});

}
start().catch(()=>{console.error('Miqad startup failed: verify mode, migrations and protected settings. No credentials were logged.');process.exitCode=1;});
