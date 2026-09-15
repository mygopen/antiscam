export const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const CHAT_MAX_TOKENS = 80;

export function fixedChatReply(text) {
  const value = String(text || '').trim().replace(/[\s!?！？。～~，,]/g, '').toLowerCase();
  if (/^(你好|您好|嗨|哈囉|hello|hi|ok|好的|好|謝謝|感謝)$/.test(value)) {
    return '你好！可以貼上可疑網址，或上傳截圖檢查風險。請勿提供密碼、驗證碼或完整卡號。';
  }
  if (/^(你可以查什麼|可以查什麼|你能做什麼|你可以做什麼|可以問什麼|功能介紹|怎麼使用|如何使用)$/.test(value)) {
    return '可以貼上網址進行風險檢測，或上傳可疑訊息截圖。檢測結果是風險提醒，不保證交易安全。';
  }
  if (/^(如何上傳|怎麼上傳|如何上傳截圖|怎麼上傳截圖|如何上傳圖片|怎麼上傳圖片)$/.test(value)) {
    return '請點輸入框旁的相機圖示選擇截圖。上傳前先遮住姓名、電話、帳號及驗證碼等個資。';
  }
  if (/^(如何檢查網址|怎麼檢查網址|如何查網址|怎麼查網址)$/.test(value)) {
    return '直接貼上完整網址即可檢測，不必先打開可疑網站。若是縮網址，系統會嘗試確認最終目的地。';
  }
  return null;
}

export function chatFallback(reason) {
  const prefix = reason === 'free_plan_unconfirmed'
    ? '為避免產生 AI 費用，目前僅提供基本服務。'
    : 'AI 額度不足或暫時無法使用，已停止呼叫模型。';
  return `${prefix}你仍可貼上網址進行檢測；請勿提供密碼或驗證碼。`;
}

export function reserveChatNeurons(messages, model = CHAT_MODEL) {
  if (model !== CHAT_MODEL || !Array.isArray(messages)) return null;
  // Pinned Cloudflare rates (2026-09-15). UTF-8 bytes bound byte-token inputs;
  // reserve additional template overhead and margin, never refund estimates.
  const encoder = new TextEncoder();
  let inputBound = 256;
  for (const message of messages) {
    if (typeof message?.content !== 'string') return null;
    inputBound += encoder.encode(message.content).length + 128;
  }
  return Math.ceil((inputBound * 13778 + CHAT_MAX_TOKENS * 26128) / 1000000 * 1.25) + 5;
}
