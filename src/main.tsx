import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './data/store'
import { ServicesProvider } from './services'

/* Installable: the service worker runs in the BUILT app only -- in dev it
   would cache Vite's live modules and serve stale code on the next reload.
   BASE_URL is /Mumble/ on Pages and / on Railway; the worker's paths are
   relative, so it works under either. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* no offline shell -- the app still works online */ })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </StoreProvider>
  </StrictMode>,
)
