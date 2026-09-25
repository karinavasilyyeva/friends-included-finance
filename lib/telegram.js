export async function sendTelegram(chatId, text) {
  if (!chatId) return { status: 'no_recipient', error: 'No Telegram recipient linked' };
  if (!process.env.TELEGRAM_BOT_TOKEN) return { status: 'failed', error: 'Telegram is not configured' };
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text })
    });
    const body = await response.json();
    if (!response.ok || !body.ok) return { status: 'failed', error: body.description || `Telegram ${response.status}` };
    return { status: 'sent', error: null };
  } catch (error) { return { status: 'failed', error: error.message }; }
}

export function submissionMessage(row) {
  const destination = row.type === 'sale' ? `Project ${row.project}` : row.proposed_allocation;
  return `${row.reference} recorded — €${row.amount.toFixed(2)}; ${destination}; ${row.status}.`;
}

export function decisionMessage(row) {
  if (row.type === 'sale') {
    const changed = JSON.stringify(row.proposed_split) !== JSON.stringify(row.approved_split);
    const lines = ['Richard', 'Anastasia', 'Jean-Claude'].map(p => `${p}: ${row.proposed_split[p]}% → ${row.approved_split[p]}% (€${row.commission_earned[p].toFixed(2)})`);
    return `${row.reference} approved${changed ? ' — commission split changed' : ''}. Sale €${row.amount.toFixed(2)}; total commission €${row.commission_pool.toFixed(2)}. ${lines.join('; ')}.`;
  }
  const changed = row.proposed_allocation !== row.final_allocation;
  return `${row.reference} — allocation ${changed ? 'changed' : 'confirmed'}. €${row.amount.toFixed(2)}: ${row.description}. Proposed: ${row.proposed_allocation}. Approved: ${row.final_allocation}.`;
}
