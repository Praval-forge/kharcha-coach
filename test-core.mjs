// Tests the page's real parsing and detection code by loading kharcha-coach.html's script in a stubbed browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./kharcha-coach.html', import.meta.url), 'utf8');
let code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const end = code.lastIndexOf('})();');
code = code.slice(0, end) + 'globalThis.__kc = {txnsFromCSV, enrich, analyze, detect, buildAlerts, categorise, merchantKey, sampleTxns, occurrences, TODAY};\n' + code.slice(end);

// A browser stub where every property is a harmless object, so the page can boot and render into nothing.
const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === Symbol.iterator ? function* () {} : stub(),
  set: () => true, apply: () => stub(),
});
const ctx = vm.createContext({
  document: stub(), window: {}, location: {protocol: 'file:'}, navigator: stub(), addEventListener() {}, console,
  localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
  getComputedStyle: () => stub(), fetch: () => Promise.reject(new Error('offline')), URL, Blob, File: class {}, FileReader: class {}, AbortController, TextDecoder,
});
new vm.Script(code).runInContext(ctx);
const K = ctx.__kc, DAY = 86400000, today = K.TODAY.getTime();
const ago = n => new Date(today - n * DAY);

/* ---- helpers to write bank-style CSV text ---- */
const p2 = n => String(n).padStart(2, '0');
const fmt = {
  dmy2: d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`,
  dmy4: d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`,
  dashes: d => `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`,
  mon: d => `${p2(d.getDate())} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`,
  mdy: d => `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}`,
};
// Three monthly Netflix charges, one salary credit and two one-off debits.
const rows = [[3, 'NEFT CR-ACME TECH-SALARY', 90000], [5, 'UPI-NETFLIX.COM-AUTOPAY', -649], [35, 'UPI-NETFLIX.COM-AUTOPAY', -649], [65, 'UPI-NETFLIX.COM-AUTOPAY', -649], [10, 'SWIGGY ORDER 4412', -380], [20, 'BIGBASKET ORDER', -1450]];
const banks = {
  'HDFC Bank': () => ['Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance', ...rows.map(([n, d, a]) => [fmt.dmy2(ago(n)), `"${d}"`, '0001', fmt.dmy2(ago(n)), a < 0 ? -a : '', a > 0 ? a : '', 1000].join(','))].join('\n'),
  'SBI': () => ['Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance', ...rows.map(([n, d, a]) => [fmt.mon(ago(n)), fmt.mon(ago(n)), d, 'REF1', a < 0 ? -a : '', a > 0 ? a : '', 1000].join(','))].join('\n'),
  'ICICI Bank': () => ['S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR),Deposit Amount (INR),Balance (INR)', ...rows.map(([n, d, a], i) => [i + 1, fmt.dmy4(ago(n)), fmt.dmy4(ago(n)), '-', d, a < 0 ? -a : '', a > 0 ? a : '', 1000].join(','))].join('\n'),
  'Axis Bank': () => ['SRL NO,Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL', ...rows.map(([n, d, a], i) => [i + 1, fmt.dashes(ago(n)), '', d, a < 0 ? -a : '', a > 0 ? a : '', 1000, 99].join(','))].join('\n'),
  'Kotak': () => ['Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Debit,Credit,Balance,Dr / Cr', ...rows.map(([n, d, a], i) => [i + 1, fmt.dashes(ago(n)), fmt.dashes(ago(n)), d, 'R1', a < 0 ? -a : '', a > 0 ? a : '', 1000, 'Cr'].join(','))].join('\n'),
};
for (const [bank, make] of Object.entries(banks)) {
  const t = K.txnsFromCSV(make());
  assert.equal(t.bank, bank, `${bank}: format detected`);
  assert.equal(t.length, 6, `${bank}: row count`);
  assert.equal(t.filter(x => x.amount < 0).length, 5, `${bank}: debits are negative`);
  assert.equal(t.find(x => x.amount > 0).amount, 90000, `${bank}: credit`);
  assert.equal(Math.round((today - t[0].date.getTime()) / DAY) >= 0, true, `${bank}: dates parsed`);
  const a = K.analyze(K.enrich(t).sort((x, y) => x.date - y.date));
  const nf = a.recurring.find(r => r.name === 'Netflix');
  assert.ok(nf && nf.freq === 'Monthly' && Math.round(nf.amount) === 649, `${bank}: Netflix found as monthly 649`);
}

