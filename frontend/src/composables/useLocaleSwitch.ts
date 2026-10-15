import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { availableLocales, setLocale } from '@/i18n'

/**
 * Language dropdown state shared by every locale switcher skin.
 * `rootRef` bounds the dropdown so clicks outside it close the menu.
 */
export function useLocaleSwitch(rootRef: Ref<HTMLElement | null>) {
  const { locale } = useI18n()

  const isOpen = ref(false)
  const switching = ref(false)
  const currentLocaleCode = computed(() => locale.value)
  const currentLocale = computed(() => availableLocales.find((l) => l.code === locale.value))

  function toggle() {
    isOpen.value = !isOpen.value
  }

  async function select(code: string) {
    if (switching.value || code === currentLocaleCode.value) {
      isOpen.value = false
      return
    }
    switching.value = true
    try {
      await setLocale(code)
      isOpen.value = false
      // 分组名称等内容由后端按请求语言返回，整页刷新让已加载的数据换成新语言
      window.location.reload()
    } finally {
      switching.value = false
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
      isOpen.value = false
    }
  }

  onMounted(() => document.addEventListener('click', handleClickOutside))
  onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

  return { availableLocales, currentLocale, currentLocaleCode, isOpen, switching, toggle, select }
}
