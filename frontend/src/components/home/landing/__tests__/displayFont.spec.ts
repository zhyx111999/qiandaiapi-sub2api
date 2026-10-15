import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/landingHome'
import zh from '@/i18n/locales/zh/landingHome'

const dir = dirname(fileURLToPath(import.meta.url))
const covered = new Set(readFileSync(resolve(dir, '../../../../assets/fonts/display-serif.chars.txt'), 'utf8'))

describe('headline display font', () => {
  it.each([
    ['en', en],
    ['zh', zh],
  ])('covers every %s headline character (run `pnpm build:display-font` after editing the headline)', (_, locale) => {
    const text = Object.values(locale.landingHome.headline).join('')
    const missing = [...new Set(text)].filter((character) => !covered.has(character))
    expect(missing).toEqual([])
  })
})
