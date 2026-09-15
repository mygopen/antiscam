export function freeAiConfirmed(env) {
  // Retain the previously verified production flag during configuration migration.
  const value = env.AI_FREE_ONLY_CONFIRMED === undefined
    ? env.CHAT_AI_FREE_ONLY_CONFIRMED : env.AI_FREE_ONLY_CONFIRMED;
  return value === 'true';
}

export function aiUnavailableMessage(reason) {
  if (reason === 'quota' || reason === 'daily_budget_exhausted') {
    return '今日 AI 免費使用額度不足，已停止 AI；台灣時間上午 8 點重置後可再試。';
  }
  if (reason === 'busy') return 'AI 目前忙碌，這次未執行複核，請稍後再試。';
  if (reason === 'free_plan_unconfirmed') return '尚未確認 AI 免費方案，為避免費用已停止 AI。';
  if (['budget_unavailable', 'configuration', 'binding_unavailable', 'invalid_budget'].includes(reason)) {
    return 'AI 設定或額度檢查暫時無法使用，已停止 AI。';
  }
  if (reason === 'uncertain') return 'AI 未能取得足夠可靠的辨識結果，無法確認安全；請裁切清楚的內容或貼上實際連結。';
  return 'AI 辨識失敗或回應不完整，無法確認安全；請稍後再試或貼上實際連結。';
}
