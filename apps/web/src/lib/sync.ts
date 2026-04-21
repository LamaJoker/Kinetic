/**
 * apps/web/src/lib/sync.ts
 *
 * CRDT Vector Clock pour la résolution de conflits multi-device.
 * Stratégie : Last-Write-Wins avec vecteur d'horloge.
 */

import type { StoragePort } from '@kinetic/core';

export type DeviceId = string;
export type VectorClock = Record<DeviceId, number>;

export interface SyncedValue<T> {
  value: T;
  clock: VectorClock;
  deviceId: DeviceId;
  wallTime: number; // Timestamp réel pour tiebreak (LWW)
}

// ─── Horloges Vectorielles ────────────────────────────────────────

export function createClock(deviceId: DeviceId): VectorClock {
  return { [deviceId]: 0 };
}

export function incrementClock(clock: VectorClock, deviceId: DeviceId): VectorClock {
  return {
    ...clock,
    [deviceId]: (clock[deviceId] ?? 0) + 1,
  };
}

export function mergeClock(a: VectorClock, b: VectorClock): VectorClock {
  const merged: VectorClock = { ...a };
  for (const [device, time] of Object.entries(b)) {
    merged[device] = Math.max(merged[device] ?? 0, time);
  }
  return merged;
}

export type CausalOrder = 'before' | 'after' | 'concurrent' | 'equal';

/**
 * Compare deux horloges pour déterminer leur relation causale.
 */
export function compareClocks(a: VectorClock, b: VectorClock): CausalOrder {
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);

  let aLeqB = true; // a <= b
  let bLeqA = true; // b <= a

  for (const device of allDevices) {
    const aTime = a[device] ?? 0;
    const bTime = b[device] ?? 0;
    if (aTime > bTime) aLeqB = false;
    if (bTime > aTime) bLeqA = false;
  }

  if (aLeqB && bLeqA) return 'equal';
  if (aLeqB) return 'before';
  if (bLeqA) return 'after';
  return 'concurrent';
}

/**
 * Résout le conflit entre un état local et un état distant.
 */
export function resolveConflict<T>(
  local: SyncedValue<T>,
  remote: SyncedValue<T>,
): SyncedValue<T> {
  const order = compareClocks(local.clock, remote.clock);

  switch (order) {
    case 'after':
    case 'equal':
      return local;

    case 'before':
      return remote;

    case 'concurrent':
      // En cas de concurrence pure, on utilise le temps réel (Last-Write-Wins)
      if (local.wallTime > remote.wallTime) return local;
      if (remote.wallTime > local.wallTime) return remote;
      // Tiebreak déterministe par ID de device en dernier recours
      return local.deviceId > remote.deviceId ? local : remote;
  }
}

// ─── Identité du Device ───────────────────────────────────────────

const DEVICE_ID_KEY = 'kinetic:deviceId';

export function getOrCreateDeviceId(): DeviceId {
  let id = typeof window !== 'undefined' ? localStorage.getItem(DEVICE_ID_KEY) : null;
  if (!id) {
    id = crypto.randomUUID();
    if (typeof window !== 'undefined') {
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
  }
  return id;
}

// ─── Sync Manager ─────────────────────────────────────────────────

const SYNC_META_KEY = 'kinetic:sync:meta';
const PENDING_WRITES_KEY = 'kinetic:sync:pending';

interface SyncMeta {
  lastSyncAt: string;
  deviceId: DeviceId;
  clock: VectorClock;
}

interface PendingWrite {
  key: string;
  syncedValue: SyncedValue<unknown>;
  retries: number;
}

export class SyncManager {
  private readonly deviceId: DeviceId;
  private clock: VectorClock;
  private pendingWrites = new Map<string, PendingWrite>();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;

  constructor(
    private readonly local: StoragePort,
    private readonly remote: StoragePort,
  ) {
    this.deviceId = getOrCreateDeviceId();
    this.clock = createClock(this.deviceId);
  }

  async initialize(): Promise<void> {
    const meta = await this.local.get<SyncMeta>(SYNC_META_KEY);
    if (meta) {
      this.clock = meta.clock;
    }

    const pending = await this.local.get<[string, PendingWrite][]>(PENDING_WRITES_KEY);
    if (pending) {
      this.pendingWrites = new Map(pending);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.syncFromRemote();
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_REQUESTED') {
            this.scheduleSyncFlush();
          }
        });
      }
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    // Incrémenter l'horloge logique du device
    this.clock = incrementClock(this.clock, this.deviceId);

    const syncedValue: SyncedValue<T> = {
      value,
      clock: { ...this.clock },
      deviceId: this.deviceId,
      wallTime: Date.now(),
    };

    // 1. Persistance locale immédiate
    await this.local.set(key, syncedValue);

    // 2. File d'attente pour synchronisation distante
    this.pendingWrites.set(key, { key, syncedValue, retries: 0 });
    await this._savePendingWrites();

    this.scheduleSyncFlush();
  }

  async read<T>(key: string): Promise<T | null> {
    const synced = await this.local.get<SyncedValue<T>>(key);
    return synced ? synced.value : null;
  }

  async syncFromRemote(): Promise<void> {
    if (this.isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    this.isSyncing = true;

    try {
      const remoteKeys = await this.remote.keys();
      let workingClock = { ...this.clock };

      for (const key of remoteKeys) {
        const remoteValue = await this.remote.get<SyncedValue<unknown>>(key);
        if (!remoteValue?.clock) continue;

        const localValue = await this.local.get<SyncedValue<unknown>>(key);

        if (!localValue || resolveConflict(localValue, remoteValue) === remoteValue) {
          await this.local.set(key, remoteValue);
        }

        // On fusionne les horloges pour maintenir la causalité
        workingClock = mergeClock(workingClock, remoteValue.clock);
      }

      this.clock = workingClock;

      const meta: SyncMeta = {
        lastSyncAt: new Date().toISOString(),
        deviceId: this.deviceId,
        clock: this.clock,
      };
      await this.local.set(SYNC_META_KEY, meta);
      
      // Après avoir récupéré le distant, on tente de pousser le local
      await this.flushPendingWrites();

    } catch (error) {
      console.error('[SyncManager] Remote sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private scheduleSyncFlush(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      void this.flushPendingWrites();
    }, 2000);
  }

  private async flushPendingWrites(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (this.pendingWrites.size === 0) return;

    const MAX_RETRIES = 3;

    for (const [key, pending] of this.pendingWrites) {
      try {
        await this.remote.set(key, pending.syncedValue);
        this.pendingWrites.delete(key);
      } catch (e) {
        pending.retries++;
        if (pending.retries >= MAX_RETRIES) {
          console.warn(`[SyncManager] Max retries reached for ${key}, removing from queue.`);
          this.pendingWrites.delete(key);
        }
      }
    }

    await this._savePendingWrites();
  }

  private async _savePendingWrites(): Promise<void> {
    await this.local.set(
      PENDING_WRITES_KEY,
      Array.from(this.pendingWrites.entries())
    );
  }
}
