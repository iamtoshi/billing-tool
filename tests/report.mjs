import { chromium } from 'playwright'; import fs from 'fs';
const OUT = process.argv[3];
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:900}});
await ctx.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('RP', { create: true }); });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.argv[2]); await p.getByRole('button',{name:'Choose folder'}).click(); await p.getByRole('heading',{name:'Aata bills',exact:true}).waitFor();
await p.waitForFunction(() => navigator.serviceWorker.controller);
// 1. online, from a bill page
await p.getByRole('button',{name:'New bill'}).click(); await p.fill('#f-party','Shri Balaji'); await p.fill('#f-i0-bags','10'); await p.selectOption('#f-i0-size','30kg'); await p.fill('#f-i0-rate','2600');
await p.getByRole('button',{name:'Create bill'}).click(); await p.waitForSelector('.paperbox .inv');
await p.getByRole('button',{name:/Report a problem/}).click();
console.log('dialog:', (await p.locator('.dialog').innerText()).replace(/\s+/g,' ').slice(0,260));
await p.getByRole('button',{name:'Send'}).click(); console.log('empty refused:', await p.locator('#rpErr').innerText());
await p.fill('#rpText','PDF of bill 01 is blank when the internet is off'); await p.fill('#rpName','Rakesh');
await p.screenshot({path: OUT+'/report-dialog.png'});
await p.getByRole('button',{name:'Send'}).click(); await p.waitForTimeout(800);
console.log('toast online:', await p.locator('#toast').innerText());
// 2. offline idea from the list
await p.getByRole('button',{name:'← Back to bills'}).click();
await ctx.setOffline(true);
await p.getByRole('button',{name:/Report a problem/}).click();
console.log('name remembered:', await p.inputValue('#rpName'), '| bill box on list page:', await p.locator('#rpBill').count());
await p.locator('[data-rk="idea"]').click(); await p.fill('#rpText','Add vehicle number column in grain sale statement');
await p.getByRole('button',{name:'Send'}).click(); await p.waitForTimeout(500);
console.log('toast offline:', await p.locator('#toast').innerText(), '| button:', await p.locator('#reportBtn').innerText());
await p.reload(); await p.getByRole('heading',{name:'Aata bills',exact:true}).waitFor(); await p.waitForTimeout(4500);
console.log('after offline reload, still waiting:', await p.locator('#reportBtn').innerText());
await ctx.setOffline(false); await p.waitForTimeout(1500);
console.log('back online:', await p.locator('#reportBtn').innerText());
const issues = JSON.parse(fs.readFileSync(process.argv[4]));
console.log('issues filed:', issues.length); issues.forEach(i => console.log('  ', i.identifier, '|', i.title, '|', i.description.split('\n').filter(l => l.startsWith('**')).join(' ; ')));
// 3. the same report sent twice makes one issue
const fresh = await p.evaluate(async () => { const mk = (id,t) => fetch('api/report',{method:'POST',body:JSON.stringify({id, kind:'idea', text:t, name:'X', when:'now', version:'t', context:{}})}).then(r=>r.json()); const a = await mk('fuzzA','fuzzy one'); const b2 = await mk('fuzzB','fuzzy two'); return [a.issue, b2.issue, b2.duplicate]; });
if (fresh[0]===fresh[1] || fresh[2]) { console.log('FAIL two different reports became one issue', fresh); process.exitCode=1; } else console.log('ok: a new report is never mistaken for an old one', fresh);
const dup = await p.evaluate(async () => { const r = {id:'fixed1', kind:'problem', text:'duplicate check text', name:'X', when:'now', version:'t', context:{}}; const a = await (await fetch('api/report',{method:'POST',body:JSON.stringify(r)})).json(); const b2 = await (await fetch('api/report',{method:'POST',body:JSON.stringify(r)})).json(); return [a.issue, b2.issue, b2.duplicate]; });
console.log('sent twice →', JSON.stringify(dup));
console.log('errors', errs); await b.close();
