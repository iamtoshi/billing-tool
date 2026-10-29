// BIL-3: Halloween look is on in October 2026 and off from 1 November; the bill paper never changes.
import { chromium } from 'playwright';
const base = process.argv[2], out = process.argv[3];
const b = await chromium.launch(); let bad = 0;
const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok ? '' : '  [' + d + ']')); if (!ok) bad++; };
async function look(date, shot) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } }); const p = await ctx.newPage();
  await p.clock.install({ time: new Date(date) }); await p.goto(base); await p.waitForSelector('.bar');
  const r = await p.evaluate(() => { const cs = getComputedStyle(document.body); const paper = document.createElement('div'); paper.className = 'inv'; document.body.appendChild(paper); const pc = getComputedStyle(paper);
    const o = { on: document.documentElement.classList.contains('halloween'), bg: cs.backgroundColor, theme: document.querySelector('meta[name=theme-color]').content, paperBg: pc.backgroundColor, paperFg: pc.color }; paper.remove(); return o; });
  if (shot) await p.screenshot({ path: out + '/' + shot });
  await ctx.close(); return r;
}
const a = await look('2026-10-29T12:00:00', 'halloween-on.png'), c = await look('2026-10-31T23:59:00'), d = await look('2026-11-01T00:00:00', 'halloween-off.png'), e = await look('2026-12-25T12:00:00');
ck('29 Oct: Halloween look on', a.on && a.bg === 'rgb(27, 16, 34)', JSON.stringify(a));
ck('31 Oct late evening: still on', c.on, JSON.stringify(c));
ck('1 Nov: back to the normal look', !d.on && d.bg === 'rgb(244, 243, 241)' && d.theme === '#7A2E2E', JSON.stringify(d));
ck('later in the year: normal look', !e.on, JSON.stringify(e));
ck('bill paper is white with black ink in both looks', a.paperBg === d.paperBg && a.paperFg === d.paperFg && a.paperBg === 'rgb(255, 255, 255)' && a.paperFg === 'rgb(0, 0, 0)', JSON.stringify([a.paperBg, a.paperFg, d.paperBg, d.paperFg]));
await b.close(); console.log(bad ? 'FAILED ' + bad : 'all ok'); process.exit(bad ? 1 : 0);
