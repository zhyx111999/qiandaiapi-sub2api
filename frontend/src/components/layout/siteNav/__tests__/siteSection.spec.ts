import { describe, expect, it } from 'vitest'
import { needsCompact, siteNavVisible, siteSection } from '../siteSection'

describe('site nav section', () => {
  it('maps the cover, the model plaza and any console page', () => {
    expect(siteSection('/home')).toBe('home')
    expect(siteSection('/model-plaza')).toBe('plaza')
    expect(siteSection('/dashboard')).toBe('platform')
    expect(siteSection('/admin/accounts')).toBe('platform')
  })

  it('shows on the cover, the plaza and console pages only', () => {
    expect(siteNavVisible('/home', false)).toBe(true)
    expect(siteNavVisible('/model-plaza', false)).toBe(true)
    expect(siteNavVisible('/admin/users', true)).toBe(true)
    expect(siteNavVisible('/login', false)).toBe(false)
    expect(siteNavVisible('/setup', false)).toBe(false)
  })

  it('falls back to icons only when the full nav would reach the console toolbar', () => {
    // 1440 wide, a 290px nav ends at 865; the toolbar starts at 1040.
    expect(needsCompact(1440, 290, 1040)).toBe(false)
    // 1100 wide, it ends at 695; a toolbar from 690 is too close.
    expect(needsCompact(1100, 290, 690)).toBe(true)
    // No toolbar (cover, standalone plaza): never.
    expect(needsCompact(1024, 290, null)).toBe(false)
  })
})
