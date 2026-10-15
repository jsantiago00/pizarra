import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1f4d3f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1f4d3f' } },
  },
  images: ['public/logo.svg'],
})
