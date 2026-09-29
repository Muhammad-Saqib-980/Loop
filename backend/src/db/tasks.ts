import { pool } from './client';
import type { Priority, Recurrence } from '../types';

export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  completed: boolean;
  recurrence: Recurrence | null;
  history: string[];
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): TaskRow {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    dueDate: row.due_date,
    completed: row.completed,
    recurrence: row.recurrence,
    history: row.history,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface NewTaskRow {
  title: string;
  notes?: string;
  priority: Priority;
  dueDate?: string;
  recurrence?: Recurrence;
}

export async function listTasksForUser(userId: string): Promise<TaskRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function findTaskForUser(
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const { rows } = await pool.query(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [
    taskId,
    userId,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createTaskForUser(
  userId: string,
  input: NewTaskRow,
): Promise<TaskRow> {
  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, title, notes, priority, due_date, recurrence, history)
     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb)
     RETURNING *`,
    [
      userId,
      input.title.trim(),
      input.notes?.trim() || null,
      input.priority,
      input.dueDate ?? null,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
    ],
  );
  return mapRow(rows[0]);
}

export interface TaskUpdateRow {
  title?: string;
  notes?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  completed?: boolean;
  history?: string[];
}

export async function updateTaskForUser(
  userId: string,
  taskId: string,
  changes: TaskUpdateRow,
): Promise<TaskRow | null> {
  const existing = await findTaskForUser(userId, taskId);
  if (!existing) {
    return null;
  }

  const { rows } = await pool.query(
    `UPDATE tasks SET
       title = $3,
       notes = $4,
       priority = $5,
       due_date = $6,
       recurrence = $7,
       completed = $8,
       history = $9,
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      taskId,
      userId,
      changes.title !== undefined ? changes.title.trim() : existing.title,
      changes.notes !== undefined
        ? changes.notes === null
          ? null
          : changes.notes.trim() || null
        : existing.notes,
      changes.priority ?? existing.priority,
      changes.dueDate !== undefined ? changes.dueDate : existing.dueDate,
      changes.recurrence !== undefined
        ? changes.recurrence
          ? JSON.stringify(changes.recurrence)
          : null
        : existing.recurrence
          ? JSON.stringify(existing.recurrence)
          : null,
      changes.completed !== undefined ? changes.completed : existing.completed,
      JSON.stringify(changes.history !== undefined ? changes.history : existing.history),
    ],
  );
  return mapRow(rows[0]);
}

export async function deleteTaskForUser(userId: string, taskId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2`, [
    taskId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}
