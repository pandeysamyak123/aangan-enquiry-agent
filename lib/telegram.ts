// Telegram Bot API — instant handoff to designers (with buttons) and alerts to Nikhil.
export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;

type Button = { text: string; callback_data?: string; url?: string };

export async function tg<T = any>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

export async function sendMessage(chatId: string | number, html: string, buttons?: Button[][]) {
  const msg = await tg<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
  return msg.message_id;
}

export async function editButtons(chatId: string | number, messageId: number, buttons: Button[][]) {
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons } });
}

export async function answerCallback(id: string, text: string) {
  await tg('answerCallbackQuery', { callback_query_id: id, text });
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Buttons on a lead card; callback data is "<action>:<leadId>" (well under Telegram's 64-byte cap).
export function leadButtons(leadId: string, state: 'new' | 'claimed' | 'called' | 'done', recordingUrl?: string): Button[][] {
  const rows: Button[][] = [];
  if (state === 'new') rows.push([{ text: '🙋 Claim', callback_data: `claim:${leadId}` }]);
  if (state === 'claimed') rows.push([{ text: '📞 Called', callback_data: `called:${leadId}` }, { text: '✖ Not a fit', callback_data: `notfit:${leadId}` }]);
  if (state === 'called') rows.push([{ text: '✖ Not a fit', callback_data: `notfit:${leadId}` }]);
  if (recordingUrl) rows.push([{ text: '▶ Recording', url: recordingUrl }]);
  return rows;
}
