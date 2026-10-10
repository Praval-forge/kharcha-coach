import assert from 'node:assert/strict';
import {TOOL_DEFS, runTool} from './tools.mjs';

const tx = (d, desc, amt, cat, m) => ({d, desc, amt, cat, m});
const data = {
  today: '2026-10-10', cancel: ['Netflix'],
  txns: [
    tx('2026-08-01', 'SALARY', 80000, 'Income', 'Acme'), tx('2026-09-01', 'SALARY', 80000, 'Income', 'Acme'), tx('2026-10-01', 'SALARY', 80000, 'Income', 'Acme'),
    tx('2026-08-07', 'NETFLIX', -649, 'Subscriptions', 'Netflix'), tx('2026-09-07', 'NETFLIX', -649, 'Subscriptions', 'Netflix'), tx('2026-10-07', 'NETFLIX', -649, 'Subscriptions', 'Netflix'),
    tx('2026-08-10', 'SWIGGY', -500, 'Food & dining', 'Swiggy'), tx('2026-09-12', 'SWIGGY', -700, 'Food & dining', 'Swiggy'), tx('2026-10-03', 'ZOMATO', -300, 'Food & dining', 'Zomato'),
    tx('2026-08-03', 'RENT', -20000, 'Rent', 'Landlord'),
  ],
  recurring: [{name: 'Netflix', category: 'Subscriptions', freq: 'Monthly', amount: 649, monthly: 649, yearly: 7788, next: '2026-11-07', lapsed: false, hike: null}],
};
for (const t of TOOL_DEFS) assert.equal(t.input_schema.type, 'object');

const ov = runTool('get_overview', {}, data);
assert.equal(ov.period, '2026-08-01 to 2026-10-07'); assert.equal(ov.category_per_month['Food & dining'], Math.round(1500 / (67 / 30.44)));

const q = runTool('query_transactions', {category: 'Food & dining', group_by: 'merchant'}, data);
assert.equal(q.matched, 3); assert.equal(q.total, 1500); assert.equal(q.groups[0].key, 'Swiggy'); assert.equal(q.groups[0].total, 1200);
const big = runTool('query_transactions', {sort: 'largest', limit: 1}, data);
assert.equal(big.transactions[0].amount, 20000);
assert.equal(runTool('query_transactions', {type: 'credit', date_from: '2026-09-01'}, data).matched, 2);

const sim = runTool('simulate_changes', {cancel_subscriptions: ['netflix', 'Nope'], category_cuts: [{category: 'Food & dining', percent: 20}]}, data);
assert.equal(sim.cancelled.length, 1); assert.deepEqual(sim.not_found, ['nope']); assert.equal(sim.saves_per_year, sim.saves_per_month * 12);

const g = runTool('goal_plan', {target_amount: 40000, months: 3}, data);
assert.equal(g.needed_per_month, 13333); assert.equal(typeof g.affordable_now, 'boolean');
assert.equal(runTool('list_recurring', {}, data).items[0].user_marked_to_cancel, true);
assert.throws(() => runTool('nope', {}, data));
console.log('tools ok');

// Alerts and budgets reach the overview.
const withExtras = {...data, alerts: ['Overlap: x'], budgets: {'Food & dining': 1000, Rent: 0}};
const ov2 = runTool('get_overview', {}, withExtras);
assert.deepEqual(ov2.alerts, ['Overlap: x']);
assert.equal(ov2.budgets.length, 1);
assert.deepEqual({c: ov2.budgets[0].category, spent: ov2.budgets[0].spent_this_month, over: ov2.budgets[0].over_by}, {c: 'Food & dining', spent: 300, over: 0});
console.log('alerts + budgets ok');
