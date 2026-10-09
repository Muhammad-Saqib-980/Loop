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
