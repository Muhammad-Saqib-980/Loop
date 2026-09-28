import { computeNextDueDate } from '../../src/services/recurrence';

describe('computeNextDueDate', () => {
  it('advances a daily task by the interval', () => {
    expect(computeNextDueDate({ type: 'daily', interval: 1 }, '2026-01-01')).toBe(
      '2026-01-02',
    );
    expect(computeNextDueDate({ type: 'daily', interval: 3 }, '2026-01-01')).toBe(
      '2026-01-04',
    );
  });

  it('advances a weekly task to the next matching weekday', () => {
    expect(
      computeNextDueDate(
        { type: 'weekly', interval: 1, daysOfWeek: [1, 3] },
        '2026-01-01',
      ),
    ).toBe('2026-01-05');
  });

  it('advances a weekly task without explicit days by N weeks', () => {
    expect(computeNextDueDate({ type: 'weekly', interval: 2 }, '2026-01-01')).toBe(
      '2026-01-15',
    );
  });

  it('advances a monthly task, clamping short months', () => {
    expect(computeNextDueDate({ type: 'monthly', interval: 1 }, '2026-01-31')).toBe(
      '2026-02-28',
    );
  });

  it('returns null once the recurrence end date has passed', () => {
    expect(
      computeNextDueDate(
        { type: 'daily', interval: 1, endDate: '2026-01-01' },
        '2026-01-01',
      ),
    ).toBeNull();
  });
});
