import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || process.cwd(), 'web/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3002',
      '/maps': 'http://127.0.0.1:3002',
      '/heroes': 'http://127.0.0.1:3002',
      '/talents': 'http://127.0.0.1:3002',
      '/branding': 'http://127.0.0.1:3002',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
