import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlazaMediaPricingTable from '../PlazaMediaPricingTable.vue'
import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import type { PlazaPriceKind } from '../plazaPriceKind'
import type { PlazaPriceMode } from '../plazaRates'
import { NOVELAI_TIERS, imageModel, interval, novelAIPixelModel, plazaGroup, tokenModel } from './plazaFixtures'

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) }
})

vi.mock('@/composables/useClipboard', () => ({
  useClipboard: () => ({ copyToClipboard: vi.fn(async () => true) })
}))

function mountTable(
  models: PlazaModel[],
  kind: Exclude<PlazaPriceKind, 'token'>,
  group: Partial<ModelPlazaGroup> = {},
  priceMode: PlazaPriceMode = 'group'
) {
  return mount(PlazaMediaPricingTable, { props: { models, kind, group: plazaGroup(group), priceMode } })
}

const headers = (w: ReturnType<typeof mountTable>) => w.findAll('thead th').map((th) => th.text())
const row = (w: ReturnType<typeof mountTable>, i = 0) => w.findAll('tbody tr')[i].findAll('td').map((td) => td.text())

describe('PlazaMediaPricingTable', () => {
  it.each(['group', 'official'] as const)('shares media price widths, caps the name column, and scrolls within the table on mobile (%s)', (mode) => {
    const w = mountTable([novelAIPixelModel([0.05, 0.5, 0.65, 0.8, 0.95])], 'resolution', {}, mode)
    expect(w.classes()).toEqual(expect.arrayContaining(['max-w-full', 'overflow-x-auto']))
    expect(w.find('table').classes()).toEqual(expect.arrayContaining(['w-full', 'table-fixed']))
    expect(w.find('table').element.style.minWidth).toBe(mode === 'group' ? '920px' : '824px')
    const columns = w.findAll('col')
    expect(columns).toHaveLength(mode === 'group' ? 8 : 7)
    expect(columns[0].classes()).toEqual(expect.arrayContaining(['w-56', 'xl:w-60', '2xl:w-[280px]']))
    expect(columns.slice(1, 7).every((col) => !col.attributes('width') && !col.attributes('class'))).toBe(true)
    if (mode === 'group') expect(columns[7].classes()).toContain('w-24')
    // Range boundaries may wrap without truncating or changing the pixel text.
    expect(w.findAll('thead wbr')).toHaveLength(3)
    expect(w.find('th[data-tier="1.5MP"]').text()).toBe('1.5MP 1,048,577–1,572,864 modelPlaza.table.pixelUnit')
  })

  it('keeps narrower request tables compact while accounting for optional columns', async () => {
    const model = imageModel('gpt-image-2', { '1K': 0.01, '2K': 0.01 })
    const w = mountTable([model], 'request')
    expect(w.find('table').element.style.minWidth).toBe('640px')
    expect(w.findAll('col')).toHaveLength(3)
    await w.setProps({ priceMode: 'official' })
    expect(w.findAll('col')).toHaveLength(2)
  })

  it('按分辨率：每档一列，表头写档位分辨率，价格 × 生效倍率；参考图另列', () => {
    const m = imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1, '4K': 0.15 })
    m.image!.reference_image_price = 0.01
    const w = mountTable([m], 'resolution', { rate_multiplier: 2 })
    expect(headers(w)).toEqual([
      'modelPlaza.table.model',
      '1K 1024×1024',
      '2K 2048×2048',
      '4K 4096×4096',
      'modelPlaza.table.referenceImage',
      'modelPlaza.table.rate'
    ])
    expect(row(w)).toEqual(['gpt-image-2', '$0.10modelPlaza.table.perUnitImage', '$0.20modelPlaza.table.perUnitImage', '$0.30modelPlaza.table.perUnitImage', '$0.02modelPlaza.table.perUnitImage', '2x'])
  })

  it('NovelAI 只有 1K/2K；同档分辨率各行不一致时写进单元格', () => {
    const nai = imageModel('nai-diffusion-5-full', { '1K': 0.035, '2K': 0.9 }, { platform: 'novelai' }, NOVELAI_TIERS)
    expect(headers(mountTable([nai], 'resolution'))).toContain('2K 1536×2048')
    const w = mountTable([nai, imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1 })], 'resolution')
    expect(headers(w)).toContain('2K')
    expect(w.find('td[data-tier="2K"]').text()).toMatch(/×/)
  })

  it('NovelAI 像素档：按价卡档位逐列，表头写档位名与像素范围', () => {
    const w = mountTable([novelAIPixelModel([0.05, 0.5, 0.65, 0.8, 0.95])], 'resolution')
    expect(headers(w)).toEqual([
      'modelPlaza.table.model',
      '1MP ≤1,048,576 modelPlaza.table.pixelUnit',
      '1.5MP 1,048,577–1,572,864 modelPlaza.table.pixelUnit',
      '2MP 1,572,865–2,097,152 modelPlaza.table.pixelUnit',
      '2.5MP 2,097,153–2,621,440 modelPlaza.table.pixelUnit',
      '3MP ≥2,621,441 modelPlaza.table.pixelUnit',
      'modelPlaza.table.referenceImage',
      'modelPlaza.table.rate'
    ])
    expect(row(w).slice(1, 7)).toEqual([
      '$0.05modelPlaza.table.perUnitImage',
      '$0.50modelPlaza.table.perUnitImage',
      '$0.65modelPlaza.table.perUnitImage',
      '$0.80modelPlaza.table.perUnitImage',
      '$0.95modelPlaza.table.perUnitImage',
      '$0.075modelPlaza.table.perUnitImage'
    ])
  })

  it('按次：各档同价的生图模型给单一按次价；按上下文分档的按次模型逐档列出', () => {
    const flat = imageModel('gpt-image-2', { '1K': 0.001, '2K': 0.001, '4K': 0.001 })
    expect(headers(mountTable([flat], 'request'))[1]).toBe('modelPlaza.table.perRequestPrice')
    expect(row(mountTable([flat], 'request'))[1]).toBe('$0.001modelPlaza.table.perUnitImage')
    const tiered = tokenModel({
      name: 'sora',
      pricing: { ...tokenModel().pricing!, billing_mode: 'per_request', intervals: [interval({ max_tokens: 128000, per_request_price: 0.1 })] }
    })
    expect(row(mountTable([tiered], 'request'))[1]).toContain('≤128K')
  })

  it('生图独立倍率覆盖分组 / 专属倍率，按视频独立倍率同理', () => {
    const m = imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1 })
    const w = mountTable([m], 'resolution', { rate_multiplier: 2, user_rate_multiplier: 3, image_rate_independent: true, image_rate_multiplier: 0.5 })
    expect(row(w)[1]).toContain('$0.025')
    expect(row(w).at(-1)).toBe('0.5x')
    const video = tokenModel({ name: 'veo', pricing: { ...tokenModel().pricing!, billing_mode: 'video', per_request_price: 1 } })
    expect(row(mountTable([video], 'request', { video_rate_independent: true, video_rate_multiplier: 0 }))[1]).toContain('$0.00')
  })

  it('官方价格口径：无按张参考价，价格与参考图列为 -，不展示倍率', () => {
    const m = imageModel('gpt-image-2', { '1K': 0.05, '2K': 0.1 })
    m.image!.reference_image_price = 0.01
    const w = mountTable([m], 'resolution', {}, 'official')
    expect(row(w).slice(1)).toEqual(['-', '-', '-'])
    expect(headers(w)).not.toContain('modelPlaza.table.rate')
  })
})
