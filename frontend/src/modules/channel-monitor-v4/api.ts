import { apiClient } from '@/api/client'
import { repeatedArrayParamsSerializer } from '@/api/channelMonitorV2'

export type MonitorView = 'v1' | 'v2' | 'v3' | 'v4'

export interface ChannelMonitorViewState {
  view: MonitorView
}

export async function getView(signal?: AbortSignal): Promise<ChannelMonitorViewState> {
  const { data } = await apiClient.get<ChannelMonitorViewState>('/channel-monitor-v4/view', { signal })
  return data
}

export async function setView(view: MonitorView): Promise<ChannelMonitorViewState> {
  const { data } = await apiClient.put<ChannelMonitorViewState>('/admin/channel-monitor-v4/view', { view })
  return data
}

/** A successful real request with a recorded first token; the fields feed usageOutputTps. */
export interface MonitorRequestSample {
  at: string
  first_token_ms: number
  duration_ms: number | null
  output_tokens: number
  image_count: number
  image_output_tokens: number
  billing_mode: string | null
}

/** Real-traffic side of a card: newest samples first, cache rate over the last 30 minutes. */
export interface MonitorGroupInsight {
  group_id: number
  samples: MonitorRequestSample[]
  cache_rate: number | null
}

export async function getInsights(groupIds: readonly number[], admin: boolean, signal?: AbortSignal): Promise<MonitorGroupInsight[]> {
  if (!groupIds.length) return []
  const { data } = await apiClient.get<{ items: MonitorGroupInsight[] }>(admin ? '/admin/channel-monitor-v4/insights' : '/channel-monitor-v4/insights', {
    params: { group_id: groupIds },
    paramsSerializer: { serialize: repeatedArrayParamsSerializer },
    signal,
  })
  return data.items
}
