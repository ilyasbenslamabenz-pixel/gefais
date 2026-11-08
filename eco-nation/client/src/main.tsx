import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useStore } from './store';

createRoot(document.getElementById('root')!).render(<App />);
(window as unknown as Record<string, unknown>).__eco = { useStore };
