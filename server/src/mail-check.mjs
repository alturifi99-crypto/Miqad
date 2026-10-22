import pg from 'pg';import {createHash} from 'node:crypto';import {z} from 'zod';import {mailSender} from './mail.mjs';
// Trusted startup only. Persist the claim BEFORE sending to avoid mail on every cold start.
export async function checkMail(config=process.env,{send}={}){
 if(!config.MAIL_TEST_TO)return {status:'not_requested'};
 if(!z.string().email().max(254).safeParse(config.MAIL_TEST_TO).success||!config.DATABASE_ADMIN_URL)return {status:'invalid_configuration'};
 const testId=config.MAIL_TEST_ID||'first-mail-check';if(!/^[a-zA-Z0-9_-]{1,80}$/.test(testId))return {status:'invalid_configuration'};
 let deliver;try{deliver=send||mailSender(config);}catch{return {status:'invalid_configuration'};}
 const key=createHash('sha256').update(JSON.stringify([testId,config.MAIL_TEST_TO,config.MAIL_FROM])).digest('hex');
 const c=new pg.Client({connectionString:config.DATABASE_ADMIN_URL,connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:4000});let transaction=false;
 try{
 await c.connect();const schema=await c.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS tracked");if(!schema.rows[0].tracked)return {status:'schema_required'};
 await c.query('BEGIN');transaction=true;await c.query("SELECT pg_advisory_xact_lock(hashtextextended('miqad-mail-check',0))");
 await c.query("CREATE TABLE IF NOT EXISTS public.miqad_mail_checks(check_hash text PRIMARY KEY,status text NOT NULL CHECK(status IN('attempting','accepted','failed')),created_at timestamptz NOT NULL DEFAULT now())");await c.query('REVOKE ALL ON public.miqad_mail_checks FROM PUBLIC');
 const previous=(await c.query('SELECT status FROM public.miqad_mail_checks WHERE check_hash=$1',[key])).rows[0];
 if(previous){await c.query('COMMIT');transaction=false;return {status:previous.status==='attempting'?'outcome_unknown':previous.status};}
 await c.query("INSERT INTO public.miqad_mail_checks(check_hash,status) VALUES($1,'attempting')",[key]);await c.query('COMMIT');transaction=false;
 let status='accepted';try{await deliver({to:config.MAIL_TEST_TO,subject:'مقعد · اختبار إرسال البريد',text:'هذه رسالة اختبار من موقع مقعد للتأكد من إعداد خدمة البريد. لا تتضمن بيانات ضيوف أو روابط دخول. لا يلزم الرد عليها.',idempotencyKey:'miqad-test-'+key});}catch{status='failed';}
 await c.query('UPDATE public.miqad_mail_checks SET status=$1 WHERE check_hash=$2',[status,key]);return {status};
 }catch{if(transaction)try{await c.query('ROLLBACK');}catch{}return {status:'unavailable'};}
 finally{try{await c.end();}catch{}}
}
