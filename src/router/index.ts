import { createRouter, createWebHistory } from 'vue-router'
import L2D from '@/components/views/L2D.vue'
import StoryGenerator from '@/components/views/StoryGenerator.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/story-gen'
    },
    {
      path: '/story-gen',
      name: 'story-gen',
      component: StoryGenerator
    },
    {
      path: '/visualiser',
      name: 'visualiser',
      component: L2D
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/story-gen'
    }
  ]
})

export default router
