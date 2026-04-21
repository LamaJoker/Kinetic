import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoragePort, StorageKey } from '@kinetic/core';
import type { Database, Json } from './database.types.js';  // ← ajouter Json

/**
 * SupabaseStorage — StoragePort qui synchronise avec Supabase.
 *
 * Stratégie offline-first :
 *   1. Lecture → toujours depuis IDB (rapide, hors-ligne).
 *   2. Écriture → IDB immédiatement + Supabase en arrière-plan.
 *   3. Sync → au démarrage et à la reconnexion réseau.
 */
export class SupabaseStorage implements StoragePort {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async get<T>(key: StorageKey): Promise<T | null> {
    const { data, error } = await this.client
      .from('user_storage')
      .select('value')
      .eq('user_id', this.userId)
      .eq('key', key)
      .single();

    if (error || !data) return null;
    return data.value as T;
  }

  async set<T>(key: StorageKey, value: T): Promise<void> {
    const { error } = await this.client
      .from('user_storage')
      async set<T>(key: StorageKey, value: T): Promise<void> {
  const { error } = await this.client
    .from('user_storage')
    .upsert(
      {
        user_id: this.userId,
        key,
        value: value as Json,          // ← cast direct vers Json, pas via Insert
      },
      { onConflict: 'user_id,key' },
    );

  if (error) {
    console.error('[SupabaseStorage] set failed:', error.message);
    throw new Error(error.message);
  }
}
        { onConflict: 'user_id,key' },
      );

    if (error) {
      console.error('[SupabaseStorage] set failed:', error.message);
      throw new Error(error.message);
    }
  }

  async remove(key: StorageKey): Promise<void> {
    await this.client
      .from('user_storage')
      .delete()
      .eq('user_id', this.userId)
      .eq('key', key);
  }

  async keys(): Promise<readonly StorageKey[]> {
    const { data } = await this.client
      .from('user_storage')
      .select('key')
      .eq('user_id', this.userId);

    return (data ?? []).map((row) => row.key);
  }

  async clear(): Promise<void> {
    await this.client
      .from('user_storage')
      .delete()
      .eq('user_id', this.userId);
  }
}
