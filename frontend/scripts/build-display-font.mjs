/**
 * Regenerates the display serif used by the home page headline:
 * Noto Serif SC SemiBold (SIL OFL 1.1, no reserved font name) subset to exactly
 * the characters of the headline in every locale, so the page ships ~20 KB
 * instead of an 11 MB CJK font.
 *
 * Run it after editing `landingHome.headline` in any locale:
 *   pnpm build:display-font <path/to/NotoSerifSC-SemiBold.otf>
 * Source font: https://github.com/notofonts/noto-cjk/blob/main/Serif/SubsetOTF/SC/NotoSerifSC-SemiBold.otf
 * Requires Node 22.18+ (imports the TypeScript locale files directly).
 */
import { readFile, writeFile } from 'node:fs/promises'
import subsetFont from 'subset-font'
import en from '../src/i18n/locales/en/landingHome.ts'
import zh from '../src/i18n/locales/zh/landingHome.ts'

const OUTPUT_DIR = new URL('../src/assets/fonts/', import.meta.url)

const source = process.argv[2]
if (!source) {
  console.error('Usage: pnpm build:display-font <path/to/NotoSerifSC-SemiBold.otf>')
  process.exit(1)
}

const headlineText = [en, zh].flatMap((locale) => Object.values(locale.landingHome.headline)).join('')
const characters = [...new Set(headlineText)].sort().join('')

const font = await subsetFont(await readFile(source), characters, { targetFormat: 'woff2' })
await writeFile(new URL('display-serif.woff2', OUTPUT_DIR), font)
await writeFile(new URL('display-serif.chars.txt', OUTPUT_DIR), characters)
console.log(`display-serif.woff2: ${characters.length} characters, ${font.length} bytes`)
