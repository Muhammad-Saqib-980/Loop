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

/** In `daysOfMonth`, stands for the last day of whichever month it is. */
export const LAST_DAY_OF_MONTH = -1;

function isValidDayOfMonth(day: number): boolean {
  return day === LAST_DAY_OF_MONTH || (Number.isInteger(day) && day >= 1 && day <= 31);
}

/**
 * ISO dates (ascending, de-duplicated) a days-of-month rule falls on in an
 * absolute month index (year * 12 + month). Days the month doesn't have move
 * to its last day, so e.g. 29, 30, 31 and LAST_DAY_OF_MONTH all land on
 * Feb 28 in a non-leap year and occur once.
 */
function monthlyOccurrences(monthIndex: number, daysOfMonth: number[]): string[] {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = new Set(
    daysOfMonth.map(d => (d === LAST_DAY_OF_MONTH ? lastDay : Math.min(d, lastDay))),
  );
  return [...days]
    .sort((a, b) => a - b)
    .map(d => toISODate(new Date(year, month, d)));
}

/**
 * First picked day strictly after `after`, only in months that are a whole
 * number of `interval`s from `anchor`'s month, so an every-N-months rule
 * keeps its cycle even when completed late.
 */
function nextMonthlyOnDays(
  anchor: Date,
  after: string,
  daysOfMonth: number[],
  interval: number,
): string {
  const anchorIndex = anchor.getFullYear() * 12 + anchor.getMonth();
  const afterDate = parseISODate(after);
  const afterIndex = afterDate.getFullYear() * 12 + afterDate.getMonth();
  // Jump straight to the last cycle month on or before `after`'s month, so a
  // completion years late doesn't walk every month in between. Every date in
  // the cycle month after that one is later than `after`, so this loop runs
  // at most twice.
  const periods = Math.max(0, Math.floor((afterIndex - anchorIndex) / interval));
  for (let monthIndex = anchorIndex + periods * interval; ; monthIndex += interval) {
    const match = monthlyOccurrences(monthIndex, daysOfMonth).find(iso => iso > after);
    if (match) {
      return match;
    }
  }
}

/**
 * Given a recurrence rule, the date an occurrence was just completed on and
 * the task's current due date, returns the ISO date of the next occurrence,
 * or null if the recurrence has ended.
 *
 * Rules pinned to specific days (weekly `daysOfWeek`, monthly `daysOfMonth`)
 * advance past both the completion date and the due date: completing early
 * counts as the current occurrence, and completing late skips the missed ones.
 */
export function computeNextDueDate(
  recurrence: Recurrence,
  completedOn: string,
  dueDate?: string,
): string | null {
  const from = parseISODate(completedOn);
  const after = dueDate && dueDate > completedOn ? dueDate : completedOn;
  const interval = Math.max(1, recurrence.interval);
  const daysOfMonth = (recurrence.daysOfMonth ?? []).filter(isValidDayOfMonth);
  let next: Date;

  switch (recurrence.type) {
    case 'daily':
      next = addDays(from, Math.max(1, recurrence.interval));
      break;
    case 'weekly':
      if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
        next = nextMatchingWeekday(parseISODate(after), recurrence.daysOfWeek);
      } else {
        next = addDays(from, 7 * Math.max(1, recurrence.interval));
      }
      break;
    case 'monthly':
      next =
        daysOfMonth.length > 0
          ? parseISODate(
              nextMonthlyOnDays(
                dueDate ? parseISODate(dueDate) : from,
                after,
                daysOfMonth,
                interval,
              ),
            )
          : addMonths(from, interval);
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
