import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { RouterView } from 'vue-router'
import i18n, { initI18n } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { BRAND } from '@/components/home/cosmos/brand'
import { updateFavicon } from '@/utils/branding'
import type { PublicSettings } from '@/types'
import router from './previewRouter'
import '@/style.css'

/** The home page reads only these public settings; the preview has no backend to load the rest from. */
const PREVIEW_SETTINGS: Partial<PublicSettings> = {
  site_name: BRAND.name,
  model_plaza_enabled: true,
  model_plaza_require_auth: false,
}

/** Entry of the standalone home preview built by vite.preview.config.ts. */
async function bootstrap() {
  const app = createApp({ render: () => h(RouterView) })
  app.use(createPinia())

  window.__APP_CONFIG__ = PREVIEW_SETTINGS as PublicSettings
  useAppStore().initFromInjectedConfig()
  updateFavicon(BRAND.mark)

  await initI18n()
  app.use(router)
  app.use(i18n)
  await router.push('/home')
  app.mount('#app')
}

bootstrap()
