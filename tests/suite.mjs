// Full pre-production test of the Deo Ratan billing app.
// Every money figure is checked against an independent calculation written here (the "oracle"), not read back from the app.
import { chromium } from 'playwright';
import fs from 'fs';
const URL_ = process.argv[2], OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- result log ---------------- */
let pass = 0, fail = 0; const fails = []; let section = '';
const sec = (s) => { section = s; console.log('\n## ' + s); };
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(section + ' › ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); console.log('  ✗ ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
}
const eq = (name, got, want) => check(name, String(got) === String(want), 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
const near = (name, got, want) => check(name, Math.abs(Number(got) - Number(want)) < 0.006, 'got ' + got + ', want ' + want);

/* ---------------- oracle ---------------- */
const r2 = (n) => Math.round(n * 100) / 100;
const inr = (n) => (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const SIZEKG = { LD: 30, '25.1kg': 25.1, '30kg': 30 };
const lineQ = (it) => r2(it.qty !== undefined ? it.qty : it.bags * (it.kg ?? SIZEKG[it.size]) / 100);
function saleBill({ items, discount = 0, gst = 'none', freight = 0 }) {
  const lines = items.map(it => { const q = lineQ(it); return { q, amt: r2(q * it.rate) }; });
  const amount = r2(lines.reduce((t, l) => t + l.amt, 0)), taxable = r2(amount - discount);
  const sg = gst === 'intra' ? r2(taxable * 0.025) : 0, ig = gst === 'inter' ? r2(taxable * 0.05) : 0;
  return { lines, amount, taxable, sgst: sg, cgst: sg, igst: ig, final: r2(taxable + 2 * sg + ig + freight), qtl: r2(lines.reduce((t, l) => t + l.q, 0)) };
}
function purchase({ grain, vehicle, gross, rate, discount = 0 }) {
  const cut = grain === 'dhan' ? 1 : 0.3;
  const ded = r2(gross * cut / 100), net = r2(gross - ded), amount = r2(net * rate);
  const dk = vehicle === 'Truck' ? 100 : 60;
  const lq = Math.floor(net + 0.5), lr = grain === 'dhan' ? 15 : vehicle === 'Hydraulic trolley' ? 7.5 : 10.5;
  const labour = r2(lq * lr);
  return { ded, net, amount, dk, lq, lr, labour, final: r2(amount - discount - dk - labour) };
}
const money = (s) => Number(String(s).replace(/[₹,\s/-]|−/g, '').replace(/[^\d.]/g, ''));

/* ---------------- browser ---------------- */
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Prod', { create: true }); });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
const p = page;
const H = (n) => p.getByRole('heading', { name: n, exact: true });
const txt = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const fits = () => p.evaluate(() => { const i = document.querySelector('.paperbox .inv'), a = i.querySelector('.addr'); return a.getBoundingClientRect().bottom <= i.getBoundingClientRect().bottom + 0.5; });
const visibleErrs = async () => (await p.locator('.err:not([hidden])').allInnerTexts()).filter(Boolean);
async function readFolder() {
  return p.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Prod');
    const out = { top: [], inv: [], bk: [], data: null, x: {} };
    for await (const [n] of d.entries()) out.top.push(n);
    try { for await (const [n] of (await d.getDirectoryHandle('Invoices')).entries()) out.inv.push(n); } catch (e) {}
    try { for await (const [n] of (await d.getDirectoryHandle('Backups')).entries()) out.bk.push(n); } catch (e) {}
    out.data = JSON.parse(await (await (await d.getFileHandle('bills-data.json')).getFile()).text());
    for (const n of out.top.filter(n => n.endsWith('.xlsx'))) {
      const wb = XLSX.read(await (await (await d.getFileHandle(n)).getFile()).arrayBuffer(), { type: 'array' });
      out.x[n] = {}; wb.SheetNames.forEach(s => { out.x[n][s] = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' }); });
    }
    return out;
  });
}
const sheetRows = (aoa) => { const h = aoa[1]; return aoa.slice(2).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const go = async (tab) => { await p.getByRole('button', { name: tab, exact: true }).click(); };

/* ---------------- form helpers ---------------- */
async function aataItem(i, it) {
  if (i > 0) await p.getByRole('button', { name: '+ Add another item' }).click();
  await p.selectOption(`#f-i${i}-prod`, it.prod || 'aata');
  await p.fill(`#f-i${i}-bags`, String(it.bags));
  if (it.size) await p.selectOption(`#f-i${i}-size`, it.size);
  if (it.kg !== undefined && (!it.size || it.size === 'other')) await p.fill(`#f-i${i}-bagKg`, String(it.kg));
  await p.fill(`#f-i${i}-rate`, String(it.rate));
}
async function party({ mobile, name, location, gst }) {
  if (mobile) await p.fill('#f-mobile', mobile);
  await p.waitForTimeout(60);
  if (name !== undefined) await p.fill('#f-party', name);
  if (location !== undefined) await p.fill('#f-location', location);
  if (gst !== undefined && await p.locator('#f-gst').count()) await p.fill('#f-gst', gst);
}
async function newGrain(g, k) {
  await p.getByRole('button', { name: 'New bill' }).click();
  await p.locator(`[data-g="${g}"]`).click(); await p.locator(`[data-k="${k}"]`).click(); await p.locator('#gGo').click();
}
async function grainItem(i, g, it) {
  if (i > 0) await p.getByRole('button', { name: '+ Add another item' }).click();
  if (g === 'wheat') {
    await p.selectOption(`#f-i${i}-type`, it.type);
    if (it.type === 'Others'){
      check('Others line: no bags, size or brand', (await p.locator(`#f-i${i}-bags, #f-i${i}-size, #f-i${i}-brand`).count()) === 0);
      if (it.typeOther) await p.fill(`#f-i${i}-typeOther`, it.typeOther);
      await p.fill(`#f-i${i}-qty`, String(it.qty)); await p.fill(`#f-i${i}-rate`, String(it.rate)); return;
    }
    if (it.brand) { await p.selectOption(`#f-i${i}-brand`, it.brand); if (it.brand === 'Others') await p.fill(`#f-i${i}-brandOther`, it.brandOther); }
    await p.fill(`#f-i${i}-bags`, String(it.bags));
    if (it.size === 'other') { await p.selectOption(`#f-i${i}-size`, 'other'); await p.fill(`#f-i${i}-bagKg`, String(it.kg)); }
  } else await p.fill(`#f-i${i}-qty`, String(it.qty));
  await p.fill(`#f-i${i}-rate`, String(it.rate));
}
async function invoiceTotals() {
  const tot = await txt('.paperbox .inv tr.tot');
  const rows = (await p.locator('.paperbox .inv tr.item').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  const adv = (await p.locator('.paperbox .inv tr.adv').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  return { tot, rows, adv, final: money(tot.split('Total')[1]) };
}

/* ================================================================ */
sec('Start-up');
await p.goto(URL_);
await H('Choose where to save your bills').waitFor();
check('setup screen asks for a folder', true);
await p.getByRole('button', { name: 'Choose folder' }).click();
await H('Aata bills').waitFor();
eq('tabs', (await p.locator('#mainNav .tab').allInnerTexts()).join('|'), 'Aata|Grains|Parties');
check('empty list message', (await txt('table.list tbody')).includes('No bills yet'));

/* ================================================================ */
sec('Aata 1 · multi-item bill: 30 kg, LD, 25.1 kg, Other + Chapad, GST in M.P., discount, freight, advance');
const A1 = { items: [
  { prod: 'aata', bags: 80, size: '30kg', rate: 2660 },
  { prod: 'aata', bags: 15, size: 'LD', rate: 2800 },
  { prod: 'aata', bags: 33, size: '25.1kg', rate: 2650 },
  { prod: 'aata', bags: 12, size: 'other', kg: 47.5, rate: 2700 },
  { prod: 'chapad', bags: 20, size: 'other', kg: 40, rate: 1800 }], discount: 1250, gst: 'intra', freight: 2200 };
const oA1 = saleBill(A1);
await p.getByRole('button', { name: 'New bill' }).click();
eq('new bill number', await p.locator('h1').innerText(), 'New bill · No. 01');
await party({ mobile: '9876543210', name: 'Shri Balaji Laghu Udyog, Bhopal', location: 'Bhopal', gst: '23AKDPK9279G1ZD' });
for (let i = 0; i < A1.items.length; i++) await aataItem(i, A1.items[i]);
await p.fill('#f-discount', String(A1.discount)); await p.fill('#f-freight', String(A1.freight));
for (let i = 0; i < A1.items.length; i++) near('line ' + (i + 1) + ' amount', money(await p.locator(`#f-i${i}-amount`).innerText()), oA1.lines[i].amt);
near('amount after discount', money(await p.locator('#f-taxable').innerText()), oA1.taxable);
near('SGST auto', await p.inputValue('#f-sgst'), oA1.sgst); near('CGST auto', await p.inputValue('#f-cgst'), oA1.cgst);
eq('IGST empty', await p.inputValue('#f-igst'), '');
near('form total', money(await p.locator('#finalOut').innerText()), oA1.final);
await p.fill('#f-advance', '50000'); await p.selectOption('#f-advMode', 'UPI');
check('balance shown in footer', (await p.locator('#balOut').innerText()).includes(inr(r2(oA1.final - 50000))), await p.locator('#balOut').innerText());
await p.locator('#f-dueDate').fill('15/11/2026'); await p.locator('#f-dueDate').blur();
await p.locator('summary', { hasText: '5. Transport details' }).click();
await p.fill('#f-truckNo', 'MP04 GA 7788'); await p.fill('#f-driverName', 'Ramu'); await p.fill('#f-saudaAgent', 'Mahesh');
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Bill no. 01').waitFor();
let inv = await invoiceTotals();
eq('invoice item rows', inv.rows.length, 5);
check('row 2 shows LD', inv.rows[1].includes(' LD '), inv.rows[1]);
check('row 4 shows 47.5 kg', inv.rows[3].includes('47.5 kg'), inv.rows[3]);
check('row 5 is चापड़ with HSN 2302', inv.rows[4].includes('चापड़') && inv.rows[4].includes('2302'), inv.rows[4]);
near('invoice total', inv.final, oA1.final);
check('discount row printed', (await txt('.paperbox .inv tbody')).includes('Less discount'));
check('advance & balance rows', inv.adv.length === 2 && inv.adv[0].includes('UPI') && money(inv.adv[1].split('Balance')[1]) === r2(oA1.final - 50000), inv.adv.join(' / '));
check('mobile printed', (await txt('.paperbox .inv .partyblk')).includes('9876543210'));
check('transport printed', (await txt('.paperbox .inv .foot')).includes('MP04 GA 7788'));
check('bill fits on the slip', await fits());
eq('status pill', await txt('.head .pill'), 'Partly paid');
await p.locator('.paperbox .inv').screenshot({ path: OUT + '/A1-invoice.png' });
const [dlA] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download bill (PDF)' }).click()]);
eq('print PDF name', dlA.suggestedFilename(), 'Invoice_01_3-per-A4.pdf');

/* ================================================================ */
sec('Aata 2 · no GST No. → no GST; outside M.P. → IGST; manual GST edit + "work out again"');
await p.getByRole('button', { name: '← Back to bills' }).click();
await p.getByRole('button', { name: 'New bill' }).click();
await party({ mobile: '9123456780', name: 'Gupta Kirana Store', location: 'Sehore' });
await aataItem(0, { bags: 10, size: '30kg', rate: 2700 });
eq('no GST when no GST No.', await p.inputValue('#f-sgst') + '|' + await p.inputValue('#f-igst'), '|');
await p.fill('#f-gst', '27AAACG1234F1Z5');
near('IGST 5% for outside M.P.', await p.inputValue('#f-igst'), r2(8100 * 0.05));
await p.fill('#f-igst', '400');
check('reset button appears after manual edit', await p.locator('#gstResetWrap').isVisible());
near('manual IGST used in total', money(await p.locator('#finalOut').innerText()), 8500);
await p.locator('#gstReset').click();
near('worked out again', await p.inputValue('#f-igst'), 405);
await p.locator('input[name="gstMode"][value="none"]').check();
near('No GST chosen → total = amount', money(await p.locator('#finalOut').innerText()), 8100);
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Bill no. 02').waitFor();

/* ================================================================ */
sec('Aata 3 · validation');
await p.getByRole('button', { name: '← Back to bills' }).click();
await p.getByRole('button', { name: 'New bill' }).click();
await p.fill('#f-mobile', '98765'); await p.locator('#f-party').focus();
check('short mobile flagged', (await visibleErrs()).some(e => e.includes('10 digits')));
await p.fill('#f-mobile', '');
await p.getByRole('button', { name: 'Create bill' }).click();
let ve = await visibleErrs();
check('name required', ve.some(e => e.includes('name and address')), ve.join(' | '));
check('bags required', ve.some(e => e.includes('number of bags')));
check('rate required', ve.some(e => e.includes('rate per quintal')));
await p.fill('#f-party', 'Validation Party'); await aataItem(0, { bags: 10, size: 'other', rate: 2000 });
await p.getByRole('button', { name: 'Create bill' }).click();
check('Other size needs bag weight', (await visibleErrs()).some(e => e.includes('weight of one bag')));
await p.fill('#f-i0-bagKg', '50'); await p.fill('#f-discount', '20000');
await p.getByRole('button', { name: 'Create bill' }).click();
check('discount larger than goods refused', (await visibleErrs()).some(e => e.includes('discount is more')));
await p.fill('#f-discount', ''); await p.fill('#f-advance', '99999');
await p.getByRole('button', { name: 'Create bill' }).click();
check('advance larger than bill refused', (await visibleErrs()).some(e => e.includes('more than the bill total')));
await p.fill('#f-advance', '');
await p.getByRole('button', { name: 'Save for later' }).click(); await H('Aata bills').waitFor();
check('draft listed as Not finished', (await txt('table.list tbody')).includes('Not finished'));

/* ================================================================ */
sec('Aata 4 · draft → continue → create keeps numbering; edit a final bill');
await p.locator('tr', { hasText: 'Validation Party' }).getByRole('button', { name: 'Continue' }).click();
eq('draft gets next number', await p.locator('h1').innerText(), 'New bill · No. 03');
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Bill no. 03').waitFor();
near('bill 03 total', (await invoiceTotals()).final, 10000);
await p.getByRole('button', { name: 'Edit bill' }).click();
await p.fill('#f-i0-rate', '2100');
await p.getByRole('button', { name: 'Save changes' }).click(); await H('Bill no. 03').waitFor();
near('edited total', (await invoiceTotals()).final, 10500);

/* ================================================================ */
sec('Aata 5 · payments, statuses, overdue');
await p.getByRole('button', { name: 'Mark paid' }).click();
await p.fill('#pAmt', '4000'); await p.selectOption('#pMode', 'Cheque');
await p.getByRole('button', { name: 'Save payment' }).click(); await p.waitForTimeout(300);
eq('partly paid', await txt('.head .pill'), 'Partly paid');
await p.getByRole('button', { name: 'Mark paid' }).click();
near('remaining prefilled', await p.inputValue('#pAmt'), 6500);
await p.fill('#pAmt', '7000');
check('overpayment blocked', !(await p.locator('#pErr').isHidden()));
await p.fill('#pAmt', '6500'); await p.getByRole('button', { name: 'Save payment' }).click(); await p.waitForTimeout(300);
eq('paid', await txt('.head .pill'), 'Paid');
check('Mark paid button gone', (await p.getByRole('button', { name: 'Mark paid' }).count()) === 0);
await p.getByRole('button', { name: 'Edit bill' }).click();
await p.locator('#f-dueDate').fill('01/01/2026'); await p.locator('#f-dueDate').blur();
await p.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(200);
eq('fully paid bill never overdue', await txt('.head .pill'), 'Paid');
await p.getByRole('button', { name: '← Back to bills' }).click();
await p.locator('tr', { hasText: 'Gupta Kirana' }).getByRole('button', { name: 'Open bill' }).click();
await p.getByRole('button', { name: 'Edit bill' }).click();
await p.locator('#f-dueDate').fill('01/10/2026'); await p.locator('#f-dueDate').blur();
await p.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(200);
eq('unpaid past due → Overdue', await txt('.head .pill'), 'Overdue');
await p.getByRole('button', { name: '← Back to bills' }).click();
await p.locator('.chip[data-st="overdue"]').click();
eq('Overdue filter rows', await p.locator('table.list tbody tr').count(), 1);
await p.locator('.chip[data-st="all"]').click();
await p.fill('#q', 'balaji');
eq('search by name', await p.locator('table.list tbody tr').count(), 1);
await p.fill('#q', '');

/* ================================================================ */
sec('Aata 6 · saved-party picker & autofill');
await p.getByRole('button', { name: 'New bill' }).click();
await p.fill('#f-party', 'gupta');
check('picker finds Gupta', (await txt('#partyPick')).includes('Gupta Kirana Store'));
await p.locator('#partyPick [data-pk]').first().click();
eq('picker fills mobile/location', await p.inputValue('#f-mobile') + '|' + await p.inputValue('#f-location'), '9123456780|Sehore');
await p.getByRole('button', { name: '← Back to bills' }).click();
await p.waitForTimeout(200);
await p.getByRole('button', { name: 'New bill' }).click();
await p.fill('#f-mobile', '9876543210'); await p.waitForTimeout(150);
eq('mobile autofills party', await p.inputValue('#f-party'), 'Shri Balaji Laghu Udyog, Bhopal');
eq('mobile autofills GST', await p.inputValue('#f-gst'), '23AKDPK9279G1ZD');

/* 8 items: limit and fit */
for (let i = 0; i < 8; i++) await aataItem(i, { prod: i === 7 ? 'chapad' : 'aata', bags: 10 + i, size: i % 2 ? 'LD' : '30kg', rate: 2600 + i * 10 });
check('no 9th item', (await p.getByRole('button', { name: '+ Add another item' }).count()) === 0);
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Bill no. 04').waitFor();
check('8-item bill fits', await fits());
eq('8 rows printed', (await invoiceTotals()).rows.length, 8);

/* ================================================================ */
sec('Aata 7 · delete');
await p.getByRole('button', { name: 'Delete this bill' }).click();
check('confirm explains number reuse', (await txt('.dialog')).includes('will be used again'));
await p.getByRole('button', { name: 'Delete bill' }).click(); await H('Aata bills').waitFor();
await p.getByRole('button', { name: 'New bill' }).click();
eq('number 04 reused', await p.locator('h1').innerText(), 'New bill · No. 04');
await p.getByRole('button', { name: '← Back to bills' }).click();

/* ================================================================ */
sec('Grain sale 1 · wheat: types, brands, Others, 30 kg and Other bags, GST, discount, advance');
await go('Grains'); await H('Grains').waitFor();
const W1 = { items: [
  { type: 'Sharbati (1 no.)', brand: 'Ratan Gold', bags: 100, kg: 30, rate: 3100 },
  { type: 'Others', typeOther: 'Desi Lal', qty: 20, rate: 2950 },
  { type: 'Lokwan (MTR)', bags: 25, kg: 30, rate: 3050 }], discount: 500, gst: 'intra' };
const oW1 = saleBill(W1);
await newGrain('wheat', 'gsale');
eq('sale number', await p.locator('h1').innerText(), 'New grain sale · No. GS-01');
await party({ mobile: '9876543210' }); await p.waitForTimeout(150);
for (let i = 0; i < W1.items.length; i++) await grainItem(i, 'wheat', W1.items[i]);
await p.fill('#f-discount', '500');
for (let i = 0; i < 3; i++) near('wheat line ' + (i + 1), money(await p.locator(`#f-i${i}-amount`).innerText()), oW1.lines[i].amt);
near('wheat sale total', money(await p.locator('#finalOut').innerText()), oW1.final);
await p.fill('#f-advance', '100000');
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Grain sale no. GS-01').waitFor();
inv = await invoiceTotals();
near('wheat invoice total', inv.final, oW1.final);
check('row 1 desc type+brand', inv.rows[0].includes('Sharbati (1 no.)') && inv.rows[0].includes('Ratan Gold'), inv.rows[0]);
check('row 2 loose Others line: name + 20.00 qtl, no brand', inv.rows[1].includes('Desi Lal') && inv.rows[1].includes('20.00') && !inv.rows[1].includes('kg'), inv.rows[1]);
check('wheat sale fits', await fits());
await p.locator('.paperbox .inv').screenshot({ path: OUT + '/W1-invoice.png' });

await p.getByRole('button', { name: '← Back to grains' }).click();
await newGrain('wheat', 'gsale');
await party({ name: 'Loose Wheat Buyer' });
await p.selectOption('#f-i0-type', 'Others');
await p.fill('#f-i0-qty', '7.5'); await p.fill('#f-i0-rate', '2800');
await p.getByRole('button', { name: 'Create bill' }).click(); await p.waitForSelector('.paperbox .inv');
check('wheat Others with only quantity + rate is accepted', (await p.locator('h1').innerText()).startsWith('Grain sale no.'), await p.locator('h1').innerText());
near('loose wheat total', (await invoiceTotals()).final, 21000);
await p.getByRole('button', { name: 'Delete this bill' }).click(); await p.getByRole('button', { name: 'Delete bill' }).click(); await H('Grains').waitFor();

sec('Grain sale 2 · chana, tewda, soybean by quintal');
const others = [['chana', 12.5, 6000], ['tewda', 8.25, 4200], ['soybean', 20.4, 4700]];
const oOther = {};
for (const [g, q, r] of others) {
  if (await p.getByRole('button', { name: '← Back to grains' }).count()) await p.getByRole('button', { name: '← Back to grains' }).click();
  await newGrain(g, 'gsale');
  check(g + ': no type / brand / bags', (await p.locator('#f-i0-type').count()) + (await p.locator('#f-i0-brand').count()) + (await p.locator('#f-i0-bags').count()) === 0);
  await party({ name: 'Buyer ' + g, location: 'Vidisha' });
  await grainItem(0, g, { qty: q, rate: r });
  await p.getByRole('button', { name: 'Create bill' }).click(); await p.waitForSelector('.paperbox .inv');
  oOther[g] = saleBill({ items: [{ qty: q, rate: r }] });
  near(g + ' total', (await invoiceTotals()).final, oOther[g].final);
}

/* ================================================================ */
sec('Grain purchase · every vehicle, rounding at .5, discount, paid now, dhan');
const buys = [
  { grain: 'wheat', wtype: 'Sharbati', vehicle: 'Truck', gross: 45.37, rate: 2500, party: 'Ramesh Patel, Berasia', paid: 50000 },
  { grain: 'wheat', wtype: 'Others', wtypeOther: 'Purana', vehicle: 'Tractor', gross: 30.59, rate: 2400, discount: 300, party: 'Ramesh Patel, Berasia' },
  { grain: 'wheat', wtype: 'Mill Quality', vehicle: 'Hydraulic trolley', gross: 30.59, rate: 2400, party: 'Kisan Traders' },
  { grain: 'soybean', vehicle: 'Pickup', gross: 18.0, rate: 4800, party: 'Kisan Traders' },
  { grain: 'chana', vehicle: 'Others', gross: 9.99, rate: 5900, party: 'Gupta Kirana Store' },
  { grain: 'dhan', vehicle: 'Truck', gross: 52.4, rate: 2200, party: 'Dhan Seller' },
  { grain: 'dhan', vehicle: 'Hydraulic trolley', gross: 0.7, rate: 2200, party: 'Small Seller' }];
const oBuy = [];
for (const [n, bq] of buys.entries()) {
  await p.getByRole('button', { name: '← Back to grains' }).click();
  await newGrain(bq.grain, 'gpurchase');
  await party({ name: bq.party });
  if (bq.wtype) { await p.selectOption('#f-wtype', bq.wtype); if (bq.wtypeOther) await p.fill('#f-wtypeOther', bq.wtypeOther); }
  await p.selectOption('#f-vehicle', bq.vehicle); await p.fill('#f-gross', String(bq.gross)); await p.fill('#f-rate', String(bq.rate));
  if (bq.discount) await p.fill('#f-discount', String(bq.discount));
  if (bq.paid) await p.fill('#f-advance', String(bq.paid));
  const o = purchase(bq); oBuy.push(o);
  const tag = bq.grain + '/' + bq.vehicle + ' ' + bq.gross;
  near(tag + ' net', money(await p.locator('#f-net').innerText()), o.net);
  near(tag + ' labour', money(await p.locator('#f-labour').innerText()), o.labour);
  near(tag + ' payable', money(await p.locator('#f-pfinal').innerText()), o.final);
  await p.getByRole('button', { name: 'Create purchase slip' }).click(); await p.waitForSelector('.paperbox .inv');
  eq(tag + ' number', (await p.locator('h1').innerText()).replace('Purchase no. ', ''), 'GP-0' + (n + 1));
  const slip = await txt('.paperbox .inv tbody');
  check(tag + ' slip shows labour ' + o.lq + ' qtl @ ' + o.lr, slip.includes('Labour ' + o.lq + ' qtl @ ' + o.lr), slip.slice(0, 200));
  near(tag + ' slip total', money((await txt('.paperbox .inv tr.tot')).split('Total')[1]), o.final);
  check(tag + ' fits', await fits());
  if (n === 5) await p.locator('.paperbox .inv').screenshot({ path: OUT + '/P-dhan-slip.png' });
}
await p.getByRole('button', { name: '← Back to grains' }).click();
await newGrain('wheat', 'gpurchase');
await party({ name: 'Nothing Left' }); await p.selectOption('#f-wtype', 'Malwa'); await p.selectOption('#f-vehicle', 'Truck');
await p.fill('#f-gross', '1'); await p.fill('#f-rate', '50');
await p.getByRole('button', { name: 'Create purchase slip' }).click();
check('slip with nothing left to pay refused', (await visibleErrs()).some(e => e.includes('nothing is left to pay')));
await p.getByRole('button', { name: '← Back to grains' }).click();
if (await p.locator('.dialog').count()) await p.getByRole('button', { name: 'Discard changes' }).click().catch(() => {});
await H('Grains').waitFor();
// dhan cannot be sold
await p.getByRole('button', { name: 'New bill' }).click(); await p.locator('[data-g="dhan"]').click();
check('dhan: Sale disabled', await p.locator('[data-k="gsale"]').isDisabled());
await p.getByRole('button', { name: 'Cancel' }).click();
// grain list filters
await p.locator('[data-gk="gpurchase"]').click();
const nPurch = await p.locator('table.list tbody tr').filter({ hasText: 'GP-' }).count();
eq('purchases filter', nPurch, buys.length);
await p.locator('[data-gk="all"]').click();

/* ================================================================ */
sec('Parties ledger · mixed customer/seller, old dues, payments both ways');
await go('Parties'); await H('Parties').waitFor();
await p.locator('tr', { hasText: 'Gupta Kirana Store' }).getByRole('button', { name: 'Open ledger' }).click();
// Gupta: bill 02 = 8100 (unpaid, overdue) ; bought chana from them oBuy[4].final (we owe) → balance = 8100 - chana purchase
const gBal = r2(8100 - oBuy[4].final);
near('Gupta net balance (sale − purchase)', money(await txt('.ledsum .card.big b')) * (gBal < 0 ? -1 : 1), gBal);
check('balance wording', (await txt('.ledsum .card.big')).includes(gBal < 0 ? 'we owe them' : 'to collect'));
await p.getByRole('button', { name: 'Add old dues' }).click();
await p.fill('#oAmt', '2500'); await p.fill('#oDate', '01/04/2026'); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(300);
near('balance after old dues', money(await txt('.ledsum .card.big b')) * (gBal + 2500 < 0 ? -1 : 1), r2(gBal + 2500));
await p.getByRole('button', { name: 'Record payment' }).click();
const opts = await p.locator('#lAgainst option').allInnerTexts();
check('payment options: old dues, bill, purchase', opts.some(o => o.startsWith('Old dues')) && opts.some(o => o.startsWith('Bill no. 02')) && opts.some(o => o.includes('We pay · purchase GP-05')), opts.join(' / '));
await p.selectOption('#lAgainst', { label: opts.find(o => o.includes('GP-05')) });
await p.fill('#lAmt', '10000'); await p.getByRole('button', { name: 'Save payment' }).click(); await p.waitForTimeout(300);
near('paying the seller moves balance up', money(await txt('.ledsum .card.big b')) * (gBal + 12500 < 0 ? -1 : 1), r2(gBal + 2500 + 10000));
const lines = (await p.locator('table.ledger tbody tr').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
check('ledger has old dues, bill, purchase, payment', lines.some(l => l.includes('Opening balance')) && lines.some(l => l.includes('Bill no. 02')) && lines.some(l => l.includes('Purchase GP-05')) && lines.some(l => l.includes('Paid to them')), lines.join(' || '));
await p.screenshot({ path: OUT + '/L-ledger.png', fullPage: true });
await p.getByRole('button', { name: '← Parties' }).click();
await p.locator('tr', { hasText: 'Shri Balaji' }).getByRole('button', { name: 'Open ledger' }).click();
const balajiBal = r2(oA1.final - 50000 + 0 + oW1.final - 100000); // bill 01, deleted bill 04 gone, GS-01
near('Balaji balance (Aata + wheat sale − advances)', money(await txt('.ledsum .card.big b')), balajiBal);
const [pop] = await Promise.all([p.waitForEvent('popup'), p.locator('[data-pdf]').first().click()]);
check('ledger opens invoice PDF', !!pop); await pop.close();

/* ================================================================ */
sec('Statements · four files, right tabs, right rows, totals match');
await p.waitForTimeout(3000);
let F = await readFolder();
for (const n of ['Aata sale statement.xlsx', 'Grain sale statement.xlsx', 'Grain purchase statement.xlsx', 'Master statement.xlsx']) check('file ' + n, F.top.includes(n), F.top.join(', '));
eq('aata tabs', Object.keys(F.x['Aata sale statement.xlsx']).join('|'), 'Aata sale');
eq('grain sale tabs', Object.keys(F.x['Grain sale statement.xlsx']).join('|'), 'Wheat|Tewda|Chana|Soybean');
eq('grain purchase tabs', Object.keys(F.x['Grain purchase statement.xlsx']).join('|'), 'Wheat|Tewda|Chana|Soybean|Dhan');
eq('master tabs', Object.keys(F.x['Master statement.xlsx']).length, 10);
const aataRows = sheetRows(F.x['Aata sale statement.xlsx']['Aata sale']);
const finals = aataRows.map(r => r['FINAL AMOUNT (₹)']).filter(v => v !== '');
eq('aata statement has bills 01–03 (04 deleted)', aataRows.filter(r => r['INVOICE NO.']).map(r => r['INVOICE NO.']).join(','), '01,02,03');
near('aata bill 01 final', finals[0], oA1.final);
eq('bill 01 spans 5 item rows', aataRows.slice(0, 5).map(r => r['ITEM (AATA/ CHAPAD)']).join(','), 'Aata,Aata,Aata,Aata,Chapad');
eq('sizes column', aataRows.slice(0, 5).map(r => r['SIZE (LD/ 25kg/ 30kg)']).join(','), '30 kg,LD,25.1 kg,Other,Other');
near('discount column', aataRows[0]['DISCOUNT (₹)'], 1250);
eq('payment status 01', aataRows[0]['PAYMENT STATUS'], 'Partly paid');
const ws = sheetRows(F.x['Grain sale statement.xlsx']['Wheat']);
eq('wheat tab rows (3 items of GS-01)', ws.length, 3);
eq('wheat brands (Others line has none; next line starts blank after it)', ws.map(r => r['BRAND']).join(','), 'Ratan Gold,,');
eq('wheat bags column (Others line loose)', ws.map(r => r['NO. OF BAGS']).join(','), '100,,25');
near('wheat final', ws[0]['FINAL AMOUNT (₹)'], oW1.final);
for (const [g] of others) {
  const t = g[0].toUpperCase() + g.slice(1);
  const rr = sheetRows(F.x['Grain sale statement.xlsx'][t]);
  check(t + ' sale tab has its one bill', rr.length === 1 && Math.abs(rr[0]['FINAL AMOUNT (₹)'] - oOther[g].final) < 0.01, JSON.stringify(rr[0] || {}).slice(0, 120));
  check(t + ' tab has no TYPE/BRAND/BAGS columns', !('BRAND' in (rr[0] || {})) && !('NO. OF BAGS' in (rr[0] || {})));
}
const wp = sheetRows(F.x['Grain purchase statement.xlsx']['Wheat']);
eq('wheat purchases', wp.length, 3);
wp.forEach((r, i) => { near('GP-0' + (i + 1) + ' final in Excel', r['FINAL AMOUNT (₹)'], oBuy[i].final); near('GP-0' + (i + 1) + ' labour rate', r['LABOUR RATE (₹/qtl)'], oBuy[i].lr); });
eq('wheat purchase types', wp.map(r => r['TYPE']).join(','), 'Sharbati,Purana,Mill Quality');
const dp = sheetRows(F.x['Grain purchase statement.xlsx']['Dhan']);
eq('dhan purchases', dp.length, 2);
near('dhan deduction rate', dp[0]['DEDUCTION RATE (kg/qtl)'], 1);
near('dhan final', dp[0]['FINAL AMOUNT (₹)'], oBuy[5].final);
near('tiny dhan (0.7 qtl → labour on 1 qtl)', dp[1]['FINAL AMOUNT (₹)'], oBuy[6].final);
const ms = F.x['Master statement.xlsx'];
check('master = all statements', JSON.stringify(ms['Aata sale']) === JSON.stringify(F.x['Aata sale statement.xlsx']['Aata sale']) && JSON.stringify(ms['Dhan purchase']) === JSON.stringify(F.x['Grain purchase statement.xlsx']['Dhan']));
check('invoice PDFs saved (01,02,03, GS-01..04, GP-01..07; 04 removed)',
  ['Invoice_01.pdf', 'Invoice_02.pdf', 'Invoice_03.pdf', 'Invoice_GS-01.pdf', 'Invoice_GS-04.pdf', 'PurchaseSlip_GP-07.pdf'].every(n => F.inv.includes(n)) && !F.inv.includes('Invoice_04.pdf'), F.inv.sort().join(', '));
check('backup copy made before delete', F.bk.some(n => n.startsWith('manual_')), F.bk.join(', '));
eq('final bills in file', F.data.bills.filter(b => b.status !== 'draft').length, 3 + 4 + buys.length);
eq('drafts kept from forms left half-filled', F.data.bills.filter(b => b.status === 'draft').length, 2);
for (const [n, sheets] of Object.entries(F.x)) { fs.writeFileSync(OUT + '/' + n.replace(/ /g, '_') + '.json', JSON.stringify(sheets)); }
const [dlM] = await Promise.all([p.waitForEvent('download'), (async () => { await go('Grains'); await p.getByRole('button', { name: 'Download master statement' }).click(); })()]);
eq('master download name', dlM.suggestedFilename(), 'MASTER_STATEMENT.xlsx');
await dlM.saveAs(OUT + '/MASTER_STATEMENT.xlsx');

/* ================================================================ */
sec('Extra edge cases');
await go('Aata'); await H('Aata bills').waitFor();
await p.getByRole('button', { name: 'New bill' }).click();
await party({ name: 'Typed Weight Party' });
await p.fill('#f-i0-bags', '10'); await p.fill('#f-i0-bagKg', '26'); await p.fill('#f-i0-rate', '2500');
near('no size picked, typed 26 kg', money(await p.locator('#f-i0-amount').innerText()), r2(r2(10 * 26 / 100) * 2500));
await p.fill('#f-advance', '1000');
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Bill no. 04').waitFor();
await p.getByRole('button', { name: 'Mark paid' }).click(); await p.getByRole('button', { name: 'Save payment' }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Delete this bill' }).click();
check('delete warns about payments', (await txt('.dialog')).includes('payments'), await txt('.dialog'));
await p.getByRole('button', { name: 'Delete bill' }).click(); await H('Aata bills').waitFor();
check('paid bill deleted', !(await txt('table.list tbody')).includes('Typed Weight Party'));
await go('Grains'); await H('Grains').waitFor();
await newGrain('wheat', 'gsale');
await party({ name: 'Switch Party' });
await grainItem(0, 'wheat', { type: 'Jhiri', brand: 'Meera', bags: 10, kg: 30, rate: 3000 });
await p.getByRole('button', { name: 'Change' }).click(); await p.locator('[data-g="chana"]').click(); await p.locator('#gGo').click();
check('switch wheat→chana clears wheat-only fields', (await p.locator('#f-i0-type').count()) === 0 && (await p.locator('#f-i0-qty').count()) === 1);
eq('HSN follows the grain', await p.inputValue('#f-i0-hsn'), '0713');
await p.getByRole('button', { name: 'Change' }).click(); await p.locator('[data-k="gpurchase"]').click(); await p.locator('#gGo').click();
check('switch sale→purchase shows weighment', (await p.locator('#f-gross').count()) === 1 && (await p.locator('#itemsBox').count()) === 0);
await p.getByRole('button', { name: 'Save for later' }).click(); await H('Grains').waitFor();
await p.locator('tr', { hasText: 'GP-06' }).getByRole('button', { name: 'Mark paid' }).click();
check('seller payment dialog wording', (await txt('.dialog')).includes('Payment to seller'));
near('full amount prefilled', await p.inputValue('#pAmt'), oBuy[5].final);
await p.getByRole('button', { name: 'Save payment' }).click(); await p.waitForTimeout(300);
check('GP-06 now Paid', (await txt('tr:has-text("GP-06")')).includes('Paid'));
await p.locator('tr', { hasText: 'Switch Party' }).getByRole('button', { name: 'Delete' }).click();
await p.getByRole('button', { name: 'Delete draft' }).click(); await p.waitForTimeout(200);
check('draft deleted', !(await txt('table.list tbody')).includes('Switch Party'));

/* ================================================================ */
sec('Persistence · reload, offline, second window, browser data cleared');
const before = F.data.bills.length;
await p.reload(); await H('Aata bills').waitFor();
eq('rows after reload (3 bills + 1 draft)', await p.locator('table.list tbody tr').count(), 4);
await ctx.setOffline(true); await p.reload(); await H('Aata bills').waitFor();
check('opens offline', true);
await go('Grains'); await H('Grains').waitFor();
await newGrain('tewda', 'gsale'); await party({ name: 'Offline Buyer' }); await grainItem(0, 'tewda', { qty: 3, rate: 4000 });
await p.getByRole('button', { name: 'Create bill' }).click(); await H('Grain sale no. GS-05').waitFor();
check('bill made offline', true);
await ctx.setOffline(false);
const p2 = await ctx.newPage(); await p2.goto(URL_);
await p2.getByRole('heading', { name: 'The app is already open' }).waitFor({ timeout: 10000 }).then(() => check('second window blocked', true), () => check('second window blocked', false));
await p2.close();
await p.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('deoratan-app'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await p.reload(); await H('Choose where to save your bills').waitFor();
await p.getByRole('button', { name: 'Choose folder' }).click(); await H('Aata bills').waitFor();
F = await readFolder();
eq('all bills back after re-choosing the folder', F.data.bills.length, before + 1);

/* ================================================================ */
sec('Mobile width');
await p.setViewportSize({ width: 390, height: 844 });
await go('Grains'); await H('Grains').waitFor();
check('no sideways scroll on list', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await newGrain('wheat', 'gsale');
check('no sideways scroll on form', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await p.screenshot({ path: OUT + '/M-form-phone.png', fullPage: true });

console.log('\nJS ERRORS:', errors.length ? errors : 'none');
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log('FAILED:\n - ' + fails.join('\n - '));
await browser.close();
