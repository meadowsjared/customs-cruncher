<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <header class="navbar">
    <div class="nav-container">
      <RouterLink to="/matches" class="brand">
        <img :src="'/branding/Avatar_no_BG.png'" alt="Customs Cruncher" class="brand-icon" />
        <span>CUSTOMS CRUNCHER</span>
      </RouterLink>

      <nav class="nav-links">
        <RouterLink to="/matches" class="nav-link">
          <span>⚔️</span>
          <span>Matches</span>
        </RouterLink>
        <RouterLink to="/leaderboard" class="nav-link">
          <span>🏆</span>
          <span>Leaderboard</span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

