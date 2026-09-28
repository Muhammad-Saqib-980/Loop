import type { Recurrence } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

function nextMatchingWeekday(from: Date, daysOfWeek: number[]): Date {
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(from, offset);
    if (sorted.includes(candidate.getDay())) {
      return candidate;
    }
  }
  return addDays(from, 7);
}

/**
 * Given a recurrence rule and the date an occurrence was just completed on,
 * returns the ISO date of the next occurrence, or null if the recurrence
 * has ended.
 */
export function computeNextDueDate(
  recurrence: Recurrence,
  completedOn: string,
): string | null {
  const from = parseISODate(completedOn);
  let next: Date;

  switch (recurrence.type) {
    case 'daily':
      next = addDays(from, Math.max(1, recurrence.interval));
      break;
    case 'weekly':
      if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
        next = nextMatchingWeekday(from, recurrence.daysOfWeek);
      } else {
        next = addDays(from, 7 * Math.max(1, recurrence.interval));
      }
      break;
    case 'monthly':
      next = addMonths(from, Math.max(1, recurrence.interval));
      break;
    default:
      return null;
  }

  const nextISO = toISODate(next);
  if (recurrence.endDate && nextISO > recurrence.endDate) {
    return null;
  }
  return nextISO;
}
