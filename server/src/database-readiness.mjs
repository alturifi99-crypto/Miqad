import pg from 'pg';
// Read-only preflight: the current migrations require role creation and a bypassing owner.
// A managed owner needs a separately reviewed policy-function ownership strategy.
export async function inspectDatabase(config=process.env,{Client=pg.Client}={}){
 if(!config.DATABASE_ADMIN_URL)return {status:'not_configured'};
 let client;
 try{
  client=new Client({connectionString:config.DATABASE_ADMIN_URL,connectionTimeoutMillis:5000,query_timeout:3000,statement_timeout:3000,options:'-c default_transaction_read_only=on'});
  await client.connect();
  const role=(await client.query('SELECT rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(!role)return {status:'unavailable'};
  if(!role.rolsuper&&!role.rolcreaterole)return {status:'role_creation_unavailable'};
  if(!role.rolsuper&&!role.rolbypassrls)return {status:'managed_owner_review_required'};
  const metadata=await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS tracked");
  if(!metadata.rows[0].tracked)return {status:'migration_required'};
  const applied=(await client.query('SELECT version FROM public.schema_migrations')).rows.map(r=>r.version);
  if(!['001_foundation','002_hardening','003_platform_audit'].every(v=>applied.includes(v)))return {status:'migration_required'};
  const roles=(await client.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])",[['miqad_app','miqad_auth','miqad_platform']])).rows;
  if(roles.length!==3||roles.some(r=>r.rolsuper||r.rolbypassrls))return {status:'runtime_roles_unsafe'};
  const tables=['tenants','memberships','invitations','events','halls','workspaces','seating_rows','seats','guests','reservations','delegations','delegation_members','audit_logs','import_batches','tenant_subscriptions','platform_audit_logs'];
  const flags=(await client.query("SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows;
  if(flags.length!==tables.length||flags.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||['miqad_app','miqad_auth','miqad_platform'].includes(r.rolname)))return {status:'schema_protection_incomplete'};
  return {status:'schema_checks_passed'};
 }catch{return {status:'unavailable'};}
 finally{if(client)try{await client.end();}catch{}}
}
