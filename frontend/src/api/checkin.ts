/**
 * Daily check-in API. Served by the Yezi check-in sidecar (extensions/checkin)
 * on the same origin; the official backend has no check-in endpoints.
 */

import { apiClient } from './client'

export interface CheckinStatus {
  enabled: boolean
  reward_min: number
  reward_max: number
  checked_in: boolean
  reward_amount?: number
  /** ISO time the current check-in day ends (08:00 Beijing time). */
  next_reset_at: string
  is_admin: boolean
}

export interface CheckinResult {
  reward_amount: number
  new_balance: number
  next_reset_at: string
}

export interface CheckinSettings {
  enabled: boolean
  reward_min: number
  reward_max: number
}

export async function getStatus(): Promise<CheckinStatus> {
  const { data } = await apiClient.get<CheckinStatus>('/ext/checkin/status')
  return data
}

export async function checkIn(): Promise<CheckinResult> {
  const { data } = await apiClient.post<CheckinResult>('/ext/checkin')
  return data
}

/** Site-wide settings; the sidecar accepts this from administrators only. */
export async function updateSettings(settings: CheckinSettings): Promise<CheckinSettings> {
  const { data } = await apiClient.put<CheckinSettings>('/ext/checkin/settings', settings)
  return data
}

export const checkinAPI = { getStatus, checkIn, updateSettings }
