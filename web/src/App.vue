<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from './components/Navbar.vue'
</script>

<template>
  <div class="app-root">
    <Navbar />
    <main>
      <RouterView />
    </main>
    <footer class="app-footer">
      <div class="footer-container">
        <div class="footer-brand">
          <img :src="'/branding/Avatar_no_BG.png'" alt="Customs Cruncher" class="footer-logo" />
          <div class="footer-text-group">
            <span class="footer-title">CUSTOMS CRUNCHER</span>
            <span class="footer-subtitle">Heroes of the Storm Custom Matches & Analytics</span>
          </div>
        </div>
        <div class="footer-meta">
          <span>Nexus Customs</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

.app-footer {
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  padding: 1.5rem 1rem;
  margin-top: 3rem;
}

.footer-container {
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.footer-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(56, 189, 248, 0.3));
}

.footer-text-group {
  display: flex;
  flex-direction: column;
}

.footer-title {
  font-weight: 800;
  font-size: 0.9rem;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #38bdf8, #818cf8, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.footer-subtitle {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.footer-meta {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-dim);
}
</style>

