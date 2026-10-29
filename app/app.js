(function(){
'use strict';
const $ = (s, el=document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g,'')); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n*100)/100;
const inr = (n) => (Math.round(n*100)/100).toLocaleString('en-IN', {maximumFractionDigits:2});
const qtlFmt = (n) => (Math.round(n*100)/100).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
const pad = (n) => String(n).padStart(2,'0');
const todayISO = () => { const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const dmy = (iso) => { if(!iso) return ''; const [y,m,d] = iso.split('-'); return d+'/'+m+'/'+y; };
function parseDMY(s){
  const m = String(s||'').trim().match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/); if (!m) return null;
  let d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const dt = new Date(y, mo-1, d); if (dt.getFullYear() !== y || dt.getMonth() !== mo-1 || dt.getDate() !== d) return null;
  return y+'-'+pad(mo)+'-'+pad(d);
}
const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/* ---------- maths ---------- */
const LD_PACK = 6, LD_KG = 5;           // an LD bag is a pack of 6 x 5 kg = 30 kg
const SIZES = [['', 'Select'], ['LD', 'LD'], ['25.1kg', '25.1 kg'], ['30kg', '30 kg'], ['other', 'Other']];
const sizeLabel = (v) => v === 'other' ? 'Other' : (SIZES.find(x => x[0] === v) || ['', v || ''])[1].replace(/^Select$/, '');
const SIZE_KG = {LD: LD_PACK*LD_KG, '25.1kg': 25.1, '30kg': 30, '25kg': 25};
const PAY_MODES = ['Cash', 'UPI', 'Bank transfer (NEFT/RTGS)', 'Cheque'];
const MAX_ITEMS = 8;                     // what fits on one invoice
/* what an Aata bill line sells: aata or chapad (bran). The choice is the line's description on the bill. */
const PRODUCTS = {aata:{label:'Aata', desc:'आटा', hsn:'1001'}, chapad:{label:'Chapad', desc:'चापड़', hsn:'2302'}};
const isChapad = (it) => it && it.prod === 'chapad';
function blankItem(prev){ const pr = prev && prev.prod === 'chapad' ? 'chapad' : 'aata';
  return {id:uid(), prod:pr, desc:PRODUCTS[pr].desc, hsn:prev && prev.prod === pr ? prev.hsn : PRODUCTS[pr].hsn, bags:'', size:'', bagKg:'', rate:''}; }
/* ---------- grains: wheat, tewda, chana, soybean ----------
   kind: 'aata' (wheat flour bills, the original), 'gsale' (grain sale), 'gpurchase' (grain bought from a farmer/trader) */
const GRAINS = {
  wheat:   {en:'Wheat',   hi:'गेहूं',    hsn:'1001'},
  tewda:   {en:'Tewda',   hi:'तेवड़ा',   hsn:'0713'},
  chana:   {en:'Chana',   hi:'चना',     hsn:'0713'},
  soybean: {en:'Soybean', hi:'सोयाबीन', hsn:'1201'},
  dhan:    {en:'Dhan',    hi:'धान',     hsn:'1006', buyOnly:true, cutKg:1, labour:15}   // bought only
};
/* weight taken off per quintal bought: 300 g for most grains, 1 kg for dhan */
const cutKgOf = (g) => (GRAINS[g] && GRAINS[g].cutKg) || 0.3;
const cutLabel = (g) => cutKgOf(g) < 1 ? Math.round(cutKgOf(g)*1000)+' g' : cutKgOf(g)+' kg';
const SALE_GRAINS = Object.keys(GRAINS).filter(g => !GRAINS[g].buyOnly);
/* wheat qualities: purchases and sales use different lists; "Others" lets them type a name */
const OTHERS = 'Others';
const BUY_TYPES = ['Malwa','Sharbati','Lokwan','1544','Shri Ram','Lota','Mill Quality', OTHERS];
const SELL_TYPES = ['1544 (1 no.)','1544 (2 no.)','1544 (3 no.)','1544 (MTR)','Lokwan (1 no.)','Lokwan (2 no.)','Lokwan (3 no.)','Lokwan (MTR)',
  'Sharbati (1 no.)','Sharbati (2 no.)','Jhiri','Malwa','Shri Ram','Lota', OTHERS];
const BRANDS = ['Hara Navkar','Orange Navkar','Laal Navkar','Ratan Gold','Shivam Gold','Dev Gold','Dinner Gold','Meera','Golden Temple','White Lilly','Lajawab','Bandhan','Bawarchi','Jai Shree Ram']
  .sort((a,b) => a.localeCompare(b, 'en', {sensitivity:'base'})).concat([OTHERS]);
/* the name to show for a pick from one of these lists */
/* one spelling everywhere, also for bills saved before the lists changed */
const spellFix = (v) => String(v||'').replace(/\bSarbati\b/gi, 'Sharbati').replace(/\bLokvan\b/gi, 'Lokwan');
const pickName = (v, other) => spellFix(v === OTHERS ? (String(other||'').trim() || OTHERS) : (v || ''));
/* an old saved value that isn't in the list any more opens as "Others" with that name typed in */
function normPick(o, k, list){ if (o[k]) o[k] = spellFix(o[k]); if (o[k+'Other']) o[k+'Other'] = spellFix(o[k+'Other']); const v = o[k]; if (v && !list.includes(v)){ o[k+'Other'] = v; o[k] = OTHERS; } if (o[k+'Other'] === undefined) o[k+'Other'] = ''; }
const VEHICLES = ['Truck','Tractor','Hydraulic trolley','Pickup','Others'];
/* labour, ₹ per quintal of net weight (rounded to whole quintals), by vehicle, on every slip:
   Hydraulic trolley ₹7.5; Truck, Tractor, Pickup and Others ₹10.5.
   Slips made when the list said just "Trolley" mean the hydraulic trolley. */
const vehicleOf = (b) => b.vehicle === 'Trolley' ? 'Hydraulic trolley' : (b.vehicle || '');
const labourRateFor = (v) => v === 'Hydraulic trolley' || v === 'Trolley' ? 7.5 : v ? 10.5 : 0;
const labourRateOf = (b) => (GRAINS[b.grain] && GRAINS[b.grain].labour) || labourRateFor(vehicleOf(b));   // dhan: ₹15 whatever the vehicle
const dharamKata = (v) => v === 'Truck' ? 100 : v ? 60 : 0;
const kindOf = (b) => (b && b.kind) || 'aata';
const isGrain = (b) => kindOf(b) !== 'aata';
const KIND_WORD = {aata:'Bill', gsale:'Sale', gpurchase:'Purchase'};
const grainName = (g) => GRAINS[g] ? GRAINS[g].en : 'Grain';
const grainDesc = (g, type, brand) => [GRAINS[g] ? GRAINS[g].hi : '', g === 'wheat' ? type : '', g === 'wheat' ? brand : ''].filter(Boolean).join(' · ');
const itemType = (it) => pickName(it.type, it.typeOther);
/* a wheat line whose type is "Others" is sold loose like the other grains: quantity in quintal, no bags or brand */
const looseWheat = (it) => it && it.type === OTHERS;
const itemBrand = (it, grain) => grain === 'wheat' && !looseWheat(it) ? pickName(it.brand, it.brandOther) : '';
const buyType = (b) => b.grain === 'wheat' ? pickName(b.wtype, b.wtypeOther) : '';
const WHEAT_BAG_KG = 30;   // wheat is sold in 30 kg bags, or another size typed in
const WHEAT_SIZES = [['30kg', '30 kg'], ['other', 'Other']];
function gBlankItem(grain, prev){ return {id:uid(), bags:'', size:grain === 'wheat' ? '30kg' : '', bagKg:grain === 'wheat' ? String(WHEAT_BAG_KG) : '', type:prev ? prev.type : '', typeOther:prev ? prev.typeOther || '' : '', brand:prev ? prev.brand || '' : '', brandOther:prev ? prev.brandOther || '' : '', qty:'', rate:'', hsn:prev ? prev.hsn : (GRAINS[grain] ? GRAINS[grain].hsn : '')}; }
function itemsOf(b){
  if (Array.isArray(b.items) && b.items.length) return b.items;
  if (kindOf(b) !== 'aata') return [];
  return [{id:'i0', desc:b.desc ?? 'आटा', hsn:b.hsn ?? '1001', bags:b.bags ?? '', size:b.size ?? '', bagKg:b.bagKg ?? '', rate:b.rate ?? ''}];
}
function itemCalc(it, kind){
  if (kind === 'gsale'){
    const rate = num(it.rate), bags = looseWheat(it) ? 0 : num(it.bags);
    if (bags > 0){ const kg = it.size === 'other' ? num(it.bagKg) : (num(it.bagKg) || WHEAT_BAG_KG), q = r2(bags*kg/100); return {bags, kg, rate, qtl:q, amount:r2(q*rate)}; }
    const q = r2(num(it.qty)); return {bags:0, kg:0, rate, qtl:q, amount:r2(q*rate)};
  }
  const bags = num(it.bags), kg = num(it.bagKg), rate = num(it.rate);
  const qtl = r2(bags*kg/100);
  return {bags, kg, rate, qtl, amount: r2(qtl*rate)};
}
/* weighment maths for a purchase */
function purchaseCalc(b){
  const gross = r2(num(b.gross)), rate = num(b.rate);
  const cutKg = cutKgOf(b.grain), deduction = r2(gross * cutKg / 100);   // kg per quintal, rounded to the nearest kg
  const net = r2(gross - deduction);
  const amount = r2(net * rate);
  const dk = gross > 0 ? dharamKata(vehicleOf(b)) : 0;
  const labourQtl = net > 0 ? Math.floor(net + 0.5) : 0;  // x.5 and above goes up
  const labourRate = labourRateOf(b), labour = r2(labourQtl * labourRate);
  const discount = r2(num(b.discount));
  return {gross, cutKg, deduction, net, rate, amount, discount, dk, labourQtl, labourRate, labour, final: amount > 0 ? r2(amount - discount - dk - labour) : 0};
}
function payStatus(b, final, received, balance){
  if (b.status === 'draft') return 'draft';
  if (final > 0 && balance <= 0.004) return 'paid';
  if (b.dueDate && b.dueDate < todayISO()) return 'overdue';
  if (received > 0) return 'partial';
  return 'unpaid';
}
function calc(b){
  const kind = kindOf(b);
  if (kind === 'gpurchase'){
    const p = purchaseCalc(b), pays = b.payments || [];
    const received = r2(pays.reduce((t,x) => t + num(x.amount), 0));
    const advance = r2(pays.filter(x => x.advance).reduce((t,x) => t + num(x.amount), 0));
    const balance = r2(p.final - received);
    return Object.assign(p, {items:[], bags:0, qtl:p.net, sgst:0, cgst:0, igst:0, freight:0, received, advance, balance, status:payStatus(b, p.final, received, balance)});
  }
  const items = itemsOf(b).map(it => Object.assign({}, it, itemCalc(it, kind)));
  const bags = items.reduce((t,i) => t + i.bags, 0);
  const qtl = r2(items.reduce((t,i) => t + i.qtl, 0));
  const amount = r2(items.reduce((t,i) => t + i.amount, 0));
  const discount = r2(num(b.discount)), taxable = r2(amount - discount);   // GST is on the amount after discount
  const sgst = num(b.sgst), cgst = num(b.cgst), igst = num(b.igst), freight = num(b.freight);
  const final = r2(taxable + sgst + cgst + igst + freight);
  const pays = b.payments || [];
  const received = r2(pays.reduce((t,p) => t + num(p.amount), 0));
  const advance = r2(pays.filter(p => p.advance).reduce((t,p) => t + num(p.amount), 0));
  const balance = r2(final - received);
  return {items, bags, qtl, amount, discount, taxable, sgst, cgst, igst, freight, final, received, advance, balance, status:payStatus(b, final, received, balance)};
}
const STATUS_LABEL = {paid:'Paid', partial:'Partly paid', unpaid:'Unpaid', overdue:'Overdue', draft:'Not finished'};
const warnIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
function pill(st){ return '<span class="pill '+st+'">'+(st==='overdue'?warnIcon:'')+STATUS_LABEL[st]+'</span>'; }

/* ---------- state ---------- */
const S = { bills:new Map(), customers:{}, cq:'', view:'loading', currentId:null, justMade:false, filter:{q:'', st:'all'}, gfilter:{q:'', st:'all', k:'all'}, form:null, formDirty:false, errors:{}, downloads:null };
const listOf = (b) => isGrain(b) ? 'glist' : 'list';
async function saveBill(b){ b.updatedAt = new Date().toISOString(); S.bills.set(b.id, b); await persist(); }
async function deleteBill(id){ S.bills.delete(id); await persist(); }

/* ---------- toast ---------- */
let toastT;
function toast(msg, ms){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3200); }

/* ---------- navigation ---------- */
function go(view, id){
  S.view = view; S.currentId = id ?? null;
  if (view !== 'bill') S.justMade = false;
  render(); window.scrollTo(0,0);
}
function render(){
  if (S.view === 'gate' || S.view === 'loading') return;
  $('#footerSlot').innerHTML = '';
  let tab = 'bills';
  if (S.view === 'customers' || S.view === 'ledger') tab = 'cust';
  else if (S.view === 'glist') tab = 'grain';
  else if (S.view === 'form') tab = S.form && isGrain(S.form) ? 'grain' : 'bills';
  else if (S.view === 'bill') tab = isGrain(S.bills.get(S.currentId)) ? 'grain' : 'bills';
  ['bills','grain','cust'].forEach(t => { const el = $('#tab-'+t); if (el) el.setAttribute('aria-current', t === tab ? 'page' : 'false'); });
  if (S.view === 'form') renderForm();
  else if (S.view === 'bill') renderBill();
  else if (S.view === 'customers') renderCustomers();
  else if (S.view === 'ledger') renderLedger();
  else if (S.view === 'glist') renderGrainList();
  else renderList();
}

/* ================= BILLS LIST ================= */
function sortedBills(){
  return [...S.bills.values()].sort((a,b) => {
    if ((a.status==='draft') !== (b.status==='draft')) return a.status==='draft' ? -1 : 1;
    return (b.date||'').localeCompare(a.date||'') || noSeq(b.invNo) - noSeq(a.invNo);
  });
}
/* long lists show the newest rows first, a page at a time; search and filters still look at every bill */
const PAGE = 150;
const pageRows = (rows, key, cols, grain) => {
  const lim = S[key] || PAGE, shown = rows.slice(0, lim);
  return shown.map(b => rowHTML(b, grain)).join('') +
    (rows.length > lim ? '<tr class="more"><td colspan="'+cols+'"><button class="btn small" type="button" data-more="'+key+'">Show '+Math.min(PAGE, rows.length - lim)+' more · '+(rows.length - lim)+' not shown</button></td></tr>' : '');
};
const wireMore = (again) => document.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { S[b.dataset.more] = (S[b.dataset.more] || PAGE) + PAGE; const y = window.scrollY; again(); window.scrollTo(0, y); });
function renderList(){
  const all = sortedBills().filter(b => !isGrain(b));
  const q = S.filter.q.trim().toLowerCase();
  const rows = all.filter(b => {
    const c = calc(b);
    if (S.filter.st !== 'all' && c.status !== S.filter.st) return false;
    if (q && !((b.party||'').toLowerCase().includes(q) || (b.invNo||'').includes(q) || String(b.bookNo||'').toLowerCase().includes(q) || (b.mobile||'').includes(q) || (b.location||'').toLowerCase().includes(q))) return false;
    return true;
  });
  const chips = ['all','overdue','unpaid','partial','paid','draft'].map(k =>
    '<button type="button" class="chip" data-st="'+k+'" aria-pressed="'+(S.filter.st===k)+'">'+(k==='all'?'All':STATUS_LABEL[k])+'</button>').join('');
  $('#view').innerHTML =
  '<div class="head"><div><h1>Aata bills</h1><p class="sub">Every bill you make is added to the Aata sale statement.</p></div>'+
  '<div class="acts">'+(S.downloads ? '<button class="btn" type="button" id="xlsx">Download Aata sale statement</button><button class="btn link" type="button" id="xlsxM">Download master statement</button>' : '')+'<button class="btn primary" type="button" id="newBill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New bill</button></div></div>'+
  '<div class="filters"><label for="q" class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search bills</label>'+
  '<input id="q" class="search" type="search" placeholder="Search by customer, mobile, bill no. or book no." value="'+esc(S.filter.q)+'"><div class="chips" role="group" aria-label="Filter by status">'+chips+'</div></div>'+
  '<div class="tablebox"><table class="list"><thead><tr><th>Bill no.</th><th>Book no.</th><th>Date</th><th>Customer</th><th class="r">Bill amount ₹</th><th class="r">Still to pay ₹</th><th>Due date</th><th>Status</th><th><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Actions</span></th></tr></thead><tbody>'+
  (rows.length ? pageRows(rows, 'limA', 9) : '<tr><td colspan="9" class="empty">'+(all.length ? 'No bills match this filter.' : 'No bills yet. Use New bill to make the first one.')+'</td></tr>')+
  '</tbody></table></div>';
  $('#newBill').onclick = () => openForm(null);
  if ($('#xlsx')) $('#xlsx').onclick = (e) => downloadXLSX(e, 'aata');
  if ($('#xlsxM')) $('#xlsxM').onclick = (e) => downloadXLSX(e, 'master');
  $('#q').oninput = (e) => { S.filter.q = e.target.value; const pos = e.target.selectionStart; renderList(); const qi = $('#q'); qi.focus(); qi.setSelectionRange(pos,pos); };
  document.querySelectorAll('.chip').forEach(ch => ch.onclick = () => { S.filter.st = ch.dataset.st; S.limA = 0; renderList(); });
  wireRowActs(); wireMore(renderList);
}
function wireRowActs(){
  document.querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.id, act = btn.dataset.act;
    if (act==='finish') openForm(id);
    else if (act==='pay') openPay(id);
    else if (act==='view') go('bill', id);
    else if (act==='pdf') downloadPDF(S.bills.get(id), btn);
    else if (act==='del') askDelete(id);
    else if (act==='book') openBookNo(id);
  });
}
function rowHTML(b, grainCols){
  const c = calc(b);
  let due = b.dueDate ? dmy(b.dueDate) : '—';
  if (c.status==='overdue') due += ' · '+daysBetween(b.dueDate, todayISO())+' days late';
  let acts = '';
  if (c.status==='draft'){
    acts = '<button class="btn small primary" type="button" data-act="finish" data-id="'+b.id+'">Continue</button><button class="btn link" type="button" data-act="del" data-id="'+b.id+'">Delete</button>';
  } else {
    acts += '<button class="btn small" type="button" data-act="view" data-id="'+b.id+'">Open '+(kindOf(b)==='gpurchase' ? 'slip' : 'bill')+'</button>';
    if (c.balance > 0) acts += '<button class="btn link" type="button" data-act="pay" data-id="'+b.id+'">Mark paid</button>';
  }
  const types = kindOf(b) === 'gpurchase' ? buyType(b) : b.grain === 'wheat' ? [...new Set((b.items||[]).map(itemType).filter(Boolean))].join(', ') : '';
  const gc = grainCols ? '<td>'+esc(grainName(b.grain))+(types ? ' <span class="sub2">'+esc(types)+'</span>' : '')+'</td>'+
    '<td><span class="kindtag '+kindOf(b)+'">'+KIND_WORD[kindOf(b)]+'</span></td>' : '';
  return '<tr class="'+(c.status==='overdue'?'overdue':'')+(c.status==='draft'?' draft':'')+'">'+
    '<td class="num">'+(b.invNo ? esc(b.invNo) : '—')+'</td>'+
    '<td>'+(b.bookNo ? '<button class="bookno" type="button" data-act="book" data-id="'+b.id+'" aria-label="Book no. '+esc(b.bookNo)+', change">'+esc(b.bookNo)+'</button>'
                     : '<button class="bookno add" type="button" data-act="book" data-id="'+b.id+'">+ Add</button>')+'</td>'+
    '<td>'+esc(dmy(b.date))+'</td>'+gc+'<td>'+esc(b.party||'Untitled draft')+(b.mobile ? '<span class="partymob num">'+esc(b.mobile)+'</span>' : '')+'</td>'+
    '<td class="r num">'+(c.status==='draft'?'—':inr(c.final))+'</td><td class="r num">'+(c.status==='draft'?'—':inr(Math.max(0,c.balance)))+'</td>'+
    '<td>'+esc(due)+'</td><td>'+pill(c.status)+'</td><td><div class="acts">'+acts+'</div></td></tr>';
}

