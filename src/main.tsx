import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initNotifications } from './lib/notifications';

createRoot(document.getElementById('root')!).render(<App />);

initNotifications().catch(() => {});
