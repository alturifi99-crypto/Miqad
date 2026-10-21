'use strict';
(() => {
  const KEY = 'miqadStateV2', LEGACY = 'miqadGuests', SIZE = 15;
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const fresh = () => ({version:2,nextRowId:4,rows:[1,2,3].map(id=>({id,name:`الصف ${id}`,seatCount:SIZE})),guests:[],delegations:[]});
  let state = fresh(), lastRaw = null, blocked = false, activeSeat = null, editingId = null, pending = null;
  let delegationEditingId=null, memberSequence=0;
  let movingId=null, draggedId=null, suppressClickUntil=0;
  const node = (tag,text,cls) => {const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const option = (value,text) => {const n=node('option',text);n.value=value;return n;};
  const key = (row,seat) => `${row}:${seat}`;
  const label = g => g.rowId === null ? 'بانتظار التجليس' : `${state.rows.find(r=>r.id===g.rowId)?.name} · مقعد ${g.seat}`;
  function message(id,text){$(id).textContent=text;$(id).hidden=false;}
  function valid(data){
    if(data?.version!==2 || !Array.isArray(data.rows) || !data.rows.length || data.rows.length>50 || !Array.isArray(data.guests))return false;
    const rows=new Set(),ids=new Set(),seats=new Set();
    for(const r of data.rows){if(!Number.isInteger(r.id)||r.id<1||rows.has(r.id)||typeof r.name!=='string'||!r.name.trim()||!Number.isInteger(r.seatCount)||r.seatCount<1||r.seatCount>100)return false;rows.add(r.id);}
    if(!Number.isInteger(data.nextRowId)||data.nextRowId<=Math.max(...rows))return false;
    for(const g of data.guests){
      if(typeof g.id!=='string'||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||!['regular','vip'].includes(g.category)||['title','organization','notes'].some(k=>typeof g[k]!=='string'))return false;
      if(g.companions!==undefined&&typeof g.companions!=='string')return false;
      ids.add(g.id);
      if(g.rowId===null && g.seat===null)continue;
      if(!rows.has(g.rowId)||!Number.isInteger(g.seat)||g.seat<1||g.seat>data.rows.find(r=>r.id===g.rowId).seatCount||seats.has(key(g.rowId,g.seat)))return false;
      seats.add(key(g.rowId,g.seat));
    }
    if(!Array.isArray(data.delegations))return false;
    const delegationIds=new Set(),members=new Set();
    for(const d of data.delegations){
      if(typeof d.id!=='string'||delegationIds.has(d.id)||typeof d.name!=='string'||!d.name.trim()||!Array.isArray(d.memberIds)||!d.memberIds.length||!d.memberIds.includes(d.leaderId))return false;
      delegationIds.add(d.id);
      for(const id of d.memberIds){if(!ids.has(id)||members.has(id))return false;members.add(id);}
    }
    return true;
  }
  function load(){
    try {
      lastRaw=localStorage.getItem(KEY);
      if(lastRaw!==null){const data=JSON.parse(lastRaw);if(Array.isArray(data?.rows))data.rows=data.rows.map(r=>r&&typeof r==='object'?{...r,seatCount:r.seatCount===undefined?SIZE:r.seatCount}:r);if(data.delegations===undefined)data.delegations=[];if(!valid(data))throw Error();state=data;return;}
      const raw=localStorage.getItem(LEGACY);
      if(raw===null)return;
      const old=JSON.parse(raw);
      if(!Array.isArray(old)||old.some(g=>!g||typeof g.name!=='string'||!g.name.trim()))throw Error();
      const occupied=new Set(),ids=new Set();
      state.guests=old.map(g=>{
        let id=String(g.id??uid());if(ids.has(id))id=uid();ids.add(id);
        const n=g.seat;let rowId=null,seat=null;
        if(Number.isInteger(n)&&n>0&&n<=state.rows.length*SIZE){rowId=Math.ceil(n/SIZE);seat=(n-1)%SIZE+1;if(occupied.has(key(rowId,seat))){rowId=null;seat=null;}else occupied.add(key(rowId,seat));}
        return {...g,id,name:g.name,title:typeof g.title==='string'?g.title:'',organization:typeof g.organization==='string'?g.organization:'',notes:typeof g.notes==='string'?g.notes:'',category:g.category==='vip'?'vip':'regular',rowId,seat};
      });
      // Keep the original legacy entry intact as a recoverable migration source.
      if(persist(state))message('notice','تم نقل بيانات الضيوف السابقة بأمان. بقيت النسخة القديمة محفوظة، وأي تخصيص متعارض بقي في الانتظار.');
    }catch{blocked=true;message('storage-warning','تعذّرت قراءة البيانات المحفوظة. لم نستبدلها أو نحذفها. احتفظ بنسخة منها وأصلح التخزين قبل إجراء التعديلات.');}
  }
  function persist(next){
    if(blocked){message('storage-warning','الحفظ متوقف لحماية البيانات المحفوظة التي تعذّرت قراءتها.');return false;}
    if(!valid(next)){message('storage-warning','تعذّر حفظ بيانات غير متسقة؛ لم تتغير البيانات.');return false;}
    try{
      if(localStorage.getItem(KEY)!==lastRaw){message('storage-warning','تغيرت البيانات في نافذة أخرى. حدّث الصفحة قبل حفظ تعديلك لتجنب استبدالها.');return false;}
      const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);lastRaw=raw;state=next;$('storage-warning').hidden=true;return true;
    }catch{message('storage-warning','تعذّر الحفظ. لم يُعتمد التغيير؛ تحقق من مساحة التخزين وإعدادات المتصفح ثم أعد المحاولة.');return false;}
  }
  function commit(next,text){if(!persist(next))return false;render();if(text)message('notice',text);return true;}
  function changeChairs(rowId,delta){
    const row=state.rows.find(r=>r.id===rowId);if(!row)return;
    const seatCount=row.seatCount+delta;if(seatCount<1||seatCount>100)return;
    const affected=g=>g.rowId===rowId&&g.seat>seatCount;
    const moved=state.guests.filter(affected).length;
    const save=()=>{
      if(commit({...state,rows:state.rows.map(r=>r.id===rowId?{...r,seatCount}:r),guests:state.guests.map(g=>affected(g)?{...g,rowId:null,seat:null}:g)},`تم تحديث ${row.name} إلى ${seatCount} كرسيًا.`)){
        document.querySelector(`[data-row-id="${rowId}"] [data-action="${delta>0?'increase':'decrease'}"]`)?.focus({preventScroll:true});
      }
    };
    if(moved)confirm(`الكرسي الأخير مشغول. سيُنقل ${moved} من الضيوف إلى الانتظار دون حذف بياناتهم. هل تريد تقليل الكراسي؟`,save);else save();
  }
  function deleteRow(rowId){
    if(state.rows.length<=1)return;
    const row=state.rows.find(r=>r.id===rowId);if(!row)return;
    const moved=state.guests.filter(g=>g.rowId===rowId).length;
    confirm(`هل تريد حذف ${row.name}؟ سيُنقل ${moved} من الضيوف إلى الانتظار دون حذف بياناتهم.`,()=>{
      if(commit({...state,rows:state.rows.filter(r=>r.id!==rowId),guests:state.guests.map(g=>g.rowId===rowId?{...g,rowId:null,seat:null}:g)},'تم حذف الصف مع الاحتفاظ ببيانات الضيوف.'))$('add-row').focus({preventScroll:true});
    });
  }
  $('add-row').onclick=()=>{
    if(state.rows.length>=50)return;
    const id=state.nextRowId;let name=`الصف ${id}`;
    while(state.rows.some(r=>r.name===name))name+=' الجديد';
    if(commit({...state,nextRowId:id+1,rows:[...state.rows,{id,name,seatCount:SIZE}]},'تمت إضافة صف جديد.')){
      document.querySelector(`[data-row-id="${id}"]`)?.scrollIntoView({block:'nearest'});
    }
  };
  function moveGuest(id,rowId,seat){
    const guest=state.guests.find(g=>g.id===id),row=state.rows.find(r=>r.id===rowId);
    if(!guest||!row||!Number.isInteger(seat)||seat<1||seat>row.seatCount)return;
    if(guest.rowId===rowId&&guest.seat===seat)return;
    const other=state.guests.find(g=>g.rowId===rowId&&g.seat===seat);
    const save=()=>{
      const next={...state,guests:state.guests.map(g=>g.id===id?{...g,rowId,seat}:other&&g.id===other.id?{...g,rowId:guest.rowId,seat:guest.seat}:g)};
      if(commit(next,other?`تم تبديل مقعدي ${guest.name} و${other.name}.`:`تم نقل ${guest.name} إلى ${row.name} · مقعد ${seat}.`)){
        movingId=null;$('move-banner').hidden=true;
        document.querySelector(`[data-seat-id="${key(rowId,seat)}"]`)?.focus({preventScroll:true});
      }
    };
    if(other)confirm(`الكرسي مشغول بالضيف ${other.name}. هل تريد تبديل مقعده مع ${guest.name}؟ ستُحفظ بيانات الضيفين كاملة.`,save);else save();
  }
  function clearDrop(){document.querySelectorAll('.drop-target').forEach(b=>b.classList.remove('drop-target'));}
  function highlightGuest(guest){
    document.querySelectorAll('.seat-found').forEach(b=>b.classList.remove('seat-found'));
    const b=document.querySelector(`[data-seat-id="${key(guest.rowId,guest.seat)}"]`);
    if(b){b.classList.add('seat-found');b.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  function renderSearch(reveal=false){
    const q=$('guest-search').value.trim().toLocaleLowerCase('ar');$('guest-search-results').replaceChildren();
    document.querySelectorAll('.seat-found').forEach(b=>b.classList.remove('seat-found'));
    if(!q)return;
    const matches=state.guests.filter(g=>g.name.toLocaleLowerCase('ar').includes(q));
    if(!matches.length){$('guest-search-results').append(node('p','لا يوجد ضيف مطابق لهذا الاسم.','muted'));return;}
    for(const g of matches){
      const card=node('button',`${g.name} — ${label(g)}`,'guest-search-result');card.type='button';
      card.onclick=()=>{if(g.rowId!==null)highlightGuest(g);else message('notice','هذا الضيف بانتظار تخصيص مقعد.');};
      $('guest-search-results').append(card);
      if(g.rowId!==null)document.querySelector(`[data-seat-id="${key(g.rowId,g.seat)}"]`)?.classList.add('seat-found');
    }
    if(reveal){const g=matches.find(g=>g.rowId!==null);if(g)document.querySelector(`[data-seat-id="${key(g.rowId,g.seat)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  $('guest-search').oninput=()=>renderSearch(true);
  $('cancel-move').onclick=()=>{movingId=null;$('move-banner').hidden=true;};
  $('start-move').onclick=()=>{
    movingId=editingId;$('guest-dialog').close();location.hash='#dashboard';
    $('move-description').textContent='اختر كرسيًا لنقل الضيف إليه، أو كرسيًا مشغولًا لتبديل مقعدي الضيفين.';$('move-banner').hidden=false;
  };
  function render(){
    $('total-count').textContent=state.guests.length;
    $('vip-count').textContent=state.guests.filter(g=>g.category==='vip').length;
    $('occupied-count').textContent=state.guests.filter(g=>g.rowId!==null).length;
    $('waiting-count').textContent=state.guests.filter(g=>g.rowId===null).length;
    $('capacity-label').textContent=`من أصل ${state.rows.reduce((total,row)=>total+row.seatCount,0)} مقعدًا`;
    document.querySelectorAll('[data-metric]').forEach(output=>{output.textContent=$(output.dataset.metric).textContent;});
    $('add-row').disabled=state.rows.length>=50;
    $('seats').replaceChildren();
    for(const row of state.rows){
      const section=node('section','','conference-row');section.dataset.rowId=row.id;
      const header=node('div','','row-heading');header.append(node('h3',row.name));
      const controls=node('div','','row-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label',`التحكم في ${row.name}`);
      const decrease=node('button','−','chair-control');decrease.type='button';decrease.dataset.action='decrease';decrease.setAttribute('aria-label',`تقليل كراسي ${row.name}`);decrease.disabled=row.seatCount<=1;decrease.onclick=()=>changeChairs(row.id,-1);
      const count=node('span',`${row.seatCount} كرسيًا`,'row-chair-count');
      const increase=node('button','+','chair-control');increase.type='button';increase.dataset.action='increase';increase.setAttribute('aria-label',`زيادة كراسي ${row.name}`);increase.disabled=row.seatCount>=100;increase.onclick=()=>changeChairs(row.id,1);
      const remove=node('button','حذف الصف','button row-delete');remove.type='button';remove.setAttribute('aria-label',`حذف ${row.name}`);remove.disabled=state.rows.length<=1;remove.title=state.rows.length<=1?'يجب الاحتفاظ بصف واحد على الأقل':'';remove.onclick=()=>deleteRow(row.id);
      controls.append(decrease,count,increase,remove);header.append(controls);section.append(header);
      const chairs=node('div','','seats');chairs.setAttribute('aria-label',row.name);chairs.style.setProperty('--seat-count',row.seatCount);chairs.style.minWidth=row.seatCount>15?`${row.seatCount*48}px`:'0';
      for(let seat=1;seat<=row.seatCount;seat++){
        const g=state.guests.find(g=>g.rowId===row.id&&g.seat===seat);
        const b=node('button','',`seat${g?' taken':''}${g?.category==='vip'?' vip-seat':''}`);b.type='button';b.dataset.seatId=key(row.id,seat);
        b.setAttribute('aria-label',`${row.name}، مقعد ${seat}، ${g?g.name:'متاح'}`);
        b.append(node('strong',String(seat)),node('span',g?g.name:'متاح'));
        b.onclick=()=>{if(Date.now()<suppressClickUntil)return;if(movingId)moveGuest(movingId,row.id,seat);else openGuest(row.id,seat);};
        b.draggable=Boolean(g);
        b.ondragstart=e=>{if(!g)return;draggedId=g.id;e.dataTransfer.setData('text/plain',g.id);e.dataTransfer.effectAllowed='move';b.classList.add('dragging');};
        b.ondragend=()=>{draggedId=null;b.classList.remove('dragging');clearDrop();};
        b.ondragover=e=>{if(!draggedId)return;e.preventDefault();e.dataTransfer.dropEffect='move';b.classList.add('drop-target');};
        b.ondragleave=()=>b.classList.remove('drop-target');
        b.ondrop=e=>{e.preventDefault();clearDrop();if(draggedId)moveGuest(draggedId,row.id,seat);draggedId=null;};
        if(g){
          let start=null,active=false;
          b.onpointerdown=e=>{if(e.pointerType!=='touch')return;start={x:e.clientX,y:e.clientY};active=false;b.setPointerCapture(e.pointerId);};
          b.onpointermove=e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)active=true;if(!active)return;b.classList.add('dragging');clearDrop();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.seat');if(target)target.classList.add('drop-target');};
          b.onpointerup=e=>{if(!start)return;start=null;clearDrop();b.classList.remove('dragging');if(!active)return;suppressClickUntil=Date.now()+400;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.seat');if(target){const [rowId,number]=target.dataset.seatId.split(':').map(Number);moveGuest(g.id,rowId,number);}active=false;};
          b.onpointercancel=()=>{start=null;active=false;b.classList.remove('dragging');clearDrop();};
        }
        chairs.append(b);
      }section.append(chairs);$('seats').append(section);
    }
    renderSearch();renderManagement();
  }
  function fillGuest(g){$('name').value=g?.name||'';$('title').value=g?.title||'';$('organization').value=g?.organization||'';$('vip').checked=g?.category==='vip';$('notes').value=g?.notes||'';$('companions').value=g?.companions||'';}
  function openGuest(rowId,seat,id){
    const g=id?state.guests.find(g=>g.id===id):state.guests.find(g=>g.rowId===rowId&&g.seat===seat);
    activeSeat=g?{rowId:g.rowId,seat:g.seat}:{rowId,seat};editingId=g?.id??null;
    $('guest-form').reset();$('name').setCustomValidity('');$('guest-error').hidden=true;
    $('guest-dialog-title').textContent=g?'بيانات الضيف · تعديل':'إضافة ضيف إلى الكرسي';
    $('guest-location').textContent=g?label(g):`${state.rows.find(r=>r.id===rowId).name} · مقعد ${seat}`;
    $('release-seat').hidden=!g||g.rowId===null;$('start-move').hidden=!g;
    $('waiting-picker').hidden=Boolean(g);
    $('waiting-guest').replaceChildren(option('','ضيف جديد'));
    state.guests.filter(g=>g.rowId===null).forEach(g=>$('waiting-guest').append(option(g.id,g.name)));
    fillGuest(g);$('guest-dialog').showModal();
  }
  function confirm(text,action){pending=action;$('confirm-description').textContent=text;$('confirm-dialog').showModal();}
  $('waiting-guest').onchange=()=>{editingId=$('waiting-guest').value||null;fillGuest(state.guests.find(g=>g.id===editingId));};
  $('name').oninput=()=>$('name').setCustomValidity('');
  $('guest-form').onsubmit=e=>{
    e.preventDefault();const name=$('name').value.trim();if(!name){$('name').setCustomValidity('اكتب اسم الضيف.');$('name').reportValidity();return;}
    if(activeSeat.rowId!==null&&state.guests.some(g=>g.rowId===activeSeat.rowId&&g.seat===activeSeat.seat&&g.id!==editingId)){message('guest-error','الكرسي محجوز لضيف آخر.');return;}
    const old=state.guests.find(g=>g.id===editingId);
    const g={...old,id:editingId??uid(),name,title:$('title').value.trim(),organization:$('organization').value.trim(),notes:$('notes').value.trim(),companions:$('companions').value.trim(),category:$('vip').checked?'vip':'regular',...activeSeat};
    const next={...state,guests:old?state.guests.map(item=>item.id===g.id?g:item):[...state.guests,g]};
    const save=()=>{if(commit(next,'تم حفظ بيانات الضيف.'))$('guest-dialog').close();else message('guest-error','لم يتم حفظ التغيير. راجع تنبيه التخزين وأعد المحاولة.');};
    if(old)confirm('هل تريد حفظ تعديلات بيانات هذا الضيف وتخصيص مقعده؟',save);else save();
  };
  $('close-guest').onclick=()=>$('guest-dialog').close();
  $('release-seat').onclick=()=>confirm('هل تريد إخلاء الكرسي؟ سيبقى الضيف محفوظًا في قائمة الانتظار.',()=>{
    if(commit({...state,guests:state.guests.map(g=>g.id===editingId?{...g,rowId:null,seat:null}:g)},'تم إخلاء الكرسي مع الاحتفاظ ببيانات الضيف.'))$('guest-dialog').close();
  });
  $('confirm-action').onclick=()=>{const action=pending;pending=null;$('confirm-dialog').close();action?.();};
  $('cancel-action').onclick=()=>{$('confirm-dialog').close();pending=null;};
  $('confirm-dialog').addEventListener('cancel',()=>{pending=null;});
  function delegationFor(id){return state.delegations.find(d=>d.memberIds.includes(id));}
  function renderManagement(){
    $('guest-cards').replaceChildren();const q=$('management-search').value.trim().toLocaleLowerCase('ar');
    const guests=state.guests.filter(g=>`${g.name} ${g.title} ${g.organization} ${delegationFor(g.id)?.name||''}`.toLocaleLowerCase('ar').includes(q));
    for(const g of guests){
      const card=node('article','','guest-card');card.dataset.guestId=g.id;const d=delegationFor(g.id);
      card.append(node('h3',g.name),node('span',g.category==='vip'?'كبار الشخصيات':'ضيف','tag'));
      const list=node('dl','');for(const [name,value] of [['المنصب',g.title],['الجهة',g.organization],['المرافقون',g.companions],['الصف ورقم الكرسي',label(g)],['الملاحظات',g.notes],['الوفد',d?`${d.name} · ${d.leaderId===g.id?'رئيس الوفد':'عضو'}`:'']]){list.append(node('dt',name),node('dd',value||'—'));}card.append(list);
      const edit=node('button','عرض وتعديل البيانات','button secondary');edit.type='button';edit.onclick=()=>openGuest(g.rowId,g.seat,g.id);card.append(edit);$('guest-cards').append(card);
    }
    if(!guests.length)$('guest-cards').append(node('p',state.guests.length?'لا توجد نتائج مطابقة.':'لا يوجد ضيوف مسجلون بعد. أضف ضيفًا من الكرسي أو أضف وفدًا.','muted'));
    $('delegations').replaceChildren();
    for(const d of state.delegations){
      const card=node('article','','delegation-card');card.dataset.delegationId=d.id;card.append(node('h3',d.name));
      const list=node('ul','');for(const id of d.memberIds){const g=state.guests.find(g=>g.id===id);list.append(node('li',`${g.name} · ${d.leaderId===id?'رئيس الوفد':'عضو'} · ${label(g)}`));}card.append(list);
      const edit=node('button','تعديل الوفد','button secondary');edit.type='button';edit.onclick=()=>openDelegation(d);card.append(edit);$('delegations').append(card);
    }
    if(!state.delegations.length)$('delegations').append(node('p','لم تتم إضافة وفود بعد.','muted'));
  }
  $('management-search').oninput=renderManagement;
  function memberSeatOptions(){
    const groups=[...$('delegation-members').children],allowed=new Set(groups.map(group=>group.querySelector('.member-existing').value).filter(Boolean));
    for(const group of groups){
      const select=group.querySelector('.member-seat'),selected=select.value;select.replaceChildren(option('','بانتظار تخصيص مقعد'));
      for(const r of state.rows)for(let seat=1;seat<=r.seatCount;seat++){
        const g=state.guests.find(g=>g.rowId===r.id&&g.seat===seat),o=option(key(r.id,seat),`${r.name} · مقعد ${seat}${g&&!allowed.has(g.id)?' · محجوز':''}`);o.disabled=Boolean(g&&!allowed.has(g.id));select.append(o);
      }select.value=selected;
    }
  }
  function addMember(guest,leader=false){
    const group=node('fieldset','','delegation-member');const index=++memberSequence;group.append(node('legend',`عضو الوفد`));
    const existing=node('select','','member-existing');existing.id=`member-existing-${index}`;existing.append(option('','ضيف جديد'));
    for(const g of state.guests){const d=delegationFor(g.id),o=option(g.id,`${g.name}${d&&d.id!==delegationEditingId?' · ضمن وفد آخر':''}`);o.disabled=Boolean(d&&d.id!==delegationEditingId);existing.append(o);}
    function field(labelText,element){const label=node('label',labelText);label.htmlFor=element.id;group.append(label,element);}
    field('ضيف موجود أو جديد',existing);
    const name=node('input','','member-name');name.id=`member-name-${index}`;name.required=true;name.maxLength=120;field('اسم العضو *',name);
    const title=node('input','','member-title');title.id=`member-title-${index}`;title.maxLength=160;field('المنصب',title);
    const organization=node('input','','member-organization');organization.id=`member-organization-${index}`;organization.maxLength=160;field('الجهة',organization);
    const category=node('select','','member-category');category.id=`member-category-${index}`;category.append(option('regular','ضيف'),option('vip','كبار الشخصيات'));field('الفئة',category);
    const seat=node('select','','member-seat');seat.id=`member-seat-${index}`;field('الصف والكرسي',seat);
    const lead=node('input','','member-leader');lead.type='radio';lead.name='delegation-leader';lead.id=`member-leader-${index}`;lead.required=true;lead.checked=leader;const leadLabel=node('label','رئيس الوفد','checkbox-label');leadLabel.htmlFor=lead.id;leadLabel.prepend(lead);group.append(leadLabel);
    const remove=node('button','إزالة العضو من نموذج الوفد','button secondary');remove.type='button';remove.onclick=()=>{if($('delegation-members').children.length<=1)return;const wasLeader=lead.checked;group.remove();if(wasLeader)$('delegation-members').querySelector('.member-leader').checked=true;memberSeatOptions();};group.append(remove);
    const fill=g=>{name.value=g?.name||'';title.value=g?.title||'';organization.value=g?.organization||'';category.value=g?.category||'regular';memberSeatOptions();seat.value=g?.rowId!=null?key(g.rowId,g.seat):'';};
    existing.onchange=()=>fill(state.guests.find(g=>g.id===existing.value));
    $('delegation-members').append(group);existing.value=guest?.id||'';fill(guest);
  }
  function openDelegation(d){
    delegationEditingId=d?.id??null;memberSequence=0;$('delegation-form').reset();$('delegation-name').value=d?.name||'';$('delegation-error').hidden=true;$('delegation-members').replaceChildren();$('delegation-dialog-title').textContent=d?'تعديل الوفد':'إضافة وفد كامل';
    if(d)for(const id of d.memberIds)addMember(state.guests.find(g=>g.id===id),id===d.leaderId);else addMember(null,true);
    memberSeatOptions();$('delegation-dialog').showModal();
  }
  $('add-delegation').onclick=()=>openDelegation();$('add-delegation-member').onclick=()=>addMember();$('cancel-delegation').onclick=()=>$('delegation-dialog').close();
  $('delegation-form').onsubmit=e=>{
    e.preventDefault();const name=$('delegation-name').value.trim();if(!name){message('delegation-error','اكتب اسم الوفد.');return;}
    const groups=[...$('delegation-members').children],chosen=new Set(),reserved=new Set(),members=[];let leaderId=null;
    const editable=new Set(groups.map(group=>group.querySelector('.member-existing').value).filter(Boolean));
    for(const group of groups){
      const id=group.querySelector('.member-existing').value||uid(),old=state.guests.find(g=>g.id===id),other=delegationFor(id),memberName=group.querySelector('.member-name').value.trim();
      if(!memberName||chosen.has(id)||other&&other.id!==delegationEditingId){message('delegation-error','تحقق من أسماء الأعضاء؛ لا يمكن تكرار الضيف أو إسناده إلى وفدين.');return;}chosen.add(id);
      const location=group.querySelector('.member-seat').value;let rowId=null,seat=null;
      if(location){[rowId,seat]=location.split(':').map(Number);const row=state.rows.find(r=>r.id===rowId);if(!row||!Number.isInteger(seat)||seat<1||seat>row.seatCount||reserved.has(location)||state.guests.some(g=>g.rowId===rowId&&g.seat===seat&&!editable.has(g.id))){message('delegation-error','يوجد مقعد محجوز أو مكرر. اختر مقعدًا مختلفًا لكل عضو.');return;}reserved.add(location);}
      members.push({...old,id,name:memberName,title:group.querySelector('.member-title').value.trim(),organization:group.querySelector('.member-organization').value.trim(),category:group.querySelector('.member-category').value,companions:old?.companions||'',notes:old?.notes||'',rowId,seat});
      if(group.querySelector('.member-leader').checked)leaderId=id;
    }
    if(!members.length||!leaderId){message('delegation-error','أضف عضوًا واحدًا على الأقل وحدد رئيس الوفد.');return;}
    const delegation={id:delegationEditingId??uid(),name,leaderId,memberIds:members.map(g=>g.id)},updated=new Map(members.map(g=>[g.id,g]));
    const next={...state,guests:[...state.guests.map(g=>updated.get(g.id)||g),...members.filter(g=>!state.guests.some(old=>old.id===g.id))],delegations:delegationEditingId?state.delegations.map(d=>d.id===delegationEditingId?delegation:d):[...state.delegations,delegation]};
    if(commit(next,'تم حفظ الوفد وأعضائه ومقاعدهم.'))$('delegation-dialog').close();else message('delegation-error','تعذّر حفظ الوفد. لم يُعتمد أي جزء من التغيير؛ راجع تنبيه التخزين.');
  };
  function rowInputs(){
    const count=Number($('row-count').value);if(!Number.isInteger(count)||count<1||count>50)return;
    const current=[...$('row-names').querySelectorAll('.row-setting')].map(group=>({name:group.querySelector('[data-field="name"]').value,seatCount:group.querySelector('[data-field="count"]').value}));
    $('row-names').replaceChildren();
    for(let i=0;i<count;i++){
      const group=node('div','','row-setting');
      const label=node('label',`اسم الصف ${i+1}`),input=node('input','');input.id=`row-name-${i}`;label.htmlFor=input.id;input.dataset.field='name';input.value=current[i]?.name??state.rows[i]?.name??`الصف ${i+1}`;input.required=true;input.maxLength=60;
      const countLabel=node('label','عدد الكراسي'),chairs=node('input','');chairs.id=`row-seats-${i}`;countLabel.htmlFor=chairs.id;chairs.type='number';chairs.min=1;chairs.max=100;chairs.step=1;chairs.required=true;chairs.dataset.field='count';chairs.value=current[i]?.seatCount??state.rows[i]?.seatCount??SIZE;
      group.append(label,input,countLabel,chairs);$('row-names').append(group);
    }
  }
  $('open-settings').onclick=()=>{$('row-count').value=state.rows.length;$('row-names').replaceChildren();$('settings-error').hidden=true;rowInputs();$('settings-dialog').showModal();};
  $('row-count').oninput=rowInputs;$('cancel-settings').onclick=()=>$('settings-dialog').close();
  $('settings-form').onsubmit=e=>{
    e.preventDefault();const count=Number($('row-count').value);if(!Number.isInteger(count)||count<1||count>50)return;
    const names=[...$('row-names').querySelectorAll('[data-field="name"]')].map(i=>i.value.trim());
    if(names.length!==count||names.some(n=>!n)||new Set(names).size!==count){message('settings-error','اكتب اسمًا مختلفًا وغير فارغ لكل صف.');return;}
    const seatCounts=[...$('row-names').querySelectorAll('[data-field="count"]')].map(i=>Number(i.value));
    if(seatCounts.length!==count||seatCounts.some(n=>!Number.isInteger(n)||n<1||n>100)){message('settings-error','عدد الكراسي لكل صف يجب أن يكون عددًا صحيحًا من 1 إلى 100.');return;}
    let nextId=state.nextRowId;const rows=names.map((name,i)=>({id:state.rows[i]?.id??nextId++,name,seatCount:seatCounts[i]}));
    const excluded=g=>g.rowId!==null&&!rows.some(r=>r.id===g.rowId&&g.seat<=r.seatCount);
    const moved=state.guests.filter(excluded).length;
    const next={...state,rows,nextRowId:nextId,guests:state.guests.map(g=>excluded(g)?{...g,rowId:null,seat:null}:g)};
    const save=()=>{if(commit(next,'تم حفظ إعدادات الصفوف.'))$('settings-dialog').close();else message('settings-error','لم يتم حفظ الإعدادات؛ راجع تنبيه التخزين.');};
    if(count<state.rows.length||rows.some(r=>r.seatCount<(state.rows.find(old=>old.id===r.id)?.seatCount??0)))confirm(`سيتم تقليل عدد الصفوف أو الكراسي، ويُنقل ${moved} من الضيوف إلى الانتظار دون حذف بياناتهم. هل تريد المتابعة؟`,save);else save();
  };
  window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)message('storage-warning','تغيرت البيانات في نافذة أخرى. حدّث الصفحة قبل التعديل للحفاظ على أحدث نسخة.');});
  const routes={dashboard:'لوحة التحكم','seating-layout':'مخطط المقاعد','guest-section':'إدارة الضيوف','check-in':'الاستقبال والحضور','events-halls':'الفعاليات والقاعات',reports:'التقارير والإحصائيات',settings:'الإعدادات'};
  function showView(){
    const requested=location.hash.slice(1),route=Object.hasOwn(routes,requested)?requested:'dashboard';
    const management=route==='guest-section'||route==='reports',layout=route==='dashboard'||route==='seating-layout';
    $('dashboard').hidden=!layout;$('guest-section').hidden=!management;$('secondary-view').hidden=layout||management;
    $('management-details').hidden=route==='reports';
    $('dashboard-stats').hidden=route!=='dashboard';
    $('management-title').textContent=route==='reports'?routes.reports:routes['guest-section'];
    $('layout-view-title').textContent=routes[layout?route:'dashboard'];$('current-view-title').textContent=routes[route];
    $('settings-shortcut').hidden=route!=='settings';
    if(!layout&&!management){
      $('secondary-title').textContent=routes[route];$('secondary-description').textContent=route==='settings'?'تخصيص الصفوف والكراسي في القاعة.':'هذا القسم غير متاح حاليًا.';
      $('secondary-message').textContent=route==='settings'?'يمكنك تعديل أسماء الصفوف وعددها وعدد الكراسي لكل صف من الإعدادات.':route==='check-in'?'لم تُضف بعد وظائف تسجيل الوصول والحضور.':'لم تُضف بعد وظائف إنشاء الفعاليات وإدارة القاعات.';
    }
    document.querySelectorAll('.sidebar nav a').forEach(a=>{if(a.hash===`#${route}`)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  }
  $('settings-shortcut').onclick=()=>$('open-settings').click();
  const mobileSidebar=matchMedia('(max-width:700px)');
  function setSidebar(collapsed,save=false){
    document.body.classList.toggle('sidebar-collapsed',collapsed);
    const open=mobileSidebar.matches&&!collapsed;document.body.classList.toggle('mobile-sidebar-open',open);$('sidebar-backdrop').hidden=!open;$('app-main').inert=open;
    const text=collapsed?'توسيع القائمة الجانبية':'طي القائمة الجانبية';
    $('sidebar-toggle').setAttribute('aria-expanded',String(!collapsed));$('sidebar-toggle').setAttribute('aria-label',text);$('sidebar-toggle').title=text;
    if(save)try{localStorage.setItem('miqadSidebarCollapsed',String(collapsed));}catch{/* Navigation remains usable when preference storage is unavailable. */}
  }
  function sidebarPreference(){try{return localStorage.getItem('miqadSidebarCollapsed')==='true';}catch{return false;}}
  let collapsed=mobileSidebar.matches?true:sidebarPreference();
  setSidebar(collapsed);$('sidebar-toggle').onclick=()=>setSidebar(!document.body.classList.contains('sidebar-collapsed'),true);
  $('sidebar-backdrop').onclick=()=>{setSidebar(true,true);$('sidebar-toggle').focus();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('mobile-sidebar-open')&&!document.querySelector('dialog[open]')){setSidebar(true,true);$('sidebar-toggle').focus();}});
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.addEventListener('click',()=>{if(mobileSidebar.matches)setSidebar(true,true);}));
  mobileSidebar.addEventListener('change',()=>setSidebar(mobileSidebar.matches?true:sidebarPreference()));
  window.addEventListener('hashchange',showView);
  showView();
  load();render();
})();