/* ================= GRAINS LIST ================= */
function renderGrainList(){
  const F = S.gfilter, all = sortedBills().filter(isGrain);
  const q = F.q.trim().toLowerCase();
  const rows = all.filter(b => {
    if (F.k !== 'all' && kindOf(b) !== F.k) return false;
    if (F.st !== 'all' && calc(b).status !== F.st) return false;
    if (q && !((b.party||'').toLowerCase().includes(q) || (b.invNo||'').toLowerCase().includes(q) || String(b.bookNo||'').toLowerCase().includes(q) || (b.mobile||'').includes(q) || (b.location||'').toLowerCase().includes(q) || grainName(b.grain).toLowerCase().includes(q))) return false;
    return true;
  });
  const kinds = [['all','All'],['gsale','Sales'],['gpurchase','Purchases']].map(k =>
    '<button type="button" class="chip" data-gk="'+k[0]+'" aria-pressed="'+(F.k===k[0])+'">'+k[1]+'</button>').join('');
  const chips = ['all','overdue','unpaid','partial','paid','draft'].map(k =>
    '<button type="button" class="chip" data-st="'+k+'" aria-pressed="'+(F.st===k)+'">'+(k==='all'?'Any status':STATUS_LABEL[k])+'</button>').join('');
  $('#view').innerHTML =
  '<div class="head"><div><h1>Grains</h1><p class="sub">Wheat, tewda, chana, soybean and dhan (purchase only). Sales go to the grain sale statement and purchases to the grain purchase statement, with a tab for each grain.</p></div>'+
  '<div class="acts">'+(S.downloads ? '<button class="btn" type="button" id="gxS">Download grain sale statement</button><button class="btn" type="button" id="gxP">Download grain purchase statement</button><button class="btn link" type="button" id="gxM">Download master statement</button>' : '')+
  '<button class="btn primary" type="button" id="newGrain"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New bill</button></div></div>'+
  '<div class="filters"><label for="q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search grain entries</label>'+
  '<input id="q" class="search" type="search" placeholder="Search by party, mobile, grain, no. or book no." value="'+esc(F.q)+'">'+
  '<div class="chips" role="group" aria-label="Sales or purchases">'+kinds+'</div><div class="chips" role="group" aria-label="Filter by status">'+chips+'</div></div>'+
  '<div class="tablebox"><table class="list"><thead><tr><th>No.</th><th>Book no.</th><th>Date</th><th>Grain</th><th>Type</th><th>Party</th><th class="r">Amount ₹</th><th class="r">Still to pay ₹</th><th>Due date</th><th>Status</th><th><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Actions</span></th></tr></thead><tbody>'+
  (rows.length ? pageRows(rows, 'limG', 11, true) : '<tr><td colspan="11" class="empty">'+(all.length ? 'Nothing matches this filter.' : 'No grain sales or purchases yet. Use New bill to make the first one.')+'</td></tr>')+
  '</tbody></table></div>';
  $('#newGrain').onclick = () => openGrainChooser({});
  if ($('#gxS')) $('#gxS').onclick = (e) => downloadXLSX(e, 'gsale');
  if ($('#gxP')) $('#gxP').onclick = (e) => downloadXLSX(e, 'gpurchase');
  if ($('#gxM')) $('#gxM').onclick = (e) => downloadXLSX(e, 'master');
  $('#q').oninput = (e) => { F.q = e.target.value; const pos = e.target.selectionStart; renderGrainList(); const qi = $('#q'); qi.focus(); qi.setSelectionRange(pos,pos); };
  document.querySelectorAll('[data-gk]').forEach(ch => ch.onclick = () => { F.k = ch.dataset.gk; renderGrainList(); });
  document.querySelectorAll('[data-st]').forEach(ch => ch.onclick = () => { F.st = ch.dataset.st; S.limG = 0; renderGrainList(); });
  wireRowActs(); wireMore(renderGrainList);
}
/* step 1 of a grain entry: which grain, then sale or purchase */
function openGrainChooser(prefill, onPick){
  let g = prefill.grain || '', k = prefill.kind || '';
  openDialog('<h2 id="dlgT">'+(onPick ? 'Change grain or bill type' : 'New grain bill')+'</h2>'+
    '<fieldset class="pick"><legend>1. Which grain?</legend><div class="pickrow">'+Object.keys(GRAINS).map(x =>
      '<button type="button" class="pickbtn" data-g="'+x+'" aria-pressed="'+(g===x)+'"><b>'+GRAINS[x].en+'</b><span class="deva">'+GRAINS[x].hi+'</span></button>').join('')+'</div></fieldset>'+
    '<fieldset class="pick"><legend>2. Sale or purchase?</legend><div class="pickrow two">'+
      '<button type="button" class="pickbtn" data-k="gsale" aria-pressed="'+(k==='gsale')+'"><b>Sale</b><span>We sell to a customer · invoice</span></button>'+
      '<button type="button" class="pickbtn" data-k="gpurchase" aria-pressed="'+(k==='gpurchase')+'"><b>Purchase</b><span>We buy from a seller · purchase slip</span></button></div><p class="hint" id="gNote" hidden></p></fieldset>'+
    '<p class="err" id="gErr" hidden></p>'+
    '<div class="btns"><button class="btn" type="button" id="gCancel">Cancel</button><button class="btn primary" type="button" id="gGo">Continue</button></div>');
  const sync = () => {
    const buyOnly = GRAINS[g] && GRAINS[g].buyOnly;
    if (buyOnly && k === 'gsale') k = '';
    document.querySelectorAll('[data-g]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === g)));
    document.querySelectorAll('[data-k]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.k === k)); b.disabled = !!(buyOnly && b.dataset.k === 'gsale'); });
    const n = $('#gNote'); if (n){ n.hidden = !buyOnly; n.textContent = buyOnly ? grainName(g)+' is only bought, so it has purchase slips only.' : ''; }
  };
  document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { g = b.dataset.g; $('#gErr').hidden = true; sync(); });
  document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { k = b.dataset.k; $('#gErr').hidden = true; sync(); });
  sync();
  $('#gCancel').onclick = closeDialog;
  $('#gGo').onclick = () => {
    if (!g || !k){ const e = $('#gErr'); e.textContent = !g ? 'Choose the grain.' : 'Choose sale or purchase.'; e.hidden = false; return; }
    closeDialog();
    if (onPick) onPick(g, k);
    else openForm(null, Object.assign({}, prefill, {grain:g, kind:k}));
  };
}

/* delete a finished bill made by mistake: keeps a backup copy first, then removes the bill, its payments and its PDF */
function askDeleteBill(id){
  const b = S.bills.get(id), c = calc(b), P = kindOf(b) === 'gpurchase';
  const what = P ? 'purchase slip '+b.invNo : kindOf(b) === 'gsale' ? 'grain sale '+b.invNo : 'bill no. '+b.invNo;
  const pays = (b.payments||[]).length;
  const isLast = nextInvNo(kindOf(b)) === NO_PREFIX[kindOf(b)] + pad(noSeq(b.invNo) + 1);
  openDialog('<h2 id="dlgT">Delete '+esc(what)+'?</h2>'+
    '<p class="note" style="font-size:15px">'+esc(b.party)+' · ₹'+inr(c.final)+' · '+esc(dmy(b.date))+'</p>'+
    '<ul class="dellist"><li>The '+(P ? 'slip' : 'bill')+' and its PDF are removed, and it comes off the Excel statement and the party’s ledger.</li>'+
    (pays ? '<li>'+(pays === 1 ? 'Its payment' : 'Its '+pays+' payments')+' (₹'+inr(c.received)+') '+(pays === 1 ? 'is' : 'are')+' removed too.</li>' : '')+
    '<li>'+(isLast ? 'The number '+esc(b.invNo)+' will be used again for the next one.' : 'The number '+esc(b.invNo)+' is left unused, so there will be a gap in the numbers.')+'</li>'+
    '<li>A copy of all bills is saved in the Backups folder first, in case you need it back.</li></ul>'+
    '<div class="btns"><button class="btn" type="button" id="dCancel">Keep it</button><button class="btn danger" type="button" id="dOk">Delete '+(P ? 'slip' : 'bill')+'</button></div>');
  $('#dCancel').onclick = closeDialog;
  $('#dOk').onclick = async () => {
    const btn = $('#dOk'); btn.disabled = true;
    try { if (FS.dir) await dailyBackup(payload(), true); }
    catch(e){ btn.disabled = false; toast('Couldn’t save a backup copy, so nothing was deleted. Try again.'); return; }
    try { await deleteBill(id); } catch(e){ btn.disabled = false; return; }
    try { const d = await FS.dir.getDirectoryHandle(INVOICE_DIR); await d.removeEntry(invoiceFile(b)); } catch(e){}
    closeDialog(); toast(what.charAt(0).toUpperCase()+what.slice(1)+' deleted'); go(listOf(b));
  };
}

/* account book number: written against one bill, any time after it's made */
function openBookNo(id){
  const b = S.bills.get(id); if (!b) return;
  const what = kindOf(b) === 'gpurchase' ? 'purchase '+b.invNo : kindOf(b) === 'gsale' ? 'grain sale '+b.invNo : b.invNo ? 'bill no. '+b.invNo : 'this draft';
  openDialog('<h2 id="dlgT">Book no. for '+esc(what)+'</h2>'+
    '<p class="note" style="font-size:14px">'+esc(b.party||'Untitled draft')+(b.date ? ' · '+esc(dmy(b.date)) : '')+'</p>'+
    '<div class="field"><label for="bkNo">Account book number</label><input id="bkNo" type="text" maxlength="40" value="'+esc(b.bookNo||'')+'" placeholder="e.g. 12/245" aria-describedby="bkHint"><p class="hint" id="bkHint">Saved with this bill only. Leave it empty to remove it.</p></div>'+
    '<div class="btns"><button class="btn" type="button" id="bkCancel">Cancel</button><button class="btn primary" type="button" id="bkSave">Save book no.</button></div>');
  const inp = $('#bkNo'); inp.focus(); inp.select();
  const save = async () => {
    const v = inp.value.trim();
    if (v === String(b.bookNo||'')){ closeDialog(); return; }
    const nb = JSON.parse(JSON.stringify(b)); if (v) nb.bookNo = v; else delete nb.bookNo;
    try { await saveBill(nb); } catch(e){ return; }
    closeDialog(); toast(v ? 'Book no. '+v+' saved' : 'Book no. removed'); render();
  };
  $('#bkCancel').onclick = closeDialog; $('#bkSave').onclick = save;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); save(); } });
}

/* delete draft confirmation (built into the page) */
function askDelete(id){
  const b = S.bills.get(id);
  openDialog('<h2 id="dlgT">Delete this draft?</h2><p class="note" style="font-size:15px">'+esc(b.party||'Untitled draft')+' will be removed. This can’t be undone.</p>'+
   '<div class="btns"><button class="btn" type="button" id="dCancel">Keep draft</button><button class="btn primary" type="button" id="dOk">Delete draft</button></div>');
  $('#dCancel').onclick = closeDialog;
  $('#dOk').onclick = async () => { closeDialog(); await deleteBill(id); toast('Draft deleted'); render(); };
}

/* ================= FORM ================= */
const SECTIONS = [
  {id:'party', title:'1. Customer', fields:[
    {k:'date', label:'Bill date', type:'date', req:true},
    {k:'mobile', label:'Mobile no.', type:'mobile', ph:'10 digits', hint:'Customers you’ve billed before fill in by themselves.'},
    {k:'party', label:'Customer name and address', req:true, wide:true, ph:'e.g. Shri Balaji Laghu Udyog, Bhopal'},
    {k:'location', label:'Location', ph:'City or town'},
    {k:'gst', label:'GST No.', ph:'Leave blank if they don’t have one'}]},
  {id:'goods', title:'2. Goods', items:true, fields:[
    {k:'discount', label:'Discount (₹)', type:'num', ph:'0', hint:'Taken off the goods amount, before GST. Leave blank if none.'},
    {k:'taxable', label:'Amount after discount (₹)', auto:true}]},
  {id:'tax', title:'3. GST & freight', tax:true, note:'Optional. GST is worked out for you from the amount.', fields:[
    {k:'sgst', label:'SGST 2.5% (₹)', type:'num', ph:'0'},
    {k:'cgst', label:'CGST 2.5% (₹)', type:'num', ph:'0'},
    {k:'igst', label:'IGST 5% (₹)', type:'num', ph:'0'},
    {k:'freight', label:'Freight (₹)', type:'num', ph:'0', hint:'Added to the bill total'}]},
  {id:'pay', title:'4. Payment', note:'An advance is printed on the invoice and taken off the total.', fields:[
    {k:'dueDate', label:'Payment due by', type:'date', quick:true},
    {k:'advance', label:'Advance received (₹)', type:'num', ph:'0', hint:'Leave blank if nothing is paid yet'},
    {k:'advMode', label:'Payment mode', type:'select', options:PAY_MODES.map(m => [m, m]), hint:'How the advance was paid'}]},
  {id:'transport', title:'5. Transport details', optional:true, note:'Printed at the bottom of the bill and kept in the sale statement. Fill in only what you have.', fields:[
    {k:'stationFrom', label:'Station from'}, {k:'stationTo', label:'Station to'},
    {k:'truckNo', label:'Truck no.'}, {k:'biltiNo', label:'Bilti no.'},
    {k:'transporter', label:'Transporter name'}, {k:'gatePass', label:'Gate pass no.'},
    {k:'driverName', label:'Driver name'}, {k:'driverNo', label:'Driver no.', type:'tel'},
    {k:'saudaNo', label:'Sauda no.'}, {k:'saudaAgent', label:'Sauda agent'},
    {k:'frieghtNote', label:'Freight note', ph:'e.g. Nil'}]}
];
/* a grain purchase: the seller, the weighment, and what we pay them */
const P_SECTIONS = [
  {id:'party', title:'1. Seller', fields:[
    {k:'date', label:'Purchase date', type:'date', req:true},
    {k:'mobile', label:'Mobile no.', type:'mobile', ph:'10 digits', hint:'Parties you’ve dealt with before fill in by themselves.'},
    {k:'party', label:'Seller name and address', req:true, wide:true, ph:'e.g. Ramesh Patel, Berasia'},
    {k:'location', label:'Location', ph:'Village or town'}]},
  {id:'weigh', title:'2. Weighment', weigh:true, note:'300 g per quintal, dharam kata and labour are taken off for you.', fields:[]},
  {id:'pay', title:'3. Payment to seller', note:'What you pay now is printed on the slip and taken off the amount payable.', fields:[
    {k:'dueDate', label:'Pay seller by', type:'date', quick:true},
    {k:'advance', label:'Paid now (₹)', type:'num', ph:'0', hint:'Leave blank if nothing is paid yet'},
    {k:'advMode', label:'Payment mode', type:'select', options:PAY_MODES.map(m => [m, m]), hint:'How it was paid'}]},
  {id:'transport', title:'4. Other details', optional:true, note:'Printed at the bottom of the slip and kept in the purchase statement. Fill in only what you have.', fields:[
    {k:'driverName', label:'Driver name'}, {k:'driverNo', label:'Driver no.', type:'tel'},
    {k:'gatePass', label:'Gate pass no.'}, {k:'saudaNo', label:'Sauda no.'}, {k:'saudaAgent', label:'Sauda agent'}]}
];
function weighFields(f){
  return (f.grain === 'wheat' ? [{k:'wtype', label:'Type of wheat', type:'select', req:true, options:[['','Select']].concat(BUY_TYPES.map(t => [t, t]))}] : [])
    .concat(f.grain === 'wheat' && f.wtype === OTHERS ? [{k:'wtypeOther', label:'Name of the wheat type', req:true, ph:'Type the quality name'}] : []).concat([
    {k:'vehicle', label:'Vehicle', type:'select', req:true, options:[['','Select']].concat(VEHICLES.concat(f.vehicle && !VEHICLES.includes(f.vehicle) ? [f.vehicle] : []).map(v => [v, v])),
      hint:'Dharam kata: Truck ₹100, others ₹60. '+(GRAINS[f.grain] && GRAINS[f.grain].labour ? 'Labour for '+grainName(f.grain).toLowerCase()+': ₹'+GRAINS[f.grain].labour+' per qtl.' : 'Labour: Hydraulic trolley ₹7.5 per qtl, others ₹10.5 per qtl.')},
    {k:'vehicleNo', label:'Vehicle no.', ph:'e.g. MP 04 HE 1234'},
    {k:'gross', label:'Gross weight (quintal)', type:'num', req:true, ph:'e.g. 45.37', hint:'Weight from the dharam kata slip'},
    {k:'deduction', label:'Less '+cutLabel(f.grain)+' per quintal', auto:true},
    {k:'net', label:'Net weight (quintal)', auto:true},
    {k:'rate', label:'Rate per quintal (₹)', type:'num', req:true},
    {k:'pamount', label:'Purchase value (₹)', auto:true},
    {k:'discount', label:'Less discount (₹)', type:'num', ph:'0', hint:'Leave blank if none'},
    {k:'dk', label:'Less dharam kata (₹)', auto:true},
    {k:'labour', label:'Less labour (₹)', auto:true},
    {k:'pfinal', label:'Payable to seller (₹)', auto:true, wide:true}]);
}
function sectionsFor(f){
  const k = kindOf(f);
  if (k === 'gpurchase') return P_SECTIONS.map(s => s.weigh ? Object.assign({}, s, {fields:weighFields(f), note:cutLabel(f.grain)+' per quintal, dharam kata and labour are taken off for you.'}) : s);
  if (k === 'gsale') return SECTIONS.map(s => s.id === 'transport' ? s : s.id === 'goods' ? Object.assign({}, s, {title:'2. Grain'}) : s);
  return SECTIONS;
}

function blankBill(){ return {id:uid(), kind:'aata', status:'draft', invNo:'', date:todayISO(), party:'', gst:'', location:'', mobile:'', items:[blankItem()], gstMode:'', taxEdited:{}, discount:'', sgst:'', cgst:'', igst:'', freight:'', dueDate:'', advance:'', advMode:'Cash', stationFrom:'Sukhi Sevaniya', stationTo:'', truckNo:'', biltiNo:'', transporter:'', gatePass:'', saudaNo:'', saudaAgent:'', driverName:'', driverNo:'', frieghtNote:'', payments:[]}; }
function openForm(id, prefill){
  const src = id ? S.bills.get(id) : null;
  S.form = src ? Object.assign(blankBill(), JSON.parse(JSON.stringify(src))) : Object.assign(blankBill(), prefill || {});
  const f = S.form;
  if (src && !src.kind) f.kind = 'aata';
  setupItems(f, src);
  if (src && src.status !== 'draft'){
    const adv = (src.payments || []).filter(p => p.advance);
    f.advance = adv.length ? String(r2(adv.reduce((t,p) => t + num(p.amount), 0))) : '';
    f.advMode = adv.length && adv[0].mode ? adv[0].mode : 'Cash';
  }
  if (src && !src.gstMode){
    // bills saved before the GST choice existed: keep whatever tax they already carry
    f.gstMode = num(src.igst) > 0 ? 'inter' : (num(src.sgst) > 0 || num(src.cgst) > 0) ? 'intra' : 'none';
    f.taxEdited = {};
  }
  S.formIsNew = !src; S.formDirty = false; S.errors = {}; S.matchDismissed = '';
  S.parties = partyIndex(f.id);
  go('form');
}
/* items to match the entry type: aata bags, grain quantities, or none for a purchase (one weighment) */
function setupItems(f, src){
  const k = kindOf(f);
  if (k === 'aata'){
    f.items = itemsOf(src || f).map(it => Object.assign(blankItem(), JSON.parse(JSON.stringify(it)), {id: it.id && it.id !== 'i0' ? it.id : uid()}, {prod: isChapad(it) || it.desc === PRODUCTS.chapad.desc ? 'chapad' : 'aata'}));
    ['desc','hsn','bags','size','bagKg','rate','taxOn','paidNow'].forEach(x => delete f[x]);
  } else if (k === 'gsale'){
    const its = (src && src.kind === 'gsale' ? src.items : f.items) || [];
    const ok = its.filter(it => 'qty' in it);
    f.items = ok.length ? ok.map(it => Object.assign(gBlankItem(f.grain), JSON.parse(JSON.stringify(it)))) : [gBlankItem(f.grain)];
    f.items.forEach(it => { normPick(it, 'type', SELL_TYPES); normPick(it, 'brand', BRANDS);
      // wheat bags saved before the size choice: 30 kg unless another weight was used
      if (f.grain === 'wheat' && !it.size) it.size = !it.bagKg || num(it.bagKg) === WHEAT_BAG_KG ? '30kg' : 'other';
      if (f.grain === 'wheat' && it.size === '30kg') it.bagKg = String(WHEAT_BAG_KG);
      // an "Others" line saved with bags before it became loose: carry its weight over as quintals
      if (f.grain === 'wheat' && looseWheat(it) && num(it.bags) > 0 && !num(it.qty)){ it.qty = String(Math.round(num(it.bags) * (num(it.bagKg) || WHEAT_BAG_KG)) / 100); it.bags = ''; } });
    ['wtype','wtypeOther','vehicle','vehicleNo','gross','rate'].forEach(x => delete f[x]);
  } else {
    f.items = [];
    ['wtype','vehicle','vehicleNo','gross','rate'].forEach(x => { if (f[x] === undefined) f[x] = ''; });
    f.vehicle = vehicleOf(f); delete f.labourRate;
    normPick(f, 'wtype', BUY_TYPES);
  }
}
/* the grain or sale/purchase changed on a new entry or draft */
function changeGrain(g, k){
  const f = S.form, wasKind = kindOf(f), wasGrain = f.grain;
  f.grain = g; f.kind = k;
  if (k === 'gsale'){
    if (wasKind !== 'gsale') f.items = [];
    f.items.forEach(it => { if (wasGrain !== g){ it.hsn = GRAINS[g].hsn;
      if (g !== 'wheat'){ it.type = ''; it.typeOther = ''; it.brand = ''; it.brandOther = ''; it.bags = ''; it.bagKg = ''; }
      else { it.size = '30kg'; it.bagKg = String(WHEAT_BAG_KG); it.qty = ''; } } });
  }
  if (k === 'gpurchase' && g !== 'wheat'){ f.wtype = ''; f.wtypeOther = ''; }
  setupItems(f, null);
  if (k === 'gpurchase'){ f.gst = ''; f.gstMode = ''; f.taxEdited = {}; f.sgst = f.cgst = f.igst = f.freight = ''; }
  S.formDirty = true; S.errors = {};
  renderForm(); window.scrollTo(0,0);
}
function leaveForm(next){
  if (S.view !== 'form'){ next(); return; }
  const f = S.form;
  if (f.status === 'draft' && S.formDirty){ saveBill(cleanForSave(f)).then(() => toast('Saved for later'), () => {}); next(); return; }
  if (f.status !== 'draft' && S.formDirty){
    openDialog('<h2 id="dlgT">Leave without saving?</h2><p class="note" style="font-size:15px">Your changes to bill '+esc(f.invNo)+' haven’t been saved.</p>'+
     '<div class="btns"><button class="btn" type="button" id="dStay">Keep editing</button><button class="btn primary" type="button" id="dGo">Discard changes</button></div>');
    $('#dStay').onclick = closeDialog; $('#dGo').onclick = () => { closeDialog(); next(); };
    return;
  }
  next();
}
function cleanForSave(f){
  const b = JSON.parse(JSON.stringify(f));
  ['desc','hsn','bags','size','bagKg','taxOn','paidNow'].concat(kindOf(f) === 'gpurchase' ? [] : ['rate']).forEach(k => delete b[k]);
  if (kindOf(f) === 'gpurchase'){ b.items = []; ['sgst','cgst','igst','freight','gst','gstMode','taxEdited','stationFrom','stationTo','truckNo','biltiNo','transporter','frieghtNote'].forEach(k => delete b[k]); }
  return b;
}
/* the advance typed in the form becomes the bill's advance payment */
function applyAdvance(b, f){
  const amt = num(f.advance);
  const old = (b.payments || []).filter(p => p.advance);
  const rest = (b.payments || []).filter(p => !p.advance);
  b.payments = amt > 0 ? [{amount:amt, date:(old[0] && old[0].date) || todayISO(), mode:f.advMode || 'Cash', advance:true}].concat(rest) : rest;
  delete b.advance; delete b.advMode;
}

