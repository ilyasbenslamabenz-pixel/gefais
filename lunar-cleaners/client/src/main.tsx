import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Accès de débogage depuis la console du navigateur
import { G } from './game/state';
import { useStore } from './store';
(window as unknown as Record<string, unknown>).__lc = { G, useStore };
