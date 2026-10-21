// Run against a local static server: MIQAD_URL=http://127.0.0.1:8010 node tests/browser.cjs
// Requires Playwright (or set PLAYWRIGHT_MODULE to its installed location).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser=await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.MIQAD_URL || 'http://127.0.0.1:8010';
 await page.goto(base);
 await page.evaluate(()=>localStorage.clear());await page.reload();
 assert.equal(await page.locator('.seat').count(),20);
 assert.equal(await page.locator('#total-count').textContent(),'0');
 await page.locator('#name').fill('أحمد');await page.locator('#title').fill('مدير البروتوكول');await page.locator('#category').selectOption('vip');await page.locator('#save-guest').click();
 assert.equal(await page.locator('#vip-count').textContent(),'1');
 await page.locator('.seat').nth(2).click();assert.equal(await page.locator('#occupied-count').textContent(),'1');
 await page.reload();assert.equal(await page.locator('.seat').nth(2).locator('span').textContent(),'أحمد');
 await page.getByRole('button',{name:'تعديل أحمد',exact:true}).click();await page.locator('#name').fill('أحمد المعدّل');await page.locator('#guest-seat').selectOption('5');await page.locator('#save-guest').click();
 assert.equal(await page.locator('.seat').nth(4).locator('span').textContent(),'أحمد المعدّل');
 await page.locator('#name').fill('سارة');await page.locator('#save-guest').click();
 await page.locator('#name').fill('خالد');await page.locator('#save-guest').click();
 const khalid=await page.locator('#assignment-guest option').last().getAttribute('value');
 await page.locator('#assignment-guest').selectOption(khalid);await page.locator('.seat').nth(6).click();
 assert.equal(await page.locator('.seat').nth(6).locator('span').textContent(),'خالد');
 await page.locator('.seat').nth(4).click();await page.locator('#release-seat').click();assert.equal(await page.locator('#occupied-count').textContent(),'1');
 await page.locator('#search').fill('مدير');assert.equal(await page.locator('#guests tr').count(),1);
 await page.locator('#search').fill('غير موجود');assert.equal(await page.locator('#guests tr').count(),0);assert.equal(await page.locator('#empty-state').isVisible(),true);
 await page.locator('#search').fill('');await page.locator('#filter').selectOption('vip');assert.equal(await page.locator('#guests tr').count(),1);
 await page.locator('#filter').selectOption('all');
 await page.getByRole('button',{name:'حذف خالد',exact:true}).click();await page.locator('#cancel-delete').click();assert.equal(await page.locator('#total-count').textContent(),'3');
 await page.getByRole('button',{name:'حذف خالد',exact:true}).click();await page.locator('#confirm-delete').click();assert.equal(await page.locator('#occupied-count').textContent(),'0');
 await page.locator('#name').fill('<img src=x onerror=alert(1)>');await page.locator('#save-guest').click();assert.equal(await page.locator('#guests img').count(),0);
 await page.screenshot({path:'/tmp/miqad-desktop.png',fullPage:true});
 for(const width of [390,320,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/miqad-mobile.png',fullPage:true});
 // Existing release's records remain usable, including numeric IDs.
 await page.evaluate(()=>localStorage.setItem('miqadGuests',JSON.stringify([{id:123,name:'ضيف قديم',seat:2}])));await page.reload();
 assert.equal(await page.locator('.seat').nth(1).locator('span').textContent(),'ضيف قديم');
 await page.getByRole('button',{name:'تعديل ضيف قديم',exact:true}).click();await page.locator('#name').fill('ضيف محفوظ');await page.locator('#save-guest').click();await page.reload();assert.equal(await page.locator('#total-count').textContent(),'1');
 // Failed writes are visible; corrupt data is never silently overwritten.
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('QuotaExceededError')};});await page.locator('#name').fill('مؤقت');await page.locator('#save-guest').click();assert.equal(await page.locator('#storage-warning').isVisible(),true);
 await page.reload();assert.equal(await page.locator('#total-count').textContent(),'1');
 await page.evaluate(()=>localStorage.setItem('miqadGuests','broken-json'));await page.reload();assert.equal(await page.locator('#storage-warning').isVisible(),true);
 await page.locator('#name').fill('ضيف مؤقت');await page.locator('#save-guest').click();assert.equal(await page.evaluate(()=>localStorage.getItem('miqadGuests')),'broken-json');
 assert.deepEqual(errors,[]);
 console.log('PASS: real Chromium CRUD, VIP counts, explicit/automatic seating, release, delete confirmation, search/filter, reload persistence, legacy records, injection safety, storage failures, corrupt-data protection, responsive widths 320/390/768, no page errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
