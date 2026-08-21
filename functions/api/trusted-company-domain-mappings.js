export const trustedCompanyDomainMappingVersion = '2026-08-21-1';

export const trustedCompanyDomainMappings = [
  {
    domains: ['jack-hsinchu.com'],
    taxIds: ['85422023'],
    names: ['杰克行李箱維修工作室'],
    officialUrl: 'https://www.jack-hsinchu.com/',
    reviewedAt: '2026-08-21',
    evidence: [
      {
        type: 'official-site',
        source: '杰克行李箱維修官方網站',
        sourceUrl: 'https://www.jack-hsinchu.com/',
        matchedFields: ['網域']
      },
      {
        type: 'business-registration',
        source: '經濟部商工登記公示資料',
        sourceUrl: 'https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?queryString=85422023',
        matchedFields: ['統一編號', '商業名稱', '登記狀態']
      }
    ]
  }
];
