import Alpine from 'alpinejs';

// Stores (auto-enregistrement dans Alpine)
import './stores/auth.js';
import './stores/xp.js';
import './stores/vitalite.js';
import './stores/notifications.js';

// Router
import { initRouter } from './router.js';

// Typage global
declare global {
  interface Window { Alpine: typeof Alpine; }
}

window.Alpine = Alpine;

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  Alpine.start();
});
