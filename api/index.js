import { createSale, createExpense, approveSale, allocateExpense, dashboard } from '../lib/domain.js';
import * as store from '../lib/store.js';
import { upsertSheetRow } from '../lib/sheets.js';
import { sendTelegram, submissionMessage, decisionMessage } from '../lib/telegram.js';

function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); }
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}
function route(req) { return new URL(req.url, 'https://local').pathname.replace(/^\/api/, '') || '/'; }
async function actor(req) {
  const name = req.headers['x-demo-role'];
  if (!name) throw new Error('Demonstration role is required');
  const employee = await store.employeeByName(name);
  if (!employee) throw new Error('Unknown demonstration role');
  return employee;
}
async function sync(row) {
  try { await upsertSheetRow(row); return await store.updateTransaction(row.reference, { sync_status: 'synced', sync_error: null }); }
  catch (error) { return await store.updateTransaction(row.reference, { sync_status: 'failed', sync_error: error.message }); }
}
async function notify(row, text) {
  const delivery = await sendTelegram(row.origin_chat_id, text);
  return store.updateTransaction(row.reference, { notify_status: delivery.status, notify_error: delivery.error });
}
function parseTelegram(text) {
  const parts = text.split('|').map(x => x.trim());
  if (parts[0].startsWith('/sale')) {
    const [command, customer, project, description, amount, splitText] = parts;
    const reference = command.split(/\s+/)[1]; const nums = splitText?.split('/').map(Number);
    return { type: 'sale', value: { reference, customer, project: project?.toUpperCase(), description, amount, split: { Richard: nums?.[0], Anastasia: nums?.[1], 'Jean-Claude': nums?.[2] } } };
  }
  if (parts[0].startsWith('/expense')) {
    const [command, description, category, amount, allocation] = parts;
    return { type: 'expense', value: { reference: command.split(/\s+/)[1], description, category, amount, allocation } };
  }
  throw new Error('Use /sale REF | customer | A/B | description | amount | R/A/JC or /expense REF | description | category | amount | allocation');
}

export default async function handler(req, res) {
  try {
    const path = route(req);
    if (req.method === 'GET' && path === '/config') return json(res, 200, { owner: process.env.OWNER_NAME || 'Student', telegram: process.env.PUBLIC_TELEGRAM_BOT_URL || '', sheet: process.env.PUBLIC_GOOGLE_SHEET_URL || '', github: process.env.PUBLIC_GITHUB_URL || '' });
    if (req.method === 'GET' && path === '/employees') return json(res, 200, await store.listEmployees());
    if (req.method === 'GET' && path === '/transactions') { const rows = await store.listTransactions(); return json(res, 200, { rows, dashboard: dashboard(rows) }); }
    if (req.method === 'POST' && path === '/transactions') {
      const employee = await actor(req), input = await body(req);
      const row = input.type === 'sale' ? createSale(input, employee, { kind: 'website' }) : createExpense(input, employee, { kind: 'website' });
      if (await store.getTransaction(row.reference)) return json(res, 409, { error: 'Duplicate reference' });
      let saved = await store.insertTransaction(row); saved = await sync(saved);
      return json(res, 201, saved);
    }
    let match = path.match(/^\/transactions\/([^/]+)\/(approve|allocate)$/);
    if (req.method === 'POST' && match) {
      const employee = await actor(req), input = await body(req), reference = decodeURIComponent(match[1]);
      const old = await store.getTransaction(reference); if (!old) return json(res, 404, { error: 'Transaction not found' });
      const decided = match[2] === 'approve' ? approveSale(old, input.split, employee) : allocateExpense(old, input.allocation, employee);
      if (decided === old) return json(res, 200, old);
      let saved = await store.updateTransaction(reference, decided); saved = await sync(saved); saved = await notify(saved, decisionMessage(saved));
      return json(res, 200, saved);
    }
    match = path.match(/^\/transactions\/([^/]+)\/retry-(sync|notification)$/);
    if (req.method === 'POST' && match) {
      const employee = await actor(req); if (employee.role !== 'manager') throw new Error('Only Svetlana can retry deliveries');
      const row = await store.getTransaction(decodeURIComponent(match[1])); if (!row) return json(res, 404, { error: 'Transaction not found' });
      const updated = match[2] === 'sync' ? await sync(row) : await notify(row, row.status === 'Approved' || row.status === 'Allocated' ? decisionMessage(row) : submissionMessage(row));
      return json(res, 200, updated);
    }
    if (req.method === 'POST' && path === '/manager/link-telegram') {
      const employee = await actor(req); if (employee.role !== 'manager') throw new Error('Only Svetlana can link Telegram users');
      const input = await body(req); return json(res, 200, await store.linkTelegram(input.employee, input.userId, input.chatId));
    }
    if (req.method === 'POST' && path === '/telegram/webhook') {
      if (process.env.TELEGRAM_WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) return json(res, 403, { error: 'Invalid webhook secret' });
      const update = await body(req), message = update.message; if (!message?.text) return json(res, 200, { ok: true });
      const employee = await store.employeeByTelegramId(message.from.id);
      if (!employee) { await sendTelegram(message.chat.id, `Your Telegram account is not linked. Your Telegram user ID is ${message.from.id}. Ask Svetlana to link this ID.`); return json(res, 200, { ok: true }); }
      try {
        const parsed = parseTelegram(message.text), origin = { kind: 'telegram', chatId: String(message.chat.id) };
        const row = parsed.type === 'sale' ? createSale(parsed.value, employee, origin) : createExpense(parsed.value, employee, origin);
        if (await store.getTransaction(row.reference)) throw new Error('Duplicate reference');
        let saved = await store.insertTransaction(row); saved = await sync(saved);
        const delivery = await sendTelegram(saved.origin_chat_id, submissionMessage(saved));
        await store.updateTransaction(saved.reference, { notify_status: delivery.status, notify_error: delivery.error });
      } catch (error) { await sendTelegram(message.chat.id, `Not recorded: ${error.message}`); }
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { return json(res, /Only|role|required|must|Invalid|greater|Duplicate/.test(error.message) ? 400 : 500, { error: error.message }); }
}
