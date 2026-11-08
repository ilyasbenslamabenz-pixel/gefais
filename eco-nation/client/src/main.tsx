import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useStore } from './store';
import { camApi } from './game/world';

createRoot(document.getElementById('root')!).render(<App />);
// accès de débogage depuis la console du navigateur
(window as unknown as Record<string, unknown>).__eco = { useStore, camApi };
