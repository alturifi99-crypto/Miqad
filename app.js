'use strict';
(() => {
  const KEY = 'miqadGuests';
  const CAPACITY = 20;
  const $ = id => document.getElementById(id);
  let guests = [];
  let editingId = null;
  let seatGuestId = null;
  let deleteId = null;
  let storageBlocked = false;
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  function warn(message) { $('storage-warning').textContent = message; $('storage-warning').hidden = false; }
  function notify(message) { $('notice').textContent = message; $('notice').hidden = false; }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.some(g => !g || typeof g.name !== 'string' || !g.name.trim())) throw new Error('Invalid data');
      const usedSeats = new Set();
      const usedIds = new Set();
      guests = data.map(g => {
        let id = String(g.id ?? uid());
        if (usedIds.has(id)) id = uid();
        usedIds.add(id);
        const seat = Number.isInteger(g.seat) && g.seat >= 1 && g.seat <= CAPACITY && !usedSeats.has(g.seat) ? g.seat : null;
        if (seat !== null) usedSeats.add(seat);
        return {id, name:g.name.trim(), title:typeof g.title === 'string' ? g.title : '', category:g.category === 'vip' ? 'vip' : 'regular', seat};
      });
    } catch {
      storageBlocked = true;
      warn('تعذّرت قراءة البيانات المحفوظة. لم نغيّرها. تحقق من إعدادات التخزين أو احتفظ بنسخة من بيانات miqadGuests قبل إصلاحها؛ التعديلات الحالية مؤقتة.');
    }
  }
  function commit(next) {
    guests = next;
    if (!storageBlocked) {
      try { localStorage.setItem(KEY, JSON.stringify(guests)); $('storage-warning').hidden = true; }
      catch { warn('تعذّر حفظ آخر تغيير. البيانات الحالية مؤقتة وقد تفقدها عند تحديث الصفحة. تحقق من مساحة التخزين وإعدادات المتصفح.'); }
    }
    render();
  }
  function option(value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; }
  function node(tag, text, className) { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; }
  function seatOptions() {
    const selected = $('guest-seat').value;
    $('guest-seat').replaceChildren(option('', 'بدون مقعد · بانتظار التجليس'));
    for (let i=1; i<=CAPACITY; i++) {
      const occupied = guests.find(g => g.seat === i && g.id !== editingId);
      const o = option(String(i), `مقعد ${i}${occupied ? ' · محجوز' : ''}`);
      o.disabled = Boolean(occupied);
      $('guest-seat').append(o);
    }
    if ([...$('guest-seat').options].some(o => o.value === selected && !o.disabled)) $('guest-seat').value = selected;
  }
  function render() {
    $('total-count').textContent = guests.length;
    $('vip-count').textContent = guests.filter(g => g.category === 'vip').length;
    $('occupied-count').textContent = guests.filter(g => g.seat !== null).length;
    $('waiting-count').textContent = guests.filter(g => g.seat === null).length;
    const selection = $('assignment-guest').value;
    $('assignment-guest').replaceChildren(option('', 'تلقائيًا: أول ضيف ينتظر'));
    guests.filter(g => g.seat === null).forEach(g => $('assignment-guest').append(option(g.id, `${g.name}${g.category === 'vip' ? ' · VIP' : ''}`)));
    if (guests.some(g => g.id === selection && g.seat === null)) $('assignment-guest').value = selection;
    $('seats').replaceChildren();
    for (let i=1; i<=CAPACITY; i++) {
      const guest = guests.find(g => g.seat === i);
      const b = document.createElement('button'); b.type = 'button';
      b.className = `seat${guest ? ' taken' : ''}${guest?.category === 'vip' ? ' vip-seat' : ''}`;
      b.setAttribute('aria-label', `مقعد ${i}، ${guest ? guest.name + '، محجوز' : 'متاح'}`);
      b.append(node('strong', String(i)), node('span', guest ? guest.name : 'متاح'));
      b.addEventListener('click', () => assign(i)); $('seats').append(b);
    }
    seatOptions(); renderList();
  }
  function renderList() {
    const query = $('search').value.trim().toLocaleLowerCase('ar');
    const filter = $('filter').value;
    const shown = guests.filter(g => `${g.name} ${g.title}`.toLocaleLowerCase('ar').includes(query) && (filter === 'all' || filter === 'vip' && g.category === 'vip' || filter === 'waiting' && g.seat === null || filter === 'seated' && g.seat !== null));
    $('list-count').textContent = shown.length;
    $('guests').replaceChildren();
    shown.forEach(g => {
      const tr = document.createElement('tr');
      const person = node('td', ''); const wrap = node('div', '', 'guest-name');
      const details = node('div', g.name); if (g.title) details.append(node('small', g.title));
      wrap.append(node('span', g.name.slice(0,1), 'avatar'), details); person.append(wrap);
      const category = node('td', ''); category.append(node('span', g.category === 'vip' ? 'كبار الشخصيات · VIP' : 'ضيف', `tag${g.category === 'vip' ? ' vip' : ''}`));
      const actions = node('td', ''); const buttons = node('div', '', 'row-actions');
      const edit = node('button', 'تعديل'); edit.type='button'; edit.setAttribute('aria-label', `تعديل ${g.name}`); edit.onclick = () => editGuest(g.id);
      const remove = node('button', 'حذف', 'delete'); remove.type='button'; remove.setAttribute('aria-label', `حذف ${g.name}`); remove.onclick = () => requestDelete(g.id);
      buttons.append(edit, remove); actions.append(buttons);
      tr.append(person, category, node('td', g.seat === null ? '—' : `مقعد ${g.seat}`), node('td', g.seat === null ? 'بانتظار التجليس' : 'تم التجليس', g.seat === null ? 'waiting' : 'seated'), actions);
      $('guests').append(tr);
    });
    $('empty-state').hidden = shown.length > 0;
    $('empty-state').querySelector('h3').textContent = guests.length ? 'لا توجد نتائج مطابقة' : 'قائمة ضيوفك تبدأ هنا';
    $('empty-state').querySelector('p').textContent = guests.length ? 'جرّب اسمًا آخر أو غيّر مرشح العرض.' : 'أضف أول ضيف، ثم اختر له مقعدًا في القاعة.';
  }
  function resetForm() {
    editingId = null; $('guest-form').reset(); $('form-title').textContent = 'إضافة ضيف جديد';
    $('save-guest').textContent = 'إضافة الضيف'; $('cancel-edit').hidden = true; seatOptions();
  }
  function editGuest(id) {
    const g = guests.find(g => g.id === id); if (!g) return;
    editingId=id; $('name').value=g.name; $('title').value=g.title; $('category').value=g.category;
    seatOptions(); $('guest-seat').value=g.seat === null ? '' : String(g.seat);
    $('form-title').textContent='تعديل بيانات الضيف'; $('save-guest').textContent='حفظ التعديلات'; $('cancel-edit').hidden=false;
    $('guest-form').scrollIntoView({block:'center'}); $('name').focus();
  }
  function assign(seat) {
    const occupied = guests.find(g => g.seat === seat);
    if (occupied) { seatGuestId=occupied.id; $('seat-dialog-title').textContent=`مقعد ${seat}`; $('seat-description').textContent=`المقعد مخصص للضيف: ${occupied.name}`; $('seat-dialog').showModal(); return; }
    const selected = $('assignment-guest').value;
    const waiting = selected ? guests.find(g => g.id === selected && g.seat === null) : guests.find(g => g.seat === null);
    if (!waiting) { notify('لا يوجد ضيف ينتظر التجليس. أضف ضيفًا جديدًا أولًا.'); return; }
    commit(guests.map(g => g.id === waiting.id ? {...g,seat} : g)); notify(`تم تخصيص المقعد ${seat} للضيف ${waiting.name}.`);
  }
  function requestDelete(id) {
    const g=guests.find(g=>g.id===id); if (!g) return;
    deleteId=id; $('delete-description').textContent=`سيُحذف ${g.name} من القائمة${g.seat !== null ? ' ويُتاح مقعده مجددًا' : ''}. لا يمكن التراجع عن الحذف.`;
    $('delete-dialog').showModal();
  }
  $('guest-form').addEventListener('submit', e => {
    e.preventDefault(); const name=$('name').value.trim();
    if (!name) { $('name').setCustomValidity('اكتب اسم الضيف.'); $('name').reportValidity(); return; }
    const seat=$('guest-seat').value === '' ? null : Number($('guest-seat').value);
    if (seat !== null && (!Number.isInteger(seat) || seat<1 || seat>CAPACITY || guests.some(g=>g.seat===seat && g.id!==editingId))) { notify('المقعد غير متاح، اختر مقعدًا آخر.'); return; }
    const wasEditing=editingId !== null;
    const guest={id:editingId ?? uid(),name,title:$('title').value.trim(),category:$('category').value==='vip'?'vip':'regular',seat};
    commit(wasEditing ? guests.map(g=>g.id===editingId?guest:g) : [...guests,guest]);
    resetForm(); notify(wasEditing ? 'تم حفظ تعديلات الضيف.' : 'تمت إضافة الضيف بنجاح.');
  });
  $('name').addEventListener('input', ()=>$('name').setCustomValidity(''));
  $('cancel-edit').onclick=resetForm;
  $('new-guest-link').onclick=()=>{resetForm(); $('name').focus();};
  $('search').addEventListener('input',renderList); $('filter').addEventListener('change',renderList);
  $('close-seat').onclick=()=>$('seat-dialog').close();
  $('edit-seat-guest').onclick=()=>{$('seat-dialog').close();editGuest(seatGuestId);};
  $('release-seat').onclick=()=>{
    commit(guests.map(g=>g.id===seatGuestId?{...g,seat:null}:g));
    if (editingId===seatGuestId) $('guest-seat').value='';
    $('seat-dialog').close();notify('تم إخلاء المقعد وإعادة الضيف إلى قائمة الانتظار.');
  };
  $('cancel-delete').onclick=()=>$('delete-dialog').close();
  $('confirm-delete').onclick=()=>{commit(guests.filter(g=>g.id!==deleteId));if(editingId===deleteId)resetForm();$('delete-dialog').close();notify('تم حذف الضيف وإتاحة مقعده.');};
  load(); render();
})();
