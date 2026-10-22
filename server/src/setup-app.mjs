import Fastify from 'fastify';
// Public deployment preparation only. No registration, sessions or guest data APIs.
export function createSetupApp({database={status:'not_checked'}}={}){
 const labels={not_checked:'لم يُفحص الاتصال بعد',not_configured:'لم يُضف متغير اتصال القاعدة',invalid_configuration:'صيغة إعداد الاتصال غير صالحة',connected:'نجح الاتصال بقاعدة البيانات',authentication_failed:'تعذّر التحقق من بيانات الدخول إلى القاعدة',database_not_found:'قاعدة البيانات المحددة غير موجودة',unavailable:'تعذّر الاتصال؛ يلزم مراجعة إعدادات الخدمة'};
 const databaseStatus=Object.hasOwn(labels,database.status)?database.status:'unavailable';
 const safeDatabase={status:databaseStatus,...(typeof database.checkedAt==='string'&&Number.isFinite(Date.parse(database.checkedAt))?{checkedAt:new Date(database.checkedAt).toISOString()}:{})};
 const app=Fastify({logger:false});
 app.addHook('onRequest',async(req,reply)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");});
 app.get('/api/setup/database',async()=>({database:safeDatabase,productionReady:false,scope:'connection-only'}));
 app.get('/api/health',async()=>({status:'ok',mode:'setup',productionReady:false}));
 app.get('/',async(req,reply)=>reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مقعد | جارٍ التجهيز</title><style>body{font-family:system-ui,Tahoma;background:#f7f7f5;color:#22272b;margin:0;display:grid;min-height:100vh;place-items:center}main{max-width:560px;padding:32px;margin:20px;background:white;border:1px solid #d5dad6;border-radius:16px}strong{color:#4d7768;font-size:32px}p{line-height:1.9}</style><main><strong>مقعد</strong><h1>جارٍ تجهيز منصة الشركات</h1><p>خدمة الاستضافة تعمل. تسجيل الدخول وبيانات الشركات لم تُفعّل بعد؛ يجري إعداد قاعدة البيانات والدخول الآمن قبل فتح المنصة.</p><p><b>فحص القاعدة:</b> ${labels[databaseStatus]}</p><p>هذا فحص اتصال فقط؛ لا يعني اكتمال تهيئة الجداول أو عزل الشركات.</p></main></html>`));
 app.setNotFoundHandler((req,reply)=>reply.code(503).send({error:'Platform setup is in progress',productionReady:false}));
 return app;
}
