import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './app'
import './index.css'
import { flushOfflineQueue } from './lib/offlineQueue'

registerSW({
  immediate: true,
  onNeedRefresh() {
    // New service worker is available — reload to avoid serving stale assets
    window.location.reload()
  },
})

window.addEventListener('online', () => flushOfflineQueue().catch((err) => console.warn('Failed to flush offline queue:', err)))
if (navigator.onLine) flushOfflineQueue().catch((err) => console.warn('Failed to flush offline queue:', err))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
