import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './data/store'
import { ServicesProvider } from './services'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </StoreProvider>
  </StrictMode>,
)
