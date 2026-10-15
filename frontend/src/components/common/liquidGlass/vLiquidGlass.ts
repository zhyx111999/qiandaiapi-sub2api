import type { Directive } from 'vue'
import { attachRefraction, type RefractionController, type RefractionOptions } from './refraction'
import './liquidGlass.css'

const controllers = new WeakMap<HTMLElement, RefractionController>()

type Binding = RefractionOptions | null | undefined

function sameOptions(a: Binding, b: Binding): boolean {
  return a?.scale === b?.scale && a?.aberration === b?.aberration && a?.mode === b?.mode
}

/**
 * Adds the refraction layer to an element that already carries a `liquid-glass` class.
 * Usage: `<nav class="liquid-glass" v-liquid-glass="{ scale: 28 }">`
 */
export const vLiquidGlass: Directive<HTMLElement, Binding> = {
  mounted(el, { value }) {
    const controller = attachRefraction(el, value ?? {})
    if (controller) controllers.set(el, controller)
  },
  updated(el, { value, oldValue }) {
    if (!sameOptions(value, oldValue)) controllers.get(el)?.update(value ?? {})
  },
  beforeUnmount(el) {
    controllers.get(el)?.destroy()
    controllers.delete(el)
  },
}
