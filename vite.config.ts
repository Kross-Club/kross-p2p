import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Down-level the output so it runs on older iOS Safari / Chrome-iOS (WebKit)
  build: {
    target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
  },
})
