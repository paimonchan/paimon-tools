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
})
