/**
 * Router SPA minimaliste basé sur les hash routes.
 *
 * Routes :
 *   #/              → dashboard
 *   #/vitalite      → routine vitalité
 *   #/login         → auth
 *   #/profile       → profil
 *   #/auth/callback → callback OAuth
 */

const ROUTES: Record<string, string> = {
  '/':             '/src/pages/dashboard.html',
  '/vitalite':     '/src/pages/vitalite.html',
  '/login':        '/src/pages/login.html',
  '/profile':      '/src/pages/profile.html',
  '/auth/callback':'/src/pages/auth-callback.html',
};

// Cache pages en mémoire
const PAGE_CACHE = new Map<string, string>();

const outlet = (): HTMLElement => {
  const el = document.getElementById('app-outlet');
  if (!el) throw new Error('Missing #app-outlet');
  return el;
};

async function navigate(path: string): Promise<void> {
  const src = ROUTES[path] ?? ROUTES['/']!;

  // Skeleton
  const o = outlet();
  o.style.opacity = '0.5';
  o.style.transition = 'opacity 0.15s';

  try {
    // Depuis le cache ou réseau
    let html = PAGE_CACHE.get(src);
    if (!html) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${src}`);
      html = await res.text();
      PAGE_CACHE.set(src, html);
    }

    o.innerHTML = html;
    o.style.opacity = '1';

    // Réinitialiser Alpine sur le nouveau contenu
    if (window.Alpine) {
      window.Alpine.initTree(o);
    }

    // Scroll en haut
    window.scrollTo({ top: 0, behavior: 'instant' });

  } catch (e) {
    console.error('[Router]', e);
    o.style.opacity = '1';
    o.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p class="text-4xl mb-3">🔍</p>
          <p class="text-gray-400 mb-4">Page introuvable</p>
          <a href="#/" class="text-kinetic-purple underline text-sm">Retour au dashboard</a>
        </div>
      </div>`;
  }
}

/** prefetch — précharge une page en arrière-plan au survol d'un lien */
export function prefetchRoute(path: string): void {
  const src = ROUTES[path];
  if (!src || PAGE_CACHE.has(src)) return;
  fetch(src).then(async (r) => {
    if (r.ok) PAGE_CACHE.set(src, await r.text());
  }).catch(() => {});
}

export function initRouter(): void {
  const getPath = (): string => window.location.hash.slice(1) || '/';

  window.addEventListener('hashchange', () => navigate(getPath()));

  // Prefetch au survol des liens de navigation
  document.addEventListener('mouseover', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]');
    if (a) {
      const path = (a.getAttribute('href') ?? '').slice(1) || '/';
      prefetchRoute(path);
    }
  });

  navigate(getPath());
}