function fieldHTML(fd){
  const f = S.form, v = fd.val !== undefined ? fd.val : (f[fd.k] ?? '');
  const lab = '<label for="f-'+fd.k+'">'+esc(fd.label)+(fd.req?' <span class="req" aria-hidden="true">*</span>':'')+'</label>';
  let ctl;
  if (fd.auto) return '<div class="field'+(fd.wide?' wide':'')+'"><span class="flabel" id="l-'+fd.k+'">'+esc(fd.label)+' <span class="autotag">Worked out for you</span></span>'+
    '<output id="f-'+fd.k+'" class="auto" aria-labelledby="l-'+fd.k+'"></output><p class="calcline" id="c-'+fd.k+'" aria-live="polite"></p></div>';
  else if (fd.type==='date') ctl = dateCtl('f-'+fd.k, v, (fd.req?' aria-required="true"':'')+' aria-describedby="h-'+fd.k+' e-'+fd.k+'"');
  else if (fd.type==='mobile') ctl = '<input id="f-'+fd.k+'" type="tel" inputmode="numeric" autocomplete="tel-national" value="'+esc(v)+'" placeholder="'+esc(fd.ph)+'" aria-describedby="h-'+fd.k+' e-'+fd.k+'">';
  else if (fd.type==='select') ctl = '<select id="f-'+fd.k+'" aria-describedby="h-'+fd.k+' e-'+fd.k+'">'+fd.options.map(o => '<option value="'+esc(o[0])+'"'+(o[0]===v?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
  else {
    const t = fd.type==='date' ? 'date' : fd.type==='tel' ? 'tel' : 'text';
    const im = fd.type==='num' ? ' inputmode="decimal"' : fd.type==='tel' ? ' inputmode="tel"' : '';
    const val = v;
    ctl ='<input id="f-'+fd.k+'" type="'+t+'"'+im+' value="'+esc(val)+'"'+(fd.ph?' placeholder="'+esc(fd.ph)+'"':'')+(fd.readonly?' readonly':'')+(fd.req?' aria-required="true"':'')+' aria-describedby="h-'+fd.k+' e-'+fd.k+'">';
  }
  const quick = fd.quick ? '<div class="quick" role="group" aria-label="Quick pick">'+[7,15,30].map(n => '<button type="button" class="chip" data-quick="'+n+'">In '+n+' days</button>').join('')+'</div>' : '';
  const extra = fd.k === 'mobile' ? '<div id="mobileMatch" class="match" hidden></div>' : '';
  return '<div class="field'+(fd.wide?' wide':'')+'">'+lab+ctl+extra+quick+(fd.hint?'<p class="hint" id="h-'+fd.k+'">'+esc(fd.hint)+'</p>':'<span id="h-'+fd.k+'" hidden></span>')+'<p class="err" id="e-'+fd.k+'" hidden></p></div>';
}
/* separate number series: 01, 02… for aata; GS-01… grain sales; GP-01… grain purchases */
const NO_PREFIX = {aata:'', gsale:'GS-', gpurchase:'GP-'};
const noSeq = (no) => parseInt(String(no||'').replace(/\D/g,''), 10) || 0;
function nextInvNo(kind){
  kind = kind || 'aata'; let max = 0;
  S.bills.forEach(b => { if (b.status!=='draft' && kindOf(b) === kind) max = Math.max(max, noSeq(b.invNo)); });
  return NO_PREFIX[kind] + pad(max+1);
}
function grainItemsHTML(){
  const f = S.form, its = f.items, many = its.length > 1, wheat = f.grain === 'wheat';
  return its.map((it, i) => {
    const k = (n) => 'i'+i+'-'+n;
    const F = (fd) => fieldHTML(Object.assign({}, fd, {val: fd.auto ? undefined : (it[fd.n] ?? '')}));
    const bagged = wheat && !looseWheat(it);
    return '<div class="itemcard" data-i="'+i+'">'+
      '<div class="itemhead"><b>'+(many ? 'Item '+(i+1) : 'Item')+' · '+esc(grainName(f.grain))+' <span class="deva">'+esc(GRAINS[f.grain] ? GRAINS[f.grain].hi : '')+'</span></b>'+(many ? '<button class="btn link" type="button" data-remove="'+i+'">Remove item</button>' : '')+'</div>'+
      '<div class="grid">'+
        (wheat ? F({k:k('type'), n:'type', label:'Type of wheat', type:'select', req:true, options:[['','Select']].concat(SELL_TYPES.map(t => [t, t]))}) : '')+
        (wheat && it.type === OTHERS ? F({k:k('typeOther'), n:'typeOther', label:'Name of the wheat type (optional)', ph:'Type the quality name', hint:'Sold loose like the other grains: enter the quantity in quintal.'}) : '')+
        (bagged ? F({k:k('brand'), n:'brand', label:'Brand', type:'select', options:[['','No brand']].concat(BRANDS.map(t => [t, t])), hint:'Listed A to Z'}) : '')+
        (bagged && it.brand === OTHERS ? F({k:k('brandOther'), n:'brandOther', label:'Brand name', req:true, ph:'Type the brand name'}) : '')+
        (bagged
          ? F({k:k('bags'), n:'bags', label:'No. of bags', type:'num', req:true})+
            F({k:k('size'), n:'size', label:'Bag size', type:'select', options:WHEAT_SIZES})+
            (it.size === 'other' ? F({k:k('bagKg'), n:'bagKg', label:'Weight of one bag (kg)', type:'num', req:true, ph:'Type the weight in kg'}) : '')+
            F({k:k('qtl'), label:'Total weight (quintal)', auto:true})
          : F({k:k('qty'), n:'qty', label:'Quantity (quintal)', type:'num', req:true, ph:'e.g. 25.50'}))+
        F({k:k('rate'), n:'rate', label:'Rate per quintal (₹)', type:'num', req:true})+
        F({k:k('amount'), label:'Amount (₹)', auto:true})+
        F({k:k('hsn'), n:'hsn', label:'HSN code'})+
      '</div></div>';
  }).join('') +
  '<div class="itemsfoot">'+(its.length < MAX_ITEMS ? '<button class="btn" type="button" id="addItem">+ Add another item</button>' : '<p class="note">An invoice fits up to '+MAX_ITEMS+' items. Make a second bill for more.</p>')+
  '<p class="itemsum num" id="itemSum" aria-live="polite"></p></div>';
}
function itemsHTML(){
  if (kindOf(S.form) === 'gsale') return grainItemsHTML();
  const its = S.form.items, many = its.length > 1;
  return its.map((it, i) => {
    const k = (n) => 'i'+i+'-'+n;
    const F = (fd) => fieldHTML(Object.assign({}, fd, {val: fd.auto ? undefined : (it[fd.n] ?? '')}));
    return '<div class="itemcard'+(isChapad(it) ? ' chapad' : '')+'" data-i="'+i+'">'+
      '<div class="itemhead"><b>'+(many ? 'Item '+(i+1) : 'Item')+' · '+PRODUCTS[it.prod === 'chapad' ? 'chapad' : 'aata'].label+'</b>'+(many ? '<button class="btn link" type="button" data-remove="'+i+'">Remove item</button>' : '')+'</div>'+
      '<div class="grid">'+
        F({k:k('prod'), n:'prod', label:'Item (description on the bill)', type:'select', req:true, options:Object.keys(PRODUCTS).map(x => [x, PRODUCTS[x].label+' · '+PRODUCTS[x].desc])})+
        F({k:k('bags'), n:'bags', label:'No. of bags', type:'num', req:true})+
        F({k:k('size'), n:'size', label:'Bag size', type:'select', options:SIZES})+
        (it.size === 'LD'
          ? '<div class="field"><span class="flabel">Weight of one bag</span><div class="auto">LD</div></div>'
          : SIZE_KG[it.size]
          ? '<div class="field"><span class="flabel">Weight of one bag</span><div class="auto">'+inr(SIZE_KG[it.size])+' kg</div></div>'
          : F({k:k('bagKg'), n:'bagKg', label:'Weight of one bag (kg)', type:'num', req:true, ph:it.size === 'other' ? 'Type the weight in kg' : '', hint:it.size === 'other' ? 'Total weight is worked out from this' : ''}))+
        F({k:k('qtl'), label:'Total weight (quintal)', auto:true})+
        F({k:k('rate'), n:'rate', label:'Rate per quintal (₹)', type:'num', req:true})+
        F({k:k('amount'), label:'Amount (₹)', auto:true})+
        F({k:k('hsn'), n:'hsn', label:'HSN code'})+
      '</div></div>';
  }).join('') +
  '<div class="itemsfoot">'+(its.length < MAX_ITEMS ? '<button class="btn" type="button" id="addItem">+ Add another item</button>' : '<p class="note">An invoice fits up to '+MAX_ITEMS+' items. Make a second bill for more.</p>')+
  '<p class="itemsum num" id="itemSum" aria-live="polite"></p></div>';
}
function wireItems(){
  const box = $('#itemsBox'), f = S.form;
  if (!box) return;
  const onField = (e) => {
    const m = (e.target.id || '').match(/^f-i(\d+)-(\w+)$/); if (!m) return;
    const i = +m[1], n = m[2], it = f.items[i]; if (!it) return;
    if (e.type === 'change' && e.target.tagName !== 'SELECT') return;
    it[n] = e.target.value; S.formDirty = true;
    if (n === 'type' || n === 'brand'){
      if (n === 'type' && f.grain === 'wheat'){
        if (looseWheat(it)){ it.bags = ''; it.brand = ''; it.brandOther = ''; }
        else { it.qty = ''; if (!it.size){ it.size = '30kg'; it.bagKg = String(WHEAT_BAG_KG); } }
      }
      redrawItems();
      const other = $('#f-i'+i+'-'+n+'Other'), sel = $('#f-i'+i+'-'+n);
      if (it[n] === OTHERS && other) other.focus(); else if (sel) sel.focus();
      return;
    }
    if (n === 'prod'){
      it.desc = PRODUCTS[it.prod].desc;
      if (!it.hsn || Object.values(PRODUCTS).some(x => x.hsn === it.hsn)) it.hsn = PRODUCTS[it.prod].hsn;
      redrawItems(); const sel = $('#f-i'+i+'-prod'); if (sel) sel.focus();
      return;
    }
    if (n === 'size'){
      if (SIZE_KG[it.size]) it.bagKg = String(SIZE_KG[it.size]);
      else if (it.size === 'other') it.bagKg = '';
      delete S.errors['i'+i+'-bagKg'];
      redrawItems();
      const nx = it.size === 'other' ? $('#f-i'+i+'-bagKg') : $('#f-i'+i+'-size'); if (nx) nx.focus();
      return;
    }
    const ek = 'i'+i+'-'+n; if (S.errors[ek]){ delete S.errors[ek]; showErr(ek, ''); }
    updateAutos();
  };
  box.addEventListener('input', onField);
  box.addEventListener('change', onField);
  box.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm){ f.items.splice(+rm.dataset.remove, 1); S.formDirty = true; redrawItems(); toast('Item removed'); return; }
    if (e.target.closest('#addItem')){
      const last = f.items[f.items.length-1], at = f.items.length;
      f.items.push(kindOf(f) === 'gsale' ? gBlankItem(f.grain, last) : blankItem(last)); S.formDirty = true; redrawItems();
      const nb = $('#f-i'+at+'-'+(kindOf(f) === 'gsale' && f.grain !== 'wheat' ? 'qty' : 'bags')); if (nb){ nb.focus(); nb.scrollIntoView({block:'center'}); }
    }
  });
}
function redrawItems(){ Object.keys(S.errors).filter(k => /^i\d+-/.test(k)).forEach(k => delete S.errors[k]); $('#itemsBox').innerHTML = itemsHTML(); updateAutos(); }

