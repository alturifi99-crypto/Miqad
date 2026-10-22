import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';import {createApp} from '../src/app.mjs';
let app,admin,db,a,b,staff,importA,importB,wa,wb,ga,gb,viewerInvite;const run=randomUUID();const password='Local-test-password-2026!';const origin=process.env.PUBLIC_ORIGIN;
const source={version:2,nextRowId:3,rows:[{id:1,name:'الصف الرئاسي',seatCount:3},{id:2,name:'الصف الثاني',seatCount:2}],guests:[{id:'guest-1',name:'ضيف أول',title:'رئيس',organization:'جهة',companions:'مرافق',notes:'حجز محفوظ',category:'vip',rowId:1,seat:1},{id:'guest-2',name:'ضيف ثان',title:'عضو',organization:'جهة',notes:'',category:'regular',rowId:1,seat:2},{id:'guest-3',name:'ضيف ينتظر',title:'',organization:'',notes:'',category:'regular',rowId:null,seat:null}],delegations:[{id:'delegation-1',name:'وفد محفوظ',leaderId:'guest-1',memberIds:['guest-1','guest-2']}]};
const path=(actor,suffix)=>`/api/tenants/${actor.tenant.id}${suffix}`;
async function call(method,url,payload,actor,headers={}){return app.inject({method,url,payload,headers:{origin,...(actor?{cookie:actor.cookie}:{}),...headers}});}
async function register(label){const r=await call('POST','/api/auth/register',{email:`${label}-${run}@example.test`,password,companyName:label==='a'?'شركة الطريفي':`شركة اختبار ${label}`});assert.equal(r.statusCode,201,r.body);return {...r.json(),cookie:r.headers['set-cookie'].split(';')[0],setCookie:r.headers['set-cookie']};}
async function scoped(actor,fn,tenant=actor.tenant.id){const c=await db.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",[actor.user.id,tenant]);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const importBody={snapshot:source,eventName:'فعالية مستوردة',hallName:'قاعة مستوردة',dryRun:false};
before(async()=>{app=await createApp();await app.ready();admin=new pg.Pool({connectionString:process.env.DATABASE_ADMIN_URL});db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});a=await register('a');b=await register('b');staff=await register('staff');
const ra=await call('POST',path(a,'/imports/legacy'),importBody,a);assert.equal(ra.statusCode,200,ra.body);importA=ra.json();const rb=await call('POST',path(b,'/imports/legacy'),importBody,b);assert.equal(rb.statusCode,200,rb.body);importB=rb.json();wa=(await call('GET',path(a,`/workspaces/${importA.workspaceId}`),null,a)).json();wb=(await call('GET',path(b,`/workspaces/${importB.workspaceId}`),null,b)).json();ga=(await call('GET',path(a,'/guests'),null,a)).json();gb=(await call('GET',path(b,'/guests'),null,b)).json();});
after(async()=>{await Promise.all([app?.close(),admin?.end(),db?.end()]);});

