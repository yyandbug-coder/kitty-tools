import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons-ng'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import { fileURLToPath } from 'node:url'

const host = process.env.TAURI_DEV_HOST
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => ({
  // 多 HTML 入口：必须用 mpa，否则 dev 时 SPA 回退会错判子页请求，子页易 404
  appType: 'mpa',
  plugins: [
    react(),
    tailwindcss(),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(rootDir, './src/assets/images/icons')],
      symbolId: 'icon-[name]'
    }),
    ...(mode === 'analyze'
      ? [
          visualizer({
            filename: path.resolve(rootDir, 'dist/stats.html'),
            gzipSize: true,
            template: 'treemap',
          }),
        ]
      : []),
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
        main: path.resolve(rootDir, 'html/index.html'),
        'clipboard-popup': path.resolve(rootDir, 'html/clipboard-popup.html'),
        floating: path.resolve(rootDir, 'html/floating.html'),
        'region-select': path.resolve(rootDir, 'html/region-select.html'),
        launcher: path.resolve(rootDir, 'html/launcher.html')
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const norm = id.replace(/\\/g, '/')
          if (norm.includes('lucide-react')) return 'icons'
          if (norm.includes('radix-ui')) return 'radix'
          if (norm.includes('@tanstack/react-virtual')) return 'virtual'
          // react / react-dom / scheduler 抽到独立 chunk，便于多入口共享缓存且不误匹配 react-router 等包名
          if (/node_modules\/react-dom(\/|$)/.test(norm)) return 'react-runtime'
          if (/node_modules\/scheduler(\/|$)/.test(norm)) return 'react-runtime'
          if (/node_modules\/react(\/|$)/.test(norm)) return 'react-runtime'
        }
      }
    }
  }
}))

