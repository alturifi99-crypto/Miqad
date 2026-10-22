import {createHash} from 'node:crypto';
export async function siteState(c,id){
 const w=(await c.query('SELECT w.*,e.name AS event_name,h.name AS hall_name FROM workspaces w JOIN events e ON e.id=w.event_id JOIN halls h ON h.id=w.hall_id WHERE w.id=$1',[id])).rows[0];
 if(!w)throw Object.assign(Error('Workspace not found'),{statusCode:404});
 const rows=(await c.query('SELECT * FROM seating_rows WHERE workspace_id=$1 ORDER BY legacy_id',[id])).rows;
 const guests=(await c.query('SELECT * FROM guests WHERE event_id=$1 ORDER BY external_id',[w.event_id])).rows;
 const bookings=(await c.query('SELECT r.guest_id,s.number,s.row_id FROM reservations r JOIN seats s ON s.id=r.seat_id WHERE r.workspace_id=$1',[id])).rows;
 const ds=(await c.query('SELECT * FROM delegations WHERE event_id=$1 ORDER BY external_id',[w.event_id])).rows;
 const members=(await c.query('SELECT * FROM delegation_members WHERE event_id=$1 ORDER BY guest_id',[w.event_id])).rows;
 const elsewhere=(await c.query('SELECT guest_id,workspace_id FROM reservations WHERE event_id=$1 AND workspace_id<>$2',[w.event_id,id])).rows;
 const external=new Map(guests.map(g=>[g.id,g.external_id]));
 const state={version:2,nextRowId:w.next_row_id,rows:rows.map(r=>({id:r.legacy_id,name:r.name,seatCount:r.seat_count})),guests:guests.map(g=>{const b=bookings.find(r=>r.guest_id===g.id);return {id:g.external_id,name:g.name,title:g.title,organization:g.organization,companions:g.companions,notes:g.notes,category:g.category,...(elsewhere.some(b=>b.guest_id===g.id)?{otherWorkspaceId:elsewhere.find(b=>b.guest_id===g.id).workspace_id}:{}),rowId:b?rows.find(r=>r.id===b.row_id).legacy_id:null,seat:b?b.number:null};}),delegations:ds.map(d=>({id:d.external_id,name:d.name,leaderId:external.get(d.leader_id),memberIds:members.filter(m=>m.delegation_id===d.id).map(m=>external.get(m.guest_id)).sort()}))};
 // Includes other halls' bookings so an external move invalidates an old editor too.
 const eventBookings=(await c.query('SELECT id,guest_id,seat_id,version FROM reservations WHERE event_id=$1 ORDER BY id',[w.event_id])).rows;
 const revision=createHash('sha256').update(JSON.stringify({state,eventBookings})).digest('hex');
 return {state,revision,workspace:w};
}
export async function saveSiteState(c,ctx,id,next){
 const current=await siteState(c,id),w=current.workspace;
 const guests=(await c.query('SELECT * FROM guests WHERE event_id=$1',[w.event_id])).rows;
 const kept=new Set(next.guests.map(g=>g.id));
 const outside=(await c.query('SELECT guest_id FROM reservations WHERE event_id=$1 AND workspace_id<>$2',[w.event_id,id])).rows;
 for(const booking of outside){const g=guests.find(g=>g.id===booking.guest_id);const replacement=next.guests.find(n=>n.id===g.external_id);if(!replacement||replacement.seat!==null)throw Object.assign(Error('Guest has a reservation in another hall'),{statusCode:409});}
 // All scoped API requests share the tenant transaction lock. Apply the validated diff atomically.
 const oldDelegations=(await c.query('SELECT id,external_id FROM delegations WHERE event_id=$1',[w.event_id])).rows;
 const previousBookings=(await c.query('SELECT b.*,s.number,r.legacy_id,g.external_id FROM reservations b JOIN seats s ON s.id=b.seat_id JOIN seating_rows r ON r.id=s.row_id JOIN guests g ON g.id=b.guest_id WHERE b.workspace_id=$1',[id])).rows;
 const unchanged=new Set();for(const b of previousBookings){const desired=next.guests.find(g=>g.id===b.external_id);if(desired&&desired.rowId===b.legacy_id&&desired.seat===b.number)unchanged.add(b.guest_id);else await c.query('DELETE FROM reservations WHERE id=$1',[b.id]);}
 await c.query('DELETE FROM delegation_members WHERE event_id=$1',[w.event_id]);
 await c.query('DELETE FROM delegations WHERE event_id=$1',[w.event_id]);
 for(const g of guests)if(!kept.has(g.external_id))await c.query('DELETE FROM guests WHERE id=$1',[g.id]);
 const rowMap=new Map(),seatMap=new Map();
 const oldRows=(await c.query('SELECT * FROM seating_rows WHERE workspace_id=$1',[id])).rows;
 for(const r of oldRows)if(!next.rows.some(n=>n.id===r.legacy_id)){await c.query('DELETE FROM seats WHERE row_id=$1',[r.id]);await c.query('DELETE FROM seating_rows WHERE id=$1',[r.id]);}
 for(const r of next.rows){const saved=(await c.query('INSERT INTO seating_rows(tenant_id,event_id,workspace_id,legacy_id,name,seat_count) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,workspace_id,legacy_id) DO UPDATE SET name=EXCLUDED.name,seat_count=EXCLUDED.seat_count RETURNING id',[ctx.tenantId,w.event_id,id,r.id,r.name,r.seatCount])).rows[0];rowMap.set(r.id,saved.id);await c.query('DELETE FROM seats WHERE row_id=$1 AND number>$2',[saved.id,r.seatCount]);await c.query('INSERT INTO seats(tenant_id,event_id,workspace_id,row_id,number) SELECT $1,$2,$3,$4,n FROM generate_series(1,$5::integer) n ON CONFLICT(tenant_id,workspace_id,row_id,number) DO NOTHING',[ctx.tenantId,w.event_id,id,saved.id,r.seatCount]);for(const s of (await c.query('SELECT id,number FROM seats WHERE row_id=$1',[saved.id])).rows)seatMap.set(`${r.id}:${s.number}`,s.id);}
 const guestMap=new Map();
 for(const g of next.guests){const saved=(await c.query('INSERT INTO guests(tenant_id,event_id,external_id,name,title,organization,companions,notes,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,event_id,external_id) DO UPDATE SET name=EXCLUDED.name,title=EXCLUDED.title,organization=EXCLUDED.organization,companions=EXCLUDED.companions,notes=EXCLUDED.notes,category=EXCLUDED.category RETURNING id',[ctx.tenantId,w.event_id,g.id,g.name,g.title,g.organization,g.companions,g.notes,g.category])).rows[0];guestMap.set(g.id,saved.id);if(g.seat!==null&&!unchanged.has(saved.id)){const old=previousBookings.find(b=>b.guest_id===saved.id);await c.query('INSERT INTO reservations(id,tenant_id,event_id,workspace_id,guest_id,seat_id,version) VALUES(coalesce($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7)',[old?.id||null,ctx.tenantId,w.event_id,id,saved.id,seatMap.get(`${g.rowId}:${g.seat}`),old?old.version+1:1]);}}
 for(const d of next.delegations){const saved=(await c.query('INSERT INTO delegations(id,tenant_id,event_id,external_id,name,leader_id) VALUES(coalesce($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6) RETURNING id',[oldDelegations.find(old=>old.external_id===d.id)?.id||null,ctx.tenantId,w.event_id,d.id,d.name,guestMap.get(d.leaderId)])).rows[0];for(const member of d.memberIds)await c.query('INSERT INTO delegation_members(tenant_id,event_id,delegation_id,guest_id) VALUES($1,$2,$3,$4)',[ctx.tenantId,w.event_id,saved.id,guestMap.get(member)]);}
 await c.query('UPDATE workspaces SET next_row_id=$1 WHERE id=$2',[next.nextRowId,id]);
 await c.query('INSERT INTO audit_logs(tenant_id,user_id,action,details) VALUES($1,$2,$3,$4)',[ctx.tenantId,ctx.user.id,'workspace.site.save',{workspaceId:id,before:current.state,after:next}]);
 return siteState(c,id);
}
