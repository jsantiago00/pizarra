/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:lan` (modo "lan") sirve por HTTPS con un certificado autofirmado para
// probar desde el celular o la tablet en la red local: Pointer Events y la presión
// funcionan igual, pero el navegador no registra el service worker con ese certificado.
// BASE_PATH: ruta donde se sirve la app. "/" en Firebase Hosting; "/pizarra/" en GitHub Pages.
const base = process.env.BASE_PATH || '/'

export default defineConfig(({ mode }) => ({
  base,
  // MathJax (fórmulas) usa «global», de Node
  define: { global: 'globalThis' },
  plugins: [
    react(),
    mode === 'lan' && basicSsl({ name: 'pizarra-lan' }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Pizarra',
        short_name: 'Pizarra',
        description: 'Pizarra online para dibujar y estudiar en vivo con otras personas.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f3ec',
        theme_color: '#f6f3ec',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        // /__/auth/* lo sirve Firebase Hosting (login con redirect): nunca desde la caché
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: mode === 'lan' ? true : undefined },
  // El SDK de Firestore solo ya pesa ~540 kB (se carga después del login); jsPDF, al exportar
  // MathJax (~1,6 MB) se carga recién con la primera fórmula
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1700 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
