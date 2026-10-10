import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './data/store'
import { ServicesProvider } from './services'
import { macRecognizer } from './desktop/desktop'
import { enableWelcome } from './components/Welcome/welcomeState'

/* The demo's welcome card shows once per browser (components/Welcome). */
enableWelcome()

/* Installable: the service worker runs in the BUILT app only -- in dev it
   would cache Vite's live modules and serve stale code on the next reload.
   BASE_URL is /Mumble/ on Pages and / on Railway; the worker's paths are
   relative, so it works under either. */
/* Not inside the Mac app (desktop/): it serves its own copy of these files,
   and a cached copy would outlive an app update. */
const inMacApp = 'mumbleDesktop' in window
if (import.meta.env.PROD && 'serviceWorker' in navigator && !inMacApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* no offline shell -- the app still works online */ })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      {/* Inside the Mac app, 🎤 dictation is done by the Mac (desktop/Dictation.swift). */}
      <ServicesProvider recognizer={inMacApp ? macRecognizer : undefined}>
        <App />
      </ServicesProvider>
    </StoreProvider>
  </StrictMode>,
)
