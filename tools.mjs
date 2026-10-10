// Agent tools. They run over the statement data the browser posts with each request,
// so Claude only ever sees what a tool returns, never the raw statement.
// Transaction shape: {d:'YYYY-MM-DD', desc, amt (negative = spent), cat, m (merchant)}.

const r0 = n => Math.round(n);
const monthsOf = txns => {
  if (!txns.length) return 1;
  const ds = txns.map(t => t.d).sort();
  return Math.max(1, (Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / 86400000 / 30.44);
};
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const group = (list, keyFn) => {
  const g = new Map();
  for (const t of list) { const k = keyFn(t); const e = g.get(k) || {key: k, count: 0, total: 0}; e.count++; e.total += Math.abs(t.amt); g.set(k, e); }
  return [...g.values()].map(e => ({...e, total: r0(e.total)})).sort((a, b) => b.total - a.total);
};

/* User-set monthly limits vs spending in the latest month of the statement. */
function budgetStatus(T, budgets = {}) {
  const entries = Object.entries(budgets).filter(([, v]) => +v > 0);
  if (!entries.length || !T.length) return [];
  const month = T.map(t => t.d.slice(0, 7)).sort().pop();
  return entries.map(([category, limit]) => {
    const spent = sum(T.filter(t => t.amt < 0 && t.cat === category && t.d.startsWith(month)), t => -t.amt);
    return {category, month, limit: r0(+limit), spent_this_month: r0(spent), over_by: r0(Math.max(0, spent - limit))};
  });
}

export const TOOL_DEFS = [
  {
    name: 'get_overview',
    description: "Headline numbers for the user's statement: period, income and spending per month, savings rate, spending per month by category, top merchants, heads-up alerts (overlapping, new or duplicate charges) and the user's budget limits against the latest month. Call this first for broad questions.",
    input_schema: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'query_transactions',
    description: 'Search and aggregate transactions. Filter by category, merchant, text in the description, date range or amount, then optionally group the matches by merchant, category or month. Use it for any "how much did I spend on X" or "show my biggest Y" question. Amounts are in rupees, always positive.',
    input_schema: {
      type: 'object',
      properties: {
        category: {type: 'string', description: 'Exact category name, e.g. "Food & dining". See get_overview for the list.'},
        merchant: {type: 'string', description: 'Case-insensitive substring of the merchant name.'},
        text: {type: 'string', description: 'Case-insensitive substring of the raw bank description.'},
        date_from: {type: 'string', description: 'YYYY-MM-DD, inclusive.'},
        date_to: {type: 'string', description: 'YYYY-MM-DD, inclusive.'},
        type: {type: 'string', enum: ['debit', 'credit', 'all'], description: 'Default debit (money spent).'},
        min_amount: {type: 'number'}, max_amount: {type: 'number'},
        group_by: {type: 'string', enum: ['none', 'merchant', 'category', 'month']},
        sort: {type: 'string', enum: ['recent', 'largest']},
        limit: {type: 'integer', description: 'Max rows returned (default 15, max 40).'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_recurring',
    description: 'Recurring payments detected in the statement (subscriptions, rent, bills): name, category, frequency, amount, yearly cost, next charge date, price hikes and whether the user has ticked it to cancel. Lapsed items stopped charging.',
    input_schema: {type: 'object', properties: {include_lapsed: {type: 'boolean'}}, additionalProperties: false},
  },
  {
    name: 'simulate_changes',
    description: 'What-if calculator. Given subscriptions to cancel (by name) and/or percentage cuts to spending categories, returns the monthly and yearly savings and the new savings rate. Use it before promising a savings figure.',
    input_schema: {
      type: 'object',
      properties: {
        cancel_subscriptions: {type: 'array', items: {type: 'string'}, description: 'Names exactly as returned by list_recurring.'},
        category_cuts: {type: 'array', items: {type: 'object', properties: {category: {type: 'string'}, percent: {type: 'number'}}, required: ['category', 'percent'], additionalProperties: false}},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'goal_plan',
    description: 'Checks whether a savings goal or purchase is affordable: compares the amount needed per month against current free cash flow and lists the largest flexible categories to trim if there is a gap.',
    input_schema: {
      type: 'object',
      properties: {target_amount: {type: 'number', description: 'Rupees.'}, months: {type: 'number', description: 'Months until the money is needed.'}},
      required: ['target_amount', 'months'],
      additionalProperties: false,
    },
  },
];

export function runTool(name, input, data) {
  const T = data.txns, months = monthsOf(T), debits = T.filter(t => t.amt < 0);
  const catPM = () => Object.fromEntries(group(debits, t => t.cat).map(g => [g.key, r0(g.total / months)]));
  const surplus = () => sum(T.filter(t => t.amt > 0), t => t.amt) / months - sum(debits, t => -t.amt) / months;
  switch (name) {
    case 'get_overview': {
      const spent = sum(debits, t => -t.amt), income = sum(T.filter(t => t.amt > 0), t => t.amt);
      const ds = T.map(t => t.d).sort();
      return {
        period: `${ds[0]} to ${ds[ds.length - 1]}`, months: +months.toFixed(1), today: data.today,
        income_per_month: r0(income / months), spent_per_month: r0(spent / months),
        savings_rate_pct: income ? Math.round((income - spent) / income * 100) : null,
        category_per_month: catPM(), top_merchants_total: group(debits, t => t.m).slice(0, 8).map(g => ({merchant: g.key, total: g.total, charges: g.count})),
        recurring_per_month: r0(sum(data.recurring.filter(r => !r.lapsed), r => r.monthly)),
        alerts: data.alerts || [], budgets: budgetStatus(T, data.budgets),
      };
    }
    case 'query_transactions': {
      const {category, merchant, text, date_from, date_to, min_amount, max_amount, group_by = 'none', sort = 'recent'} = input;
      const type = input.type || 'debit', limit = Math.min(Math.max(+input.limit || 15, 1), 40);
      const mq = merchant?.toLowerCase(), tq = text?.toLowerCase();
      let L = T.filter(t =>
        (type === 'all' || (type === 'debit' ? t.amt < 0 : t.amt > 0)) &&
        (!category || t.cat === category) && (!mq || t.m.toLowerCase().includes(mq)) && (!tq || t.desc.toLowerCase().includes(tq)) &&
        (!date_from || t.d >= date_from) && (!date_to || t.d <= date_to) &&
        (min_amount == null || Math.abs(t.amt) >= min_amount) && (max_amount == null || Math.abs(t.amt) <= max_amount));
      const out = {matched: L.length, total: r0(sum(L, t => Math.abs(t.amt)))};
      if (group_by !== 'none') {
        const key = {merchant: t => t.m, category: t => t.cat, month: t => t.d.slice(0, 7)}[group_by];
        out.groups = group(L, key).slice(0, 25);
        if (group_by === 'month') out.groups.sort((a, b) => a.key < b.key ? -1 : 1);
      } else {
        L = sort === 'largest' ? [...L].sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)) : [...L].sort((a, b) => a.d < b.d ? 1 : -1);
        out.transactions = L.slice(0, limit).map(t => ({date: t.d, description: t.desc.slice(0, 80), amount: r0(Math.abs(t.amt)), category: t.cat}));
      }
      return out;
    }
    case 'list_recurring': {
      const list = data.recurring.filter(r => input.include_lapsed || !r.lapsed);
      return {count: list.length, items: list.map(r => ({name: r.name, category: r.category, frequency: r.freq, amount: r0(r.amount), per_year: r0(r.yearly), next_charge: r.next, status: r.lapsed ? 'lapsed' : 'active', price_hike: r.hike, user_marked_to_cancel: data.cancel.includes(r.name)}))};
    }
    case 'simulate_changes': {
      const wanted = new Set((input.cancel_subscriptions || []).map(s => String(s).toLowerCase()));
      const hit = data.recurring.filter(r => !r.lapsed && wanted.has(r.name.toLowerCase()));
      const unknown = [...wanted].filter(w => !hit.some(r => r.name.toLowerCase() === w));
      const cpm = catPM(), cuts = (input.category_cuts || []).map(c => {
        const pct = Math.min(Math.max(+c.percent || 0, 0), 100);
        return {category: c.category, percent: pct, saves_per_month: r0((cpm[c.category] || 0) * pct / 100)};
      });
      const perMonth = sum(hit, r => r.monthly) + sum(cuts, c => c.saves_per_month);
      const income = sum(T.filter(t => t.amt > 0), t => t.amt) / months, spent = sum(debits, t => -t.amt) / months;
      return {
        cancelled: hit.map(r => ({name: r.name, per_month: r0(r.monthly), per_year: r0(r.yearly)})), not_found: unknown, category_cuts: cuts,
        saves_per_month: r0(perMonth), saves_per_year: r0(perMonth * 12),
        new_savings_rate_pct: income ? Math.round((income - spent + perMonth) / income * 100) : null,
      };
    }
    case 'goal_plan': {
      const target = +input.target_amount, mo = Math.max(+input.months || 1, 1), free = surplus(), need = target / mo;
      const flex = group(debits.filter(t => ['Food & dining', 'Shopping', 'Transport', 'Other', 'Groceries'].includes(t.cat)), t => t.cat)
        .slice(0, 3).map(g => ({category: g.key, per_month: r0(g.total / months)}));
      return {target: r0(target), months: mo, free_cash_flow_per_month: r0(free), needed_per_month: r0(need), gap_per_month: r0(Math.max(0, need - free)), affordable_now: free >= need, largest_flexible_categories: flex};
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
