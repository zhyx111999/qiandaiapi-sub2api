import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import PlazaNovelAIAddonPricing from '../PlazaNovelAIAddonPricing.vue'
import zh from '@/i18n/locales/zh/dashboard'
import en from '@/i18n/locales/en/dashboard'

function mountPricing(locale: 'zh' | 'en') {
  return mount(PlazaNovelAIAddonPricing, {
    global: { plugins: [createI18n({ legacy: false, locale, messages: { zh, en } })] }
  })
}

describe('PlazaNovelAIAddonPricing', () => {
  it.each(['zh', 'en'] as const)('shows the fixed add-on prices and free tag suggestions (%s)', (locale) => {
    const wrapper = mountPricing(locale)
    try {
      const messages = { zh, en }[locale].modelPlaza
      expect(wrapper.findAll('tbody tr')).toHaveLength(4)
      expect(wrapper.find('[data-addon="upscale"] .plaza-price').text()).toBe('$0.01')
      expect(wrapper.find('[data-addon="upscale"]').text()).toContain(messages.table.perUnitRequest)
      expect(wrapper.find('[data-addon="encode-vibe"] .plaza-price').text()).toBe('$0.02')
      expect(wrapper.find('[data-addon="encode-vibe"]').text()).toContain(messages.table.perUnitImage)
      expect(wrapper.find('[data-addon="suggest-tags"] .plaza-price').text()).toBe(messages.novelaiAddons.free)
      expect(wrapper.text()).not.toContain('modelPlaza.')
    } finally {
      wrapper.unmount()
    }
  })

  it.each(['zh', 'en'] as const)('uses calibrated Anlas pricing and discloses Opus free tiers instead of a Director range (%s)', (locale) => {
    const wrapper = mountPricing(locale)
    try {
      const director = wrapper.find('[data-addon="director"]')
      expect(director.find('.plaza-price').text()).toBe(locale === 'zh' ? '按耗点计费 / Anlas × $0.01' : 'Anlas × $0.01')
      expect(director.text()).toContain('Opus')
      expect(director.text()).toContain('≤1MP')
      expect(director.text()).toContain(locale === 'zh' ? '免费' : 'free')
      expect(director.text()).toContain(locale === 'zh' ? '工具和图像尺寸' : 'tool and image dimensions')
      const examples = wrapper.find('[data-testid="novelai-director-examples"]').text()
      expect(examples).toContain('512×512')
      expect(examples).toContain('20 Anlas')
      expect(examples).toContain('$0.20')
      expect(examples).toContain('1024×1024')
      expect(examples).toContain('65 Anlas')
      expect(examples).toContain('$0.65')
      expect(examples).toContain('1536×1024')
      expect(examples).toContain('30 Anlas')
      expect(examples).toContain('$0.30')
      expect(wrapper.text()).not.toContain('$0.005')
      expect(wrapper.text()).not.toMatch(/defry/i)
    } finally {
      wrapper.unmount()
    }
  })

  it('uses the existing paid-price style, dark variants, and local horizontal scrolling', () => {
    const wrapper = mountPricing('en')
    try {
      expect(wrapper.find('.plaza-table').classes()).toContain('overflow-x-auto')
      expect(wrapper.find('table').classes()).toEqual(expect.arrayContaining(['w-full', 'min-w-[640px]', 'table-fixed']))
      expect(wrapper.find('h3').classes()).toContain('dark:text-white')
      expect(wrapper.find('thead tr').classes()).toContain('dark:text-dark-400')
      expect(wrapper.find('tbody tr').classes()).toContain('dark:border-dark-800')
      expect(wrapper.findAll('.plaza-price')).toHaveLength(4)
    } finally {
      wrapper.unmount()
    }
  })
})