/* ---------- mobile: 10-digit check and returning customers ---------- */
/* every saved party (customers and sellers), newest details winning, for the picker and autofill */
function partyIndex(exceptId){
  const map = new Map();
  const add = (key, info, date) => {
    const p = map.get(key) || {key, name:'', mobile:'', location:'', gst:'', last:'', count:0};
    const newer = (date||'') >= p.last;
    ['name','mobile','location','gst'].forEach(k => { const v = String(info[k]||'').trim(); if (v && (newer || !p[k])) p[k] = v; });
    if (date && date > p.last) p.last = date;
    map.set(key, p); return p;
  };
  Object.entries(S.customers).forEach(([key, r]) => add(key, r, ''));
  [...S.bills.values()].filter(b => b.id !== exceptId && b.status !== 'draft' && (b.party||'').trim())
    .sort((a,b) => (a.date||'').localeCompare(b.date||''))
    .forEach(b => { add(custKey(b), {name:b.party, mobile:b.mobile, location:b.location, gst:b.gst}, b.date).count++; });
  return [...map.values()].filter(p => p.name).sort((a,b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
}
function customerByMobile(mob){ return (S.parties || []).find(p => p.mobile === mob) || null; }
function partyMatches(){
  const f = S.form, all = S.parties || [];
  const q = String(f.party||'').trim().toLowerCase(), m = String(f.mobile||'').trim();
  if (!q && !m) return {list:all.slice(0, 6), recent:true};
  const words = q.split(/\s+/).filter(Boolean);
  const list = all.filter(p => (m && p.mobile.startsWith(m)) || (words.length && words.every(w => (p.name+' '+p.location).toLowerCase().includes(w))));
  return {list:list.slice(0, 8), recent:false};
}
function renderPartyPick(){
  const box = $('#partyPick'); if (!box) return;
  const f = S.form, P = kindOf(f) === 'gpurchase', {list, recent} = partyMatches();
  const chosen = (p) => p.name === String(f.party||'').trim() && p.mobile === String(f.mobile||'').trim();
  box.innerHTML = '<div class="pphead"><b>Saved parties</b><span>'+(recent ? 'Recent · type a name or mobile to search' : list.length ? 'Click one to fill in the details' : 'No saved party matches')+'</span></div>'+
    (list.length ? '<ul>'+list.map(p => '<li><button type="button" class="ppitem'+(chosen(p) ? ' on' : '')+'" data-pk="'+esc(p.key)+'"'+(chosen(p) ? ' aria-pressed="true"' : '')+'>'+
      '<b>'+esc(p.name)+'</b><span class="num">'+esc(p.mobile || 'No mobile')+'</span>'+(p.location ? '<span>'+esc(p.location)+'</span>' : '')+
      (p.last ? '<span class="pplast">Last '+(p.count === 1 ? 'entry' : 'of '+p.count+' entries')+' · '+esc(dmy(p.last))+'</span>' : '<span class="pplast">Old dues only</span>')+'</button></li>').join('')+'</ul>'
      : '<p class="note">'+(P ? 'A new seller is saved when you create this slip.' : 'A new customer is saved when you create this bill.')+'</p>');
  box.querySelectorAll('[data-pk]').forEach(btn => btn.onclick = () => {
    const p = (S.parties||[]).find(x => x.key === btn.dataset.pk); if (!p) return;
    f.mobile = p.mobile || ''; const mel = $('#f-mobile'); if (mel) mel.value = f.mobile;
    fillCustomer(p); mobileStatus();
  });
}
function mobileStatus(){
  const f = S.form, el = $('#f-mobile'), h = $('#h-mobile'), box = $('#mobileMatch');
  if (!el) return;
  const d = f.mobile || '';
  if (h){
    h.hidden = false;
    h.className = 'hint' + (d.length === 10 ? ' ok' : d ? ' warn' : '');
    h.textContent = !d ? (kindOf(f) === 'gpurchase' ? 'Parties you’ve dealt with before fill in by themselves.' : 'Customers you’ve billed before fill in by themselves.') : d.length === 10 ? '✓ 10 digits' : d.length+' of 10 digits';
  }
  if (!box) return;
  const hit = d.length === 10 ? customerByMobile(d) : null;
  if (!hit || S.matchDismissed === d){ if (!(S.matchDismissed === d && box.classList.contains('done'))) box.hidden = true; return; }
  const same = (f.party||'').trim() === hit.name && (f.location||'') === (hit.location||'') && (f.gst||'') === (hit.gst||'');
  if (same){ box.hidden = true; return; }
  const empty = !(f.party||'').trim() && !(f.location||'').trim() && !(f.gst||'').trim();
  if (empty){ fillCustomer(hit); return; }
  box.hidden = false;
  box.className = 'match';
  box.innerHTML = '<span>This number is saved for <b>'+esc(hit.name)+'</b>.</span> <button class="btn small" type="button" id="useMatch">Use their details</button> <button class="btn link" type="button" id="noMatch">No thanks</button>';
  $('#useMatch').onclick = () => fillCustomer(hit);
  $('#noMatch').onclick = () => { S.matchDismissed = d; box.hidden = true; };
}
function fillCustomer(p){
  const f = S.form, from = {party:p.name, location:p.location, gst:p.gst};
  ['party','location','gst'].forEach(k => { f[k] = from[k] || ''; const el = $('#f-'+k); if (el) el.value = f[k]; if (S.errors[k]){ delete S.errors[k]; showErr(k,''); } });
  if (f.mobile && S.errors.mobile){ delete S.errors.mobile; showErr('mobile',''); }
  S.formDirty = true; S.matchDismissed = f.mobile;
  const box = $('#mobileMatch');
  if (box){ box.hidden = false; box.className = 'match done'; box.innerHTML = '✓ Filled in '+esc(p.name)+(p.last ? ' from their last entry ('+esc(dmy(p.last))+')' : '')+'. Change anything that’s different.'; }
  renderPartyPick(); updateAutos();
}
/* typed a saved party's exact name: bring in their location (and GST / mobile) if those are still empty */
function autofillByName(){
  const f = S.form, n = String(f.party||'').trim().toLowerCase(); if (!n) return;
  const p = (S.parties||[]).find(x => x.name.toLowerCase() === n); if (!p) return;
  let done = false;
  [['location','location'],['gst','gst'],['mobile','mobile']].forEach(([k, pk]) => {
    if (!String(f[k]||'').trim() && p[pk]){ f[k] = p[pk]; const el = $('#f-'+k); if (el) el.value = p[pk]; done = true; }
  });
  if (done){ S.formDirty = true; S.matchDismissed = f.mobile; mobileStatus(); renderPartyPick(); toast('Filled in the saved details for '+p.name); }
}
function renderForm(){
  const f = S.form, kind = kindOf(f), SECS = sectionsFor(f);
  const isFinal = f.status !== 'draft';
  const secs = SECS.map(s => {
    const fields = s.fields.filter(fd => !(fd.newOnly && isFinal));
    if (s.tax){
      const opts = [['none','No GST'],['intra','SGST + CGST (in M.P.)'],['inter','IGST (outside M.P.)']];
      return '<section class="sec" aria-labelledby="s-'+s.id+'"><div class="sechead"><h2 id="s-'+s.id+'">'+s.title+'</h2></div><p class="secnote">'+s.note+'</p>'+
        '<fieldset class="gstmode"><legend>GST on this bill</legend><div class="seg">'+opts.map(o =>
          '<label class="segopt"><input type="radio" name="gstMode" value="'+o[0]+'"> <span>'+o[1]+'</span></label>').join('')+'</div>'+
        '<p class="hint" id="gstWhy"></p></fieldset>'+
        '<div class="grid">'+fields.map(fieldHTML).join('')+'</div>'+
        '<div id="gstResetWrap" hidden><button class="btn small" type="button" id="gstReset">Work out GST again</button></div></section>';
    }
    if (s.items){
      return '<section class="sec" aria-labelledby="s-'+s.id+'"><div class="sechead"><h2 id="s-'+s.id+'">'+s.title+'</h2></div>'+
        '<div id="itemsBox" class="items">'+itemsHTML()+'</div>'+
        (fields.length ? '<div class="grid discrow">'+fields.map(fieldHTML).join('')+'</div>' : '')+'</section>';
    }
    if (s.optional){
      const filled = fields.some(fd => fd.k !== 'stationFrom' && String(f[fd.k]||'').trim());
      return '<details class="sec opt"'+(filled?' open':'')+'><summary><span class="sumtitle">'+s.title+'</span><span class="sumnote">Optional</span></summary>'+
        '<p class="secnote">'+s.note+'</p><div class="grid">'+fields.map(fieldHTML).join('')+'</div></details>';
    }
    if (s.id === 'party' && (S.parties||[]).length)
      return '<section class="sec" aria-labelledby="s-'+s.id+'"><div class="sechead"><h2 id="s-'+s.id+'">'+s.title+'</h2></div>'+
        '<div class="partylay"><div class="grid">'+fields.map(fieldHTML).join('')+'</div><aside class="partypick" id="partyPick" aria-label="Saved parties" aria-live="polite"></aside></div></section>';
    return '<section class="sec" aria-labelledby="s-'+s.id+'"><div class="sechead"><h2 id="s-'+s.id+'">'+s.title+'</h2></div>'+(s.note?'<p class="secnote">'+s.note+'</p>':'')+'<div class="grid">'+fields.map(fieldHTML).join('')+'</div></section>';
  }).join('');
  const billNo = f.invNo || nextInvNo(kind);
  const what = kind === 'gsale' ? 'grain sale' : kind === 'gpurchase' ? 'grain purchase' : 'bill';
  const stmt = kind === 'aata' ? 'the Aata sale statement' : 'the '+grainName(f.grain)+' tab of the grain '+(kind === 'gsale' ? 'sale' : 'purchase')+' statement';
  const grainBar = kind === 'aata' ? '' :
    '<div class="grainbar"><span class="kindtag '+kind+'">'+KIND_WORD[kind]+'</span><b>'+esc(grainName(f.grain))+'</b> <span class="deva">'+esc(GRAINS[f.grain] ? GRAINS[f.grain].hi : '')+'</span>'+
    (isFinal ? '' : '<button class="btn link" type="button" id="chgGrain">Change</button>')+'</div>';
  $('#view').innerHTML =
    '<div class="head"><div><button class="btn link" type="button" id="back" style="margin-left:-4px">'+(kind === 'aata' ? '← Back to bills' : '← Back to grains')+'</button>'+
    '<h1>'+(isFinal ? 'Edit '+what+' no. '+esc(f.invNo) : 'New '+what+' · No. '+esc(billNo))+'</h1>'+
    '<p class="sub">'+(isFinal ? 'Saving updates the '+(kind === 'gpurchase' ? 'slip' : 'bill')+' and '+stmt+'.' : 'Fields marked <span class="req">*</span> are needed. Your entry is kept as a draft if you leave.')+'</p>'+grainBar+'</div></div>'+
    '<form class="formcol" id="billForm" novalidate>'+secs+'</form>';
  $('#footerSlot').innerHTML = '<div class="footer"><div class="wrap"><div class="total">'+(kind === 'gpurchase' ? 'Payable to seller' : 'Bill total')+' <b class="num" id="finalOut">₹0</b> <span class="balout num" id="balOut" hidden></span></div><div class="btns">'+
    (isFinal ? '<button class="btn primary" type="button" id="saveFinal">Save changes</button>'
             : '<button class="btn" type="button" id="saveDraft">Save for later</button><button class="btn primary" type="button" id="generate">'+(kind === 'gpurchase' ? 'Create purchase slip' : 'Create bill')+'</button>')+
    '</div></div></div>';
  // wire
  $('#back').onclick = () => leaveForm(() => go(listOf(f)));
  if ($('#chgGrain')) $('#chgGrain').onclick = () => openGrainChooser({grain:f.grain, kind}, changeGrain);
  SECS.forEach(s => s.fields.forEach(fd => {
    if (fd.auto || fd.readonly) return;
    if (fd.type === 'date'){
      wireDate('f-'+fd.k, (iso) => { f[fd.k] = iso || ''; S.formDirty = true; if (S.errors[fd.k] && iso){ delete S.errors[fd.k]; showErr(fd.k, ''); } },
        (bad) => showErr(fd.k, bad ? 'Use DD/MM/YYYY, for example 24/06/2026.' : (S.errors[fd.k] || '')));
      return;
    }
    const el = $('#f-'+fd.k); if (!el) return;
    const ev = fd.type==='select' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      if (fd.type === 'mobile'){ const d = el.value.replace(/\D/g,'').slice(0,10); if (d !== el.value) el.value = d; if (d.length === 10 || !d) showErr('mobile',''); }
      f[fd.k] = el.value; S.formDirty = true;
      if (fd.type === 'mobile'){ if (S.matchDismissed && S.matchDismissed !== el.value) S.matchDismissed = ''; mobileStatus(); }
      if (fd.k==='sgst' || fd.k==='cgst' || fd.k==='igst'){ f.taxEdited = Object.assign({}, f.taxEdited, {[fd.k]: true}); }
      if (fd.k === 'wtype'){ const y = window.scrollY; renderForm(); window.scrollTo(0, y); const nx = $(f.wtype === OTHERS ? '#f-wtypeOther' : '#f-wtype'); if (nx) nx.focus(); return; }
      if (S.errors[fd.k]){ delete S.errors[fd.k]; showErr(fd.k, ''); }
      if (fd.k === 'party' || fd.k === 'mobile') renderPartyPick();
      updateAutos();
    });
    if (fd.k === 'party') el.addEventListener('blur', autofillByName);
    if (fd.type === 'mobile') el.addEventListener('blur', () => {
      const d = el.value;
      if (d && d.length !== 10){ showErr('mobile', 'Mobile number must be 10 digits. You typed '+d.length+'.'); toast('Mobile number has only '+d.length+' digits'); }
      else showErr('mobile', '');
    });
  }));
  document.querySelectorAll('input[name="gstMode"]').forEach(r => r.addEventListener('change', () => {
    f.gstMode = r.value; f.taxEdited = {}; S.formDirty = true; updateAutos();
  }));
  if ($('#gstReset')) $('#gstReset').onclick = () => { f.taxEdited = {}; S.formDirty = true; updateAutos(); toast('GST worked out again from the amount'); };
  document.querySelectorAll('[data-quick]').forEach(ch => ch.onclick = () => {
    const base = f.date ? new Date(f.date+'T00:00:00') : new Date(); base.setDate(base.getDate() + +ch.dataset.quick);
    const iso = base.getFullYear()+'-'+pad(base.getMonth()+1)+'-'+pad(base.getDate());
    f.dueDate = iso; $('#f-dueDate').value = dmy(iso); S.formDirty = true; showErr('dueDate','');
  });
  wireItems();
  mobileStatus();
  renderPartyPick();
  $('#billForm').addEventListener('submit', e => e.preventDefault());
  if (isFinal) $('#saveFinal').onclick = () => submitForm('final');
  else { $('#saveDraft').onclick = () => submitForm('draft'); $('#generate').onclick = () => submitForm('generate'); }
  updateAutos();
}
function gstModeOf(f){
  if (f.gstMode) return {mode:f.gstMode, auto:false};
  const g = (f.gst||'').trim();
  return {mode: !g ? 'none' : g.startsWith('23') ? 'intra' : 'inter', auto:true};
}
function updatePurchaseAutos(){
  const f = S.form, p = purchaseCalc(f);
  const set = (k, v, line) => { const o = $('#f-'+k), c = $('#c-'+k); if (o) o.textContent = v; if (c) c.textContent = line; };
  const kg = (q) => inr(Math.round(q*100))+' kg';
  set('deduction', p.gross ? qtlFmt(p.deduction)+' qtl ('+kg(p.deduction)+')' : '—', p.gross ? qtlFmt(p.gross)+' qtl × '+cutLabel(f.grain)+' = '+kg(p.deduction) : 'Fills in when you enter the gross weight');
  set('net', p.gross ? qtlFmt(p.net)+' qtl' : '—', p.gross ? qtlFmt(p.gross)+' − '+qtlFmt(p.deduction)+' = '+qtlFmt(p.net)+' qtl' : '');
  set('pamount', p.amount ? '₹'+inr(p.amount) : '—', p.amount ? qtlFmt(p.net)+' qtl × ₹'+inr(p.rate)+' = ₹'+inr(p.amount) : 'Fills in when you enter the rate');
  set('dk', p.dk ? '− ₹'+inr(p.dk) : '—', p.gross ? (f.vehicle ? f.vehicle+' = ₹'+p.dk : 'Choose the vehicle') : '');
  set('labour', p.labour ? '− ₹'+inr(p.labour) : '—', p.net ? qtlFmt(p.net)+' qtl rounds to '+p.labourQtl+' qtl × ₹'+p.labourRate+(GRAINS[f.grain] && GRAINS[f.grain].labour ? ' ('+grainName(f.grain)+')' : f.vehicle ? ' ('+f.vehicle+')' : '')+' = ₹'+inr(p.labour) : '');
  set('pfinal', p.final ? '₹'+inr(p.final) : '—', p.amount ? '₹'+inr(p.amount)+(p.discount ? ' − ₹'+inr(p.discount)+' discount' : '')+' − ₹'+inr(p.dk)+' − ₹'+inr(p.labour)+' = ₹'+inr(p.final) : '');
  const adv = num(f.advance);
  const fo = $('#finalOut'); if (fo) fo.textContent = '₹'+inr(p.final);
  const bo = $('#balOut'); if (bo){ bo.hidden = !(adv > 0); bo.textContent = 'Paid now ₹'+inr(adv)+' · Still to pay ₹'+inr(Math.max(0, r2(p.final - adv))); }
}
function updateAutos(){
  const f = S.form;
  if (kindOf(f) === 'gpurchase') return updatePurchaseAutos();
  // GST: fill each tax field from AMOUNT unless the person typed their own figure
  const base = calc(Object.assign({}, f, {sgst:'', cgst:'', igst:'', freight:''}));
  const gm = gstModeOf(f), ed = f.taxEdited || {};
  const want = {
    sgst: gm.mode==='intra' ? String(r2(base.taxable*0.025)) : '',
    cgst: gm.mode==='intra' ? String(r2(base.taxable*0.025)) : '',
    igst: gm.mode==='inter' ? String(r2(base.taxable*0.05)) : ''
  };
  ['sgst','cgst','igst'].forEach(k => {
    if (ed[k]) return;
    f[k] = base.taxable > 0 ? want[k] : '';
    const el = $('#f-'+k); if (el && document.activeElement !== el) el.value = f[k];
  });
  document.querySelectorAll('input[name="gstMode"]').forEach(r => { r.checked = r.value === gm.mode; });
  const why = $('#gstWhy');
  if (why) why.textContent = gm.auto
    ? (gm.mode==='none' ? 'No GST No. for this customer, so no GST is added.' : gm.mode==='intra' ? 'Chosen for you: the customer’s GST No. is from M.P.' : 'Chosen for you: the customer’s GST No. is from outside M.P.')
    : '';
  const rw = $('#gstResetWrap'); if (rw) rw.hidden = !Object.keys(ed).length;

  const c = calc(f);
  { const o = $('#f-taxable'), cl = $('#c-taxable');
    if (o) o.textContent = c.amount ? '₹'+inr(c.taxable) : '—';
    if (cl) cl.textContent = c.amount ? (c.discount ? '₹'+inr(c.amount)+' − ₹'+inr(c.discount)+' = ₹'+inr(c.taxable) : 'No discount') : 'Fills in when you enter the goods'; }
  if (kindOf(f) === 'gsale'){
    c.items.forEach((it, i) => {
      const q = $('#f-i'+i+'-qtl'), cq = $('#c-i'+i+'-qtl');
      if (q) q.textContent = it.qtl ? qtlFmt(it.qtl)+' qtl' : '—';
      if (cq) cq.textContent = it.bags ? inr(it.bags)+' bags × '+inr(it.kg)+' kg = '+inr(r2(it.bags*it.kg))+' kg ÷ 100 = '+qtlFmt(it.qtl)+' qtl' : 'Fills in when you enter the bags';
      const a = $('#f-i'+i+'-amount'), ca = $('#c-i'+i+'-amount');
      if (a) a.textContent = it.amount ? '₹'+inr(it.amount) : '—';
      if (ca) ca.textContent = (it.qtl && it.rate) ? qtlFmt(it.qtl)+' qtl × ₹'+inr(it.rate)+' = ₹'+inr(it.amount) : 'Fills in when you enter '+(f.grain === 'wheat' ? 'bags' : 'quantity')+' and rate';
    });
    const sum = $('#itemSum');
    if (sum) sum.textContent = c.items.length > 1 ? 'All items: '+(c.bags ? inr(c.bags)+' bags · ' : '')+qtlFmt(c.qtl)+' qtl · ₹'+inr(c.amount) : '';
    const adv = num(f.advance);
    const fo = $('#finalOut'); if (fo) fo.textContent = '₹'+inr(c.final);
    const bo = $('#balOut'); if (bo){ bo.hidden = !(adv > 0); bo.textContent = 'Advance ₹'+inr(adv)+' · Balance ₹'+inr(Math.max(0, r2(c.final - adv))); }
    return;
  }
  c.items.forEach((it, i) => {
    const q = $('#f-i'+i+'-qtl'), a = $('#f-i'+i+'-amount'), cq = $('#c-i'+i+'-qtl'), ca = $('#c-i'+i+'-amount');
    const ld = it.size === 'LD' && it.kg === LD_PACK*LD_KG;
    if (q) q.textContent = it.qtl ? qtlFmt(it.qtl)+' qtl' : '—';
    if (a) a.textContent = it.amount ? '₹'+inr(it.amount) : '—';
    if (cq) cq.textContent = (it.bags && it.kg)
      ? (ld ? inr(it.bags)+' bags of LD = '+qtlFmt(it.qtl)+' qtl' : inr(it.bags)+' bags × '+inr(it.kg)+' kg = '+inr(r2(it.bags*it.kg))+' kg ÷ 100 = '+qtlFmt(it.qtl)+' qtl')
      : 'Fills in when you enter bags and bag weight';
    if (ca) ca.textContent = (it.qtl && it.rate) ? qtlFmt(it.qtl)+' qtl × ₹'+inr(it.rate)+' = ₹'+inr(it.amount) : 'Fills in when you enter the rate';
  });
  const sum = $('#itemSum');
  if (sum){
    const ch = c.items.filter(isChapad), aa = c.items.filter(x => !isChapad(x));
    const part = (xs) => inr(xs.reduce((t,x) => t + x.bags, 0))+' bags · '+qtlFmt(xs.reduce((t,x) => t + x.qtl, 0))+' qtl · ₹'+inr(xs.reduce((t,x) => t + x.amount, 0));
    sum.textContent = ch.length ? 'Aata: '+part(aa)+'   +   Chapad: '+part(ch)+'   =   ₹'+inr(c.amount) : c.items.length > 1 ? 'All items: '+inr(c.bags)+' bags · '+qtlFmt(c.qtl)+' qtl · ₹'+inr(c.amount) : '';
  }
  const adv = num(f.advance);
  const fo = $('#finalOut'); if (fo) fo.textContent = '₹'+inr(c.final);
  const bo = $('#balOut'); if (bo){ bo.hidden = !(adv > 0); bo.textContent = 'Advance ₹'+inr(adv)+' · Balance ₹'+inr(Math.max(0, r2(c.final - adv))); }
}

