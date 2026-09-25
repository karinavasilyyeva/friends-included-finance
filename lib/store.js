const base = () => process.env.SUPABASE_URL?.replace(/\/$/, '');
const headers = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
});

async function request(path, options = {}) {
  if (!base() || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase is not configured');
  const response = await fetch(`${base()}/rest/v1/${path}`, { ...options, headers: { ...headers(), ...options.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function listTransactions() {
  return request('transactions?select=*&order=submitted_at.asc');
}

export async function getTransaction(reference) {
  const rows = await request(`transactions?reference=eq.${encodeURIComponent(reference)}&select=*`);
  return rows[0] || null;
}

export async function insertTransaction(row) {
  const rows = await request('transactions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  return rows[0];
}

export async function updateTransaction(reference, patch) {
  const rows = await request(`transactions?reference=eq.${encodeURIComponent(reference)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
  });
  return rows[0];
}

export async function listEmployees() { return request('employees?select=*&order=display_order.asc'); }
export async function employeeByName(name) {
  const rows = await request(`employees?name=eq.${encodeURIComponent(name)}&select=*`); return rows[0] || null;
}
export async function employeeByTelegramId(id) {
  const rows = await request(`employees?telegram_user_id=eq.${encodeURIComponent(id)}&select=*`); return rows[0] || null;
}
export async function linkTelegram(name, userId, chatId) {
  const rows = await request(`employees?name=eq.${encodeURIComponent(name)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ telegram_user_id: String(userId), telegram_chat_id: String(chatId) })
  });
  return rows[0];
}
