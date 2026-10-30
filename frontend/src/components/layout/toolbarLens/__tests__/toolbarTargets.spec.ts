import { describe, expect, it } from 'vitest'
import { restTarget, toolbarTargets } from '../toolbarTargets'

/** The toolbar as AppHeader renders it: plaza link, language switcher, user menu (popovers optional). */
function toolbar({ localeOpen = false, menuOpen = false, plazaActive = false } = {}) {
  const el = document.createElement('div')
  el.innerHTML = `
    <span class="console-toolbar-glass"></span>
    <a href="/model-plaza" id="plaza" class="${plazaActive ? 'router-link-active' : ''}">模型广场</a>
    <div class="relative" id="locale">
      <button id="localeBtn"><span class="absolute">dot</span>中文</button>
      ${localeOpen ? '<div class="absolute right-0"><button id="en">English</button></div>' : ''}
    </div>
    <div class="relative">
      <button id="userBtn">管理员</button>
      ${menuOpen ? '<div class="dropdown"><a href="/profile" id="profile">资料</a><button id="logout">退出</button></div>' : ''}
    </div>`
  return el
}
const ids = (els: HTMLElement[]) => els.map((el) => el.id)

describe('toolbar capsule targets', () => {
  it('takes the toolbar controls and skips everything inside their popovers', () => {
    expect(ids(toolbarTargets(toolbar({ localeOpen: true, menuOpen: true })))).toEqual(['plaza', 'localeBtn', 'userBtn'])
  })

  it('rests on the trigger of an open popover first', () => {
    const el = toolbar({ menuOpen: true, plazaActive: true })
    expect(restTarget(toolbarTargets(el))?.id).toBe('userBtn')
  })

  it('otherwise rests on the link of the current route, or nowhere', () => {
    expect(restTarget(toolbarTargets(toolbar({ plazaActive: true })))?.id).toBe('plaza')
    expect(restTarget(toolbarTargets(toolbar()))).toBeNull()
  })

  it('does not take a badge inside a trigger for an open popover', () => {
    // The language button holds an absolutely positioned badge of its own; that is not a popover beside it.
    expect(restTarget(toolbarTargets(toolbar()))).toBeNull()
  })
})
