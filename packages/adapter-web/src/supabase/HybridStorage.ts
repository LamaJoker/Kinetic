import type { StoragePort, StorageKey } from '@kinetic/core';

/**
 * HybridStorage — Combine IDB (local) + Supabase (remote).
 *
 * Read  → IDB uniquement (instantané, offline-safe)
 * Write → IDB d'abord, puis Supabase en fire-and-forget
 *
 * Gestion des conflits : last-write-wins basé sur le timestamp Supabase.
 */
export class HybridStorage implements StoragePort {
  constructor(
    private readonly local: StoragePort,
    private readonly remote: StoragePort,
  ) {}

  async get<T>(key: StorageKey): Promise<T | null> {
    return this.local.get<T>(key);
  }

  async set<T>(key: StorageKey, value: T): Promise<void> {
    // Écriture locale synchrone (~1ms IDB)
    await this.local.set(key, value);

    // Sync réseau en arrière-plan — ne bloque pas l'UI
    this.remote.set(key, value).catch((err: unknown) => {
      console.warn('[HybridStorage] remote sync failed for', key, err);
    });
  }

  async remove(key: StorageKey): Promise<void> {
    await this.local.remove(key);
    this.remote.remove(key).catch(() => undefined);
  }

  async keys(): Promise<readonly StorageKey[]> {
    return this.local.keys();
  }

  async clear(): Promise<void> {
    await this.local.clear();
    this.remote.clear().catch(() => undefined);
  }

  /**
   * syncFromRemote — à appeler au démarrage si online.
   * Tire toutes les clés Supabase et écrit dans IDB.
   */
  async syncFromRemote(): Promise<void> {
    try {
      const remoteKeys = await this.remote.keys();
      await Promise.all(
        remoteKeys.map(async (key) => {
          const value = await this.remote.get(key);
          if (value !== null) {
            await this.local.set(key, value);
          }
        }),
      );
    } catch (err) {
      console.warn('[HybridStorage] initial sync failed:', err);
    }
  }
}
