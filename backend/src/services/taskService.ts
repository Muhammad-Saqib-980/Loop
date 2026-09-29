import {
  createTaskForUser,
  deleteTaskForUser,
  findTaskForUser,
  listTasksForUser,
  updateTaskForUser,
  type NewTaskRow,
  type TaskRow,
  type TaskUpdateRow,
} from '../db/tasks';
import { computeNextDueDate, todayISODate } from './recurrence';

export async function listTasks(userId: string): Promise<TaskRow[]> {
  return listTasksForUser(userId);
}

export async function createTask(userId: string, input: NewTaskRow): Promise<TaskRow> {
  return createTaskForUser(userId, input);
}

export async function updateTask(
  userId: string,
  taskId: string,
  changes: TaskUpdateRow,
): Promise<TaskRow | null> {
  return updateTaskForUser(userId, taskId, changes);
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  return deleteTaskForUser(userId, taskId);
}

/**
 * Mirrors the frontend's toggleTaskComplete semantics exactly:
 * - Non-recurring: flips `completed`.
 * - Recurring, not done today: logs today in history, rolls dueDate to the
 *   next occurrence (or marks completed if the recurrence has ended).
 * - Recurring, already done today: undoes today's completion.
 */
export async function toggleTaskComplete(
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const task = await findTaskForUser(userId, taskId);
  if (!task) {
    return null;
  }

  if (!task.recurrence) {
    return updateTaskForUser(userId, taskId, { completed: !task.completed });
  }

  const today = todayISODate();
  const alreadyDoneToday = task.history.includes(today);

  if (alreadyDoneToday) {
    return updateTaskForUser(userId, taskId, {
      history: task.history.filter(d => d !== today),
    });
  }

  const nextDue = computeNextDueDate(task.recurrence, today);
  return updateTaskForUser(userId, taskId, {
    history: [...task.history, today],
    dueDate: nextDue ?? task.dueDate,
    completed: nextDue === null,
  });
}
