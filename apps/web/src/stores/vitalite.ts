import Alpine from 'alpinejs';
import { getDeps } from '../deps.js';

interface VitaliteTask {
  id: string;
  title: string;
  icon: string;
  xp: number;
  priority: 'high' | 'med' | 'low';
  done: boolean;
}

const DEFAULT_TASKS: VitaliteTask[] = [
  { id: 'morning-stretch', title: 'Étirements matin',  icon: '🧘', xp: 50, priority: 'high', done: false },
  { id: 'cold-shower',     title: 'Douche froide',     icon: '🚿', xp: 50, priority: 'high', done: false },
  { id: 'breakfast',       title: 'Petit-déjeuner sain', icon: '🥗', xp: 50, priority: 'med',  done: false },
  { id: 'meditation',      title: 'Méditation 5 min',  icon: '🧠', xp: 50, priority: 'med',  done: false },
  { id: 'hydration',       title: 'Boire 2L d\'eau',   icon: '💧', xp: 50, priority: 'low',  done: false },
];

export function vitaliteStore() {
  return {
    tasks:        [...DEFAULT_TASKS] as VitaliteTask[],
    loading:      false,
    completingId: null as string | null,

    // Triple guard anti-exploit
    _completedToday: new Set<string>(),
    _pendingIds:     new Set<string>(),

    async init() {
      const deps    = await getDeps();
      const today   = new Date().toISOString().slice(0, 10);
      const doneKey = `kinetic:vitalite:done:${today}`;
      const doneIds = await deps.storage.get<string[]>(doneKey) ?? [];

      this._completedToday = new Set(doneIds);
      this.tasks = this.tasks.map((t) => ({
        ...t,
        done: doneIds.includes(t.id),
      }));
    },

    async complete(taskId: string) {
      // Guard 1 : déjà en cours (double-click)
      if (this._pendingIds.has(taskId)) return;

      // Guard 2 : tâche déjà done (état UI)
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || task.done) return;

      // Guard 3 : completed set (exploit console)
      if (this._completedToday.has(taskId)) return;

      this._pendingIds.add(taskId);
      this.completingId = taskId;

      try {
        const today   = new Date().toISOString().slice(0, 10);
        const idempKey = `vitalite:${taskId}:${today}`;

        // Marquer localement (optimiste)
        this.tasks = this.tasks.map((t) =>
          t.id === taskId ? { ...t, done: true } : t,
        );
        this._completedToday.add(taskId);

        // Persister les IDs complétés
        const deps    = await getDeps();
        const doneKey = `kinetic:vitalite:done:${today}`;
        await deps.storage.set(doneKey, [...this._completedToday]);

        // Créditer le XP via le store XP (avec idempotence)
        const xpStore = Alpine.store('xp') as {
          award: (amount: number, key?: string) => Promise<void>;
        };
        await xpStore.award(task.xp, idempKey);

        // Notifier
        window.dispatchEvent(new CustomEvent('kinetic:notify', {
          detail: { kind: 'success', message: `+${task.xp} XP — ${task.title} ✓` },
          bubbles: true,
        }));

      } finally {
        this._pendingIds.delete(taskId);
        this.completingId = null;
      }
    },

    get doneCount()  { return this.tasks.filter((t) => t.done).length; },
    get totalCount() { return this.tasks.length; },
    get progress()   { return Math.round((this.doneCount / this.totalCount) * 100); },
    get allDone()    { return this.doneCount === this.totalCount; },

    isLocked(id: string): boolean {
      return this._pendingIds.has(id) || this._completedToday.has(id);
    },
  };
}

Alpine.store('vitalite', vitaliteStore());
