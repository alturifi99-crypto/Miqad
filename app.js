'use strict';
(() => {
  const KEY = 'miqadStateV2', LEGACY = 'miqadGuests', SIZE = 15;
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const fresh = () => ({version:2,nextRowId:4,rows:[1,2,3].map(id=>({id,name:`الصف ${id}`,seatCount:SIZE})),guests:[]});
  let state = fresh(), lastRaw = null, blocked = false, activeSeat = null, editingId = null, pending = null;
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
      ids.add(g.id);
      if(g.rowId===null && g.seat===null)continue;
      if(!rows.has(g.rowId)||!Number.isInteger(g.seat)||g.seat<1||g.seat>data.rows.find(r=>r.id===g.rowId).seatCount||seats.has(key(g.rowId,g.seat)))return false;
      seats.add(key(g.rowId,g.seat));
    }return true;
  }
  function load(){
    try {
      lastRaw=localStorage.getItem(KEY);
      if(lastRaw!==null){const data=JSON.parse(lastRaw);if(Array.isArray(data?.rows))data.rows=data.rows.map(r=>r&&typeof r==='object'?{...r,seatCount:r.seatCount===undefined?SIZE:r.seatCount}:r);if(!valid(data))throw Error();state=data;return;}
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
  function render(){
    $('total-count').textContent=state.guests.length;
    $('vip-count').textContent=state.guests.filter(g=>g.category==='vip').length;
    $('occupied-count').textContent=state.guests.filter(g=>g.rowId!==null).length;
    $('waiting-count').textContent=state.guests.filter(g=>g.rowId===null).length;
    $('capacity-label').textContent=`من أصل ${state.rows.reduce((total,row)=>total+row.seatCount,0)} مقعدًا`;
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
        b.append(node('strong',String(seat)),node('span',g?g.name:'متاح'));b.onclick=()=>openGuest(row.id,seat);chairs.append(b);
      }section.append(chairs);$('seats').append(section);
    }
  }
  function fillGuest(g){$('name').value=g?.name||'';$('title').value=g?.title||'';$('organization').value=g?.organization||'';$('vip').checked=g?.category==='vip';$('notes').value=g?.notes||'';}
  function openGuest(rowId,seat,id){
    const g=id?state.guests.find(g=>g.id===id):state.guests.find(g=>g.rowId===rowId&&g.seat===seat);
    activeSeat=g?{rowId:g.rowId,seat:g.seat}:{rowId,seat};editingId=g?.id??null;
    $('guest-form').reset();$('name').setCustomValidity('');$('guest-error').hidden=true;
    $('guest-dialog-title').textContent=g?'بيانات الضيف · تعديل':'إضافة ضيف إلى الكرسي';
    $('guest-location').textContent=g?label(g):`${state.rows.find(r=>r.id===rowId).name} · مقعد ${seat}`;
    $('release-seat').hidden=!g||g.rowId===null;
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
    const g={...old,id:editingId??uid(),name,title:$('title').value.trim(),organization:$('organization').value.trim(),notes:$('notes').value.trim(),category:$('vip').checked?'vip':'regular',...activeSeat};
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
  function showView(){
    const management=location.hash==='#guest-section';
    $('dashboard').hidden=management;$('guest-section').hidden=!management;
    $('current-view-title').textContent=management?'إدارة الضيوف':'لوحة التحكم';
    document.querySelectorAll('.sidebar nav a').forEach(a=>{
      const selected=a.hash===(management?'#guest-section':'#dashboard');
      if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange',showView);
  showView();
  load();render();
})();
