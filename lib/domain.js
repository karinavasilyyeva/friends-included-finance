const PEOPLE = ['Richard', 'Anastasia', 'Jean-Claude'];
const PROJECTS = ['A', 'B'];
const ALLOCATIONS = ['A', 'B', 'Company overhead'];
const CATEGORIES = ['Materials', 'Travel', 'Other'];

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Amount must be a number');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function validateReference(value) {
  const ref = required(value, 'Reference').toUpperCase();
  if (!/^[SE][A-Z0-9-]{1,19}$/.test(ref)) throw new Error('Reference must start with S or E');
  return ref;
}

export function validateSplit(split) {
  const result = {};
  for (const person of PEOPLE) {
    const n = Number(split?.[person]);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${person} share must be 0% to 100%`);
    result[person] = n;
  }
  const total = PEOPLE.reduce((sum, person) => sum + result[person], 0);
  if (Math.abs(total - 100) > 1e-9) throw new Error('Commission shares must total 100%');
  return result;
}

export function commission(amountValue, splitValue) {
  const amount = money(amountValue);
  const split = validateSplit(splitValue);
  const poolCents = Math.round(amount * 10);
  const cents = Object.fromEntries(PEOPLE.map(p => [p, Math.round(poolCents * split[p] / 100)]));
  const difference = poolCents - PEOPLE.reduce((sum, p) => sum + cents[p], 0);
  if (difference) {
    const winner = [...PEOPLE].sort((a, b) => split[b] - split[a] || PEOPLE.indexOf(a) - PEOPLE.indexOf(b))[0];
    cents[winner] += difference;
  }
  return { pool: poolCents / 100, earned: Object.fromEntries(PEOPLE.map(p => [p, cents[p] / 100])) };
}

export function createSale(input, employee, origin = {}) {
  if (!PEOPLE.includes(employee?.name) || employee.role !== 'sales') throw new Error('Only a salesperson can submit a sale');
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (!PROJECTS.includes(input.project)) throw new Error('Project must be A or B');
  return {
    reference: validateReference(input.reference), type: 'sale', submitted_at: new Date().toISOString(),
    submitter: employee.name, customer: required(input.customer, 'Customer'), project: input.project,
    description: required(input.description, 'Description'), amount, proposed_split: validateSplit(input.split),
    approved_split: null, commission_pool: 0, commission_earned: { Richard: 0, Anastasia: 0, 'Jean-Claude': 0 },
    status: 'Pending approval', proposed_allocation: null, final_allocation: null,
    origin_chat_id: origin.chatId || employee.telegram_chat_id || null,
    sync_status: 'pending', notify_status: origin.kind === 'telegram' ? 'sent' : 'not_required'
  };
}

export function createExpense(input, employee, origin = {}) {
  if (employee?.name !== 'Kevin' || employee.role !== 'expenses') throw new Error('Only Kevin can submit an expense');
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (!CATEGORIES.includes(input.category)) throw new Error('Invalid expense category');
  if (!ALLOCATIONS.includes(input.allocation)) throw new Error('Invalid proposed allocation');
  const overhead = input.allocation === 'Company overhead';
  return {
    reference: validateReference(input.reference), type: 'expense', submitted_at: new Date().toISOString(),
    submitter: employee.name, customer: null, project: null, description: required(input.description, 'Description'),
    category: input.category, amount, proposed_split: null, approved_split: null, commission_pool: 0,
    commission_earned: null, proposed_allocation: input.allocation,
    final_allocation: overhead ? 'Company overhead' : null,
    status: overhead ? 'Allocated' : 'Awaiting allocation',
    origin_chat_id: origin.chatId || employee.telegram_chat_id || null,
    sync_status: 'pending', notify_status: origin.kind === 'telegram' ? 'sent' : 'not_required'
  };
}

export function approveSale(row, split, actor) {
  if (actor?.role !== 'manager') throw new Error('Only Svetlana can approve sales');
  if (row.type !== 'sale') throw new Error('Transaction is not a sale');
  if (row.status === 'Approved') return row;
  if (row.status !== 'Pending approval') throw new Error('Sale is not pending approval');
  const approved = validateSplit(split);
  const calc = commission(row.amount, approved);
  return { ...row, approved_split: approved, commission_pool: calc.pool, commission_earned: calc.earned,
    status: 'Approved', decided_at: new Date().toISOString(), sync_status: 'pending', notify_status: 'pending' };
}

export function allocateExpense(row, allocation, actor) {
  if (actor?.role !== 'manager') throw new Error('Only Svetlana can allocate expenses');
  if (row.type !== 'expense') throw new Error('Transaction is not an expense');
  if (row.status === 'Allocated') return row;
  if (row.status !== 'Awaiting allocation') throw new Error('Expense is not awaiting allocation');
  if (!ALLOCATIONS.includes(allocation)) throw new Error('Invalid final allocation');
  return { ...row, final_allocation: allocation, status: 'Allocated', decided_at: new Date().toISOString(),
    sync_status: 'pending', notify_status: 'pending' };
}

export function dashboard(rows) {
  const result = {
    projects: { A: { income: 0, commissions: 0, expenses: 0, result: 0 }, B: { income: 0, commissions: 0, expenses: 0, result: 0 } },
    company: { income: 0, commissions: 0, expenses: 0, overhead: 0, awaiting: 0, result: 0 },
    earned: { Richard: 0, Anastasia: 0, 'Jean-Claude': 0 }, pendingSales: [], pendingExpenses: []
  };
  for (const row of rows) {
    if (row.type === 'sale') {
      if (row.status !== 'Approved') { result.pendingSales.push(row); continue; }
      result.projects[row.project].income += row.amount;
      result.projects[row.project].commissions += row.commission_pool;
      result.company.income += row.amount;
      result.company.commissions += row.commission_pool;
      for (const p of PEOPLE) result.earned[p] += row.commission_earned[p];
    } else {
      result.company.expenses += row.amount;
      if (row.final_allocation === 'Company overhead') result.company.overhead += row.amount;
      else if (PROJECTS.includes(row.final_allocation)) result.projects[row.final_allocation].expenses += row.amount;
      else result.company.awaiting += row.amount;
      if (row.status === 'Awaiting allocation') result.pendingExpenses.push(row);
    }
  }
  for (const p of PROJECTS) {
    const x = result.projects[p]; x.result = money(x.income - x.commissions - x.expenses);
  }
  result.company.result = money(result.company.income - result.company.commissions - result.company.expenses);
  return result;
}

export const constants = { PEOPLE, PROJECTS, ALLOCATIONS, CATEGORIES };
