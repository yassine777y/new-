import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode is intentionally off: double-invoked effects would open a second
// AudioContext and a second WebGL context on every mount, which is both wasteful
// and (on some browsers) blocked without a user gesture.
const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')
createRoot(container).render(<App />)
