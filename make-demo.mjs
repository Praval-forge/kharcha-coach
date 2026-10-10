// Writes demo-statement.csv: an HDFC-style export with dates relative to today, built to show every feature:
//   price hike (Netflix), renewal this week (Spotify), a lapsed subscription (JioHotstar), overlapping services
//   (Spotify + YouTube Premium, Netflix + Prime), a new subscription (ChatGPT), a duplicate charge (Cult.fit),
//   unlabelled merchants that land in "Other" (for the AI sorter), a variable electricity bill, a SIP and rent.
// Run: node make-demo.mjs
import fs from 'node:fs';

const DAY = 86400000, now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ago = n => new Date(today.getTime() - n * DAY);
const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
const rows = [];
const add = (date, narration, amount) => { if (date <= today) rows.push({date, narration, amount}); };
const START = 150;

// Monthly items anchored to a day of month, over the last ~5 months.
const monthly = (day, narration, amt) => {
  for (let k = -5; k <= 0; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, day);
    if (d >= ago(START) && d <= today) add(d, narration, typeof amt === 'function' ? amt(d) : amt);
  }
};
monthly(1, 'NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY', 92000);
monthly(2, 'UPI-RAJESH KUMAR-RENT PAYMENT-rajesh@okhdfc', -24000);
monthly(4, 'SIP-ZERODHA COIN MUTUAL FUND', -5000);
monthly(5, 'JIO POSTPAID AUTOPAY BILLDESK', -499);
monthly(8, 'ACT FIBERNET BROADBAND BILLDESK', -1180);
monthly(10, 'APOLLO PHARMACY-UPI', () => -Math.round(300 + rnd() * 500));
monthly(22, 'BESCOM ELECTRICITY BILL PAYMENT', () => -Math.round(850 + rnd() * 700));

// Subscriptions
const netflixHikeFrom = ago(40);
monthly(Math.min(28, ((today.getDate() + 20) % 28) + 1), 'NETFLIX.COM MUMBAI AUTOPAY', d => d >= netflixHikeFrom ? -799 : -649); // price hike
const spotifyDay = new Date(today.getTime() + 3 * DAY).getDate();                                                                 // renews in 3 days
for (let k = 1; k <= 5; k++) add(new Date(today.getTime() + 3 * DAY - k * 30 * DAY), 'SPOTIFY INDIA SI AUTOPAY', -119);
for (let k = 0; k <= 4; k++) add(ago(12 + k * 30), 'YOUTUBE PREMIUM GOOGLE INDIA ACH', -149);                                       // overlaps with Spotify
for (let k = 0; k <= 4; k++) add(ago(21 + k * 30), 'AMAZON PRIME MEMBERSHIP AMAZON PAY', -299);                                    // overlaps with Netflix
for (let k = 0; k <= 2; k++) add(ago(78 + k * 30), 'JIOHOTSTAR SUPER MONTHLY AUTOPAY', -299);                                       // lapsed
add(ago(34), 'OPENAI CHATGPT PLUS SUBSCRIPTION', -1950); add(ago(4), 'OPENAI CHATGPT PLUS SUBSCRIPTION', -1950);                    // new
for (let k = 0; k <= 4; k++) add(ago(16 + k * 30), 'CULTFIT MEMBERSHIP BILLDESK', -1999);
add(ago(9), 'CULTFIT MEMBERSHIP BILLDESK', -1999); add(ago(8), 'CULTFIT MEMBERSHIP BILLDESK', -1999);                               // duplicate

// Everyday spending: known merchants plus ones the rules cannot place (for the "Sort Other with AI" button).
const everyday = [
  [0.45, 'UPI-SWIGGY-SWIGGYUPI@icici', 160, 700], [0.28, 'UPI-ZOMATO-ZOMATO@hdfcbank', 180, 850], [0.30, 'UPI-UBER INDIA-UBERINDIA@axis', 90, 450],
  [0.15, 'UPI-BLINKIT-BLINKIT@ybl', 200, 1200], [0.10, 'BIGBASKET ORDER 48213', 700, 2800], [0.08, 'AMAZON PAY INDIA SHOPPING', 400, 4500],
  [0.04, 'MYNTRA DESIGNS PVT LTD', 900, 4000], [0.06, 'HPCL FUEL STATION BANGALORE', 500, 2200],
  [0.12, 'UPI-RAMESH CHAI STALL-9845123@paytm', 20, 120], [0.07, 'UPI-ANJALI TAILORS-anjali.t@oksbi', 250, 1800], [0.06, 'UPI-BOOKWORM LIBRARY-bookworm@ybl', 100, 500],
  [0.05, 'UPI-GREEN LEAF SALON-greenleaf@okaxis', 300, 1500], [0.04, 'UPI-VIKAS AUTO REPAIR-vikas99@okicici', 400, 3500], [0.03, 'MAKEMYTRIP INDIA PVT LTD', 1800, 9000],
];
for (let n = START; n >= 0; n--) for (const [p, narration, lo, hi] of everyday) if (rnd() < p) add(ago(n), narration, -Math.round(lo + rnd() * (hi - lo)));

rows.sort((a, b) => a.date - b.date);
let balance = 150000;
const q = s => `"${s.replace(/"/g, '""')}"`;
const lines = ['Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance'];
for (const [i, r] of rows.entries()) {
  balance += r.amount;
  lines.push([dmy(r.date), q(r.narration), `0000${100000 + i}`, dmy(r.date), r.amount < 0 ? (-r.amount).toFixed(2) : '', r.amount > 0 ? r.amount.toFixed(2) : '', balance.toFixed(2)].join(','));
}
fs.writeFileSync(new URL('./demo-statement.csv', import.meta.url), lines.join('\n') + '\n');
console.log(`Wrote demo-statement.csv with ${rows.length} transactions (${dmy(rows[0].date)} to ${dmy(rows.at(-1).date)})`);