test('sessions require authentication, protect cookies and reject forged origins and registration roles',async()=>{
assert.match(a.setCookie,/HttpOnly/i);assert.match(a.setCookie,/SameSite=Strict/i);assert.equal((await call('GET',path(a,'/guests'))).statusCode,401);
assert.equal((await call('POST','/api/auth/login',{email:a.user.email,password},null,{origin:'https://untrusted.example'})).statusCode,403);
assert.equal((await call('POST','/api/auth/register',{email:`evil-${run}@example.test`,password,companyName:'x',platformAdmin:true})).statusCode,400);
assert.equal((await call('POST','/api/auth/login',{email:a.user.email,password:'Wrong-password-2026!'})).statusCode,401);
assert.equal((await call('GET','/api/platform/companies',null,a)).statusCode,403);
});
test('API isolates companies and refuses IDOR, overposting and forged tenant headers',async()=>{
assert.equal((await call('GET',path(b,'/guests'),null,a)).statusCode,403);
assert.equal((await call('GET',path(a,`/guests/${gb[0].id}`),null,a)).statusCode,404);
assert.equal((await call('GET',path(a,`/workspaces/${wb.workspace.id}`),null,a)).statusCode,404);
assert.equal((await call('POST',path(a,'/events'),{name:'x',tenant_id:b.tenant.id},a)).statusCode,400);
const result=await call('GET',path(a,'/guests'),null,a,{'x-tenant-id':b.tenant.id});assert.equal(result.statusCode,200);assert.ok(result.json().every(g=>g.tenant_id===a.tenant.id));
});
test('database runtime roles cannot bypass RLS and every operational table forces policies',async()=>{
const attrs=await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN('miqad_app','miqad_auth','miqad_platform')");assert.equal(attrs.rowCount,3);assert.ok(attrs.rows.every(r=>!r.rolsuper&&!r.rolbypassrls));
const tables=['events','halls','workspaces','seating_rows','seats','guests','reservations','delegations','delegation_members','audit_logs','import_batches','tenant_subscriptions'];
const flags=await admin.query('SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname=ANY($1::text[])',[tables]);assert.equal(flags.rowCount,tables.length);assert.ok(flags.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.owner!=='miqad_app'));
for(const table of tables){const rows=await scoped(a,c=>c.query(`SELECT * FROM ${table}`));assert.ok(rows.rows.every(r=>r.tenant_id===a.tenant.id),table);}
});
test('SQL rejects cross-company inserts and composite foreign keys reject foreign events',async()=>{
assert.equal((await scoped(a,c=>c.query('SELECT * FROM guests'),b.tenant.id)).rowCount,0);
await assert.rejects(scoped(a,c=>c.query('INSERT INTO events(tenant_id,name) VALUES($1,$2)',[b.tenant.id,'forbidden'])),e=>e.code==='42501');
assert.equal((await scoped(a,c=>c.query('UPDATE guests SET name=$1 WHERE id=$2',['forbidden',gb[0].id]))).rowCount,0);
assert.equal((await scoped(a,c=>c.query('DELETE FROM guests WHERE id=$1',[gb[0].id]))).rowCount,0);
await assert.rejects(scoped(a,c=>c.query('INSERT INTO guests(tenant_id,event_id,external_id,name) VALUES($1,$2,$3,$4)',[a.tenant.id,wb.workspace.event_id,randomUUID(),'forbidden'])),e=>e.code==='23503');
});
test('transaction-local scope does not leak through a reused pooled connection',async()=>{
assert.equal((await scoped(a,c=>c.query('SELECT * FROM guests'))).rowCount,3);
assert.equal((await db.query('SELECT * FROM guests')).rowCount,0);
assert.equal((await scoped(b,c=>c.query('SELECT * FROM guests'))).rowCount,3);
assert.equal((await db.query('SELECT * FROM guests')).rowCount,0);
});
test('invitations are email-bound, single-use, and viewer permissions apply in API and SQL',async()=>{
const invite=await call('POST',path(a,'/invitations'),{email:staff.user.email,role:'viewer'},a);assert.equal(invite.statusCode,200,invite.body);viewerInvite=invite.json().invitationToken;
assert.equal((await call('POST','/api/invitations/accept',{token:viewerInvite},b)).statusCode,404);
assert.equal((await call('POST','/api/invitations/accept',{token:viewerInvite},staff)).statusCode,200);
assert.equal((await call('POST','/api/invitations/accept',{token:viewerInvite},staff)).statusCode,404);
assert.equal((await call('GET',path(a,'/guests'),null,staff)).statusCode,200);
assert.equal((await call('POST',path(a,'/events'),{name:'viewer write'},staff)).statusCode,403);
await assert.rejects(scoped(staff,c=>c.query('INSERT INTO events(tenant_id,name) VALUES($1,$2)',[a.tenant.id,'viewer write']),a.tenant.id),e=>e.code==='42501');
assert.equal((await scoped(staff,c=>c.query('SELECT * FROM audit_logs'),a.tenant.id)).rowCount,0);
});
test('role changes and suspension apply immediately; last owner is protected',async()=>{
assert.equal((await call('PATCH',path(a,`/members/${a.user.id}`),{role:'viewer',active:true},a)).statusCode,409);
assert.equal((await call('PATCH',path(a,`/members/${staff.user.id}`),{role:'organizer',active:true},a)).statusCode,200);
assert.equal((await call('POST',path(a,'/events'),{name:'organizer event'},staff)).statusCode,200);
assert.equal((await call('PATCH',path(a,`/members/${staff.user.id}`),{role:'organizer',active:false},a)).statusCode,200);
assert.equal((await call('GET',path(a,'/dashboard'),null,staff)).statusCode,403);
});
test('reservation movement and explicit swaps preserve guests and reject stale or foreign targets',async()=>{
const first=wa.reservations.find(r=>r.guest_id===ga.find(g=>g.external_id==='guest-1').id),second=wa.reservations.find(r=>r.id!==first.id),seat3=wa.seats.find(s=>s.row_id===wa.rows.find(r=>r.legacy_id===1).id&&s.number===3);
assert.equal((await call('POST',path(a,`/reservations/${first.id}/move`),{seatId:wb.seats[0].id,expectedVersion:1},a)).statusCode,404);
let r=await call('POST',path(a,`/reservations/${first.id}/move`),{seatId:seat3.id,expectedVersion:1},a);assert.equal(r.statusCode,200,r.body);
assert.equal((await call('POST',path(a,`/reservations/${first.id}/move`),{seatId:second.seat_id,expectedVersion:1,swap:true},a)).statusCode,409);
assert.equal((await call('POST',path(a,`/reservations/${first.id}/move`),{seatId:second.seat_id,expectedVersion:2},a)).statusCode,409);
r=await call('POST',path(a,`/reservations/${first.id}/move`),{seatId:second.seat_id,expectedVersion:2,swap:true},a);assert.equal(r.statusCode,200,r.body);
const current=(await call('GET',path(a,`/workspaces/${wa.workspace.id}`),null,a)).json().reservations;assert.equal(current.find(r=>r.id===second.id).seat_id,seat3.id);assert.equal(current.find(r=>r.id===first.id).seat_id,second.seat_id);
assert.deepEqual((await call('GET',path(a,'/guests'),null,a)).json(),ga);
});
test('simultaneous bookings produce exactly one winner and one conflict',async()=>{
const extra=(await call('POST',path(a,'/guests'),{eventId:wa.workspace.event_id,name:'ضيف إضافي'},a)).json(),waiting=ga.find(g=>g.external_id==='guest-3'),seat=wa.seats.find(s=>s.row_id===wa.rows.find(r=>r.legacy_id===2).id&&s.number===1);
const results=await Promise.all([waiting,extra].map(g=>call('POST',path(a,'/reservations'),{guestId:g.id,seatId:seat.id},a)));assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});
test('imports validate without writes, are idempotent, preserve source, and roll back invalid reservations',async()=>{
const eventsBefore=(await call('GET',path(a,'/events'),null,a)).json().length;
let r=await call('POST',path(a,'/imports/legacy'),{...importBody,dryRun:true},a);assert.equal(r.statusCode,200);assert.deepEqual(r.json().counts,{rows:2,seats:5,guests:3,reservations:2,delegations:1});
r=await call('POST',path(a,'/imports/legacy'),importBody,a);assert.equal(r.statusCode,200);assert.equal(r.json().reused,true);assert.equal(r.json().workspaceId,wa.workspace.id);
const bad=structuredClone(source);bad.guests[1].seat=1;assert.equal((await call('POST',path(a,'/imports/legacy'),{...importBody,snapshot:bad},a)).statusCode,400);
assert.equal((await call('GET',path(a,'/events'),null,a)).json().length,eventsBefore);
const original=await scoped(a,c=>c.query('SELECT original_snapshot FROM import_batches WHERE workspace_id=$1',[wa.workspace.id]));assert.deepEqual(original.rows[0].original_snapshot,source);
assert.equal(ga.find(g=>g.external_id==='guest-1').notes,'حجز محفوظ');assert.equal(ga.find(g=>g.external_id==='guest-1').companions,'مرافق');
});
test('database requires the delegation leader to remain a member',async()=>{
const d=(await scoped(a,c=>c.query('SELECT * FROM delegations'))).rows[0];await assert.rejects(scoped(a,c=>c.query('DELETE FROM delegation_members WHERE delegation_id=$1 AND guest_id=$2',[d.id,d.leader_id])),e=>e.code==='23514');
});
test('platform privilege is separate and suspension is audited without guest-table access',async()=>{
await admin.query('INSERT INTO platform_admins(user_id) VALUES($1)',[a.user.id]);assert.equal((await call('GET','/api/platform/companies',null,a)).statusCode,200);assert.equal((await call('GET','/api/platform/companies',null,b)).statusCode,403);
assert.equal((await call('PATCH',`/api/platform/companies/${b.tenant.id}`,{status:'suspended'},a)).statusCode,200);assert.equal((await call('GET',path(b,'/dashboard'),null,b)).statusCode,403);assert.equal((await call('GET',path(a,'/dashboard'),null,a)).statusCode,200);
const platform=new pg.Pool({connectionString:process.env.PLATFORM_DATABASE_URL});try{await assert.rejects(platform.query('SELECT * FROM guests'),e=>e.code==='42501');}finally{await platform.end();}
assert.ok((await admin.query('SELECT * FROM platform_audit_logs WHERE tenant_id=$1',[b.tenant.id])).rowCount>0);assert.equal((await call('PATCH',`/api/platform/companies/${b.tenant.id}`,{status:'active'},a)).statusCode,200);
});
test('logout revokes the server session and production boot is explicitly gated',async()=>{
const login=await call('POST','/api/auth/login',{email:staff.user.email,password});assert.equal(login.statusCode,200);const actor={cookie:login.headers['set-cookie'].split(';')[0]};assert.equal((await call('POST','/api/auth/logout',{},actor)).statusCode,200);assert.equal((await call('GET','/api/me',null,actor)).statusCode,401);
await assert.rejects(createApp({...process.env,NODE_ENV:'production'}),/Production rollout is blocked/);
});

