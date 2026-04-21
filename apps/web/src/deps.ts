import {
  IdbStorage, SystemClock, UuidGenerator, ToastNotifier,
  HybridStorage, SupabaseStorage, supabase, getAuthUser,
} from '@kinetic/adapters-web';
import type { StoragePort } from '@kinetic/core';

export interface AppDeps {
  storage:  StoragePort;
  clock:    SystemClock;
  idGen:    UuidGenerator;
  notifier: ToastNotifier;
}

let _deps: AppDeps | null = null;

/**
 * getDeps — singleton lazy.
 * Si l'utilisateur est connecté → HybridStorage (IDB + Supabase).
 * Si offline / non connecté → IdbStorage seul.
 */
export async function getDeps(): Promise<AppDeps> {
  if (_deps) return _deps;

  const local    = new IdbStorage();
  const clock    = new SystemClock();
  const idGen    = new UuidGenerator();
  const notifier = new ToastNotifier();

  let storage: StoragePort = local;

  if (supabase) {
    const user = await getAuthUser();
    if (user) {
      const remote = new SupabaseStorage(supabase, user.id);
      const hybrid = new HybridStorage(local, remote);
      // Sync initial depuis Supabase en arrière-plan
      hybrid.syncFromRemote().catch(console.warn);
      storage = hybrid;
    }
  }

  _deps = { storage, clock, idGen, notifier };
  return _deps;
}

/**
 * resetDeps — à appeler lors du logout pour vider le cache.
 */
export function resetDeps(): void {
  _deps = null;
}

/**
 * _resetDepsForTesting — injection de mocks dans les tests.
 */
export function _resetDepsForTesting(mock: AppDeps): void {
  _deps = mock;
}
