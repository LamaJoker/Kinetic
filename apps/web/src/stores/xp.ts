/**
 * apps/web/src/stores/xp.ts
 *
 * Gestion du système de progression et d'expérience (XP).
 * Utilise un tableau de paliers avec calcul dynamique du niveau.
 */

import Alpine from 'alpinejs';
import { getDeps } from '../deps.js';

const LEVELS = [
  { level: 1, title: 'Rookie',    threshold: 0    },
  { level: 2, title: 'Apprenti',  threshold: 200  },
  { level: 3, title: 'Confirmé',  threshold: 500  },
  { level: 4, title: 'Expert',    threshold: 1000 },
  { level: 5, title: 'Elite',      threshold: 2000 },
  { level: 6, title: 'Champion',  threshold: 3500 },
  { level: 7, title: 'Maître',    threshold: 5500 },
  { level: 8, title: 'Légende',   threshold: 8000 },
] as const;

// Type helper pour les membres du tableau LEVELS
type LevelConfig = (typeof LEVELS)[number];

function computeLevel(totalXp: number) {
  // Fix TS2322 : On définit explicitement le type comme étant l'union des niveaux
  let current: LevelConfig = LEVELS[0]!;
  let next: LevelConfig | undefined;

  for (let i = 0; i < LEVELS.length; i++) {
    if (totalXp >= LEVELS[i]!.threshold) {
      current = LEVELS[i]!;
      next    = LEVELS[i + 1];
    }
  }

  const xpInLevel    = totalXp - current.threshold;
  const xpForNext    = next ? next.threshold - current.threshold : 1;
  const progressPct  = next ? Math.min(100, Math.round((xpInLevel / xpForNext) * 100)) : 100;

  return {
    currentLevel:    current.level,
    title:            current.title,
    progressPercent: progressPct,
    remaining:        next ? next.threshold - totalXp : 0,
    isMaxLevel:      !next,
  };
}

export function xpStore() {
  return {
    xp:              0,
    currentLevel:    1,
    title:           'Rookie',
    progressPercent: 0,
    remaining:       200,
    isMaxLevel:      false,
    loading:         false,

    // Set interne anti-exploit : IDs déjà crédités (non-idempotent guard)
    _awardedKeys: new Set<string>(),

    async init() {
      const deps = await getDeps();
      const raw  = await deps.storage.get<{ xp: number; awardedKeys?: string[] }>('kinetic:xp');

      const total = raw?.xp ?? 0;
      if (raw?.awardedKeys) {
        this._awardedKeys = new Set(raw.awardedKeys);
      }

      this._applyXp(total);
    },

    _applyXp(total: number) {
      this.xp = total;
      const state = computeLevel(total);
      this.currentLevel    = state.currentLevel;
      this.title           = state.title;
      this.progressPercent = state.progressPercent;
      this.remaining       = state.remaining;
      this.isMaxLevel      = state.isMaxLevel;
    },

    /**
     * award — crédite du XP avec guard idempotence.
     * @param amount   Quantité de XP
     * @param key      Clé d'idempotence (ex: "task-123:2026-04-21")
     */
    async award(amount: number, key?: string) {
      if (amount <= 0) return;

      // Guard idempotence
      if (key && this._awardedKeys.has(key)) return;

      const prevLevel = this.currentLevel;
      const newXp     = this.xp + amount;

      this._applyXp(newXp);
      if (key) this._awardedKeys.add(key);

      // Level-up notification
      if (this.currentLevel > prevLevel) {
        window.dispatchEvent(new CustomEvent('kinetic:levelup', {
          detail: { level: this.currentLevel, title: this.title },
          bubbles: true,
        }));
      }

      // XP notification
      window.dispatchEvent(new CustomEvent('kinetic:xp-awarded', {
        detail: { amount, total: newXp },
        bubbles: true,
      }));

      // Persister
      const deps = await getDeps();
      await deps.storage.set('kinetic:xp', {
        xp:           newXp,
        awardedKeys: [...this._awardedKeys],
      });
    },

    setXp(total: number) {
      this._applyXp(total);
    },
  };
}

Alpine.store('xp', xpStore());
