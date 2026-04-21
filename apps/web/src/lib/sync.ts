/**
 * apps/web/src/lib/sync.ts
 *
 * CRDT Vector Clock pour la résolution de conflits multi-device.
 *
 * Stratégie : Last-Write-Wins avec vecteur d'horloge.
 * Chaque device a un ID unique. Les conflits sont résolus
 * par la valeur avec le timestamp logique le plus élevé.
 *
 * Suffisant pour des données de fitness (pas de concurrent editing).
 */

export type DeviceId    = string;
export type VectorClock = Record<DeviceId, number>;

export interface SyncedValue<T> {
  value:    T;
  clock:    VectorClock;
  deviceId: DeviceId;
  wallTime: number;  // Timestamp réel pour tiebreak
}

// ─── Vector Clock Operations ──────────────────────────────────

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

/**
 * compareClocks — ordre causal entre deux horloges.
 */
export type CausalOrder = 'before' | 'after' | 'concurrent' | 'equal';

export function compareClocks(a: VectorClock, b: VectorClock): CausalOrder {
  const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);

  let aLessOrEqual = true;
  let bLessOrEqual = true;

  for (const device of allDevices) {
    const aTime = a[device] ?? 0;
    const bTime = b[device] ?? 0;
    if (aTime > bTime) bLessOrEqual = false;
    if (bTime > aTime) aLessOrEqual = false;
  }

  if (aLessOrEqual && bLessOrEqual) return 'equal';
  if (aLessOrEqual) return 'before';
  if (bLessOrEqual) return 'after';
  return 'concurrent';
}

/**
 * resolveConflict — choisit la valeur gagnante entre deux états concurrents.
 * En cas de concurrence vraie : wallTime gagne (LWW).
 * Tiebreak final : ordre lexicographique du deviceId (déterministe).
 */
export function resolveConflict<T>(
  local:  SyncedValue<T>,
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
      if (local.wallTime  > remote.wallTime) return local;
      if (remote.wallTime > local.wallTime)  return remote;
      // Tiebreak déterministe
      return local.deviceId > remote.deviceId ? local : remote;
  }
}

// ─── Device Identity ──────────────────────────────────────────

const DEVICE_ID_KEY = 'kinetic:deviceId';

export function getOrCreateDeviceId(): DeviceId {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ─── Sync Manager ─────────────────────────────────────────────

import type { StoragePort } from '@kinetic/core';

const SYNC_META_KEY      = 'kinetic:sync:meta';
const PENDING_WRITES_KEY = 'kinetic:sync:pending';

interface SyncMeta {
  lastSyncAt: string;
  deviceId:   DeviceId;
  clock:      VectorClock;
}

interface PendingWrite {
  key:         string;
  value:       unknown;
  syncedValue: SyncedValue<unknown>;
  retries:     number;
}

export class SyncManager {
  private readonly deviceId: DeviceId;
  private clock:             VectorClock;
  private pendingWrites      = new Map<string, PendingWrite>();
  private syncTimer:         ReturnType<typeof setTimeout> | null = null;
  private isSyncing          = false;

  constructor(
    private readonly local:  StoragePort,
    private readonly remote: StoragePort,
  ) {
    this.deviceId = getOrCreateDeviceId();
    this.clock    = createClock(this.deviceId);
  }

  async initialize(): Promise<void> {
    const meta = await this.local.get<SyncMeta>(SYNC_META_KEY);
    if (meta) this.clock = meta.clock;

    // Restaurer les writes en attente (si crash précédent)
    const pending = await this.local.get<[string, PendingWrite][]>(PENDING_WRITES_KEY);
    if (pending) this.pendingWrites = new Map(pending);

    // Écouter les messages du SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_REQUESTED') {
          this.scheduleSyncFlush();
        }
      });
    }

    // Sync au retour online
    window.addEventListener('online', () => { void this.syncFromRemote(); });
  }

  /**
   * write — enregistre une valeur avec son vecteur d'horloge.
   */
  async write<T>(key: string, value: T): Promise<void> {
    this.clock = incrementClock(this.clock, this.deviceId);

    const syncedValue: SyncedValue<T> = {
      value,
      clock:    { ...this.clock },
      deviceId: this.deviceId,
      wallTime: Date.now(),
    };

    // Écriture locale immédiate
    await this.local.set(key, syncedValue);

    // Ajouter aux pending pour sync remote
    this.pendingWrites.set(key, { key, value, syncedValue, retries: 0 });
    await this._savePendingWrites();

    this.scheduleSyncFlush();
  }

  /**
   * read — lit la valeur (sans le wrapper CRDT).
   */
  async read<T>(key: string): Promise<T | null> {
    const synced = await this.local.get<SyncedValue<T>>(key);
    return synced?.value ?? null;
  }

  /**
   * syncFromRemote — tire les changements du remote et résout les conflits.
   */
  async syncFromRemote(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const remoteKeys = await this.remote.keys();

      await Promise.all(
        remoteKeys.map(async (key) => {
          const remoteValue = await this.remote.get<SyncedValue<unknown>>(key);
          if (!remoteValue?.clock) return;

          const localValue = await this.local.get<SyncedValue<unknown>>(key);

          if (!localValue) {
            await this.local.set(key, remoteValue);
            return;
          }

          // Résoudre le conflit
          const winner = resolveConflict(localValue, remoteValue);
          await this.local.set(key, winner);

          // Merge des horloges
          this.clock = mergeClock(this.clock, remoteValue.clock);
        })
      );

      // Sauvegarder la meta de sync
      const meta: SyncMeta = {
        lastSyncAt: new Date().toISOString(),
        deviceId:   this.deviceId,
        clock:      this.clock,
      };
      await this.local.set(SYNC_META_KEY, meta);

    } finally {
      this.isSyncing = false;
    }
  }

  private scheduleSyncFlush(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    // Debounce : flush 2s après le dernier write
    this.syncTimer = setTimeout(() => { void this.flushPendingWrites(); }, 2000);
  }

  private async flushPendingWrites(): Promise<void> {
    if (!navigator.onLine || this.pendingWrites.size === 0) return;

    const MAX_RETRIES = 3;

    for (const [key, pending] of this.pendingWrites) {
      try {
        await this.remote.set(key, pending.syncedValue);
        this.pendingWrites.delete(key);
      } catch {
        pending.retries++;
        if (pending.retries >= MAX_RETRIES) {
          console.warn(`[Sync] Abandon après ${MAX_RETRIES} tentatives pour`, key);
          this.pendingWrites.delete(key);
        }
      }
    }

    await this._savePendingWrites();
  }

  private async _savePendingWrites(): Promise<void> {
    await this.local.set(
      PENDING_WRITES_KEY,
      [...this.pendingWrites.entries()],
    );
  }
}
