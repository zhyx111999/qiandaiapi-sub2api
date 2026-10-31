import { readonly, ref } from 'vue'

/**
 * The app's one theme state. Ivory unless the user chose dark (saved as `theme`): main.ts applies it
 * at start-up, the switches in the sidebar and on the key usage page toggle it, and whatever draws
 * by theme (the console field) follows `isDark` instead of watching the <html> class.
 */
const STORAGE_KEY = 'theme'
const dark = ref(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

function apply(on: boolean) {
  dark.value = on
  document.documentElement.classList.toggle('dark', on)
}

/** Applies the saved choice; called once before the app mounts. */
export function initTheme() {
  apply(localStorage.getItem(STORAGE_KEY) === 'dark')
}

export function useTheme() {
  return {
    isDark: readonly(dark),
    toggleTheme() {
      apply(!dark.value)
      localStorage.setItem(STORAGE_KEY, dark.value ? 'dark' : 'light')
    },
  }
}
