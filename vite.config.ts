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
        // Research reports with web search can take up to 10 minutes
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
})
