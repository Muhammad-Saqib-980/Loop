export type Priority = 'low' | 'medium' | 'high';

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface Recurrence {
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: number[];
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
