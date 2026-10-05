/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  /* `npm run dev:phone` serves over HTTPS on the local network. Phones only
     allow the microphone on a secure origin, so the plain http Wi-Fi link
     can show every screen but can't record. The certificate is self-signed:
     the phone warns once ("not private") — tap through to continue. */
  plugins: [react(), ...(process.env.PHONE ? [basicSsl()] : [])],
  /* Served from https://tommyclaffey.github.io/Mumble/ (capital M — Pages paths are case-sensitive and the repo is 'Mumble'), so assets need the
     repo name as their base path — without it the built page asks for
     /assets/... at the domain root and renders blank. (Growth hit exactly
     this.) */
  base: process.env.BASE_PATH ?? '/Mumble/',
  /* Railway serves the built app at the root of its own domain
     (BASE_PATH=/, see railway.json). `vite preview` checks the Host header,
     so the Railway domains are allowed explicitly. */
  preview: { allowedHosts: ['.up.railway.app'] },
  /* parked/ holds shelved features (read-aloud) — kept, not built or tested.
     (If read-aloud comes back, it needs `worker: { format: 'es' }` again.) */
  test: { exclude: [...configDefaults.exclude, 'parked/**'] },
})
