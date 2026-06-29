import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  define: {
    // @stellar/stellar-sdk (stellar-base) references `global` in the browser.
    global: 'globalThis',
  },
  optimizeDeps: {
    // The Noir/Barretenberg proving stack is only reached via the experimental,
    // flag-gated in-browser withdraw path (dynamic import). Keep it out of the dev
    // pre-bundle and the production graph so the default deposit/portfolio build is lean.
    exclude: ['@aztec/bb.js', '@noir-lang/noir_js'],
  },
  build: {
    rollupOptions: {
      external: ['@aztec/bb.js', '@noir-lang/noir_js'],
    },
  },
})
