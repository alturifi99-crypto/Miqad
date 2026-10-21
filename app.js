'use strict';
(() => {
  const KEY = 'miqadStateV2', LEGACY = 'miqadGuests', SIZE = 15;
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const fresh = () => ({version:2,nextRowId:4,rows:[1,2,3].map(id=>({id,name:`الصف ${id}`})),guests:[]});
  let state = fresh(), lastRaw = null, blocked = false, activeSeat = null, editingId = null, pending = null;
  const node = (tag,text,cls) => {const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const option = (value,text) => {const n=node('option',text);n.value=value;return n;};
  const key = (row,seat) => `${row}:${seat}`;
  const label = g => g.rowId === null ? 'بانتظار التجليس' : `${state.rows.find(r=>r.id===g.rowId)?.name} · مقعد ${g.seat}`;
  function message(id,text){$(id).textContent=text;$(id).hidden=false;}
  function valid(data){
    if(data?.version!==2 || !Array.isArray(data.rows) || !data.rows.length || data.rows.length>50 || !Array.isArray(data.guests))return false;
    const rows=new Set(),ids=new Set(),seats=new Set();
    for(const r of data.rows){if(!Number.isInteger(r.id)||r.id<1||rows.has(r.id)||typeof r.name!=='string'||!r.name.trim())return false;rows.add(r.id);}
    if(!Number.isInteger(data.nextRowId)||data.nextRowId<=Math.max(...rows))return false;
    for(const g of data.guests){
      if(typeof g.id!=='string'||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||!['regular','vip'].includes(g.category)||['title','organization','notes'].some(k=>typeof g[k]!=='string'))return false;
      ids.add(g.id);
      if(g.rowId===null && g.seat===null)continue;
      if(!rows.has(g.rowId)||!Number.isInteger(g.seat)||g.seat<1||g.seat>SIZE||seats.has(key(g.rowId,g.seat)))return false;
      seats.add(key(g.rowId,g.seat));
    }return true;
  }
  function load(){
    try {
      lastRaw=localStorage.getItem(KEY);
      if(lastRaw!==null){const data=JSON.parse(lastRaw);if(!valid(data))throw Error();state=data;return;}
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
  function render(){
    $('total-count').textContent=state.guests.length;
    $('vip-count').textContent=state.guests.filter(g=>g.category==='vip').length;
    $('occupied-count').textContent=state.guests.filter(g=>g.rowId!==null).length;
    $('waiting-count').textContent=state.guests.filter(g=>g.rowId===null).length;
    $('capacity-label').textContent=`من أصل ${state.rows.length*SIZE} مقعدًا`;
    $('seats').replaceChildren();
    for(const row of state.rows){
      const section=node('section','','conference-row');section.append(node('h3',row.name));
      const chairs=node('div','','seats');chairs.setAttribute('aria-label',row.name);
      for(let seat=1;seat<=SIZE;seat++){
        const g=state.guests.find(g=>g.rowId===row.id&&g.seat===seat);
        const b=node('button','',`seat${g?' taken':''}${g?.category==='vip'?' vip-seat':''}`);b.type='button';b.dataset.seatId=key(row.id,seat);
        b.setAttribute('aria-label',`${row.name}، مقعد ${seat}، ${g?g.name:'متاح'}`);
        b.append(node('strong',String(seat)),node('span',g?g.name:'متاح'));b.onclick=()=>openGuest(row.id,seat);chairs.append(b);
      }section.append(chairs);$('seats').append(section);
    }renderList();renderLookup();
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
  function renderList(){
    const q=$('search').value.trim().toLocaleLowerCase('ar'),filter=$('filter').value;
    const shown=state.guests.filter(g=>`${g.name} ${g.title} ${g.organization}`.toLocaleLowerCase('ar').includes(q)&&(filter==='all'||filter==='vip'&&g.category==='vip'||filter==='waiting'&&g.rowId===null||filter==='seated'&&g.rowId!==null));
    $('list-count').textContent=shown.length;$('guests').replaceChildren();
    shown.forEach(g=>{
      const tr=node('tr',''),person=node('td',g.name);if(g.title||g.organization)person.append(node('small',[g.title,g.organization].filter(Boolean).join(' · ')));
      const category=node('td','');category.append(node('span',g.category==='vip'?'كبار الشخصيات':'ضيف',`tag${g.category==='vip'?' vip':''}`));
      const actions=node('td',''),buttons=node('div','','row-actions');
      const edit=node('button','عرض وتعديل');edit.type='button';edit.setAttribute('aria-label',`تعديل ${g.name}`);edit.onclick=()=>openGuest(g.rowId,g.seat,g.id);
      const del=node('button','حذف','delete');del.type='button';del.setAttribute('aria-label',`حذف ${g.name}`);del.onclick=()=>confirm(`هل تريد حذف ${g.name} نهائيًا وإتاحة مقعده؟`,()=>commit({...state,guests:state.guests.filter(item=>item.id!==g.id)},'تم حذف الضيف.'));
      buttons.append(edit,del);actions.append(buttons);tr.append(person,category,node('td',label(g)),node('td',g.rowId===null?'بانتظار التجليس':'تم التجليس'),actions);$('guests').append(tr);
    });$('empty-state').hidden=shown.length>0;$('empty-state').querySelector('h3').textContent=state.guests.length?'لا توجد نتائج مطابقة':'قائمة ضيوفك تبدأ هنا';
  }
  function renderLookup(){
    const q=$('seat-search').value.trim().toLocaleLowerCase('ar').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    $('seat-search-results').replaceChildren();if(!q){$('seat-search-result').textContent='ابحث بالاسم أو الجهة أو رقم المقعد أو معرّفه مثل 2:5.';return;}
    const numeric=/^\d+$/.test(q),address=/^\d+:\d+$/.test(q);
    const add=(name,location,extra)=>{const card=node('article','','seat-result');card.append(node('strong',name),node('span',location));if(extra)card.append(node('small',extra));$('seat-search-results').append(card);};
    if(numeric||address){for(const r of state.rows)for(let s=1;s<=SIZE;s++){if(numeric?String(s)!==String(Number(q)):key(r.id,s)!==q)continue;const g=state.guests.find(g=>g.rowId===r.id&&g.seat===s);add(g?g.name:'كرسي متاح',`${r.name} · مقعد ${s}`,`المعرّف: ${key(r.id,s)}`);}}
    else state.guests.filter(g=>`${g.name} ${g.title} ${g.organization}`.toLocaleLowerCase('ar').includes(q)).forEach(g=>add(g.name,label(g),g.organization));
    const count=$('seat-search-results').children.length;$('seat-search-result').textContent=count?`${count} نتيجة بحث`:'لا توجد نتائج مطابقة.';
  }
  function rowInputs(){
    const count=Number($('row-count').value);if(!Number.isInteger(count)||count<1||count>50)return;
    const current=[...$('row-names').querySelectorAll('input')].map(i=>i.value);$('row-names').replaceChildren();
    for(let i=0;i<count;i++){const label=node('label',`اسم الصف ${i+1}`);const input=node('input','');input.id=`row-name-${i}`;label.htmlFor=input.id;input.value=current[i]??state.rows[i]?.name??`الصف ${i+1}`;input.required=true;input.maxLength=60;$('row-names').append(label,input);}
  }
  $('open-settings').onclick=()=>{$('row-count').value=state.rows.length;$('row-names').replaceChildren();$('settings-error').hidden=true;rowInputs();$('settings-dialog').showModal();};
  $('row-count').oninput=rowInputs;$('cancel-settings').onclick=()=>$('settings-dialog').close();
  $('settings-form').onsubmit=e=>{
    e.preventDefault();const count=Number($('row-count').value);if(!Number.isInteger(count)||count<1||count>50)return;
    const names=[...$('row-names').querySelectorAll('input')].map(i=>i.value.trim());
    if(names.length!==count||names.some(n=>!n)||new Set(names).size!==count){message('settings-error','اكتب اسمًا مختلفًا وغير فارغ لكل صف.');return;}
    let nextId=state.nextRowId;const rows=names.map((name,i)=>({id:state.rows[i]?.id??nextId++,name}));const kept=new Set(rows.map(r=>r.id));
    const moved=state.guests.filter(g=>g.rowId!==null&&!kept.has(g.rowId)).length;
    const next={...state,rows,nextRowId:nextId,guests:state.guests.map(g=>g.rowId!==null&&!kept.has(g.rowId)?{...g,rowId:null,seat:null}:g)};
    const save=()=>{if(commit(next,'تم حفظ إعدادات الصفوف.'))$('settings-dialog').close();else message('settings-error','لم يتم حفظ الإعدادات؛ راجع تنبيه التخزين.');};
    if(count<state.rows.length)confirm(`سيُحذف ${state.rows.length-count} من الصفوف ويُنقل ${moved} من الضيوف إلى الانتظار دون حذف بياناتهم. هل تريد المتابعة؟`,save);else save();
  };
  $('search').oninput=renderList;$('filter').onchange=renderList;$('seat-search').oninput=renderLookup;
  window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)message('storage-warning','تغيرت البيانات في نافذة أخرى. حدّث الصفحة قبل التعديل للحفاظ على أحدث نسخة.');});
  load();render();
})();
