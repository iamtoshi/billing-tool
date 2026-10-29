// Report a problem: the person always learns why a report is waiting, and a fixed setup lets it through.
import { chromium } from 'playwright'; import fs from 'fs'; import path from 'path';
const URL_ = process.argv[2], OUT = process.argv[3], ENV = path.join(OUT, 'env.json');
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok ? '' : '  [' + d + ']')); };
const setEnv = (e) => fs.writeFileSync(ENV, JSON.stringify(e));
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('RS', { create: true }); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL_); await p.getByRole('button', { name: 'Choose folder' }).click(); await p.getByRole('heading', { name: 'Aata bills', exact: true }).waitFor();
const send = async (text) => { await p.locator('#reportBtn').click(); await p.fill('#rpText', text); await p.getByRole('button', { name: 'Send' }).click(); await p.waitForTimeout(700); return p.locator('#toast').innerText(); };

// 1. key missing on the server
setEnv({ LINEAR_TEAM_ID: '081e99c0-3483-4b35-a7bd-200b350e92ec' });
let t = await send('Report while the key is missing');
check('online + key missing → says setup problem, not internet', t.includes('missing a setting') && t.includes('not your internet'), t);
const badge = await p.locator('#reportBtn').innerText();
check('button says service problem', badge.includes('waiting: service problem'), badge);
await p.locator('#reportBtn').click();
const st = await p.locator('#rpStatus').innerText();
check('form shows the reason and Try again now', st.includes('waiting to be sent') && st.includes('LINEAR_API_KEY'), st);
await p.screenshot({ path: OUT + '/rs-problem.png' });

// 2. key added but the team id pasted with quotes and a space → still works (tidied)
setEnv({ LINEAR_API_KEY: ' k ', LINEAR_TEAM_ID: '"081e99c0-3483-4b35-a7bd-200b350e92ec "' });
await p.getByRole('button', { name: 'Try again now' }).click(); await p.waitForTimeout(700);
t = await p.locator('#toast').innerText();
check('Try again now sends once fixed', t.startsWith('Sent') && /DRB-\d/.test(t), t);
check('waiting count cleared', !(await p.locator('#reportBtn').innerText()).includes('waiting'), await p.locator('#reportBtn').innerText());

// 3. a team id that is plain wrong → falls back to the built-in team
setEnv({ LINEAR_API_KEY: 'k', LINEAR_TEAM_ID: 'billing-tool' });
t = await send('Report with a wrong team setting');
check('wrong team setting → built-in team used, report sent', t.startsWith('Sent'), t);

// 4. no internet → says internet, not a setup problem
await ctx.setOffline(true);
t = await send('Report with no internet');
check('offline → says no internet', t.startsWith('No internet'), t);
check('button says waiting for internet', (await p.locator('#reportBtn').innerText()).includes('waiting for internet'), await p.locator('#reportBtn').innerText());
await ctx.setOffline(false); await p.waitForTimeout(1500);
t = await p.locator('#toast').innerText();
check('back online → sends by itself and says so', t.startsWith('Your waiting report was sent'), t);

// 5. Linear refusing
setEnv({ LINEAR_API_KEY: 'k', LINEAR_TEAM_ID: '00000000-0000-0000-0000-00000000000Z' });
const issues = JSON.parse(fs.readFileSync(path.join(OUT, 'issues.json')));
check('issues filed so far', issues.length === 3, issues.length);
console.log(`RESULT: ${pass} passed, ${fail} failed`, errs.length ? errs : '');
fs.rmSync(ENV, { force: true }); await b.close();
