import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// `base: './'` makes all asset URLs relative so the build works regardless of
// where it is hosted: GitHub Pages project sites (user.github.io/repo-name/),
// custom domains, or local preview via `npm run preview`. No hardcoded paths.
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler'))
            return 'vendor-react'
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx'
          if (id.includes('node_modules/papaparse')) return 'vendor-papaparse'
        },
      },
    },
  },
})