/* ---------- date field: typed DD/MM/YYYY or picked from a small calendar ---------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const calIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
function dateCtl(id, iso, extra){
  return '<div class="datefield"><input id="'+id+'" type="text" inputmode="numeric" autocomplete="off" placeholder="DD/MM/YYYY" value="'+esc(dmy(iso))+'"'+(extra||'')+'>'+
    '<button type="button" class="calbtn" data-cal="'+id+'" aria-label="Open calendar" aria-haspopup="dialog" aria-expanded="false">'+calIcon+'</button>'+
    '<div class="calpop" id="cal-'+id+'" role="dialog" aria-label="Choose a date" hidden></div></div>';
}
function wireDate(id, onPick, onBad){
  const inp = $('#'+id), btn = document.querySelector('[data-cal="'+id+'"]'), pop = $('#cal-'+id);
  if (!inp) return;
  let vy, vm;
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded','false'); };
  const draw = () => {
    const sel = parseDMY(inp.value), today = todayISO();
    const startDow = (new Date(vy, vm, 1).getDay() + 6) % 7, days = new Date(vy, vm+1, 0).getDate();
    let cells = ''; for (let i = 0; i < startDow; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++){
      const iso = vy+'-'+pad(vm+1)+'-'+pad(d);
      cells += '<button type="button" class="calday'+(iso===sel?' sel':'')+(iso===today?' today':'')+'" data-d="'+iso+'" aria-label="'+d+' '+MONTHS[vm]+' '+vy+'"'+(iso===sel?' aria-pressed="true"':'')+'>'+d+'</button>';
    }
    pop.innerHTML = '<div class="calhead"><button type="button" class="calnav" data-nav="-1" aria-label="Previous month">‹</button><b>'+MONTHS[vm]+' '+vy+'</b><button type="button" class="calnav" data-nav="1" aria-label="Next month">›</button></div>'+
      '<div class="calgrid">'+['Mo','Tu','We','Th','Fr','Sa','Su'].map(x => '<span class="dow">'+x+'</span>').join('')+cells+'</div>'+
      '<div class="calfoot"><button type="button" class="btn link" data-today="1">Today</button></div>';
  };
  btn.addEventListener('click', () => {
    if (!pop.hidden){ close(); return; }
    document.querySelectorAll('.calpop:not([hidden])').forEach(p => { p.hidden = true; });
    const iso = parseDMY(inp.value) || todayISO(); vy = +iso.slice(0,4); vm = +iso.slice(5,7) - 1;
    draw(); pop.hidden = false; btn.setAttribute('aria-expanded','true');
    const focusEl = pop.querySelector('.calday.sel') || pop.querySelector('.calday.today') || pop.querySelector('.calday'); if (focusEl) focusEl.focus();
  });
  pop.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.nav){ vm += +t.dataset.nav; if (vm < 0){ vm = 11; vy--; } if (vm > 11){ vm = 0; vy++; } draw(); return; }
    const iso = t.dataset.d || (t.dataset.today ? todayISO() : null);
    if (iso){ inp.value = dmy(iso); close(); btn.focus(); onPick(iso); if (onBad) onBad(false); }
  });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ e.stopPropagation(); close(); btn.focus(); } });
  inp.addEventListener('input', () => { const iso = parseDMY(inp.value); onPick(iso || ''); if (iso && onBad) onBad(false); });
  inp.addEventListener('blur', () => { const v = inp.value.trim(), iso = parseDMY(v); if (iso) inp.value = dmy(iso); if (onBad) onBad(!!v && !iso); });
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.calpop:not([hidden])').forEach(p => {
    if (!p.parentElement.contains(e.target)){ p.hidden = true; const b = p.parentElement.querySelector('.calbtn'); if (b) b.setAttribute('aria-expanded','false'); }
  });
});
function showErr(k, msg){
  const el = $('#f-'+k), e = $('#e-'+k); if (!e) return;
  e.textContent = msg; e.hidden = !msg; if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
function validate(){
  const f = S.form, errs = {};
  if (!f.date) errs.date = 'Enter the bill date as DD/MM/YYYY.';
  if (f.mobile && !/^\d{10}$/.test(f.mobile)) errs.mobile = 'Mobile number must be 10 digits. You typed '+f.mobile.length+'.';
  const kind = kindOf(f);
  if (!f.party.trim()) errs.party = kind === 'gpurchase' ? 'Enter the seller’s name and address.' : 'Enter the customer’s name and address.';
  if (kind === 'gpurchase'){
    if (f.grain === 'wheat' && !f.wtype) errs.wtype = 'Choose the type of wheat.';
    if (f.grain === 'wheat' && f.wtype === OTHERS && !String(f.wtypeOther||'').trim()) errs.wtypeOther = 'Type the name of the wheat type.';
    if (!f.vehicle) errs.vehicle = 'Choose the vehicle, so the dharam kata charge is right.';
    if (!(num(f.gross) > 0)) errs.gross = 'Enter the gross weight in quintal.';
    if (!(num(f.rate) > 0)) errs.rate = 'Enter the rate per quintal.';
  } else f.items.forEach((it, i) => {
    if (kind === 'gsale'){
      if (f.grain === 'wheat' && !it.type) errs['i'+i+'-type'] = 'Choose the type of wheat.';
      if (f.grain === 'wheat' && !looseWheat(it) && it.brand === OTHERS && !String(it.brandOther||'').trim()) errs['i'+i+'-brandOther'] = 'Type the brand name.';
      if (f.grain === 'wheat' && !looseWheat(it)){
        if (!(num(it.bags) > 0)) errs['i'+i+'-bags'] = 'Enter the number of bags.';
        if (it.size === 'other' && !(num(it.bagKg) > 0)) errs['i'+i+'-bagKg'] = 'Enter the weight of one bag in kg.';
      }
      else if (!(num(it.qty) > 0)) errs['i'+i+'-qty'] = 'Enter the quantity in quintal.';
    } else {
      if (!(num(it.bags) > 0)) errs['i'+i+'-bags'] = 'Enter the number of bags.';
      if (!(num(it.bagKg) > 0)) errs['i'+i+'-bagKg'] = 'Enter the weight of one bag in kg.';
    }
    if (!(num(it.rate) > 0)) errs['i'+i+'-rate'] = 'Enter the rate per quintal.';
  });
  const dueEl = $('#f-dueDate'); if (dueEl && dueEl.value.trim() && !f.dueDate) errs.dueDate = 'Use DD/MM/YYYY, for example 24/06/2026.';
  const c = calc(f), later = r2(c.received - c.advance);
  if (num(f.advance) + later > c.final + 0.004 && c.final > 0) errs.advance = 'That’s more than the '+(kind === 'gpurchase' ? 'amount payable' : 'bill total')+' of ₹'+inr(c.final)+'.';
  if (num(f.discount) < 0) errs.discount = 'Enter the discount as a positive amount.';
  else if (c.amount > 0 && num(f.discount) >= c.amount) errs.discount = 'The discount is more than the goods amount of ₹'+inr(c.amount)+'.';
  if (kind === 'gpurchase' && c.amount > 0 && c.final <= 0) errs.rate = 'After dharam kata and labour nothing is left to pay. Check the weight and rate.';
  return errs;
}
async function submitForm(kind){
  const f = S.form;
  if (kind === 'draft'){
    try { await saveBill(cleanForSave(f)); } catch(e){ return; }
    S.formDirty = false; toast('Saved for later'); go(listOf(f)); return;
  }
  Object.keys(S.errors).forEach(k => showErr(k, ''));
  S.errors = validate();
  const keys = Object.keys(S.errors);
  if (keys.length){
    keys.forEach(k => showErr(k, S.errors[k]));
    const first = $('#f-'+keys[0]); if (first){ first.focus(); first.scrollIntoView({block:'center'}); }
    toast(keys.length === 1 ? 'One field needs attention' : keys.length+' fields need attention');
    return;
  }
  const b = cleanForSave(f);
  if (kind === 'generate'){ b.status = 'final'; b.invNo = b.invNo || nextInvNo(kindOf(b));
    b.createdAt = new Date().toISOString(); }
  applyAdvance(b, f);
  try { await saveBill(b); } catch(e){ return; }
  saveInvoicePdf(b).catch(() => {});
  S.formDirty = false; S.justMade = kind === 'generate';
  if (kind === 'final') toast('Bill '+b.invNo+' saved');
  go('bill', b.id);
}

/* ================= BILL VIEW ================= */
const INV_W = 560, INV_H = 1416, FILL_BASE = 420;
/* name and address as typed, plus the location when the address doesn't already say it */
function partyLine(b){
  const name = String(b.party||'').trim(), loc = String(b.location||'').trim();
  if (!loc || name.toLowerCase().includes(loc.toLowerCase())) return name;
  return name ? name.replace(/[,\s]+$/, '')+', '+loc : loc;
}
function invoiceHTML(b){
  const kind = kindOf(b), c = calc(b), has = c.bags > 0;
  const m2 = (n) => Number.isInteger(r2(n)) ? inr(n) : (Math.round(n*100)/100).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
  const tx = (v) => v ? m2(v) : '';
  const advLabel = (b.payments||[]).filter(p => p.advance).map(p => p.mode).filter(Boolean)[0];
  let cols, head, body, nRows, taxes, tot, foot, ncol, extraH = 0;
  if (kind === 'gpurchase'){
    ncol = 5;
    cols = [22, 0, 70, 70, 122];
    head = '<th>No.</th><th>Particulars</th><th class="nb">Quantity<br>(qtl)</th><th>Rate</th><th>Amount</th>';
    const desc = grainDesc(b.grain, buyType(b)) || grainName(b.grain);
    body = (c.gross ? '<tr class="item"><td class="c">1</td><td>'+esc(desc)+' <span class="sm">Gross weight</span></td><td class="c">'+qtlFmt(c.gross)+'</td><td></td><td></td></tr>'+
      '<tr class="item"><td></td><td><span class="sm">Less '+cutLabel(b.grain)+' per qtl</span></td><td class="c">− '+qtlFmt(c.deduction)+'</td><td></td><td></td></tr>'+
      '<tr class="item"><td></td><td><span class="sm">Net weight</span></td><td class="c">'+qtlFmt(c.net)+'</td><td class="rt">'+(c.rate?m2(c.rate):'')+'</td><td class="rt">'+(c.amount?m2(c.amount):'')+'</td></tr>' : '');
    nRows = c.gross ? 3 : 0;
    taxes = (c.discount ? [['Discount', '− '+m2(c.discount)]] : []).concat([['Dharam kata', c.dk ? '− '+m2(c.dk) : ''], ['Labour'+(c.labourQtl ? '<br><span class="am">'+c.labourQtl+' qtl @ '+c.labourRate+'</span>' : ''), c.labour ? '− '+m2(c.labour) : '']]);
    tot = '<tr class="tot"><td></td><td style="font-family:var(--font-paper);font-weight:400;font-size:13px;text-align:right">Net payable</td><td>'+(c.net?qtlFmt(c.net):'')+'</td><td style="font-family:var(--font-paper);color:var(--ink)">Total</td><td class="rt">'+(c.final?m2(c.final)+'/-':'')+'</td></tr>';
    foot = [
      ['Vehicle :', vehicleOf(b)], ['Gross Wt. :', c.gross ? qtlFmt(c.gross)+' qtl' : ''], ['Driver Name :', b.driverName],
      ['Vehicle No. :', b.vehicleNo], ['Net Wt. :', c.net ? qtlFmt(c.net)+' qtl' : ''], ['Driver No. :', b.driverNo],
      ['Gate pass No. :', b.gatePass], ['Sauda No. :', b.saudaNo], ['Sauda Agent :', b.saudaAgent]
    ];
  } else if (kind === 'gsale' && b.grain !== 'wheat'){
    ncol = 6;
    cols = [22, 0, 46, 70, 66, 122];
    head = '<th>No.</th><th>Description of Goods</th><th class="hsn">HSN<br>code</th><th class="nb">Quantity<br>(qtl)</th><th>Rate</th><th>Amount</th>';
    const rows = c.items.filter(it => it.qty || it.rate);
    // long descriptions wrap: allow ~24 characters a line, 22px per extra line
    const descs = rows.map(it => grainDesc(b.grain, itemType(it), itemBrand(it, b.grain)));
    extraH = descs.reduce((t, d) => t + Math.max(0, Math.ceil(d.length / 24) - 1) * 22, 0);
    const small = extraH > 120;   // many long lines: a smaller size keeps the page on one slip
    if (small) extraH = descs.reduce((t, d) => t + Math.max(0, Math.ceil(d.length / 30) - 1) * 19, 0);
    body = rows.map((it, i) => '<tr class="item"><td class="c">'+(i+1)+'</td><td'+(small ? ' style="font-size:14px;line-height:1.2"' : '')+'>'+esc(descs[i])+'</td><td class="c">'+esc(it.hsn)+'</td><td class="c">'+(it.qtl?qtlFmt(it.qtl):'')+'</td><td class="rt">'+(it.rate?m2(it.rate):'')+'</td><td class="rt">'+(it.amount?m2(it.amount):'')+'</td></tr>').join('');
    nRows = rows.length;
    taxes = (c.discount ? [['Less discount', '− '+m2(c.discount)]] : []).concat([['+SGST',tx(c.sgst)],['+CGST',tx(c.cgst)],['+IGST',tx(c.igst)],['add frieght',tx(c.freight)]]);
    tot = '<tr class="tot"><td></td><td></td><td></td><td>'+(c.qtl?qtlFmt(c.qtl):'')+'</td><td style="font-family:var(--font-paper);color:var(--ink)">Total</td><td class="rt">'+(c.final?m2(c.final)+'/-':'')+'</td></tr>';
  } else {
    ncol = 8;
    cols = [22, 0, 40, 46, 52, 62, 58, 122];
    head = '<th>No.</th><th>Description of Goods</th><th class="hsn">HSN<br>code</th><th class="nb">No. of Bags</th><th>Weight</th><th class="nb">Quantity<br>(qtl)</th><th>Rate</th><th>Amount</th>';
    // Aata, and wheat sold in 30 kg bags: the same columns
    const wheat = kind === 'gsale';
    const rows = c.items.filter(it => it.bags || it.rate || it.qty || (it.desc && c.items.length > 1));
    const desc = (it) => wheat ? grainDesc(b.grain, itemType(it), itemBrand(it, b.grain)) : it.desc;
    body = rows.map((it, i) => '<tr class="item"><td class="c">'+(i+1)+'</td><td'+(wheat ? ' class="wdesc"' : '')+'>'+esc(desc(it))+'</td><td class="c">'+esc(it.hsn)+'</td><td class="c">'+(it.bags?inr(it.bags):'')+'</td><td class="c">'+(it.size === 'LD' ? 'LD' : it.kg ? inr(it.kg)+' kg' : '')+'</td><td class="c">'+(it.qtl?qtlFmt(it.qtl):'')+'</td><td class="rt">'+(it.rate?m2(it.rate):'')+'</td><td class="rt">'+(it.amount?m2(it.amount):'')+'</td></tr>').join('');
    nRows = rows.length;
    taxes = (c.discount ? [['Less discount', '− '+m2(c.discount)]] : []).concat([['+SGST',tx(c.sgst)],['+CGST',tx(c.cgst)],['+IGST',tx(c.igst)],['add frieght',tx(c.freight)]]);
    tot = '<tr class="tot"><td></td><td></td><td></td><td>'+(has?inr(c.bags):'')+'</td><td class="deva" style="font-size:10px">'+(has?'बोरी':'')+'</td><td>'+(has?qtlFmt(c.qtl):'')+'</td><td style="font-family:var(--font-paper);color:var(--ink)">Total</td><td class="rt">'+(c.final?m2(c.final)+'/-':'')+'</td></tr>';
  }
  if (!foot) foot = [
    ['Station From :', b.stationFrom], ['Truck No. :', b.truckNo], ['Driver Name :', b.driverName],
    ['Station To :', b.stationTo], ['', ''], ['Driver No. :', b.driverNo],
    ['Gate pass No. :', b.gatePass], ['Bilti No. :', b.biltiNo], ['Weight :', c.qtl ? qtlFmt(c.qtl)+' qtl' : ''],
    ['Sauda No. :', b.saudaNo], ['Transporter Name :', b.transporter], ['Frieght :', b.frieghtNote],
    ['Sauda Agent :', b.saudaAgent], ['', ''], ['', '']
  ];
  const advRows = c.advance > 0 ? 2 : 0;
  const footRows = Math.ceil(foot.length/3);
  // keep the address band at the bottom whatever the number of rows
  const filler = Math.max(20, FILL_BASE - extraH - nRows*36 - advRows*32 + (4 - taxes.length)*30 + (5 - footRows)*24 + (kind === 'gpurchase' ? 24 : 0));
  const blankCells = '<td></td>'.repeat(ncol - 2);
  const purchase = kind === 'gpurchase';
  return '<div class="inv">'+
  '<div class="band l"></div><div class="band r"></div><div class="wm">DEO RATAN AGRO</div>'+
  '<div class="top"><div class="om">ॐ</div><div class="juris">Subject to Bhopal Jurisdiction</div><div class="co">DEO RATAN AGRO FOODS PVT. LTD.</div><div class="tagline">Grain Sortex &amp; Warehouse</div></div>'+
  '<div class="ids"><div><span>GST : 23AAICD0341C1ZF</span><span>PAN No. : AAICD0341C</span></div><div><span>Mo. : 94254 31531, 88392 71822</span><span>Mail id : deoratanagro@gmail.com</span></div></div>'+
  '<div class="ti">'+(purchase ? 'Purchase Slip' : 'Estimate/Invoice')+'</div>'+
  '<div class="partyblk"><div style="display:flex;gap:12px"><div class="ln" style="flex:1">'+(purchase ? 'Slip No. :' : 'Invoice No. :')+'<span class="fill">'+esc(b.invNo)+'</span></div><div class="ln" style="width:170px">Dated :<span class="fill">'+esc(dmy(b.date))+'</span></div></div>'+
  '<div class="ln">'+(purchase ? 'Seller Name :' : 'Party Name :')+' <span class="ms">M/s</span><span class="fill">'+esc(partyLine(b))+'</span></div>'+
  (purchase ? '<div class="ln" style="width:380px">Mobile No. :<span class="fill">'+esc(b.mobile)+'</span></div>'
            : '<div style="display:flex;gap:12px"><div class="ln" style="flex:1">GST No. :<span class="fill">'+esc(b.gst)+'</span></div><div class="ln" style="width:170px">Mo. :<span class="fill">'+esc(b.mobile)+'</span></div></div>')+'</div>'+
  '<div class="tbl"><table><colgroup>'+cols.map(w => w ? '<col style="width:'+w+'px">' : '<col>').join('')+'</colgroup>'+
  '<thead><tr>'+head+'</tr></thead><tbody>'+
  body+
  '<tr class="fill"><td style="height:'+filler+'px"></td>'+'<td></td>'.repeat(ncol-1)+'</tr>'+
  taxes.map(t => '<tr class="tax">'+blankCells+'<td class="lbl">'+t[0]+'</td><td class="ul"><div>'+t[1]+'</div></td></tr>').join('')+
  tot+
  (advRows ? '<tr class="adv">'+blankCells+'<td class="lbl">'+(purchase ? 'Paid' : 'Advance')+(advLabel ? '<br><span class="am">'+esc(advLabel.replace(/ \(.*\)/,''))+'</span>' : '')+'</td><td class="rt">− '+m2(c.advance)+'</td></tr>'+
             '<tr class="adv bal">'+blankCells+'<td class="lbl" style="font-weight:700">Balance</td><td class="rt">'+m2(Math.max(0, r2(c.final - c.advance)))+'/-</td></tr>' : '')+
  '</tbody></table></div>'+
  // long values (a truck no. like "MP04 GA 7788") print a size smaller so they stay on one line
  '<div class="foot">'+foot.map(x => '<div><span>'+x[0]+'</span><b'+(String(x[1]||'').length > 9 ? ' class="long"' : '')+'>'+esc(x[1])+'</b></div>').join('')+'</div>'+
  '<div class="bank"><div></div><div class="sign"><div class="l"></div><div class="n">में देव रतन एग्रो फ़ूड</div></div></div>'+
  '<div class="addr">Near Bhawya Metro City, Mungaliya Kot, Sukhisewania, BHOPAL (M.P.)</div>'+
  '</div>';
}
/* the blank space in the table is sized by estimate; after drawing, take any overflow out of it so the address band stays on the slip */
function fitInvoice(inv){
  if (!inv) return;
  const fill = inv.querySelector('tr.fill td'), addr = inv.querySelector('.addr'); if (!fill || !addr) return;
  const over = addr.getBoundingClientRect().bottom + 22 - inv.getBoundingClientRect().bottom;
  if (over > 0.5) fill.style.height = Math.max(10, fill.getBoundingClientRect().height - over - 1) + 'px';
}
function renderBill(){
  const b = S.bills.get(S.currentId);
  if (!b){ go('list'); return; }
  const c = calc(b), kind = kindOf(b), P = kind === 'gpurchase';
  const pays = (b.payments||[]).map(p => '<li><span class="num">₹'+inr(num(p.amount))+'</span> · '+esc(dmy(p.date))+(p.mode ? ' · '+esc(p.mode) : '')+(p.advance ? (P ? ' · paid at purchase' : ' · advance') : '')+'</li>').join('');
  const title = kind === 'gsale' ? 'Grain sale no. ' : P ? 'Purchase no. ' : 'Bill no. ';
  const stmt = kind === 'aata' ? 'the Aata sale statement' : 'the '+grainName(b.grain)+' tab of the grain '+(kind === 'gsale' ? 'sale' : 'purchase')+' statement';
  const doc = P ? 'slip' : 'bill';
  $('#view').innerHTML =
    '<div class="head"><div><button class="btn link" type="button" id="back" style="margin-left:-4px">'+(kind === 'aata' ? '← Back to bills' : '← Back to grains')+'</button>'+
    '<h1>'+title+esc(b.invNo)+'</h1><p class="sub">'+(kind === 'aata' ? '' : esc(grainName(b.grain))+' · ')+esc(b.party)+' · '+esc(dmy(b.date))+'</p></div>'+pill(c.status)+'</div>'+
    (S.justMade ? '<div class="banner" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><b>'+(P ? 'Purchase slip created' : 'Bill created')+'</b><span>and added to '+stmt+'.</span></div>' : '')+
    '<div class="billview"><div class="paperbox">'+invoiceHTML(b)+'</div>'+
    '<aside>'+
      (S.downloads ? '<button class="btn primary" type="button" id="pdf">Download '+doc+' (PDF)</button><p class="note">Prints 3 copies on one A4 page, ready to cut.</p>'
                   : '<p class="note">Downloads aren’t available in this view.</p>')+
      '<div class="card"><div class="row"><span>'+(P ? 'Payable to seller' : 'Bill amount')+'</span><span class="num">₹'+inr(c.final)+'</span></div>'+
      '<div class="row"><span>'+(P ? 'Paid' : 'Received')+'</span><span class="num">₹'+inr(c.received)+'</span></div>'+
      '<div class="row big"><span>Still to pay</span><span class="num">₹'+inr(Math.max(0,c.balance))+'</span></div>'+
      '<div class="row"><span>'+(P ? 'Pay by' : 'Due date')+'</span><span>'+(b.dueDate?esc(dmy(b.dueDate)):'—')+'</span></div>'+
      '<div class="row"><span>Book no.</span><button class="bookno'+(b.bookNo ? '' : ' add')+'" type="button" id="bookNo">'+(b.bookNo ? esc(b.bookNo) : '+ Add')+'</button></div>'+
      (pays ? '<ul class="paylog" aria-label="Payments">'+pays+'</ul>' : '')+
      (c.balance > 0 ? '<button class="btn" type="button" id="pay">Mark paid</button>' : '')+'</div>'+
      '<button class="btn" type="button" id="edit">Edit '+doc+'</button>'+
      '<button class="btn" type="button" id="toLedger">Party ledger</button>'+
      '<button class="btn link danger" type="button" id="delBill">Delete this '+doc+'</button>'+
    '</aside></div>';
  fitInvoice($('.paperbox .inv'));
  $('#back').onclick = () => go(listOf(b));
  if ($('#pdf')) $('#pdf').onclick = (e) => downloadPDF(b, e.currentTarget);
  if ($('#pay')) $('#pay').onclick = () => openPay(b.id);
  $('#edit').onclick = () => openForm(b.id);
  $('#toLedger').onclick = () => go('ledger', custKey(b));
  $('#delBill').onclick = () => askDeleteBill(b.id);
  $('#bookNo').onclick = () => openBookNo(b.id);
}

/* ================= MARK PAID ================= */
function openPay(id){
  const b = S.bills.get(id), c = calc(b), P = kindOf(b) === 'gpurchase';
  openDialog(
    '<h2 id="dlgT">'+(P ? 'Payment to seller · purchase no. ' : 'Payment for bill no. ')+esc(b.invNo)+'</h2>'+
    '<div class="card" style="padding:12px 14px;gap:6px"><div class="row"><span>'+esc(b.party)+'</span></div>'+
    '<div class="row"><span>'+(P ? 'Payable to seller' : 'Bill amount')+'</span><span class="num">₹'+inr(c.final)+'</span></div>'+
    '<div class="row"><span>'+(P ? 'Already paid' : 'Already received')+'</span><span class="num">₹'+inr(c.received)+'</span></div></div>'+
    '<div class="dgrid"><div class="field"><label for="pAmt">How much paid (₹)</label><input id="pAmt" type="text" inputmode="decimal" value="'+inr(c.balance).replace(/,/g,'')+'" aria-describedby="pErr"></div>'+
    '<div class="field"><span style="font-size:14px;font-weight:600" id="remL">Still to pay (₹)</span><div class="remain num" id="pRem" aria-labelledby="remL" aria-live="polite">0</div></div></div>'+
    '<p class="err" id="pErr" hidden></p>'+
    '<div class="dgrid"><div class="field"><label for="pDate">'+(P ? 'Date paid' : 'Date received')+'</label>'+dateCtl('pDate', todayISO(), '')+'</div>'+
    '<div class="field"><label for="pMode">Payment mode</label><select id="pMode">'+PAY_MODES.map(m => '<option>'+esc(m)+'</option>').join('')+'</select></div></div>'+
    '<div class="btns"><button class="btn" type="button" id="pCancel">Cancel</button><button class="btn primary" type="button" id="pSave">Save payment</button></div>');
  const amt = $('#pAmt'), rem = $('#pRem'), err = $('#pErr');
  const upd = () => { const left = r2(c.balance - num(amt.value)); rem.textContent = inr(Math.max(0,left)); rem.classList.toggle('zero', left <= 0.004);
    if (num(amt.value) > c.balance + 0.004){ err.textContent = 'That’s more than the ₹'+inr(c.balance)+' still due.'; err.hidden = false; amt.setAttribute('aria-invalid','true'); }
    else { err.hidden = true; amt.setAttribute('aria-invalid','false'); } };
  amt.addEventListener('input', upd); upd(); amt.focus(); amt.select();
  let payDate = todayISO(); wireDate('pDate', (iso) => { payDate = iso; });
  $('#pCancel').onclick = closeDialog;
  $('#pSave').onclick = async () => {
    const a = num(amt.value);
    if (!(a > 0)){ err.textContent = 'Enter the amount received.'; err.hidden = false; amt.focus(); return; }
    if (a > c.balance + 0.004){ amt.focus(); return; }
    const nb = JSON.parse(JSON.stringify(b)); nb.payments = (nb.payments||[]).concat([{amount:a, date:payDate || todayISO(), mode:$('#pMode').value}]);
    try { await saveBill(nb); } catch(e){ return; }
    closeDialog(); const left = r2(c.balance - a);
    toast(left <= 0.004 ? (P ? 'Purchase ' : 'Bill ')+b.invNo+' is fully paid' : 'Payment saved · ₹'+inr(left)+' remaining');
    render();
  };
}

/* ---------- dialog shell ---------- */
let lastFocus = null;
function openDialog(inner){
  lastFocus = document.activeElement;
  const s = $('#scrim'); s.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgT">'+inner+'</div>'; s.hidden = false;
  const first = s.querySelector('input,button'); if (first) first.focus();
}
function closeDialog(){ const s = $('#scrim'); s.hidden = true; s.innerHTML = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeDialog(); });
$('#scrim').addEventListener('keydown', e => { if (e.key === 'Escape') closeDialog(); });

