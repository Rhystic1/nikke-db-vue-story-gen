import { createRouter, createWebHistory } from 'vue-router'
import L2D from '@/components/views/L2D.vue'
import StoryGenerator from '@/components/views/StoryGenerator.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: L2D
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