/* ---- other CSV shapes ---- */
const single = (amts, f = fmt.dmy4) => ['Date,Description,Amount', ...amts.map(([n, d, a]) => `${f(ago(n))},${d},"${a}"`)].join('\n');
let t = K.txnsFromCSV(single([[1, 'SALARY ACME', '50,000.00 Cr'], [2, 'RENT', '15,000.00 Dr'], [3, 'SWIGGY', '400.00 Dr']]));
assert.equal(JSON.stringify(t.map(x => x.amount)), JSON.stringify([50000, -15000, -400]), 'Dr/Cr suffixes');
t = K.txnsFromCSV(single([[1, 'SALARY', '50000'], [2, 'SWIGGY', '-400'], [3, 'UBER', '(250)']]));
assert.equal(JSON.stringify(t.map(x => x.amount)), JSON.stringify([50000, -400, -250]), 'minus sign and brackets');
t = K.txnsFromCSV(single([[1, 'SWIGGY', '400'], [2, 'UBER', '250'], [3, 'ZOMATO', '300']]));
assert.ok(t.every(x => x.amount < 0), 'all-positive statement is read as spending');
t = K.txnsFromCSV(single([[40, 'A', '-1'], [30, 'B', '-1'], [20, 'C', '-1']], fmt.mdy).replace(/\n/g, '\n'));
assert.ok(t.every(x => x.date.getTime() <= today + DAY), 'mm/dd/yyyy detected when a day exceeds 12');
const semi = 'Date;Description;Debit;Credit\n' + [3, 2, 1].map(n => `${fmt.dmy4(ago(n))};ITEM ${n};${n * 100};`).join('\n');
assert.equal(K.txnsFromCSV(semi).length, 3, 'semicolon separated');
assert.throws(() => K.txnsFromCSV('hello,world\n1,2'), /Date/, 'no header');
assert.throws(() => K.txnsFromCSV(single([[1, 'A', '-1']])), /Fewer than 3/, 'too few rows');

/* ---- categories and merchants ---- */
assert.equal(K.merchantKey('UPI/NETFLIX.COM/AUTOPAY'), K.merchantKey('NETFLIX 4821'), 'merchant grouping');
assert.equal(K.categorise('SWIGGY ORDER', -100), 'Food & dining');
assert.equal(K.categorise('BESCOM ELECTRICITY BILL', -100), 'Bills & utilities');
assert.equal(K.categorise('ACME SALARY', 5000), 'Income');
assert.equal(K.categorise('MAKEMYTRIP INDIA', -5000), 'Other');

/* ---- recurring detection ---- */
const series = (desc, days, amt) => K.enrich(days.map((n, i) => ({date: ago(n), desc, amount: -(typeof amt === 'function' ? amt(i) : amt)}))).sort((a, b) => a.date - b.date);
const find = (txns, name) => K.analyze([...txns, ...series('FILLER ORDER', [200], 1)]).recurring.find(r => r.name === name);
assert.equal(find(series('SPOTIFY SI', [5, 35, 65], 119), 'Spotify').freq, 'Monthly');
assert.equal(find(series('JIOHOTSTAR PLAN', [10, 101], 899), 'JioHotstar').freq, 'Quarterly', 'two quarterly charges');
assert.equal(find(series('TURF CRICKET', [2, 9], 300), 'Turf Cricket'), undefined, 'two weekly charges are not enough');
assert.equal(find(series('TURF CRICKET', [2, 9, 16, 23], 300), 'Turf Cricket').freq, 'Weekly');
assert.equal(find(series('SWIGGY ORDER', [5, 35, 65], i => [200, 700, 350][i]), 'Swiggy'), undefined, 'varying food orders are not recurring');
const hike = find(series('YOUTUBE PREMIUM', [5, 35, 65], i => [149, 129, 129][i]), 'YouTube Premium');
assert.equal(JSON.stringify(hike.hike), JSON.stringify({from: 129, to: 149}), 'price hike');
assert.equal(find(series('AUDIBLE PLAN', [100, 130, 160], 199), 'Audible').lapsed, true, 'stopped charging is lapsed');
assert.equal(find(series('CULTFIT PASS', [5, 35, 36, 65], 1999), 'Cult.fit').freq, 'Monthly', 'a double charge does not break detection');

/* ---- alerts ---- */
const al = K.analyze([...series('NETFLIX AUTOPAY', [5, 35, 65], 649), ...series('AMAZON PRIME MEMBERSHIP', [8, 38, 68], 299), ...series('OPENAI CHATGPT', [4, 34], 1950), ...series('GYM FEES', [20, 19], 2500)]).alerts.join('\n');
assert.match(al, /Overlap.*video streaming/); assert.match(al, /New: ChatGPT/); assert.match(al, /Possible duplicate: Gym Fees/);

/* ---- calendar projection ---- */
const mk = (freq, next) => ({freq, next});
const span = (r, days) => K.occurrences(r, K.TODAY, new Date(today + days * DAY));
assert.equal(span(mk('Monthly', new Date(today + 2 * DAY)), 95).length, 4, 'monthly occurrences');
assert.equal(span(mk('Weekly', new Date(today + 1 * DAY)), 28).length, 4, 'weekly occurrences');
assert.equal(span(mk('Yearly', new Date(today + 100 * DAY)), 470).length, 2, 'yearly occurrences');

/* ---- the built-in sample ---- */
const sample = K.analyze(K.enrich(K.sampleTxns()).sort((a, b) => a.date - b.date));
assert.ok(sample.recurring.length >= 8, 'sample has recurring payments');
assert.ok(sample.recurring.find(r => r.name === 'YouTube Premium')?.hike, 'sample has a price hike');
assert.ok(sample.income > 0 && sample.spent > 0 && sample.monthly.every(m => m.income >= 0), 'sample totals');

console.log('core ok');
