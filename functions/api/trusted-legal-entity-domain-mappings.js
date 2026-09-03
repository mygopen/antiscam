export const trustedLegalEntityDomainMappingVersion = '2026-09-03-1';

export const trustedLegalEntityDomainMappings = [
  {
    domains: ['twnic.tw'],
    taxIds: ['17597502'],
    names: ['財團法人台灣網路資訊中心', 'Taiwan Network Information Center'],
    entityType: 'foundation',
    organizationType: '財團法人',
    registrationAuthority: '數位發展部',
    officialUrl: 'https://twnic.tw/',
    courtCode: 'TPD',
    reviewedAt: '2026-09-03',
    evidence: [
      {
        type: 'official-site',
        source: '財團法人台灣網路資訊中心官方網站',
        sourceUrl: 'https://twnic.tw/about_us/',
        directDomainMatch: true,
        independentRegistration: false,
        matchedFields: ['網域', '法人名稱', '統一編號']
      },
      {
        type: 'domain-registration',
        source: 'TWNIC .tw RDAP 網域資料',
        sourceUrl: 'https://ccrdap.twnic.tw/tw/domain/twnic.tw',
        directDomainMatch: true,
        independentRegistration: false,
        matchedFields: ['網域狀態', '註冊人組織名稱']
      }
    ]
  }
];
