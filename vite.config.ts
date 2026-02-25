import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pouchdb', 'pouchdb-find'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Research reports can take 2-3 minutes to generate
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
})
