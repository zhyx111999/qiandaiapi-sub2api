import { createMemoryHistory, createRouter } from 'vue-router'
import CosmosHome from '@/components/home/cosmos/CosmosHome.vue'

/**
 * Router of the standalone home preview; vite.preview.config.ts also aliases `@/router` here.
 * Only the home page exists, so every other link lands back on it.
 */
export default createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/home', component: CosmosHome },
    { path: '/:pathMatch(.*)*', redirect: '/home' },
  ],
})
