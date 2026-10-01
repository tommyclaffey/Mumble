/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /* Served from https://tommyclaffey.github.io/Mumble/ (capital M — Pages paths are case-sensitive and the repo is 'Mumble'), so assets need the
     repo name as their base path — without it the built page asks for
     /assets/... at the domain root and renders blank. (Growth hit exactly
     this.) */
  base: '/Mumble/',
  /* parked/ holds shelved features (read-aloud) — kept, not built or tested.
     (If read-aloud comes back, it needs `worker: { format: 'es' }` again.) */
  test: { exclude: [...configDefaults.exclude, 'parked/**'] },
})