test('legacy miqadGuests imports keep numeric identities, waiting guests and original seat locations',async()=>{
const legacy=[{id:71,name:'ضيف قديم',seat:16,category:'vip',notes:'نسخة أصلية',customField:'محفوظ'},{id:72,name:'ضيف انتظار قديم',seat:null}];
const r=await call('POST',path(a,'/imports/legacy'),{snapshot:legacy,eventName:'نقل الصيغة القديمة',hallName:'قاعة قديمة',dryRun:false},a);assert.equal(r.statusCode,200,r.body);const w=(await call('GET',path(a,`/workspaces/${r.json().workspaceId}`),null,a)).json();assert.equal(w.rows.length,3);assert.equal(w.seats.length,45);assert.equal(w.reservations.length,1);
const guest=(await call('GET',path(a,`/guests/${w.reservations[0].guest_id}`),null,a)).json();assert.equal(guest.external_id,'71');assert.equal(guest.source_record.customField,'محفوظ');const seat=w.seats.find(s=>s.id===w.reservations[0].seat_id),row=w.rows.find(row=>row.id===seat.row_id);assert.equal(row.legacy_id,2);assert.equal(seat.number,1);
const original=await scoped(a,c=>c.query('SELECT original_snapshot FROM import_batches WHERE workspace_id=$1',[w.workspace.id]));assert.deepEqual(original.rows[0].original_snapshot,legacy);
});

