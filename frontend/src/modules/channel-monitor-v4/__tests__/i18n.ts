import { vi } from 'vitest'

/** vue-i18n whose t() echoes the key and its params, so specs read the keys a component asks for. */
export async function echoI18n() {
  return {
    ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
      locale: { value: 'zh' },
    }),
  }
}
