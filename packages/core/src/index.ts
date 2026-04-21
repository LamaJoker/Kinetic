// ─── Ports (interfaces) ───────────────────────────────────────
export type { StoragePort, StorageKey }       from './ports/storage.port.js';
export type { ClockPort }                     from './ports/clock.port.js';
export type { IdGeneratorPort }               from './ports/id-generator.port.js';
export type {
  NotifierPort,
  NotificationPayload,
  NotificationKind,
}                                             from './ports/notifier.port.js';

// ─── Domain (logique pure) ────────────────────────────────────
export {
  LEVELS,
  computeXpState,
  addXp,
  didLevelUp,
  getNewLevel,
}                                             from './domain/xp.domain.js';
export type { Level, XpState }                from './domain/xp.domain.js';

export {
  createStreak,
  processActivity,
  isStreakAlive,
  getStreakStatus,
  daysBetween,
}                                             from './domain/streak.domain.js';
export type { StreakState, StreakStatus }      from './domain/streak.domain.js';

export {
  createTask,
  completeTask,
  resetRecurringTask,
  canComplete,
  sortByPriority,
  validateTask,
}                                             from './domain/task.domain.js';
export type {
  Task,
  TaskId,
  TaskType,
  TaskPriority,
  CreateTaskInput,
  TaskValidationError,
}                                             from './domain/task.domain.js';

// ─── Use Cases (orchestration) ────────────────────────────────
export { completeTask_usecase }               from './usecases/complete-task.usecase.js';
export type {
  CompleteTaskDeps,
  CompleteTaskInput,
  CompleteTaskResult,
}                                             from './usecases/complete-task.usecase.js';

export { awardXp }                            from './usecases/award-xp.usecase.js';
export type {
  AwardXpDeps,
  AwardXpInput,
  AwardXpResult,
}                                             from './usecases/award-xp.usecase.js';

export { resetDailyTasks }                    from './usecases/reset-daily-tasks.usecase.js';
export type {
  ResetDailyTasksDeps,
  ResetDailyTasksResult,
}                                             from './usecases/reset-daily-tasks.usecase.js';
