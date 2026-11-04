import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './styles/tokens.css'
import './styles/reset.css'
import './styles/base.css'
import App from './App.tsx'

// npm run dev:mock (modo "mock") o VITE_MOCKS=true en un .env local.
const mocksEnabled = import.meta.env.MODE === 'mock' || import.meta.env.VITE_MOCKS === 'true'

async function start() {
  // Import dinámico: MSW y los datos simulados nunca entran al build de producción.
  const mocks = mocksEnabled ? await import('./mocks/browser') : null
  await mocks?.startMocks()
  const MockPanel = mocksEnabled ? (await import('./mocks/MockPanel')).MockPanel : null

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      {MockPanel && <MockPanel />}
    </StrictMode>,
  )
}

void start()
