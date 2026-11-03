export default {
  modes: { v4: 'v4 融合版' },
  admin: {
    description: {
      v4: '本站当前使用 v4 融合版：卡片界面沿用 v1，检测用 v2 的真实请求统计和糖果题。检测配置在「V2 被动统计」页签里设置；V1 的外部端点探测与配额监控不运行，数据保留。',
    },
    switchEffect: {
      v4: '切换后用户看到 v1 样式的分组卡片页，数据来自 V2 的真实请求统计和糖果题。糖果题会按 V2 配置向本站分组发真实请求并消耗上游额度；V1 的外部端点探测与配额监控停止，数据保留，切回 V1 即恢复。',
    },
  },
  overall: { operational: '正常', degraded: '性能下降', failed: '服务异常', unknown: '暂无数据', stale: '数据待更新' },
  card: {
    latestFirstToken: '最新真实请求首字',
    outputRate: '观测输出速率',
    effectiveRate: '当前有效倍率',
    cacheRate: '缓存率 · 30 分钟',
    realFirstTokens: '最近真实请求首字',
    firstTokenSamples: '{n} 条样本',
    firstTokenLatest: '最新一次',
    realFirstTokensEmpty: '近 24 小时暂无首字样本',
    availability: '真实请求可用率',
    candyAccuracy: '糖果正确率 {value}%',
  },
  detail: {
    candyTitle: '糖果题（降智检测）',
    passiveTitle: '真实请求',
    model: '模型',
    latest: '最新结论',
    latestLatency: '最近延迟',
    accuracy: '正确率',
    meanLatency: '平均延迟',
    health: '健康（24 小时）',
    ttft: '首字 P50（24 小时）',
    availability: '{range} 可用率',
    noCandy: '该分组未开启糖果检测',
    noPassive: '近 30 天没有真实请求',
    loadFailed: '加载分组明细失败',
  },
  empty: {
    title: '暂无可显示的分组',
    description: '管理员尚未启用监控平台，或你没有可用的分组。',
  },
}
