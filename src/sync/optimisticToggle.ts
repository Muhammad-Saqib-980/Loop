import type {Task} from '../types/task';
import {computeNextDueDate, todayISODate} from '../utils/recurrence';

/**
 * Client-side mirror of backend/src/services/taskService.ts's
 * toggleTaskComplete, so a toggle renders correctly before it syncs.
 */
export function applyOptimisticToggle(task: Task): Task {
  const now = new Date().toISOString();

  if (!task.recurrence) {
    return {...task, completed: !task.completed, updatedAt: now};
  }

  const today = todayISODate();
  const alreadyDoneToday = task.history.includes(today);

  if (alreadyDoneToday) {
    return {...task, history: task.history.filter(d => d !== today), updatedAt: now};
  }

  const nextDue = computeNextDueDate(task.recurrence, today);
  return {
    ...task,
    history: [...task.history, today],
    dueDate: nextDue ?? task.dueDate,
    completed: nextDue === null,
    updatedAt: now,
  };
}
