import type {Task} from '../types/task';
import {todayISODate} from './recurrence';

const PRIORITY_RANK: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function isTaskDoneToday(task: Task): boolean {
  if (task.recurrence) {
    return task.history.includes(todayISODate());
  }
  return task.completed;
}

/** Tasks due today or overdue, and not yet completed for today. */
export function getTodayTasks(tasks: Task[]): Task[] {
  const today = todayISODate();
  return tasks
    .filter(t => !isTaskDoneToday(t))
    .filter(t => !t.dueDate || t.dueDate <= today)
    .sort(byPriorityThenDueDate);
}

/**
 * Tasks whose next occurrence is after today. A repeating task can have a
 * future dueDate and still have today's date in its history (it was just
 * completed today, which is what rolled it forward) — that history entry
 * describes a past occurrence, not the upcoming one, so it must not hide
 * the task here the way it does in Today/Completed.
 */
export function getUpcomingTasks(tasks: Task[]): Task[] {
  const today = todayISODate();
  return tasks
    .filter(t => t.dueDate && t.dueDate > today)
    .filter(t => t.recurrence || !t.completed)
    .sort(byPriorityThenDueDate);
}

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter(isTaskDoneToday)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function byPriorityThenDueDate(a: Task, b: Task): number {
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) {
    return pr;
  }
  return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
}
