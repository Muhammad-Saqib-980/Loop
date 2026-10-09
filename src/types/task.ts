export type Priority = 'low' | 'medium' | 'high';

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: number[];
  /** Monthly only: days 1-31, or -1 for the month's last day. */
  daysOfMonth?: number[];
  endDate?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  priority: Priority;
  dueDate?: string;
  completed: boolean;
  recurrence?: Recurrence;
  history: string[];
  createdAt: string;
  updatedAt: string;
  /** Derived client-side: true while a queued, not-yet-synced mutation exists for this task. Never persisted to the API. */
  pending?: boolean;
}

export type NewTaskInput = {
  title: string;
  notes?: string;
  priority: Priority;
  dueDate?: string;
  recurrence?: Recurrence;
};

export function isRepeating(task: Task): boolean {
  return task.recurrence !== undefined;
}
