import EmailRisk from '../../email-risk.js';

export const SIGNALS = ['credential_request', 'otp_request', 'advance_payment', 'guaranteed_return',
  'impersonation', 'urgent_threat', 'remote_control_install', 'none'];
const cleanLine = value => typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 240) : '';

export function normalizeVisualUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return '';
  if (!/^https?:\/\//i.test(value) && value.includes('@')) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return '';
    return url.href;
  } catch { return ''; }
}

export function parseVisionResult(raw) {
  let parsed;
  try { parsed = JSON.parse(String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { parsed = null; }
  const valid = parsed && !Array.isArray(parsed) &&
    ['high', 'medium', 'low', 'none', 'unknown'].includes(parsed.risk) &&
    typeof parsed.readable === 'boolean' && typeof parsed.confidence === 'number' &&
    parsed.confidence >= 0 && parsed.confidence <= 1 &&
    typeof parsed.analysis === 'string' && !!parsed.analysis.trim() &&
    typeof parsed.advice === 'string' && !!parsed.advice.trim() &&
    Array.isArray(parsed.urls) && parsed.urls.length <= 12 && parsed.urls.every(v => typeof v === 'string') &&
    typeof parsed.primaryUrl === 'string' && Array.isArray(parsed.signals) &&
    parsed.signals.length > 0 && parsed.signals.every(s => SIGNALS.includes(s)) &&
    !(parsed.signals.includes('none') && parsed.signals.length > 1);
  if (!valid) return { risk: 'unknown', status: 'invalid_output', urls: [], signals: [],
    analysis: '圖片辨識結果不完整，無法判定內容風險。', advice: '請裁切清楚的內容後重試，或貼上實際連結。' };
  const urls = [...new Set(parsed.urls.map(normalizeVisualUrl).filter(Boolean))];
  const primary = normalizeVisualUrl(parsed.primaryUrl);
  if (primary && urls.includes(primary)) urls.splice(0, urls.length, primary, ...urls.filter(u => u !== primary));
  const usable = parsed.readable && parsed.confidence >= 0.8;
  const hasEvidence = parsed.signals.some(s => s !== 'none');
  const contradictory = (['high', 'medium'].includes(parsed.risk) && !hasEvidence) ||
    (['low', 'none'].includes(parsed.risk) && hasEvidence);
  let risk = usable && !contradictory ? parsed.risk : 'unknown';
  const mail = usable ? EmailRisk.assess(parsed.mailLines) : null;
  if (mail?.risk === 'high') risk = 'high';
  else if (mail?.needsContentReview && ['none', 'low'].includes(risk)) risk = 'unknown';
  return { risk, status: risk === 'unknown' ? 'uncertain' : 'ok',
    mail,
    urls: usable ? urls : [], signals: usable ? [...new Set(parsed.signals)] : [],
    analysis: mail?.risk === 'high' || (mail?.needsContentReview && risk === 'unknown') ? mail.analysis : usable ? cleanLine(parsed.analysis) : '圖片文字不夠清楚，無法可靠辨識網址或判定內容風險。',
    advice: mail?.risk === 'high' || mail?.needsContentReview ? mail.advice : usable ? cleanLine(parsed.advice) : '請裁切清楚的內容後重試，或貼上實際連結。' };
}

export function buildReport(result) {
  if (result.mail?.risk === 'high') return EmailRisk.report(result.mail);
  const label = { high: '高風險', medium: '中風險', low: '未發現明顯內容風險', none: '未發現明顯內容風險', unknown: '無法判定' }[result.risk] || '無法判定';
  return `⚠️ 風險：${label}\n🔍 分析：${result.analysis}\n🔗 網址：${result.urls[0] || '無'}\n🛡️ 建議：${result.advice}`;
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Legacy clients receive a closed endpoint without reading or forwarding the image.
export function onRequest() {
  return json({ status: 'image_ai_disabled', risk: 'unknown', provider: null, attempts: [], urls: [],
    notice: '圖片雲端 AI 已停用，請重新整理後使用本機文字辨識。',
    report: '風險：資訊不足，無法確認安全。' }, 410);
}
