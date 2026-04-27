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
    // Tauri 用内置 WebView 加载 dev 地址，勿自动打开系统浏览器
    open: false,
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
        main: resolve(rootDir, 'html/index.html'),
        'clipboard-popup': resolve(rootDir, 'html/clipboard-popup.html'),
        floating: resolve(rootDir, 'html/floating.html'),
        'region-select': resolve(rootDir, 'html/region-select.html'),
        'translate-workspace': resolve(rootDir, 'html/translate-workspace.html'),
        onboarding: resolve(rootDir, 'html/onboarding.html'),
        launcher: resolve(rootDir, 'html/launcher.html'),
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
