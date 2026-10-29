// The offline copy (service worker) must never answer /api/* : opening /api/report must not show the app.
import { chromium } from 'playwright';
const base = process.argv[2];
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base); await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await p.reload(); await p.waitForFunction(() => navigator.serviceWorker.controller);
const r = await p.goto(new URL('api/report', base).href);
const html = await p.content();
const isApp = /id="reportBtn"|billing/i.test(html) && /<script[^>]+app\.js/.test(html);
console.log(isApp ? 'FAIL /api/report was answered with the app page (status ' + r.status() + ')' : 'ok: /api/report is not answered by the offline copy (status ' + r.status() + ')');
await b.close(); process.exit(isApp ? 1 : 0);