test('original site state is tenant-scoped, atomic and rejects stale writers and viewers',async()=>{
const url=path(a,`/workspaces/${wa.workspace.id}/site`);let r=await call('GET',url,null,a);assert.equal(r.statusCode,200,r.body);const original=r.json(),next=structuredClone(original.state);next.rows[0].seatCount+=1;next.rows[0].name='صف الواجهة';next.guests.push({id:randomUUID(),name:'ضيف من الموقع',title:'مدير',organization:'جهة',companions:'مرافق',notes:'محفوظ',category:'vip',rowId:null,seat:null});
assert.equal((await call('GET',path(b,`/workspaces/${wa.workspace.id}/site`),null,b)).statusCode,404);
r=await call('PUT',url,{revision:original.revision,state:next},a);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().state.rows[0].name,'صف الواجهة');assert.ok(r.json().state.guests.some(g=>g.name==='ضيف من الموقع'));assert.equal(r.json().state.delegations.length,original.state.delegations.length);
assert.equal((await call('PUT',url,{revision:original.revision,state:original.state},a)).statusCode,409);
const current=r.json();await call('PATCH',path(a,`/members/${staff.user.id}`),{role:'viewer',active:true},a);assert.equal((await call('PUT',url,{revision:current.revision,state:next},staff)).statusCode,403);
const invalid=structuredClone(next);const seated=invalid.guests.filter(g=>g.seat!==null);seated[1].rowId=seated[0].rowId;seated[1].seat=seated[0].seat;assert.equal((await call('PUT',url,{revision:current.revision,state:invalid},a)).statusCode,400);
assert.deepEqual((await call('GET',url,null,a)).json().state,current.state);
});

test('site saves preserve booking identities and cannot steal a guest from another hall',async()=>{
const hall=(await call('POST',path(a,'/halls'),{name:'قاعة ثانية'},a)).json();const w2=(await call('POST',path(a,'/workspaces'),{eventId:wa.workspace.event_id,hallId:hall.id,name:'مخطط القاعة الثانية',rows:[{name:'صف ثان',seatCount:15}]},a)).json();const target=(await call('GET',path(a,`/workspaces/${w2.id}`),null,a)).json();const before=(await call('GET',path(a,`/workspaces/${wa.workspace.id}`),null,a)).json();const booking=before.reservations[0];assert.equal((await call('POST',path(a,`/reservations/${booking.id}/move`),{seatId:target.seats[0].id,expectedVersion:booking.version},a)).statusCode,200);
const url=path(a,`/workspaces/${wa.workspace.id}/site`),current=(await call('GET',url,null,a)).json();const external=ga.find(g=>g.id===booking.guest_id).external_id;assert.equal(current.state.guests.find(g=>g.id===external).otherWorkspaceId,w2.id);
const bad=structuredClone(current.state);const guest=bad.guests.find(g=>g.id===external);guest.rowId=bad.rows[0].id;guest.seat=bad.rows[0].seatCount;assert.equal((await call('PUT',url,{revision:current.revision,state:bad},a)).statusCode,409);
assert.equal((await call('PUT',url,{revision:current.revision,state:current.state},a)).statusCode,200);
const after=(await call('GET',path(a,`/workspaces/${wa.workspace.id}`),null,a)).json();assert.deepEqual(after.reservations,before.reservations.filter(r=>r.id!==booking.id));const reserved=(await call('GET',path(a,`/workspaces/${w2.id}`),null,a)).json();assert.equal(reserved.reservations[0].id,booking.id);assert.equal(reserved.reservations[0].guest_id,booking.guest_id);
});
