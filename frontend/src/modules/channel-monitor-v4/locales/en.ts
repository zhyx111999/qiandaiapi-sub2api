export default {
  modes: { v4: 'v4 fusion' },
  admin: {
    description: {
      v4: 'This site uses the v4 fusion: the v1 card page, checked by the v2 real-traffic statistics and candy probes. Configure checks in the "V2 passive stats" tab; V1 external endpoint probes and quota monitors do not run, and their data is kept.',
    },
    switchEffect: {
      v4: "Users see the v1-style group card page fed by the v2 real-traffic statistics and candy probes. Candy probes send real requests to this site's groups and use upstream quota as configured in V2; V1 endpoint probes and quota monitors stop, their data is kept and returns when you switch back to V1.",
    },
  },
  overall: { operational: 'Operational', degraded: 'Degraded', failed: 'Outage', unknown: 'No data', stale: 'Data outdated' },
  card: {
    latestFirstToken: 'Latest real first token',
    outputRate: 'Observed output rate',
    effectiveRate: 'Current effective rate',
    cacheRate: 'Cache rate · 30 min',
    realFirstTokens: 'Recent real first tokens',
    firstTokenSamples: '{n} samples',
    firstTokenLatest: 'latest',
    realFirstTokensEmpty: 'No first-token samples in the last 24 hours',
    availability: 'Real-request availability',
    candyAccuracy: 'Candy accuracy {value}%',
  },
  detail: {
    candyTitle: 'Candy probes (downgrade check)',
    passiveTitle: 'Real requests',
    model: 'Model',
    latest: 'Latest verdict',
    latestLatency: 'Latest latency',
    accuracy: 'Accuracy',
    meanLatency: 'Mean latency',
    health: 'Health (24h)',
    ttft: 'TTFT P50 (24h)',
    availability: '{range} availability',
    noCandy: 'Candy probes are not enabled for this group',
    noPassive: 'No real requests in the last 30 days',
    loadFailed: 'Failed to load group details',
  },
  empty: {
    title: 'No groups to show',
    description: 'An admin has not enabled any monitored platform, or you have no usable group.',
  },
}