/* ================= SALE STATEMENT (Excel) ================= */
/* Every sheet is described by its column names; a row is filled by name, so adding a column can't shift the others. */
const COLS = ['DATE','NAME OF CUSTOMER WITH ADDRESS','LOCATION','MOBILE NO.','ITEM (AATA/ CHAPAD)','NO. OF BAGS','SIZE (LD/ 25kg/ 30kg)','WEIGHT OF ONE BAG (kg)','TOTAL WEIGHT (Quintal)','RATE (₹)','AMOUNT (₹)','DISCOUNT (₹)','SGST @2.5%','CGST @ 2.5%','IGST @ 5%','FINAL AMOUNT (₹)'];
const PAYCOLS = ['INVOICE NO.','BOOK NO.','DUE DATE','AMOUNT RECEIVED (₹)','DATE RECEIVED','BALANCE (₹)','PAYMENT STATUS','PAYMENT MODE'];
const TRANSCOLS = ['STATION FROM','STATION TO','TRUCK NO.','BILTI NO.','TRANSPORTER NAME','GATE PASS NO.','SAUDA NO.','SAUDA AGENT','DRIVER NAME','DRIVER NO.','FREIGHT (₹)','FREIGHT NOTE'];
const TITLE = 'DEO RATAN AGRO FOODS PVT. LTD. SUKHISEWANIA BHOPAL\nWHEAT FLOUR SALE STATEMENT';
const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
function sheetBills(kind, grain){
  return [...S.bills.values()].filter(b => b.status !== 'draft' && kindOf(b) === (kind || 'aata') && (!grain || b.grain === grain)).sort((a,b) => (a.date||'').localeCompare(b.date||'') || noSeq(a.invNo) - noSeq(b.invNo));
}
const payModes = (b) => [...new Set((b.payments||[]).map(p => p.mode).filter(Boolean))].join(', ');
const lastPayDate = (b) => { const l = (b.payments||[]).slice(-1)[0]; return l ? dmy(l.date) : ''; };
/* the cells every sale sheet shares: payment and transport */
function saleCommon(b, c){
  return {'DISCOUNT (₹)':c.discount || '', 'SGST @2.5%':c.sgst, 'CGST @ 2.5%':c.cgst, 'IGST @ 5%':c.igst, 'FINAL AMOUNT (₹)':c.final,
    'INVOICE NO.':b.invNo||'', 'BOOK NO.':b.bookNo||'', 'DUE DATE':dmy(b.dueDate), 'AMOUNT RECEIVED (₹)':c.received, 'DATE RECEIVED':lastPayDate(b), 'BALANCE (₹)':Math.max(0,c.balance),
    'PAYMENT STATUS':STATUS_LABEL[c.status], 'PAYMENT MODE':payModes(b),
    'STATION FROM':b.stationFrom||'', 'STATION TO':b.stationTo||'', 'TRUCK NO.':b.truckNo||'', 'BILTI NO.':b.biltiNo||'', 'TRANSPORTER NAME':b.transporter||'',
    'GATE PASS NO.':b.gatePass||'', 'SAUDA NO.':b.saudaNo||'', 'SAUDA AGENT':b.saudaAgent||'', 'DRIVER NAME':b.driverName||'', 'DRIVER NO.':b.driverNo||'',
    'FREIGHT (₹)':c.freight || '', 'FREIGHT NOTE':b.frieghtNote||''};
}
function aataRows(){
  return sheetBills('aata').map(b => {
    const c = calc(b);
    const its = c.items.filter(it => it.bags || it.rate); if (!its.length) its.push(c.items[0]);
    return {bill:Object.assign({'DATE':dmy(b.date), 'NAME OF CUSTOMER WITH ADDRESS':b.party||'', 'LOCATION':b.location||'', 'MOBILE NO.':b.mobile||''}, saleCommon(b, c)),
      items:its.map(it => ({'ITEM (AATA/ CHAPAD)':isChapad(it) ? 'Chapad' : 'Aata', 'NO. OF BAGS':it.bags, 'SIZE (LD/ 25kg/ 30kg)':sizeLabel(it.size), 'WEIGHT OF ONE BAG (kg)':it.kg, 'TOTAL WEIGHT (Quintal)':it.qtl, 'RATE (₹)':it.rate, 'AMOUNT (₹)':it.amount}))};
  });
}
/* Grain sale: like the Aata sheet, with grain, type, brand and quantity in place of the bag columns */
const GS_COLS = ['DATE','NAME OF CUSTOMER WITH ADDRESS','LOCATION','MOBILE NO.','GRAIN','TYPE','BRAND','NO. OF BAGS','BAG SIZE','WEIGHT OF ONE BAG (kg)','QUANTITY (Quintal)','RATE (₹)','AMOUNT (₹)','DISCOUNT (₹)','SGST @2.5%','CGST @ 2.5%','IGST @ 5%','FINAL AMOUNT (₹)'];
function gsaleRows(grain){
  return sheetBills('gsale', grain).map(b => {
    const c = calc(b);
    const its = c.items.filter(it => it.qty || it.bags || it.rate); if (!its.length) its.push(c.items[0] || {});
    return {bill:Object.assign({'DATE':dmy(b.date), 'NAME OF CUSTOMER WITH ADDRESS':b.party||'', 'LOCATION':b.location||'', 'MOBILE NO.':b.mobile||'', 'GRAIN':grainName(b.grain)}, saleCommon(b, c)),
      items:its.map(it => ({'TYPE':b.grain === 'wheat' ? itemType(it) : '', 'BRAND':itemBrand(it, b.grain), 'NO. OF BAGS':it.bags || '', 'BAG SIZE':it.bags ? (it.size === 'other' ? 'Other' : '30 kg') : '', 'WEIGHT OF ONE BAG (kg)':it.bags ? it.kg : '', 'QUANTITY (Quintal)':it.qtl ?? '', 'RATE (₹)':it.rate ?? '', 'AMOUNT (₹)':it.amount ?? ''}))};
  });
}
/* Grain purchase: one row per purchase, the weighment maths in full */
const GP_COLS = ['DATE','BILL NO.','BOOK NO.','SELLER NAME WITH ADDRESS','LOCATION','MOBILE NO.','GRAIN','TYPE','VEHICLE TYPE','VEHICLE NO.','GROSS WEIGHT (Quintal)','DEDUCTION RATE (kg/qtl)','DEDUCTION (Quintal)','NET WEIGHT (Quintal)','RATE (₹)','AMOUNT (₹)','DISCOUNT (₹)','DHARAM KATA (₹)','LABOUR RATE (₹/qtl)','LABOUR (₹)','FINAL AMOUNT (₹)'];
const GP_PAYCOLS = ['DUE DATE','AMOUNT PAID (₹)','DATE PAID','BALANCE (₹)','PAYMENT STATUS','PAYMENT MODE'];
const GP_OTHER = ['DRIVER NAME','DRIVER NO.','GATE PASS NO.','SAUDA NO.','SAUDA AGENT'];
function gpurchaseRows(grain){
  return sheetBills('gpurchase', grain).map(b => {
    const c = calc(b);
    return {items:[], bill:{'DATE':dmy(b.date), 'BILL NO.':b.invNo||'', 'BOOK NO.':b.bookNo||'', 'SELLER NAME WITH ADDRESS':b.party||'', 'LOCATION':b.location||'', 'MOBILE NO.':b.mobile||'',
      'GRAIN':grainName(b.grain), 'TYPE':buyType(b), 'VEHICLE TYPE':vehicleOf(b), 'VEHICLE NO.':b.vehicleNo||'',
      'GROSS WEIGHT (Quintal)':c.gross, 'DEDUCTION RATE (kg/qtl)':c.cutKg, 'DEDUCTION (Quintal)':c.deduction, 'NET WEIGHT (Quintal)':c.net, 'RATE (₹)':c.rate, 'AMOUNT (₹)':c.amount,
      'DISCOUNT (₹)':c.discount || '', 'DHARAM KATA (₹)':c.dk, 'LABOUR RATE (₹/qtl)':c.labourRate, 'LABOUR (₹)':c.labour, 'FINAL AMOUNT (₹)':c.final,
      'DUE DATE':dmy(b.dueDate), 'AMOUNT PAID (₹)':c.received, 'DATE PAID':lastPayDate(b), 'BALANCE (₹)':Math.max(0, c.balance), 'PAYMENT STATUS':STATUS_LABEL[c.status], 'PAYMENT MODE':payModes(b),
      'DRIVER NAME':b.driverName||'', 'DRIVER NO.':b.driverNo||'', 'GATE PASS NO.':b.gatePass||'', 'SAUDA NO.':b.saudaNo||'', 'SAUDA AGENT':b.saudaAgent||''}};
  });
}
const HEAD = 'DEO RATAN AGRO FOODS PVT. LTD. SUKHISEWANIA BHOPAL\n';
/* left-aligned words; quantities with 2 decimals; money in Indian format; everything else centred */
const TEXT_NAMES = new Set(['ITEM (AATA/ CHAPAD)','NAME OF CUSTOMER WITH ADDRESS','SELLER NAME WITH ADDRESS','LOCATION','GRAIN','TYPE','BRAND','VEHICLE TYPE','VEHICLE NO.','PAYMENT STATUS','PAYMENT MODE','STATION FROM','STATION TO','TRANSPORTER NAME','SAUDA AGENT','DRIVER NAME','FREIGHT NOTE']);
const QTY_NAMES = new Set(['TOTAL WEIGHT (Quintal)','QUANTITY (Quintal)','GROSS WEIGHT (Quintal)','DEDUCTION RATE (kg/qtl)','DEDUCTION (Quintal)','NET WEIGHT (Quintal)']);
const MONEY_NAMES = new Set(['LABOUR RATE (₹/qtl)','RATE (₹)','AMOUNT (₹)','DISCOUNT (₹)','SGST @2.5%','CGST @ 2.5%','IGST @ 5%','FINAL AMOUNT (₹)','AMOUNT RECEIVED (₹)','AMOUNT PAID (₹)','BALANCE (₹)','FREIGHT (₹)','DHARAM KATA (₹)','LABOUR (₹)']);
const WIDTH = {'ITEM (AATA/ CHAPAD)':10,'DATE':11,'NAME OF CUSTOMER WITH ADDRESS':34,'SELLER NAME WITH ADDRESS':30,'TRANSPORTER NAME':18,'DRIVER NAME':14,'PAYMENT MODE':14,'FINAL AMOUNT (₹)':14,'AMOUNT RECEIVED (₹)':14,'VEHICLE NO.':14,'SAUDA AGENT':14,'BRAND':14,'TYPE':14};
/* Three statements, plus a master copy with everything:
     Aata sale statement      one tab (Aata is its own business)
     Grain sale statement     a tab per grain: Wheat, Tewda, Chana, Soybean
     Grain purchase statement a tab per grain
     Master statement         all nine tabs
   Every grain always has its tab, empty until its first entry, so the files look the same every day.
   Columns that don't apply to a grain (wheat type, brand, bags) are left out. */
const SHEET_DEFS = {
  aata: {title:TITLE, groups:[COLS, PAYCOLS, TRANSCOLS], data:aataRows, titleCols:9},
  gsale: {groups:[GS_COLS, PAYCOLS, TRANSCOLS], data:gsaleRows, titleCols:9, wheatOnly:['TYPE','BRAND','NO. OF BAGS','BAG SIZE','WEIGHT OF ONE BAG (kg)']},
  gpurchase: {groups:[GP_COLS, GP_PAYCOLS, GP_OTHER], data:gpurchaseRows, titleCols:10, wheatOnly:['TYPE']}
};
const grainTabs = (kind, suffix) => (kind === 'gsale' ? SALE_GRAINS : Object.keys(GRAINS)).map(g => ({name:grainName(g)+suffix, kind, grain:g}));
const STATEMENTS = {
  aata:      {file:'Aata sale statement.xlsx',      dl:'AATA_SALE_STATEMENT.xlsx',      label:'Aata sale statement',      tabs:() => [{name:'Aata sale', kind:'aata'}]},
  gsale:     {file:'Grain sale statement.xlsx',     dl:'GRAIN_SALE_STATEMENT.xlsx',     label:'Grain sale statement',     tabs:() => grainTabs('gsale', '')},
  gpurchase: {file:'Grain purchase statement.xlsx', dl:'GRAIN_PURCHASE_STATEMENT.xlsx', label:'Grain purchase statement', tabs:() => grainTabs('gpurchase', '')},
  master:    {file:'Master statement.xlsx',         dl:'MASTER_STATEMENT.xlsx',         label:'Master statement',
              tabs:() => [{name:'Aata sale', kind:'aata'}].concat(grainTabs('gsale', ' sale'), grainTabs('gpurchase', ' purchase'))}
};
function buildSheet(tab){
  const def = SHEET_DEFS[tab.kind];
  const drop = new Set(tab.grain ? ['GRAIN'].concat(tab.grain === 'wheat' ? [] : def.wheatOnly || []) : []);
  const groups = def.groups.map(g => g.filter(n => !drop.has(n)));
  const title = def.title || HEAD+(grainName(tab.grain)+(tab.kind === 'gsale' ? ' SALE' : ' PURCHASE')).toUpperCase()+' STATEMENT';
  const all = [].concat(...groups);
  const rows = [], spans = [], itemCols = new Set();
  def.data(tab.grain).forEach(({bill, items}) => {
    const start = rows.length;
    (items.length ? items : [{}]).forEach((it, k) => {
      Object.keys(it).forEach(n => itemCols.add(n));
      rows.push(all.map(n => n in it ? it[n] : k === 0 && n in bill ? bill[n] : ''));
    });
    if (items.length > 1) spans.push([start, rows.length - 1]);
  });
  const aoa = [[title], all].concat(rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const thin = {style:'thin', color:{rgb:'808080'}};
  const border = {top:thin, bottom:thin, left:thin, right:thin};
  const HDR = 2, g1 = groups[0].length, g2 = g1 + groups[1].length, tcols = Math.min(def.titleCols, all.length);
  for (let r = 0; r < aoa.length; r++){
    for (let col = 0; col < all.length; col++){
      const ref = XLSX.utils.encode_cell({r, c:col}), name = all[col];
      if (r === 0 && col >= tcols) continue;
      const cell = ws[ref] || (ws[ref] = {t:'s', v:''});
      if (r === 0){ cell.s = {border, font:{bold:true, sz:11}, alignment:{horizontal:'center', vertical:'center', wrapText:true}}; continue; }
      if (r === 1){
        const fill = col >= g2 ? 'E2EFDA' : col >= g1 ? 'DDEBF7' : 'F2F2F2';
        cell.s = {border, font:{bold:true, sz:10}, fill:{patternType:'solid', fgColor:{rgb:fill}}, alignment:{horizontal:'center', vertical:'center', wrapText:true}};
        continue;
      }
      const txt = TEXT_NAMES.has(name);
      const st = {border, alignment:{horizontal: txt ? 'left' : 'center', vertical:'center', wrapText: txt}};
      if (cell.t === 'n'){ st.numFmt = MONEY_NAMES.has(name) ? INR_FMT : QTY_NAMES.has(name) ? '0.00' : '0'; }
      cell.s = st;
    }
  }
  const merges = [{s:{r:0,c:0}, e:{r:0,c:tcols-1}}];
  spans.forEach(([a, b]) => { all.forEach((n, col) => { if (!itemCols.has(n)) merges.push({s:{r:a+HDR,c:col}, e:{r:b+HDR,c:col}}); }); });
  ws['!merges'] = merges;
  ws['!cols'] = all.map(n => ({wch: WIDTH[n] || (n.length > 14 ? 13 : 11)}));
  ws['!rows'] = [{hpt:38}, {hpt:44}];
  return ws;
}
function buildXlsx(which){
  const wb = XLSX.utils.book_new();
  STATEMENTS[which].tabs().forEach(t => XLSX.utils.book_append_sheet(wb, buildSheet(t), t.name));
  return XLSX.write(wb, {bookType:'xlsx', type:'array', bookSST:true});
}
async function downloadXLSX(e, which){
  const btn = e.currentTarget; if (!window.XLSX){ toast('The spreadsheet tool didn’t load. Reload the page and try again.'); return; }
  btn.disabled = true;
  try {
    await S.downloads.save({filename:STATEMENTS[which].dl, data:new Blob([buildXlsx(which)])});
    toast(STATEMENTS[which].label+' downloaded');
  } catch(err){ handleDlErr(err); }
  btn.disabled = false;
}
/* ---------- PDFs must never need the internet ----------
   html2canvas draws the bill inside a hidden copy of the page, and that copy normally loads styles.css and the
   fonts again. If the window wasn't opened through the offline copy (e.g. after Ctrl+F5) and the internet is down,
   those loads fail and the bill comes out as unstyled text. So: once, while the app is open, the styles the page
   already has are copied as text and the fonts as data, and every PDF uses those - nothing is loaded. */
let inlineCss = null, inlineCssJob = null;
const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
function prepareInlineCss(){
  if (inlineCssJob) return inlineCssJob;
  inlineCssJob = (async () => {
    const jobs = []; let missing = 0;
    for (const sh of [...document.styleSheets]){
      let rules; try { rules = sh.cssRules; } catch(e){ continue; }
      for (const r of rules){
        const t = r.cssText;
        const m = r.type === CSSRule.FONT_FACE_RULE && t.match(/url\(["']?([^"')]+)["']?\)/);
        if (!m){ jobs.push(t); continue; }
        // all fonts fetched at the same time (from the offline copy, or the internet while it's there)
        jobs.push(fetch(new URL(m[1], sh.href || location.href).href)
          .then(res => res.ok ? res.blob() : Promise.reject()).then(toDataUrl)
          .then(d => t.replace(m[0], 'url("'+d+'")'), () => { missing++; return t; }));
      }
    }
    const all = await Promise.all(jobs), css = all.join('\n');
    if (missing){ inlineCssJob = null; }   // try again later (e.g. when the internet is back); use what we have meanwhile
    // the app window uses the same font data, so the page and the PDF copy always measure text alike,
    // and the bill's fonts are ready before anyone needs them (browsers otherwise fetch a font on first use)
    const faces = all.filter(t => t.startsWith('@font-face') && t.includes('data:'));
    if (faces.length){
      let st = document.getElementById('inlineFonts');
      if (!st){ st = document.createElement('style'); st.id = 'inlineFonts'; document.head.appendChild(st); }
      st.textContent = faces.join('\n');
      try { await Promise.all(['700 27px Archivo','400 15px "PT Serif"','700 21px "PT Serif"','400 16px Hind','600 16px Hind','700 16px Hind','400 16px "Noto Sans Devanagari"','600 16px "Noto Sans Devanagari"'].map(f => document.fonts.load(f, 'Aaआ1'))); } catch(e){}
    }
    inlineCss = css;
    return css;
  })();
  return inlineCssJob;
}
if (document.readyState === 'complete') prepareInlineCss().catch(() => {});
else window.addEventListener('load', () => prepareInlineCss().catch(() => {}));
window.addEventListener('online', () => { if (!inlineCssJob) prepareInlineCss().catch(() => {}); });
/* the invoice drawn as a picture (shared by both PDF kinds; one at a time) */
let pdfChain = Promise.resolve();
function invoiceImage(b){
  const job = pdfChain.then(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const css = await prepareInlineCss().catch(() => null);
    const stage = $('#stage'); stage.innerHTML = invoiceHTML(b); fitInvoice(stage.firstElementChild);
    try {
      let styled = true;
      const canvas = await html2canvas(stage.firstElementChild, {scale:3, backgroundColor:'#FFFFFF', logging:false,
        onclone: async (doc) => {
          if (css){
            doc.querySelectorAll('link[rel="stylesheet"], style').forEach(n => n.remove());
            const st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);
          }
          // text is measured before it's drawn: the bill's fonts must be ready in the copy first, or words run together
          if (doc.fonts){
            try {
              await Promise.race([
                Promise.all(['700 27px Archivo','400 15px "PT Serif"','700 21px "PT Serif"','400 16px Hind','700 16px Hind','600 16px Hind',
                             '400 16px "Noto Sans Devanagari"','600 16px "Noto Sans Devanagari"'].map(f => doc.fonts.load(f, 'Aaआ1'))).then(() => doc.fonts.ready),
                new Promise(r => setTimeout(r, 3000))]);
            } catch(e){}
          }
          // a bill drawn without its styles comes out as plain text; never save or print that
          const inv = doc.querySelector('#stage .inv') || doc.querySelector('.inv');
          styled = !!inv && doc.defaultView.getComputedStyle(inv).position === 'relative' && doc.defaultView.getComputedStyle(inv).display === 'flex';
        }});
      if (!styled){ const e = new Error('unstyled'); e.code = 'unstyled'; throw e; }
      return canvas.toDataURL('image/jpeg', 0.92);
    } finally { stage.innerHTML = ''; }
  });
  pdfChain = job.catch(() => {});
  return job;
}
/* for printing: 3 copies across a landscape A4; each third has a 15 mm blank strip on its left for the punch */
const PUNCH_MM = 15, RIGHT_MM = 5;
async function printPdf(b){
  const img = await invoiceImage(b);
  const pdf = new window.jspdf.jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  const W = 297, H = 210, slot = W/3;
  const w = slot - PUNCH_MM - RIGHT_MM, h = w * INV_H/INV_W, y = (H - h)/2;
  for (let i = 0; i < 3; i++) pdf.addImage(img, 'JPEG', i*slot + PUNCH_MM, y, w, h);
  pdf.setDrawColor(150); pdf.setLineWidth(0.2); if (pdf.setLineDashPattern) pdf.setLineDashPattern([1.5,1.5], 0);
  for (let i = 1; i < 3; i++) pdf.line(i*slot, 3, i*slot, H-3);
  return pdf.output('blob');
}
/* for the record: one copy on its own page - saved in the Invoices folder and opened from the ledger */
async function singlePdf(b){
  const img = await invoiceImage(b);
  // one slip the size of a third of an A4 page, laid out exactly like a printed copy (punch strip on the left)
  const W = 297/3, H = 210, w = W - PUNCH_MM - RIGHT_MM, h = w * INV_H/INV_W;
  const pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:[W, H]});
  pdf.addImage(img, 'JPEG', PUNCH_MM, (H - h)/2, w, h);
  return pdf.output('blob');
}
const INVOICE_DIR = 'Invoices';
const docStem = (b) => (kindOf(b) === 'gpurchase' ? 'PurchaseSlip_' : 'Invoice_')+(b.invNo||'draft');
const invoiceFile = (b) => docStem(b)+'.pdf';
async function saveInvoicePdf(b){
  if (!FS.dir || !window.html2canvas || !window.jspdf || b.status === 'draft') return null;
  const blob = await singlePdf(b);
  const d = await FS.dir.getDirectoryHandle(INVOICE_DIR, {create:true});
  await writeFile(d, invoiceFile(b), blob);
  return blob;
}
async function openInvoicePdf(b, btn){
  if (btn) btn.disabled = true;
  try {
    let blob = null;
    try { const d = await FS.dir.getDirectoryHandle(INVOICE_DIR); blob = await (await d.getFileHandle(invoiceFile(b))).getFile(); } catch(e){}
    if (!blob){ toast('Making the invoice PDF…'); blob = await saveInvoicePdf(b); }
    if (!blob) throw new Error('no pdf');
    const url = URL.createObjectURL(new Blob([blob], {type:'application/pdf'}));
    const win = window.open(url, '_blank');
    if (!win) await S.downloads.save({filename:invoiceFile(b), data:blob});
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch(e){ toast('Couldn’t open the invoice PDF. Try again.'); }
  if (btn) btn.disabled = false;
}
async function downloadPDF(b, btn){
  if (!window.html2canvas || !window.jspdf){ toast('The PDF tool didn’t load. Reload the page and try again.'); return; }
  if (btn) btn.disabled = true; toast('Preparing PDF…');
  try {
    const blob = await printPdf(b);
    await S.downloads.save({filename:docStem(b)+'_3-per-A4.pdf', data:blob});
    toast((kindOf(b) === 'gpurchase' ? 'Purchase slip' : 'Invoice')+' downloaded. Print it from your Downloads folder.');
  } catch(err){ handleDlErr(err); }
  if (btn) btn.disabled = false;
}
function handleDlErr(err){
  const code = err && err.code;
  if (code === 'declined') return;
  if (code === 'unstyled'){ toast('The bill didn’t draw properly, so no PDF was made. Close the app window, open it again and try once more.'); return; }
  if (code === 'rate_limited') toast('A download is already waiting for you to confirm.');
  else toast('Couldn’t make the file. Try again.');
}

/* ================= CUSTOMERS + LEDGER =================
   A customer is known by mobile number (or by name when there's no mobile).
   Each customer's extra details (old dues, payments against old dues) live in S.customers,
   saved in the same bills file. Bills and their payments stay on the bills. */
function custKey(o){ const m = String(o.mobile||'').trim(); return m ? 'm:'+m : 'n:'+String(o.party||o.name||'').trim().toLowerCase(); }
function custRec(key){ return S.customers[key] || null; }
function allCustomers(){
  const map = new Map();
  const add = (key, info) => { if (!map.has(key)) map.set(key, {key, name:'', mobile:'', location:'', gst:'', bills:[], last:''}); const c = map.get(key); Object.keys(info).forEach(k => { if (info[k]) c[k] = info[k]; }); return c; };
  Object.entries(S.customers).forEach(([key, r]) => add(key, {name:r.name, mobile:r.mobile, location:r.location, gst:r.gst}));
  [...S.bills.values()].filter(b => b.status !== 'draft' && (b.party||'').trim())
    .sort((a,b) => (a.date||'').localeCompare(b.date||''))
    .forEach(b => { const c = add(custKey(b), {name:b.party, mobile:b.mobile, location:b.location, gst:b.gst}); c.bills.push(b); c.last = b.date || c.last; });
  map.forEach(c => { c.lines = ledgerLines(c); c.balance = c.lines.length ? c.lines[c.lines.length-1].bal : 0; });
  return [...map.values()];
}
function ledgerLines(c){
  const r = custRec(c.key) || {}, rows = [];
  if (num(r.opening)) rows.push({date:r.openingDate||'', ord:0, text:'Opening balance (old dues)', dr:num(r.opening)});
  (r.payments||[]).forEach(p => rows.push({date:p.date, ord:2, text:'Payment'+(p.mode ? ' · '+p.mode : '')+' · old dues', cr:num(p.amount)}));
  c.bills.forEach(b => {
    const k = calc(b), kind = kindOf(b);
    const seq = ({aata:0, gsale:1, gpurchase:2}[kind]*1000 + noSeq(b.invNo)) / 1e7;   // keeps a bill's advance right under it
    const after = (p) => p.advance && p.date === b.date ? 1 + seq + 0.5e-7 : 2;
    if (kind === 'gpurchase'){
      // we owe the seller: the purchase is a credit, what we pay them is a debit
      rows.push({date:b.date, ord:1 + seq, text:'Purchase '+b.invNo+' · '+grainName(b.grain)+(buyType(b) ? ' ('+buyType(b)+')' : '')+' · '+qtlFmt(k.net)+' qtl', cr:k.final, bill:b});
      (b.payments||[]).forEach(p => rows.push({date:p.date, ord:after(p), text:'Paid to them'+(p.mode ? ' · '+p.mode : '')+' · purchase '+b.invNo, dr:num(p.amount), payBill:b}));
    } else {
      const what = kind === 'gsale' ? 'Sale '+b.invNo+' · '+grainName(b.grain)+' · '+qtlFmt(k.qtl)+' qtl' : 'Bill no. '+b.invNo+' · '+inr(k.bags)+' bags · '+qtlFmt(k.qtl)+' qtl';
      rows.push({date:b.date, ord:1 + seq, text:what, dr:k.final, bill:b});
      (b.payments||[]).forEach(p => rows.push({date:p.date, ord:after(p), text:(p.advance ? 'Advance' : 'Payment')+(p.mode ? ' · '+p.mode : '')+' · '+(kind === 'gsale' ? 'sale '+b.invNo : 'bill no. '+b.invNo), cr:num(p.amount), payBill:b}));
    }
  });
  rows.sort((a,b) => (a.date||'').localeCompare(b.date||'') || a.ord - b.ord);
  let bal = 0; rows.forEach(x => { bal = r2(bal + (x.dr||0) - (x.cr||0)); x.bal = bal; });
  return rows;
}
const balText = (v) => v > 0.004 ? '₹'+inr(v)+' to collect' : v < -0.004 ? '₹'+inr(-v)+' we owe them' : 'Nothing due';
function oldDuesLeft(key){ const r = custRec(key) || {}; return r2(num(r.opening) - (r.payments||[]).reduce((t,p) => t + num(p.amount), 0)); }

function renderCustomers(){
  const q = (S.cq||'').trim().toLowerCase();
  const all = allCustomers().sort((a,b) => (b.balance - a.balance) || a.name.localeCompare(b.name));
  const rows = all.filter(c => !q || c.name.toLowerCase().includes(q) || (c.mobile||'').includes(q) || (c.location||'').toLowerCase().includes(q));
  $('#view').innerHTML =
    '<div class="head"><div><h1>Parties</h1><p class="sub">Customers and sellers. Open a party to see their ledger: every bill, purchase and payment, with the balance after each.</p></div>'+
    '<div class="acts"><button class="btn" type="button" id="addOld">+ Add old dues</button></div></div>'+
    '<div class="filters"><label for="cq" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search parties</label>'+
    '<input id="cq" class="search" type="search" placeholder="Search by name, mobile or location" value="'+esc(S.cq||'')+'"></div>'+
    '<div class="tablebox"><table class="list"><thead><tr><th>Party</th><th>Mobile</th><th>Location</th><th class="r">Entries</th><th>Last entry</th><th class="r">Balance ₹</th><th><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Actions</span></th></tr></thead><tbody>'+
    (rows.length ? rows.map(c => '<tr><td>'+esc(c.name)+'</td><td class="num">'+esc(c.mobile||'—')+'</td><td>'+esc(c.location||'—')+'</td><td class="r num">'+c.bills.length+'</td><td>'+esc(dmy(c.last)||'—')+'</td>'+
      '<td class="r num'+(c.balance > 0.004 ? ' owe' : '')+'">'+inr(Math.abs(c.balance))+(c.balance > 0.004 ? ' <span class="baltag">to collect</span>' : c.balance < -0.004 ? ' <span class="baltag pay">we owe</span>' : '')+'</td><td><button class="btn small" type="button" data-led="'+esc(c.key)+'">Open ledger</button></td></tr>').join('')
      : '<tr><td colspan="7" class="empty">'+(all.length ? 'No parties match this search.' : 'Parties appear here after their first bill or purchase.')+'</td></tr>')+
    '</tbody></table></div>';
  $('#cq').oninput = (e) => { S.cq = e.target.value; const pos = e.target.selectionStart; renderCustomers(); const el = $('#cq'); el.focus(); el.setSelectionRange(pos,pos); };
  document.querySelectorAll('[data-led]').forEach(b => b.onclick = () => go('ledger', b.dataset.led));
  $('#addOld').onclick = () => openOpening(null);
}

function renderLedger(){
  const c = allCustomers().find(x => x.key === S.currentId);
  if (!c){ go('customers'); return; }
  const r = custRec(c.key) || {};
  const sum = (f) => r2(c.lines.filter(f).reduce((t,x) => t + (x.dr||x.cr||0), 0));
  const sales = sum(x => x.bill && kindOf(x.bill) !== 'gpurchase'), got = sum(x => x.cr && !(x.bill && kindOf(x.bill) === 'gpurchase'));
  const bought = sum(x => x.bill && kindOf(x.bill) === 'gpurchase'), paidOut = sum(x => x.dr && x.payBill && kindOf(x.payBill) === 'gpurchase');
  const hasBuy = c.bills.some(b => kindOf(b) === 'gpurchase'), hasSell = c.bills.some(b => kindOf(b) !== 'gpurchase') || !hasBuy;
  $('#view').innerHTML =
    '<div class="head"><div><button class="btn link" type="button" id="back" style="margin-left:-4px">← Parties</button>'+
    '<h1>'+esc(c.name)+'</h1><p class="sub">'+[c.mobile, c.location, c.gst ? 'GST '+c.gst : ''].filter(Boolean).map(esc).join(' · ')+'</p></div>'+
    '<div class="acts"><button class="btn" type="button" id="ledNew">New Aata bill</button><button class="btn" type="button" id="ledGrain">New grain bill</button><button class="btn primary" type="button" id="ledPay">Record payment</button></div></div>'+
    '<div class="ledsum">'+
      '<div class="card"><span class="k">Old dues</span><b class="num">₹'+inr(num(r.opening))+'</b><button class="btn link" type="button" id="ledOpen">'+(num(r.opening) ? 'Change' : 'Add old dues')+'</button></div>'+
      (hasSell ? '<div class="card"><span class="k">Total billed</span><b class="num">₹'+inr(sales)+'</b></div>'+
                 '<div class="card"><span class="k">Total received</span><b class="num">₹'+inr(got)+'</b></div>' : '')+
      (hasBuy ? '<div class="card"><span class="k">Bought from them</span><b class="num">₹'+inr(bought)+'</b></div>'+
                '<div class="card"><span class="k">Paid to them</span><b class="num">₹'+inr(paidOut)+'</b></div>' : '')+
      '<div class="card big'+(c.balance > 0.004 ? ' owe' : c.balance < -0.004 ? ' pay' : '')+'"><span class="k">Balance</span><b class="num">₹'+inr(Math.abs(c.balance))+'</b><span class="k">'+esc(balText(c.balance))+'</span></div>'+
    '</div>'+
    '<p class="note ledkey">Debit (Dr): bills to them and payments we make. Credit (Cr): payments we receive and purchases from them. Balance above zero is theirs to pay; “we owe” is ours.</p>'+
    '<div class="tablebox"><table class="list ledger"><thead><tr><th>Date</th><th>Details</th><th class="r">Debit (Dr) ₹</th><th class="r">Credit (Cr) ₹</th><th class="r">Balance ₹</th><th>PDF</th></tr></thead><tbody>'+
    (c.lines.length ? c.lines.map(x => '<tr'+(x.cr ? ' class="cr"' : '')+'><td>'+esc(dmy(x.date)||'—')+'</td><td>'+esc(x.text)+'</td>'+
      '<td class="r num">'+(x.dr ? inr(x.dr) : '')+'</td><td class="r num">'+(x.cr ? inr(x.cr) : '')+'</td><td class="r num"><b>'+inr(Math.abs(x.bal))+'</b>'+(x.bal < -0.004 ? ' <span class="baltag pay">we owe</span>' : '')+'</td>'+
      '<td>'+(x.bill ? '<div class="acts"><button class="btn small" type="button" data-pdf="'+x.bill.id+'">PDF</button><button class="btn link" type="button" data-bill="'+x.bill.id+'">Open '+(kindOf(x.bill) === 'gpurchase' ? 'slip' : 'bill')+'</button></div>' : '')+'</td></tr>').join('')
      : '<tr><td colspan="6" class="empty">No bills or payments yet.</td></tr>')+
    '</tbody></table></div>';
  $('#back').onclick = () => go('customers');
  $('#ledNew').onclick = () => openForm(null, {mobile:c.mobile||'', party:c.name||'', location:c.location||'', gst:c.gst||''});
  $('#ledGrain').onclick = () => openGrainChooser({mobile:c.mobile||'', party:c.name||'', location:c.location||'', gst:c.gst||''});
  $('#ledPay').onclick = () => openLedgerPay(c);
  $('#ledOpen').onclick = () => openOpening(c);
  document.querySelectorAll('[data-pdf]').forEach(b => b.onclick = (e) => openInvoicePdf(S.bills.get(b.dataset.pdf), e.currentTarget));
  document.querySelectorAll('[data-bill]').forEach(b => b.onclick = () => go('bill', b.dataset.bill));
}

/* old dues: for a customer on the ledger, or a new one from the Customers page */
function openOpening(c){
  const r = c ? (custRec(c.key) || {}) : {};
  openDialog('<h2 id="dlgT">'+(c ? 'Old dues for '+esc(c.name) : 'Add a customer’s old dues')+'</h2>'+
    '<p class="note" style="font-size:14px">Money they owed before you started using this app. It is the first line of their ledger.</p>'+
    (c ? '' :
      '<div class="field"><label for="oMob">Mobile no.</label><input id="oMob" type="tel" inputmode="numeric" placeholder="10 digits"><p class="err" id="oMobErr" hidden></p></div>'+
      '<div class="field"><label for="oName">Customer name and address <span class="req">*</span></label><input id="oName" type="text"></div>'+
      '<div class="field"><label for="oLoc">Location</label><input id="oLoc" type="text"></div>')+
    '<div class="dgrid"><div class="field"><label for="oAmt">Old dues (₹)</label><input id="oAmt" type="text" inputmode="decimal" value="'+esc(r.opening ? String(r.opening) : '')+'"></div>'+
    '<div class="field"><label for="oDate">As on date</label>'+dateCtl('oDate', r.openingDate || todayISO(), '')+'</div></div>'+
    '<p class="err" id="oErr" hidden></p>'+
    '<div class="btns"><button class="btn" type="button" id="oCancel">Cancel</button><button class="btn primary" type="button" id="oSave">Save</button></div>');
  let oDate = r.openingDate || todayISO(); wireDate('oDate', (iso) => { oDate = iso; });
  if ($('#oMob')) $('#oMob').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,10); });
  $('#oCancel').onclick = closeDialog;
  $('#oSave').onclick = async () => {
    const amt = num($('#oAmt').value), err = $('#oErr');
    let key, info = {};
    if (c){ key = c.key; info = {name:c.name, mobile:c.mobile, location:c.location, gst:c.gst}; }
    else {
      const mob = $('#oMob').value, name = $('#oName').value.trim();
      if (mob && mob.length !== 10){ const e = $('#oMobErr'); e.textContent = 'Mobile number must be 10 digits. You typed '+mob.length+'.'; e.hidden = false; return; }
      if (!name){ err.textContent = 'Enter the customer’s name and address.'; err.hidden = false; return; }
      key = custKey({mobile:mob, party:name}); info = {name, mobile:mob, location:$('#oLoc').value.trim()};
    }
    if (amt < 0){ err.textContent = 'Enter the amount they owe.'; err.hidden = false; return; }
    const rec = Object.assign({payments:[]}, S.customers[key] || {}, info, {opening:amt, openingDate:oDate || todayISO()});
    S.customers[key] = rec;
    await persist();
    closeDialog(); toast('Old dues saved'); go('ledger', key);
  };
}

