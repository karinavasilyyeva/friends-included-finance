import crypto from 'node:crypto';

function b64(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
async function accessToken() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) throw new Error('Google Sheets is not configured');
  const service = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: service.token_uri, iat: now, exp: now + 3600 })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), service.private_key).toString('base64url');
  const response = await fetch(service.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || 'Google authentication failed');
  return data.access_token;
}

const saleHeaders = ['Reference','Submission time','Salesperson','Customer','Project','Description','Amount','Proposed Richard %','Proposed Anastasia %','Proposed Jean-Claude %','Approved Richard %','Approved Anastasia %','Approved Jean-Claude %','Richard earned','Anastasia earned','Jean-Claude earned','Total commission','Status','Sync status'];
const expenseHeaders = ['Reference','Submission time','Reporter','Description','Category','Amount','Proposed allocation','Final allocation','Status','Sync status'];
function values(row) {
  if (row.type === 'sale') return [row.reference,row.submitted_at,row.submitter,row.customer,row.project,row.description,row.amount,row.proposed_split.Richard,row.proposed_split.Anastasia,row.proposed_split['Jean-Claude'],row.approved_split?.Richard ?? '',row.approved_split?.Anastasia ?? '',row.approved_split?.['Jean-Claude'] ?? '',row.commission_earned?.Richard ?? 0,row.commission_earned?.Anastasia ?? 0,row.commission_earned?.['Jean-Claude'] ?? 0,row.commission_pool,row.status,'synced'];
  return [row.reference,row.submitted_at,row.submitter,row.description,row.category,row.amount,row.proposed_allocation,row.final_allocation ?? '',row.status,'synced'];
}

async function sheetsFetch(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || `Sheets ${response.status}`); return body;
}

export async function ensureSheetLayout() {
  const meta = await sheetsFetch('?fields=sheets.properties');
  const existing = new Set(meta.sheets.map(s => s.properties.title));
  const requests = ['Sales','Expenses'].filter(t => !existing.has(t)).map(title => ({ addSheet: { properties: { title } } }));
  if (requests.length) await sheetsFetch(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  await sheetsFetch('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [
    { range: 'Sales!A1:S1', values: [saleHeaders] }, { range: 'Expenses!A1:J1', values: [expenseHeaders] }
  ] }) });
}

export async function upsertSheetRow(row) {
  await ensureSheetLayout();
  const tab = row.type === 'sale' ? 'Sales' : 'Expenses';
  const existing = await sheetsFetch(`/values/${encodeURIComponent(`${tab}!A:A`)}`);
  const index = (existing.values || []).findIndex(r => r[0] === row.reference);
  const rowNumber = index >= 0 ? index + 1 : (existing.values?.length || 0) + 1;
  const end = row.type === 'sale' ? 'S' : 'J';
  await sheetsFetch(`/values/${encodeURIComponent(`${tab}!A${rowNumber}:${end}${rowNumber}`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [values(row)] }) });
  return rowNumber;
}
