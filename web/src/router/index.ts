import { createRouter, createWebHistory } from 'vue-router'
import MatchHistoryView from '../views/MatchHistoryView.vue'
import MatchDetailView from '../views/MatchDetailView.vue'
import LeaderboardView from '../views/LeaderboardView.vue'
import PlayerProfileView from '../views/PlayerProfileView.vue'
import HeroProfileView from '../views/HeroProfileView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/matches',
    },
    {
      path: '/matches',
      name: 'matches',
      component: MatchHistoryView,
    },
    {
      path: '/replay/:id',
      name: 'replay',
      component: MatchDetailView,
    },
    {
      path: '/match/:id',
      redirect: to => `/replay/${to.params.id}`,
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: LeaderboardView,
    },
    {
      path: '/player/:identifier',
      name: 'player-profile',
      component: PlayerProfileView,
    },
    {
      path: '/player/:identifier/hero/:heroName',
      name: 'player-hero-profile',
      component: PlayerProfileView,
    },
    {
      path: '/hero/:heroName',
      name: 'hero-profile',
      component: HeroProfileView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/matches',
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

