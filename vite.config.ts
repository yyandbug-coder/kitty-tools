import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons-ng'
import path from 'path'
import { resolve } from 'path'
import { fileURLToPath } from 'node:url'

const host = process.env.TAURI_DEV_HOST
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(async ({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(rootDir, './src/assets/images/icons')],
      symbolId: 'icon-[name]'
    })
  ],
  base: command === 'serve' ? '/' : './',

  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src')
    }
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },

  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        floating: resolve(rootDir, 'floating.html'),
        'region-select': resolve(rootDir, 'region-select.html'),
        'translate-workspace': resolve(rootDir, 'translate-workspace.html'),
        settings: resolve(rootDir, 'settings.html'),
        onboarding: resolve(rootDir, 'onboarding.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('@tanstack/react-virtual')) return 'virtual'
        }
      }
    }
  }
}))
