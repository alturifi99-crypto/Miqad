import {createHash,randomUUID} from 'node:crypto';
export async function guestSheet(c,workspaceId){
 const w=(await c.query('SELECT id,event_id FROM workspaces WHERE id=$1',[workspaceId])).rows[0];
 if(!w)throw Object.assign(Error('Workspace not found'),{statusCode:404});
 const guests=(await c.query('SELECT * FROM guests WHERE event_id=$1 ORDER BY id',[w.event_id])).rows;
 return {workspace:w,rows:guests.map(({id,name,title,organization})=>({id,name,title,organization})),revision:createHash('sha256').update(JSON.stringify(guests)).digest('hex')};
}
export async function saveGuestSheet(c,ctx,id,body){
 const current=await guestSheet(c,id);if(current.revision!==body.revision)throw Object.assign(Error('Guest sheet changed; reload before saving'),{statusCode:409});
 const existing=new Set(current.rows.map(g=>g.id)),ids=new Set(body.rows.map(g=>g.id));
 if(ids.size!==body.rows.length||new Set(body.deletedIds).size!==body.deletedIds.length||body.deletedIds.some(id=>ids.has(id)||!existing.has(id)))throw Object.assign(Error('Invalid guest changes'),{statusCode:400});
 if(current.rows.length+body.rows.filter(r=>!existing.has(r.id)).length-body.deletedIds.length>10000)throw Object.assign(Error('Guest limit exceeded'),{statusCode:400});
 if(body.deletedIds.length){
  const linked=await c.query('SELECT 1 FROM reservations WHERE guest_id=ANY($1::uuid[]) UNION ALL SELECT 1 FROM delegation_members WHERE guest_id=ANY($1::uuid[])',[body.deletedIds]);
  if(linked.rowCount)throw Object.assign(Error('الضيف مرتبط بحجز أو وفد. أخلِ مقعده أو عدّل ارتباط الوفد قبل الحذف للحفاظ على البيانات.'),{statusCode:409});
  if(!body.confirmDelete)throw Object.assign(Error('Delete confirmation required'),{statusCode:400});
  await c.query('DELETE FROM guests WHERE event_id=$1 AND id=ANY($2::uuid[])',[current.workspace.event_id,body.deletedIds]);
 }
 for(const row of body.rows){
  if(existing.has(row.id))await c.query('UPDATE guests SET name=$1,title=$2,organization=$3 WHERE event_id=$4 AND id=$5',[row.name,row.title,row.organization,current.workspace.event_id,row.id]);
  else await c.query('INSERT INTO guests(id,tenant_id,event_id,external_id,name,title,organization) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,ctx.tenantId,current.workspace.event_id,randomUUID(),row.name,row.title,row.organization]);
 }
 await c.query('INSERT INTO audit_logs(tenant_id,user_id,action,details) VALUES($1,$2,$3,$4)',[ctx.tenantId,ctx.user.id,'guests.sheet.save',{workspaceId:id,updatedIds:body.rows.map(g=>g.id),deletedIds:body.deletedIds}]);
 return guestSheet(c,id);
}
