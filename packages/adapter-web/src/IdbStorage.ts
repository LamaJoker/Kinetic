import { get, set, del, keys, clear } from 'idb-keyval';
import type { StoragePort, StorageKey } from '@kinetic/core';

/**
 * IdbStorage — StoragePort implémenté avec idb-keyval (wrapper IndexedDB).
 *
 * Avantages vs localStorage :
 *   - Async natif (pas de blocage du thread UI)
 *   - 50MB+ de capacité (vs 5MB localStorage)
 *   - Disponible dans les Web Workers et Service Workers
 *
 * idb-keyval utilise un store global "keyval" dans la DB "keyval-store".
 */
export class IdbStorage implements StoragePort {
  async get<T>(key: StorageKey): Promise<T | null> {
    const value = await get<T>(key);
    return value ?? null;
  }

  async set<T>(key: StorageKey, value: T): Promise<void> {
    await set(key, value);
  }

  async remove(key: StorageKey): Promise<void> {
    await del(key);
  }

  async keys(): Promise<readonly StorageKey[]> {
    return keys() as Promise<string[]>;
  }

  async clear(): Promise<void> {
    await clear();
  }
}
