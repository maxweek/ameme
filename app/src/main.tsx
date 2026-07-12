import { createRoot } from 'react-dom/client'
import "@maxweek/react-scroller/css";
import './css/styles.scss'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <App />,
)
