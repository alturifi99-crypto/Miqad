// Start a static server, then set MIQAD_URL and optional PLAYWRIGHT_MODULE/CHROMIUM_PATH.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.MIQAD_URL||'http://127.0.0.1:8010';await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();
 const chair=(row,seat)=>page.locator(`[data-seat-id="${row}:${seat}"]`);
 const add=async(row,seat,name)=>{await chair(row,seat).click();await page.locator('#name').fill(name);await page.locator('#save-guest').click();};
 const snapshot=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('miqadStateV2')));
 assert.equal(await page.locator('.conference-row').count(),3);
 for(const row of await page.locator('.conference-row').all()){
  assert.equal(await row.locator('.seat').count(),15);
  assert.deepEqual(await row.locator('.seat strong').allTextContents(),Array.from({length:15},(_,i)=>String(i+1)));
  assert.equal(new Set(await row.locator('.seat').evaluateAll(nodes=>nodes.map(n=>n.offsetTop))).size,1);
 }
 assert.equal(new Set(await page.locator('.seat').evaluateAll(ns=>ns.map(n=>n.dataset.seatId))).size,45);
 assert.equal(await page.locator('main #guest-form').count(),0);
 await chair(1,1).click();await page.locator('#name').fill('   ');await page.locator('#save-guest').click();assert.equal(await page.locator('#guest-dialog').isVisible(),true);
 await page.locator('#name').fill('أحمد');await page.locator('#title').fill('رئيس الوفد');await page.locator('#organization').fill('جهة اختبار');await page.locator('#vip').check();await page.locator('#notes').fill('استقبال خاص');await page.locator('#save-guest').click();
 assert.equal(await chair(1,1).locator('span').textContent(),'أحمد');assert.match(await chair(1,1).getAttribute('class'),/vip-seat/);
 await add(2,1,'سارة');assert.equal((await snapshot()).guests.length,2);
 await chair(1,1).click();assert.equal(await page.locator('#organization').inputValue(),'جهة اختبار');assert.equal(await page.locator('#notes').inputValue(),'استقبال خاص');
 await page.locator('#name').fill('أحمد المعدل');await page.locator('#save-guest').click();await page.locator('#cancel-action').click();assert.equal((await snapshot()).guests[0].name,'أحمد');
 await page.locator('#save-guest').click();await page.locator('#confirm-action').click();assert.equal((await snapshot()).guests.length,2);
 await page.reload();assert.equal(await chair(1,1).locator('span').textContent(),'أحمد المعدل');
 await chair(2,1).click();await page.locator('#release-seat').click();await page.locator('#cancel-action').click();assert.equal((await snapshot()).guests[1].rowId,2);
 await page.locator('#release-seat').click();await page.locator('#confirm-action').click();assert.equal((await snapshot()).guests[1].rowId,null);assert.equal(await chair(2,1).locator('span').textContent(),'متاح');
 await chair(3,15).click();const id=(await snapshot()).guests[1].id;await page.locator('#waiting-guest').selectOption(id);await page.locator('#save-guest').click();await page.locator('#confirm-action').click();assert.equal(await chair(3,15).locator('span').textContent(),'سارة');
 await page.locator('.sidebar nav a[href="#guest-section"]').click();await page.locator('#guest-section').waitFor({state:'visible'});
 assert.equal(await page.locator('#dashboard').isVisible(),false);assert.equal(await page.locator('#guest-section .stats').isVisible(),true);
 assert.equal(await page.locator('#guest-section input, #guest-section table, #guest-section .stage, #guest-section .seat').count(),0);
 await page.locator('.sidebar nav a[href="#dashboard"]').click();await page.locator('#dashboard').waitFor({state:'visible'});
 await page.locator('#open-settings').click();await page.locator('#row-name-0').fill('الصف الرئاسي');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();assert.equal(await chair(1,1).locator('span').textContent(),'أحمد المعدل');
 await page.locator('#open-settings').click();await page.locator('#row-count').fill('2');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();await page.locator('#cancel-action').click();assert.equal((await snapshot()).rows.length,3);
 await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();await page.locator('#confirm-action').click();assert.equal((await snapshot()).guests[1].rowId,null);assert.equal((await snapshot()).guests.length,2);assert.equal(await page.locator('.seat').count(),30);
 await page.locator('#open-settings').click();await page.locator('#row-count').fill('3');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();assert.equal((await snapshot()).rows[2].id,4);
 await page.locator('#open-settings').click();await page.locator('#row-name-1').fill('الصف الرئاسي');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();assert.equal(await page.locator('#settings-error').isVisible(),true);await page.locator('#cancel-settings').click();
 await add(4,2,'<img src=x onerror=alert(1)>');assert.equal(await page.locator('#seats img').count(),0);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/miqad-rows-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/miqad-rows-mobile.png',fullPage:true});
 // Independent per-row chair counts, persistence, and safe shrink.
 await page.locator('#open-settings').click();await page.locator('#row-seats-0').fill('20');await page.locator('#row-seats-1').fill('12');
 await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();await page.locator('#confirm-action').click();
 assert.equal(await page.locator('.conference-row').nth(0).locator('.seat').count(),20);assert.equal(await page.locator('.conference-row').nth(1).locator('.seat').count(),12);
 assert.equal(await page.locator('#capacity-label').textContent(),'من أصل 47 مقعدًا');
 await add(1,20,'ضيف المقعد الإضافي');await page.reload();assert.equal(await chair(1,20).locator('span').textContent(),'ضيف المقعد الإضافي');
 await page.locator('#open-settings').click();await page.locator('#row-seats-0').fill('15');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();await page.locator('#cancel-action').click();assert.equal(await chair(1,20).count(),1);
 await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();await page.locator('#confirm-action').click();assert.equal(await chair(1,20).count(),0);assert.equal((await snapshot()).guests.find(g=>g.name==='ضيف المقعد الإضافي').rowId,null);
 await page.locator('#open-settings').click();await page.locator('#row-seats-0').fill('0');await page.getByRole('button',{name:'حفظ الإعدادات',exact:true}).click();assert.equal(await page.locator('#settings-dialog').isVisible(),true);assert.equal((await snapshot()).rows[0].seatCount,15);await page.locator('#cancel-settings').click();
 // Existing version-2 records without per-row counts retain their original 15 chairs.
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('miqadStateV2'));d.rows.forEach(r=>delete r.seatCount);localStorage.setItem('miqadStateV2',JSON.stringify(d));});await page.reload();assert.equal(await page.locator('.seat').count(),45);assert.equal(await chair(1,1).locator('span').textContent(),'أحمد المعدل');
 // Legacy migration keeps the exact old entry and preserves all guest records.
 const legacy=JSON.stringify([{id:1,name:'قديم',seat:20,title:'الجهة القديمة'},{id:2,name:'متعارض',seat:20},{id:3,name:'منتظر',seat:null}]);
 await page.evaluate(raw=>{localStorage.removeItem('miqadStateV2');localStorage.setItem('miqadGuests',raw);},legacy);await page.reload();
 assert.equal(await page.evaluate(()=>localStorage.getItem('miqadGuests')),legacy);assert.equal((await snapshot()).guests.length,3);assert.equal(await chair(2,5).locator('span').textContent(),'قديم');assert.equal((await snapshot()).guests.filter(g=>g.rowId===null).length,2);await page.reload();assert.equal((await snapshot()).guests.length,3);
 // Failed persistence never presents unsaved changes as accepted.
 await chair(1,1).click();await page.locator('#name').fill('لم يحفظ');await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('QuotaExceededError');};});await page.locator('#save-guest').click();assert.equal(await page.locator('#guest-error').isVisible(),true);assert.equal(await chair(1,1).locator('span').textContent(),'متاح');await page.reload();
 // A second tab's update cannot be overwritten by an obsolete editor.
 await chair(1,1).click();await page.locator('#name').fill('نافذة قديمة');await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('miqadStateV2'));d.rows[0].name='تغيير خارجي';localStorage.setItem('miqadStateV2',JSON.stringify(d));});await page.locator('#save-guest').click();assert.equal(await page.locator('#guest-error').isVisible(),true);assert.equal((await snapshot()).rows[0].name,'تغيير خارجي');await page.reload();
 // Invalid new-format data is protected, never overwritten with fresh state.
 await page.evaluate(()=>localStorage.setItem('miqadStateV2','broken'));await page.reload();await chair(1,1).click();await page.locator('#name').fill('محاولة');await page.locator('#save-guest').click();assert.equal(await page.evaluate(()=>localStorage.getItem('miqadStateV2')),'broken');
 assert.deepEqual(errors,[]);
 console.log('PASS: configurable per-row counts, safe chair reduction and old-format defaults, unique stable IDs, chair modal CRUD, all guest fields, edit/release confirmations, waiting-guest reassignment, settings grow/shrink/cancel/rename, no duplicate occupancy, persistence, legacy migration and original backup, storage errors and stale-write protection, injection safety, responsive widths 320/390/768/1440, no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
