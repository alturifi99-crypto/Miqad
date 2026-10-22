import pg from 'pg';
// One bounded read-only connection at startup; never return driver messages or credentials.
export async function probeDatabase(config=process.env,{Client=pg.Client}={}){
 const checkedAt=new Date().toISOString();
 const result=status=>({status,checkedAt});
 if(!config.DATABASE_ADMIN_URL)return result('not_configured');
 let url;try{url=new URL(config.DATABASE_ADMIN_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw Error();}catch{return result('invalid_configuration');}
 let client;
 try{
  client=new Client({connectionString:config.DATABASE_ADMIN_URL,connectionTimeoutMillis:5000,query_timeout:3000,statement_timeout:3000,application_name:'miqad-setup-read-only-check',options:'-c default_transaction_read_only=on'});
  await client.connect();await client.query('SELECT 1 AS connection_check');return result('connected');
 }catch(error){return result(['28P01','28000'].includes(error.code)?'authentication_failed':error.code==='3D000'?'database_not_found':'unavailable');}
 finally{if(client)try{await client.end();}catch{/* Never expose connection or shutdown errors. */}}
}
