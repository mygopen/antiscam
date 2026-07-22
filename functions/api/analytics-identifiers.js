const IDENTIFIER_DEFINITIONS = [
  {
    type: 'universal-analytics',
    label: 'Google Analytics（UA）',
    pattern: /\bUA-\d{4,12}-\d{1,4}\b/gi
  },
  {
    type: 'ga4',
    label: 'Google Analytics 4',
    pattern: /\bG-[A-Z0-9]{10}\b/gi,
    needsAnalyticsContext: true
  },
  {
    type: 'google-tag-manager',
    label: 'Google Tag Manager',
    pattern: /\bGTM-[A-Z0-9]{4,12}\b/gi
  },
  {
    type: 'google-tag',
    label: 'Google tag',
    pattern: /\bGT-[A-Z0-9]{5,15}\b/gi,
    needsAnalyticsContext: true
  },
  {
    type: 'google-ads',
    label: 'Google Ads',
    pattern: /\bAW-\d{6,15}\b/gi
  },
  {
    type: 'floodlight',
    label: 'Google Floodlight',
    pattern: /\bDC-\d{5,15}\b/gi
  },
  {
    type: 'adsense',
    label: 'Google AdSense',
    pattern: /\b(?:ca-)?pub-\d{10,20}\b/gi
  }
];

const ANALYTICS_CONTEXT = /(gtag|googletagmanager|google-analytics|measurement[_-]?id|analytics|dataLayer|google[_-]?tag)/i;

export function normalizeAnalyticsIdentifier(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/^ca-pub-/i, 'pub-').toUpperCase();
  if (/^PUB-\d{10,20}$/.test(normalized)) return normalized.toLowerCase();
  return IDENTIFIER_DEFINITIONS.some(definition => {
    const matcher = new RegExp(`^(?:${definition.pattern.source})$`, 'i');
    return matcher.test(normalized);
  }) ? normalized : '';
}

export function getAnalyticsIdentifierType(value = '') {
  const normalized = normalizeAnalyticsIdentifier(value);
  if (!normalized) return null;
  const definition = IDENTIFIER_DEFINITIONS.find(item => {
    const matcher = new RegExp(`^(?:${item.pattern.source})$`, 'i');
    return matcher.test(normalized);
  });
  return definition ? { type: definition.type, label: definition.label } : null;
}

export function extractAnalyticsIdentifiers(source = '') {
  const text = String(source || '').slice(0, 1000000);
  if (!text) return [];
  const byIdentifier = new Map();

  for (const definition of IDENTIFIER_DEFINITIONS) {
    const matcher = new RegExp(definition.pattern.source, definition.pattern.flags);
    for (const match of text.matchAll(matcher)) {
      if (definition.needsAnalyticsContext) {
        const start = Math.max(0, Number(match.index || 0) - 180);
        const end = Math.min(text.length, Number(match.index || 0) + match[0].length + 180);
        if (!ANALYTICS_CONTEXT.test(text.slice(start, end))) continue;
      }
      const id = normalizeAnalyticsIdentifier(match[0]);
      if (!id || byIdentifier.has(id)) continue;
      byIdentifier.set(id, {
        id,
        type: definition.type,
        typeLabel: definition.label
      });
    }
  }

  return [...byIdentifier.values()].slice(0, 20);
}

export const analyticsIdentifierTypes = IDENTIFIER_DEFINITIONS.map(({ type, label }) => ({ type, label }));