/* a payment from the ledger: against old dues or any bill with money still due */
function openLedgerPay(c){
  const opts = [];
  const old = oldDuesLeft(c.key); if (old > 0.004) opts.push({v:'old', label:'Old dues · ₹'+inr(old)+' due', due:old});
  c.bills.forEach(b => { const k = calc(b), kind = kindOf(b); if (k.balance > 0.004) opts.push({v:b.id, out:kind === 'gpurchase',
    label:(kind === 'gpurchase' ? 'We pay · purchase '+b.invNo : kind === 'gsale' ? 'Sale '+b.invNo : 'Bill no. '+b.invNo)+' ('+dmy(b.date)+') · ₹'+inr(k.balance)+(kind === 'gpurchase' ? ' to pay' : ' due'), due:k.balance}); });
  if (!opts.length){ toast('Nothing is due with this party.'); return; }
  openDialog('<h2 id="dlgT">Record payment · '+esc(c.name)+'</h2>'+
    '<div class="field"><label for="lAgainst">Payment is for</label><select id="lAgainst">'+opts.map(o => '<option value="'+esc(o.v)+'">'+esc(o.label)+'</option>').join('')+'</select></div>'+
    '<div class="dgrid"><div class="field"><label for="lAmt">How much paid (₹)</label><input id="lAmt" type="text" inputmode="decimal"></div>'+
    '<div class="field"><span style="font-size:14px;font-weight:600" id="lRemL">Still to pay (₹)</span><div class="remain num" id="lRem" aria-labelledby="lRemL" aria-live="polite">0</div></div></div>'+
    '<p class="err" id="lErr" hidden></p>'+
    '<div class="dgrid"><div class="field"><label for="lDate">Date</label>'+dateCtl('lDate', todayISO(), '')+'</div>'+
    '<div class="field"><label for="lMode">Payment mode</label><select id="lMode">'+PAY_MODES.map(m => '<option>'+esc(m)+'</option>').join('')+'</select></div></div>'+
    '<div class="btns"><button class="btn" type="button" id="lCancel">Cancel</button><button class="btn primary" type="button" id="lSave">Save payment</button></div>');
  const sel = $('#lAgainst'), amt = $('#lAmt'), rem = $('#lRem'), err = $('#lErr');
  const cur = () => opts.find(o => o.v === sel.value);
  const upd = () => { const o = cur(), left = r2(o.due - num(amt.value)); rem.textContent = inr(Math.max(0,left)); rem.classList.toggle('zero', left <= 0.004);
    if (num(amt.value) > o.due + 0.004){ err.textContent = 'That’s more than the ₹'+inr(o.due)+' still due on this.'; err.hidden = false; } else err.hidden = true; };
  sel.onchange = () => { amt.value = String(cur().due); upd(); };
  amt.value = String(opts[0].due); amt.addEventListener('input', upd); upd(); amt.focus(); amt.select();
  let pDate = todayISO(); wireDate('lDate', (iso) => { pDate = iso; });
  $('#lCancel').onclick = closeDialog;
  $('#lSave').onclick = async () => {
    const o = cur(), a = num(amt.value);
    if (!(a > 0)){ err.textContent = 'Enter the amount received.'; err.hidden = false; amt.focus(); return; }
    if (a > o.due + 0.004){ amt.focus(); return; }
    const pay = {amount:a, date:pDate || todayISO(), mode:$('#lMode').value};
    if (o.v === 'old'){ const rec = S.customers[c.key]; rec.payments = (rec.payments||[]).concat([pay]); await persist(); }
    else { const nb = JSON.parse(JSON.stringify(S.bills.get(o.v))); nb.payments = (nb.payments||[]).concat([pay]); await saveBill(nb); }
    closeDialog(); toast('Payment saved'); render();
  };
}

/* ================= DATA FOLDER =================
   The bills live in a real file on the laptop, inside a folder the person picks
   (ideally in Google Drive). The browser only remembers WHERE that folder is, so
   clearing browser data never deletes bills: the app just asks for the folder again.
   Files in the folder:
     bills-data.json          the bills (the one true copy)
     Sale statement.xlsx      updated after every change, for people to read
     Backups/bills-YYYY-MM-DD.json   one copy per day, last 30 kept            */
const DATA_FILE = 'bills-data.json';
const XLSX_FILE = 'Master statement.xlsx';
const BACKUP_DIR = 'Backups';
const SUB_NAME = 'Deo Ratan Billing';
const KEEP_BACKUPS = 30;
const APP_ID = 'deoratan-billing';
const FS = { root:null, dir:null, sub:false, knownStamp:null, lastSaved:null, lastBackup:null, state:'idle', err:'', xlsxNote:'', blocked:false, hasLock:false };

