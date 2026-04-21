/**
 * apps/web/src/stores/offline.ts
 *
 * Alpine store — état de connexion réseau.
 *
 * Usage dans les templates :
 *   <div x-show="$store.offline.isOffline" class="offline-banner">
 *     📡 Mode hors ligne — tes données sont sauvegardées
 *   </div>
 *
 * Enregistrement dans main.ts :
 *   import { offlineStore } from './stores/offline.js';
 *   Alpine.store('offline', offlineStore());
 */

import type { Alpine } from 'alpinejs';

export interface OfflineStore {
  isOffline: boolean;
  wasOffline: boolean; // true si reconnexion récente (afficher "de retour en ligne")
  lastOnlineAt: number | null;
  sinceSecs: number; // secondes depuis la dernière connexion

  _timer: ReturnType<typeof setInterval> | null;
  init(): void;
  destroy(): void;
}

export function offlineStore(): OfflineStore {
  return {
    isOffline: !navigator.onLine,
    wasOffline: false,
    lastOnlineAt: navigator.onLine ? Date.now() : null,
    sinceSecs: 0,
    _timer: null,

    init() {
      const onOnline = () => {
        this.wasOffline = this.isOffline;
        this.isOffline = false;
        this.lastOnlineAt = Date.now();
        this.sinceSecs = 0;

        // Effacer le message "reconnecté" après 3s
        if (this.wasOffline) {
          setTimeout(() => { this.wasOffline = false; }, 3000);
        }
      };

      const onOffline = () => {
        this.isOffline = true;
        this.wasOffline = false;
      };

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      // Timer pour afficher le temps depuis la dernière connexion
      this._timer = setInterval(() => {
        if (this.isOffline && this.lastOnlineAt) {
          this.sinceSecs = Math.floor((Date.now() - this.lastOnlineAt) / 1000);
        }
      }, 1000);
    },

    destroy() {
      if (this._timer) clearInterval(this._timer);
    },
  };
}

/**
 * offlineBannerHtml — snippet HTML prêt à coller dans index.html.
 *
 * La bannière apparaît en bas de l'écran quand l'utilisateur est offline.
 * Elle disparaît automatiquement 3s après la reconnexion.
 */
export const OFFLINE_BANNER_HTML = /* html */ `
<div
  x-show="$store.offline.isOffline || $store.offline.wasOffline"
  x-transition:enter="transition ease-out duration-300"
  x-transition:enter-start="opacity-0 translate-y-4"
  x-transition:enter-end="opacity-100 translate-y-0"
  x-transition:leave="transition ease-in duration-200"
  x-transition:leave-start="opacity-100 translate-y-0"
  x-transition:leave-end="opacity-0 translate-y-4"
  class="fixed bottom-20 inset-x-0 mx-auto max-w-sm px-4 z-50">

  <div :class="$store.offline.isOffline
      ? 'bg-gray-800 text-white border border-gray-700'
      : 'bg-emerald-600 text-white'"
       class="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl text-sm">

    <span x-text="$store.offline.isOffline ? '📡' : '✅'" class="text-lg flex-shrink-0"></span>

    <div class="flex-1">
      <p class="font-semibold"
         x-text="$store.offline.isOffline ? 'Mode hors ligne' : 'De retour en ligne'"></p>
      <p class="text-xs opacity-75"
         x-show="$store.offline.isOffline"
         x-text="$store.offline.sinceSecs > 5
           ? 'Hors ligne depuis ' + $store.offline.sinceSecs + 's'
           : 'Données sauvegardées localement'">
      </p>
    </div>

  </div>
</div>
`;
