/**
 * apps/web/src/lib/performance.ts
 *
 * Optimisations runtime :
 *   - Lazy loading des pages Alpine
 *   - Prefetch au hover
 *   - Skeleton screen management
 *   - Image lazy loading avec IntersectionObserver
 */

// ─── Page Loader avec cache ───────────────────────────────────
const PAGE_CACHE = new Map<string, string>();

/**
 * loadPage — charge le HTML d'une page avec mise en cache.
 * Les pages sont de petits fragments HTML, pas des documents complets.
 */
export async function loadPage(pageName: string): Promise<string> {
  if (PAGE_CACHE.has(pageName)) {
    return PAGE_CACHE.get(pageName)!;
  }

  const response = await fetch(`/src/pages/${pageName}.html`);

  if (!response.ok) {
    throw new Error(`Page "${pageName}" introuvable (${response.status})`);
  }

  const html = await response.text();
  PAGE_CACHE.set(pageName, html);
  return html;
}

/**
 * prefetchPage — charge une page en arrière-plan pour navigation instantanée.
 * Appelé au hover sur les liens de navigation.
 */
export function prefetchPage(pageName: string): void {
  if (PAGE_CACHE.has(pageName)) return;
  // Délai de 100ms pour éviter les prefetch sur survol rapide
  const timer = setTimeout(() => {
    loadPage(pageName).catch(() => {});
  }, 100);

  // Annuler si le survol se termine avant 100ms
  document.addEventListener('mouseleave', () => clearTimeout(timer), { once: true });
}

// ─── Skeleton Screen ─────────────────────────────────────────

export type SkeletonType = 'task-list' | 'dashboard' | 'profile' | 'xp-bar';

const SKELETONS: Record<SkeletonType, string> = {
  'task-list': `
    <div class="animate-pulse space-y-3">
      ${Array(4).fill(`
        <div class="flex items-center gap-4 p-4 bg-gray-800 rounded-2xl">
          <div class="w-12 h-12 bg-gray-700 rounded-xl flex-shrink-0"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 bg-gray-700 rounded w-3/4"></div>
            <div class="h-3 bg-gray-700 rounded w-1/4"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `,

  'dashboard': `
    <div class="animate-pulse space-y-4">
      <div class="flex justify-between items-center">
        <div class="space-y-2">
          <div class="h-6 bg-gray-700 rounded w-40"></div>
          <div class="h-4 bg-gray-700 rounded w-32"></div>
        </div>
        <div class="w-10 h-10 bg-gray-700 rounded-full"></div>
      </div>
      <div class="h-24 bg-gray-800 rounded-2xl"></div>
      <div class="h-32 bg-gray-800 rounded-2xl"></div>
      <div class="h-20 bg-gray-700 rounded-2xl"></div>
    </div>
  `,

  'profile': `
    <div class="animate-pulse space-y-4">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 bg-gray-700 rounded-full"></div>
        <div class="space-y-2">
          <div class="h-5 bg-gray-700 rounded w-32"></div>
          <div class="h-4 bg-gray-700 rounded w-24"></div>
        </div>
      </div>
      <div class="h-4 bg-gray-700 rounded w-full"></div>
      <div class="h-4 bg-gray-700 rounded w-5/6"></div>
    </div>
  `,

  'xp-bar': `
    <div class="animate-pulse bg-gray-800 rounded-2xl p-4">
      <div class="flex justify-between mb-2">
        <div class="h-4 bg-gray-700 rounded w-24"></div>
        <div class="h-4 bg-gray-700 rounded w-16"></div>
      </div>
      <div class="h-2 bg-gray-700 rounded-full"></div>
      <div class="h-3 bg-gray-700 rounded w-32 mt-1"></div>
    </div>
  `,
};

export function getSkeletonHtml(type: SkeletonType): string {
  return SKELETONS[type];
}

/**
 * showSkeleton — injecte un skeleton dans un conteneur.
 * Retourne une fonction pour le retirer.
 */
export function showSkeleton(container: HTMLElement, type: SkeletonType): () => void {
  const skeleton = document.createElement('div');
  skeleton.setAttribute('data-skeleton', type);
  skeleton.innerHTML = getSkeletonHtml(type);
  container.appendChild(skeleton);

  return () => {
    skeleton.style.transition = 'opacity 0.2s';
    skeleton.style.opacity = '0';
    setTimeout(() => skeleton.remove(), 200);
  };
}

// ─── Lazy Images via IntersectionObserver ─────────────────────

let _imageObserver: IntersectionObserver | null = null;

function getImageObserver(): IntersectionObserver {
  if (_imageObserver) return _imageObserver;

  _imageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const src = img.dataset['lazySrc'];
          if (src) {
            img.src = src;
            img.removeAttribute('data-lazy-src');
            _imageObserver!.unobserve(img);
          }
        }
      }
    },
    { rootMargin: '100px' }
  );

  return _imageObserver;
}

/**
 * lazyLoadImage — observe une image pour chargement différé.
 * Usage HTML : <img data-lazy-src="/path/to/img.jpg" src="/placeholder.svg" />
 */
export function lazyLoadImage(img: HTMLImageElement): void {
  getImageObserver().observe(img);
}

/**
 * initLazyImages — active le lazy loading sur toutes les images [data-lazy-src].
 * À appeler après chaque navigation (SPA).
 */
export function initLazyImages(): void {
  document.querySelectorAll<HTMLImageElement>('img[data-lazy-src]').forEach(lazyLoadImage);
}

// ─── Debounce / Throttle utilitaires ─────────────────────────

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  };
}