/* tiny key-value store (IndexedDB) - holds only the folder handle and an emergency copy */
function idbOpen(){ return new Promise((res, rej) => { const r = indexedDB.open('deoratan-app', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k){ try { const db = await idbOpen(); try { return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } finally { db.close(); } } catch(e){ return undefined; } }
async function kvSet(k, v){ try { const db = await idbOpen(); try { await new Promise((res, rej) => { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } finally { db.close(); } } catch(e){} }
async function kvDel(k){ try { const db = await idbOpen(); try { await new Promise((res) => { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = res; }); } finally { db.close(); } } catch(e){} }

const fsSupported = () => typeof window.showDirectoryPicker === 'function';
const stampNow = () => { const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds()); };
const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return pad(d.getHours())+':'+pad(d.getMinutes()); };
async function hasFile(dir, name){ try { await dir.getFileHandle(name); return true; } catch(e){ return false; } }
async function writeFile(dir, name, data){ const fh = await dir.getFileHandle(name, {create:true}); const w = await fh.createWritable(); await w.write(data); await w.close(); }
function folderLabel(){ if (!FS.root) return ''; return FS.sub ? FS.root.name+' › '+SUB_NAME : FS.root.name; }
function payload(){ return {app:APP_ID, version:1, savedAt:new Date().toISOString(), bills:[...S.bills.values()], customers:S.customers}; }
function validData(d){ return d && d.app === APP_ID && Array.isArray(d.bills); }

async function readData(dir){
  const f = await (await dir.getFileHandle(DATA_FILE)).getFile();
  const d = JSON.parse(await f.text());
  if (!validData(d)) throw Object.assign(new Error('not ours'), {kind:'invalid'});
  return d;
}
function loadBills(d){ S.bills = new Map(); d.bills.forEach(b => { if (b && b.id) S.bills.set(b.id, b); }); S.customers = (d.customers && typeof d.customers === 'object') ? d.customers : {}; FS.knownStamp = d.savedAt || null; }

/* where inside the picked folder do the bills live? */
async function locate(root){
  if (await hasFile(root, DATA_FILE)) return {dir:root, sub:false, found:true};
  try { const s = await root.getDirectoryHandle(SUB_NAME); if (await hasFile(s, DATA_FILE)) return {dir:s, sub:true, found:true}; } catch(e){}
  return {dir:null, sub:false, found:false};
}
async function isEmpty(dir){ for await (const _ of dir.values()) return false; return true; }

/* ---------- saving ---------- */
let saveChain = Promise.resolve();
function persist(){
  if (FS.blocked || !FS.dir) return Promise.resolve();
  setSaveState('saving');
  saveChain = saveChain.then(doSave, doSave);
  return saveChain;
}
async function doSave(){
  const p = payload();
  try {
    const fh = await FS.dir.getFileHandle(DATA_FILE, {create:true});
    // never replace a bills file we didn't load: keep a copy of it first
    if (!FS.knownStamp){
      try {
        const cur = JSON.parse(await (await fh.getFile()).text());
        if (validData(cur) && cur.bills.length){
          const bdir = await FS.dir.getDirectoryHandle(BACKUP_DIR, {create:true});
          await writeFile(bdir, 'earlier-file_'+stampNow()+'.json', JSON.stringify(cur));
        }
      } catch(e){}
    }
    // did someone else change the file since we read it? keep their copy, then save ours
    if (FS.knownStamp){
      try {
        const cur = JSON.parse(await (await fh.getFile()).text());
        if (validData(cur) && cur.savedAt && cur.savedAt !== FS.knownStamp){
          const bdir = await FS.dir.getDirectoryHandle(BACKUP_DIR, {create:true});
          await writeFile(bdir, 'changed-elsewhere_'+stampNow()+'.json', JSON.stringify(cur));
          toast('The bills file was changed somewhere else. A copy of that version was put in Backups.');
        }
      } catch(e){}
    }
    const w = await fh.createWritable(); await w.write(JSON.stringify(p)); await w.close();
    FS.knownStamp = p.savedAt; FS.lastSaved = p.savedAt;
    await kvDel('pending');
    setSaveState('saved');
    dailyBackup(p).catch(() => {});
    scheduleXlsx();
  } catch(e){
    // keep an emergency copy in this browser until the folder can be written again
    await kvSet('pending', {base:FS.knownStamp, data:p});
    FS.err = (e && e.name === 'NotAllowedError') ? 'permission' : 'write';
    setSaveState('error');
  }
}
async function dailyBackup(p, manual){
  const bdir = await FS.dir.getDirectoryHandle(BACKUP_DIR, {create:true});
  const name = manual ? 'manual_'+stampNow()+'.json' : 'bills-'+todayISO()+'.json';
  if (!manual && FS.lastBackup === todayISO()) return;
  if (manual || !(await hasFile(bdir, name))) await writeFile(bdir, name, JSON.stringify(p || payload()));
  if (!manual) FS.lastBackup = todayISO();
  const daily = [];
  for await (const [n, h] of bdir.entries()) if (h.kind === 'file' && /^bills-\d{4}-\d{2}-\d{2}\.json$/.test(n)) daily.push(n);
  daily.sort().reverse().slice(KEEP_BACKUPS).forEach(n => bdir.removeEntry(n).catch(() => {}));
}
let xlsxT;
function scheduleXlsx(){ clearTimeout(xlsxT); xlsxT = setTimeout(writeXlsxToFolder, 1500); }
async function writeXlsxToFolder(){
  if (!FS.dir || !window.XLSX) return;
  const busy = [];
  for (const which of Object.keys(STATEMENTS)){
    try { await writeFile(FS.dir, STATEMENTS[which].file, new Blob([buildXlsx(which)])); }
    catch(e){ busy.push(STATEMENTS[which].file); }
  }
  const was = FS.xlsxNote;
  FS.xlsxNote = busy.length ? 'Close '+busy.map(n => '“'+n+'”').join(' and ')+' in Excel so the app can update '+(busy.length > 1 ? 'them' : 'it')+'. Your bills are saved either way.' : '';
  if (busy.length && !was) toast('Close the statement in Excel so it can be updated.');
  setSaveState(FS.state);
}

/* ---------- save status in the top bar ---------- */
function setSaveState(st){
  FS.state = st;
  const b = $('#saveStatus'); if (!b) return;
  b.hidden = !FS.dir;
  b.className = 'savechip '+st;
  b.innerHTML = st === 'saving' ? 'Saving…'
    : st === 'error' ? warnIcon+' Not saved · fix'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg> Saved'+(FS.lastSaved ? ' · '+hhmm(FS.lastSaved) : '')+(FS.xlsxNote ? ' · '+warnIcon : '');
  b.setAttribute('aria-label', st === 'error' ? 'Bills not saved to your folder. Open to fix.' : 'Where your bills are saved');
}
window.addEventListener('beforeunload', (e) => { if (FS.state === 'saving' || FS.state === 'error'){ e.preventDefault(); e.returnValue = ''; } });

function openDataPanel(){
  const err = FS.state === 'error';
  openDialog(
    '<h2 id="dlgT">'+(err ? 'Your last change isn’t in your folder yet' : 'Where your bills are saved')+'</h2>'+
    (err ? '<p class="banner bad">'+(FS.err === 'permission'
        ? 'The app lost permission to the folder. Click Reconnect and choose Allow.'
        : 'The folder couldn’t be written. If it’s in Google Drive, check that Google Drive is running, then try again.')+
      ' Your changes are kept in this browser until then.</p>' : '')+
    '<div class="card" style="gap:6px"><div class="row"><span>Folder</span><b>'+esc(folderLabel())+'</b></div>'+
    '<div class="row"><span>Last saved</span><span>'+(FS.lastSaved ? esc(dmy(FS.lastSaved.slice(0,10))+' '+hhmm(FS.lastSaved)) : '—')+'</span></div>'+
    '<div class="row"><span>Daily backup</span><span>'+(FS.lastBackup ? esc(dmy(FS.lastBackup)) : '—')+'</span></div></div>'+
    '<p class="note" style="font-size:14px">In that folder: <b>bills-data</b> (your bills), <b>Aata sale</b>, <b>Grain sale</b> and <b>Grain purchase</b> statements plus a <b>'+XLSX_FILE+'</b> with everything (all updated after every change) and a <b>Backups</b> folder with one copy per day.</p>'+
    (FS.xlsxNote ? '<p class="banner warn">'+esc(FS.xlsxNote)+'</p>' : '')+
    '<div class="btns" style="justify-content:flex-start">'+
      (err ? '<button class="btn primary" type="button" id="dpRetry">'+(FS.err === 'permission' ? 'Reconnect' : 'Try again')+'</button>' : '<button class="btn" type="button" id="dpBackup">Back up now</button>')+
      '<button class="btn link" type="button" id="dpSwitch">Use a different folder</button>'+
    '</div>'+
    '<div class="btns"><button class="btn" type="button" id="dpClose">Close</button></div>');
  $('#dpClose').onclick = closeDialog;
  if ($('#dpBackup')) $('#dpBackup').onclick = async () => {
    try { await dailyBackup(null, true); toast('Backup saved in the Backups folder'); } catch(e){ toast('Couldn’t make a backup. Check the folder is available.'); }
  };
  if ($('#dpRetry')) $('#dpRetry').onclick = async () => {
    try { if (FS.root.requestPermission && (await FS.root.requestPermission({mode:'readwrite'})) !== 'granted'){ toast('The app needs permission to save in the folder.'); return; } } catch(e){}
    closeDialog(); await persist(); if (FS.state === 'saved') toast('Saved to your folder');
  };
  $('#dpSwitch').onclick = () => {
    closeDialog();
    openDialog('<h2 id="dlgT">Use a different folder?</h2><p class="note" style="font-size:15px">Only do this if your bills folder has moved. Pick the folder that has your bills in it. If you pick an empty folder, the app starts a new, empty list there.</p>'+
      '<div class="btns"><button class="btn" type="button" id="swNo">Cancel</button><button class="btn primary" type="button" id="swYes">Choose folder</button></div>');
    $('#swNo').onclick = closeDialog;
    $('#swYes').onclick = () => { closeDialog(); chooseFolder(); };
  };
}

/* ---------- gate screens (shown instead of the app until the folder is ready) ---------- */
const folderIcon = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
function gate(html){ $('#footerSlot').innerHTML = ''; if ($('#mainNav')) $('#mainNav').hidden = true; S.view = 'gate'; $('#view').innerHTML = '<section class="gate">'+html+'</section>'; setSaveState(FS.state); }

function showUnsupported(){
  gate('<div class="gicon">'+warnIcon.replace(/14/g,'40')+'</div><h1>Please open this in Google Chrome</h1>'+
    '<p>This app saves your bills in a folder on this computer, and only Google Chrome (or Microsoft Edge) on a computer can do that.</p>'+
    '<p class="note">Open Chrome, go to this same address, and the app will start.</p>');
}
function showSetup(){
  gate('<div class="gicon">'+folderIcon+'</div><h1>Choose where to save your bills</h1>'+
    '<p>Your bills are saved as files in a folder on this laptop. Put that folder in <b>Google Drive</b> so there’s always a copy online.</p>'+
    '<ol class="steps">'+
      '<li>Check that <b>Google Drive</b> is installed and signed in. It shows up as “Google Drive” in File Explorer.</li>'+
      '<li>Click <b>Choose folder</b>. Open <b>Google Drive › My Drive</b>, make a new folder called <b>'+SUB_NAME+'</b>, open it and click <b>Select Folder</b>.</li>'+
      '<li>When Chrome asks, click <b>Edit files</b> (or <b>Allow</b>).</li>'+
    '</ol>'+
    '<button class="btn primary big" type="button" id="gChoose">Choose folder</button>'+
    '<p class="note">Used this app before on this laptop? Choose the same folder and your bills will load.</p>');
  $('#gChoose').onclick = chooseFolder;
}
function showReconnect(){
  gate('<div class="gicon">'+folderIcon+'</div><h1>Open your bills</h1>'+
    '<p>Your bills are in <b>'+esc(folderLabel())+'</b>. Chrome asks once each time the app starts.</p>'+
    '<button class="btn primary big" type="button" id="gOpen">Open my bills</button>'+
    '<p class="note">Tip: when Chrome asks, choose <b>Allow on every visit</b> and it won’t ask again.</p>'+
    '<button class="btn link" type="button" id="gOther">My bills are in a different folder</button>');
  $('#gOpen').onclick = async () => {
    let st = 'denied';
    try { st = await FS.root.requestPermission({mode:'readwrite'}); } catch(e){}
    if (st === 'granted') openStoredFolder(); else toast('Click Open my bills again and choose Allow.');
  };
  $('#gOther').onclick = chooseFolder;
}
function showMissing(){
  gate('<div class="gicon">'+warnIcon.replace(/14/g,'40')+'</div><h1>Can’t find your bills file</h1>'+
    '<p>The app looked in <b>'+esc(folderLabel())+'</b> but the bills file isn’t there right now.</p>'+
    '<ul class="steps"><li>If the folder is in Google Drive, make sure <b>Google Drive is running</b> (its icon is near the clock).</li>'+
    '<li>If the laptop is offline, right-click the folder in File Explorer and choose <b>Offline access › Available offline</b>, so it works without internet next time.</li></ul>'+
    '<div class="btns" style="justify-content:flex-start"><button class="btn primary" type="button" id="gRetry">Try again</button><button class="btn" type="button" id="gOther">Choose the folder again</button></div>');
  $('#gRetry').onclick = openStoredFolder;
  $('#gOther').onclick = chooseFolder;
}
function showDamaged(){
  gate('<div class="gicon">'+warnIcon.replace(/14/g,'40')+'</div><h1>Your bills file couldn’t be read</h1>'+
    '<p>The file <b>'+DATA_FILE+'</b> in <b>'+esc(folderLabel())+'</b> is damaged or isn’t a bills file. Nothing has been changed.</p>'+
    '<p>You can load the most recent backup instead. The damaged file is kept in the Backups folder.</p>'+
    '<div class="btns" style="justify-content:flex-start"><button class="btn primary" type="button" id="gRestore">Load the latest backup</button><button class="btn" type="button" id="gOther">Choose a different folder</button></div>');
  $('#gRestore').onclick = restoreLatestBackup;
  $('#gOther').onclick = chooseFolder;
}
function showElsewhere(stolen){
  FS.blocked = true;
  gate('<div class="gicon">'+folderIcon+'</div><h1>'+(stolen ? 'The app was opened in another window' : 'The app is already open')+'</h1>'+
    '<p>'+(stolen ? 'To keep your bills safe, only one window can make changes. Close this one and use the other window.'
                  : 'Deo Ratan Billing is open in another window. Use that one, so two windows don’t change your bills at the same time.')+'</p>'+
    (stolen ? '' : '<button class="btn" type="button" id="gHere">Use this window instead</button>'));
  if ($('#gHere')) $('#gHere').onclick = () => takeLock(true).then(ok => { if (ok){ FS.blocked = false; startData(); } });
}

/* ---------- opening a folder ---------- */
async function chooseFolder(){
  let root;
  try { root = await window.showDirectoryPicker({id:'deoratan-bills', mode:'readwrite', startIn:'documents'}); }
  catch(e){ if (e && e.name !== 'AbortError') toast('That folder can’t be used. Please pick or create a different one.'); return; }
  let loc = await locate(root), fresh = false;
  if (!loc.found){
    // new folder: use it if empty or already named for the app, otherwise make our own folder inside it
    if (root.name === SUB_NAME || await isEmpty(root)) loc = {dir:root, sub:false};
    else loc = {dir:await root.getDirectoryHandle(SUB_NAME, {create:true}), sub:true};
    fresh = true;
  }
  FS.root = root; FS.dir = loc.dir; FS.sub = loc.sub;
  await kvSet('root', root); await kvSet('sub', loc.sub);
  if (fresh){
    S.bills = new Map(); FS.knownStamp = null;
    await persist();
    if (FS.state === 'saved'){ toast('All set. Bills will be saved in '+folderLabel()+'.'); enterApp(); }
    else { gate('<h1>Couldn’t save in that folder</h1><p>Please choose a different folder.</p><button class="btn primary" type="button" id="gOther">Choose folder</button>'); $('#gOther').onclick = chooseFolder; }
    return;
  }
  await openFolderData();
}
async function openStoredFolder(){
  try { FS.dir = FS.sub ? await FS.root.getDirectoryHandle(SUB_NAME) : FS.root; }
  catch(e){ showMissing(); return; }
  if (!(await hasFile(FS.dir, DATA_FILE))){ showMissing(); return; }
  await openFolderData();
}
async function openFolderData(){
  let d;
  try { d = await readData(FS.dir); }
  catch(e){ if (e && e.name === 'NotFoundError') showMissing(); else showDamaged(); return; }
  loadBills(d); FS.lastSaved = d.savedAt || null;
  // changes that couldn't be written last time?
  const pend = await kvGet('pending');
  if (pend && pend.data && validData(pend.data)){
    if (pend.base === FS.knownStamp){ loadBills(pend.data); FS.knownStamp = d.savedAt; await persist(); toast('Saved the changes from last time that hadn’t reached your folder.'); }
    else {
      try { const bdir = await FS.dir.getDirectoryHandle(BACKUP_DIR, {create:true}); await writeFile(bdir, 'unsaved-changes_'+stampNow()+'.json', JSON.stringify(pend.data)); await kvDel('pending'); toast('Some earlier changes couldn’t be merged. They were put in the Backups folder.'); } catch(e){}
    }
  }
  setSaveState('saved');
  dailyBackup(payload()).catch(() => {});
  scheduleXlsx();
  enterApp();
}
async function restoreLatestBackup(){
  try {
    const bdir = await FS.dir.getDirectoryHandle(BACKUP_DIR, {create:true});
    const names = [];
    for await (const [n, h] of bdir.entries()) if (h.kind === 'file' && /^(bills-|manual_).*\.json$/.test(n)) names.push([n, (await h.getFile()).lastModified]);
    names.sort((a,b) => b[1] - a[1]);
    for (const [n] of names){
      try {
        const d = JSON.parse(await (await (await bdir.getFileHandle(n)).getFile()).text());
        if (!validData(d)) continue;
        try { const bad = await (await (await FS.dir.getFileHandle(DATA_FILE)).getFile()).text(); await writeFile(bdir, 'damaged_'+stampNow()+'.json', bad); } catch(e){}
        loadBills(d); FS.knownStamp = null; await persist();
        toast('Loaded the backup from '+n.replace(/^bills-|\.json$/g,'')); enterApp(); return;
      } catch(e){}
    }
    toast('No usable backup was found in the Backups folder.');
  } catch(e){ toast('The Backups folder couldn’t be opened.'); }
}
function enterApp(){ setSaveState(FS.state); $('#mainNav').hidden = false; go('list'); }

/* ---------- one window at a time ---------- */
function takeLock(steal){
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise(res => {
    navigator.locks.request('deoratan-billing-writer', steal ? {steal:true} : {ifAvailable:true}, lock => {
      if (!lock){ res(false); return; }
      FS.hasLock = true; res(true); return new Promise(() => {});
    }).catch(err => { FS.hasLock = false; if (err && err.name === 'AbortError') showElsewhere(true); });
  });
}

async function startData(){
  if (!fsSupported()){ showUnsupported(); return; }
  if (!FS.hasLock && !(await takeLock(false))){ showElsewhere(false); return; }
  const root = await kvGet('root');
  if (!root){ showSetup(); return; }
  FS.root = root; FS.sub = !!(await kvGet('sub'));
  let st = 'prompt';
  try { st = await root.queryPermission({mode:'readwrite'}); } catch(e){}
  if (st === 'granted') openStoredFolder(); else showReconnect();
}

/* ================= DOWNLOADS (PDF / Excel go to the Downloads folder) ================= */
S.downloads = {
  save: async ({filename, data}) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return {status:'saved'};
  }
};

/* ================= INSTALL + UPDATES ================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; $('#installBtn').hidden = true; toast('Installed. Open it any time from the Start menu or desktop.'); });
$('#installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch(e){} installEvt = null; $('#installBtn').hidden = true; };

let updating = false;
function showUpdate(reg){
  const bar = $('#updateBar'); bar.hidden = false;
  $('#updateNow').onclick = async () => {
    if (S.view === 'form' && S.formDirty && S.form && S.form.status === 'draft'){ await saveBill(cleanForSave(S.form)); S.formDirty = false; }
    if (S.view === 'form' && S.formDirty){ toast('Save or leave the bill you’re editing first.'); return; }
    await saveChain;
    updating = true;
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); else location.reload();
  };
}
if ('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); });
      });
      // look for a new version now and then while the app is open
      setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}); }, 60*60*1000);
    } catch(e){}
  });
}

/* ================= REPORT A PROBLEM =================
   The office team tells us about a problem or an idea from inside the app. It goes to /api/report (a small
   Cloudflare function that files it in Linear). Without internet it waits on this laptop and goes later. */
const REPORT_URL = 'api/report';
let reportBusy = false;
/* why reports are waiting: null (nothing waiting / not tried yet), {kind:'offline'} or {kind:'server', why:'…'} */
let reportProblem = null;
async function reportQueue(){ const q = await kvGet('reports'); return Array.isArray(q) ? q : []; }
async function appVersion(){ try { const k = (await caches.keys()).find(n => n.startsWith('deoratan-app-')); return k ? k.slice(13) : 'dev'; } catch(e){ return 'dev'; } }
/* plain words for what the server said */
function serverWhy(status, out){
  if (out && out.error === 'not_configured') return 'The report service on Cloudflare is missing a setting'+(out.missing && out.missing.length ? ' ('+out.missing.join(', ')+')' : '')+'.';
  if (out && out.error === 'linear') return 'Linear did not accept the report'+(out.detail ? ': '+out.detail : '')+'.';
  if (status === 404) return 'The report service was not found on the server.';
  return 'The report service had an error (code '+status+').';
}
const problemLine = (p) => !p ? '' : p.kind === 'offline'
  ? 'No internet right now. It sends by itself when the internet is back.'
  : p.why+' This is a setup problem, not your internet. Please tell the person who looks after this app.';
async function showReportCount(){
  const n = (await reportQueue()).length, el = $('#reportCount'); if (!el) return;
  el.hidden = !n;
  el.textContent = !n ? '' : ' · '+n+' waiting'+(reportProblem && reportProblem.kind === 'server' ? ': service problem' : reportProblem && reportProblem.kind === 'offline' ? ' for internet' : '');
  el.classList.toggle('bad', !!(n && reportProblem && reportProblem.kind === 'server'));
}
function reportContext(){
  const ctx = {screen: S.view, browser: navigator.userAgent};
  const b = S.view === 'bill' ? S.bills.get(S.currentId) : S.view === 'form' ? S.form : null;
  if (b){
    const c = calc(b), kind = kindOf(b);
    ctx.bill = (kind === 'gpurchase' ? 'Purchase ' : kind === 'gsale' ? 'Grain sale ' : 'Aata bill ')+(b.invNo || '(draft)')+
      (isGrain(b) ? ' · '+grainName(b.grain) : '')+' · '+(b.party || 'no name')+' · '+dmy(b.date)+' · ₹'+inr(c.final)+(S.view === 'form' ? ' · while filling the form' : '');
  }
  return ctx;
}
/* send everything waiting, now. Returns {sent:[issue ids], problem} */
async function sendReports(){
  const result = {sent:[], problem:null};
  if (reportBusy) return result;
  if (!(await reportQueue()).length){ reportProblem = null; showReportCount(); return result; }
  if (!navigator.onLine){ reportProblem = result.problem = {kind:'offline'}; showReportCount(); return result; }
  reportBusy = true;
  try {
    for (const r of await reportQueue()){
      let res;
      try { res = await fetch(REPORT_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(r)}); }
      catch(e){ result.problem = {kind:'offline'}; break; }   // no connection after all
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok){ result.sent.push(out.issue); await kvSet('reports', (await reportQueue()).filter(x => x.id !== r.id)); }
      else if (res.status >= 500 || res.status === 404){ result.problem = {kind:'server', why:serverWhy(res.status, out)}; break; }   // keep it, try again later
      else await kvSet('reports', (await reportQueue()).filter(x => x.id !== r.id));   // a report the server can never accept
    }
  } finally { reportBusy = false; }
  reportProblem = (await reportQueue()).length ? result.problem : null;
  showReportCount();
  return result;
}
/* background tries: tell the person when a waiting report finally goes */
async function retryReports(){
  const res = await sendReports();
  if (res.sent.length) toast((res.sent.length === 1 ? 'Your waiting report was sent' : res.sent.length+' waiting reports were sent')+'. Reference: '+res.sent.join(', '));
}
async function openReport(){
  S.reportsWaiting = (await reportQueue()).length;
  const ctx = reportContext();
  let name = ''; try { name = localStorage.getItem('reportName') || ''; } catch(e){}
  const waiting = S.reportsWaiting || 0;
  openDialog('<h2 id="dlgT">Report a problem or idea</h2>'+
    (waiting ? '<div class="rpstatus'+(reportProblem && reportProblem.kind === 'server' ? ' bad' : '')+'" id="rpStatus"><b>'+(waiting === 1 ? '1 report is' : waiting+' reports are')+' waiting to be sent.</b> '+
      esc(problemLine(reportProblem) || 'Not tried yet.')+' <button class="btn small" type="button" id="rpRetry">Try again now</button></div>' : '')+
    '<p class="note" style="font-size:14px">It goes straight to the person who looks after this app. Hindi or English is fine.</p>'+
    '<fieldset class="pick"><legend>What is it?</legend><div class="pickrow two">'+
      '<button type="button" class="pickbtn" data-rk="problem" aria-pressed="true"><b>Problem</b><span>Something is wrong or not working</span></button>'+
      '<button type="button" class="pickbtn" data-rk="idea" aria-pressed="false"><b>Idea</b><span>Something new or a change you need</span></button></div></fieldset>'+
    '<div class="field"><label for="rpText" id="rpLabel">What happened?</label><textarea id="rpText" rows="5" placeholder="e.g. The PDF of bill 12 came out blank when the internet was off" aria-describedby="rpErr"></textarea><p class="err" id="rpErr" hidden></p></div>'+
    (ctx.bill ? '<label class="rpbill"><input type="checkbox" id="rpBill" checked> Include this bill: '+esc(ctx.bill)+'</label>' : '')+
    '<div class="field"><label for="rpName">Your name</label><input id="rpName" type="text" maxlength="60" value="'+esc(name)+'" placeholder="So we know who to ask"></div>'+
    '<div class="btns"><button class="btn" type="button" id="rpCancel">Cancel</button><button class="btn primary" type="button" id="rpSend">Send</button></div>');
  let kind = 'problem';
  document.querySelectorAll('[data-rk]').forEach(b => b.onclick = () => {
    kind = b.dataset.rk; document.querySelectorAll('[data-rk]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#rpLabel').textContent = kind === 'idea' ? 'What would help?' : 'What happened?';
    $('#rpText').placeholder = kind === 'idea' ? 'e.g. Add a column for vehicle number in the grain sale statement' : 'e.g. The PDF of bill 12 came out blank when the internet was off';
  });
  $('#rpText').focus();
  $('#rpText').addEventListener('input', () => { $('#rpErr').hidden = true; });
  $('#rpCancel').onclick = closeDialog;
  if ($('#rpRetry')) $('#rpRetry').onclick = async () => {
    const b = $('#rpRetry'); b.disabled = true; b.textContent = 'Trying…';
    const res = await sendReports();
    if (res.sent.length){ closeDialog(); toast('Sent. Reference: '+res.sent.join(', ')); return; }
    $('#rpStatus').innerHTML = '<b>Still waiting.</b> '+esc(problemLine(res.problem))+' <button class="btn small" type="button" id="rpRetry2" disabled>Tried just now</button>';
    $('#rpStatus').classList.toggle('bad', !!(res.problem && res.problem.kind === 'server'));
  };
  $('#rpSend').onclick = async () => {
    const text = $('#rpText').value.trim(), err = $('#rpErr');
    if (text.length < 5){ err.textContent = 'Write a few words about it.'; err.hidden = false; $('#rpText').focus(); return; }
    const who = $('#rpName').value.trim(); try { localStorage.setItem('reportName', who); } catch(e){}
    if (ctx.bill && $('#rpBill') && !$('#rpBill').checked) delete ctx.bill;
    const d = new Date(), rep = {id:uid(), kind, text, name:who, when:dmy(todayISO())+' '+pad(d.getHours())+':'+pad(d.getMinutes()), version:await appVersion(), context:ctx, queued:!navigator.onLine};
    $('#rpSend').disabled = true;
    await kvSet('reports', (await reportQueue()).concat([rep]));
    closeDialog(); showReportCount();
    const res = await sendReports();
    if (res.sent.length && !res.problem) toast('Sent, thank you. Reference: '+res.sent.join(', '));
    else if (res.problem && res.problem.kind === 'server') toast('Saved, but not sent: '+problemLine(res.problem), 9000);
    else toast('No internet. Saved on this laptop, and it sends by itself when the internet is back.');
  };
}
$('#reportBtn').onclick = openReport;
window.addEventListener('online', () => retryReports());
window.addEventListener('offline', () => { reportQueue().then(q => { if (q.length){ reportProblem = {kind:'offline'}; showReportCount(); } }); });
setInterval(() => retryReports(), 10*60*1000);
setTimeout(() => retryReports(), 4000);

/* ================= START ================= */
$('#tab-bills').onclick = () => leaveForm(() => go('list'));
$('#tab-cust').onclick = () => leaveForm(() => go('customers'));
$('#tab-grain').onclick = () => leaveForm(() => go('glist'));
$('#saveStatus').onclick = openDataPanel;
startData();
})();
