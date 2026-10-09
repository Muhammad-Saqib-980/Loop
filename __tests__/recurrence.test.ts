import {
  computeNextDueDate,
  describeRecurrence,
  firstMonthlyDayOnOrAfter,
} from '../src/utils/recurrence';

describe('computeNextDueDate', () => {
  it('advances a daily task by the interval', () => {
    expect(computeNextDueDate({type: 'daily', interval: 1}, '2026-01-01')).toBe(
      '2026-01-02',
    );
    expect(computeNextDueDate({type: 'daily', interval: 3}, '2026-01-01')).toBe(
      '2026-01-04',
    );
  });

  it('advances a weekly task to the next matching weekday', () => {
    // 2026-01-01 is a Thursday (day 4); next Monday (1) and Wednesday (3)
    expect(
      computeNextDueDate(
        {type: 'weekly', interval: 1, daysOfWeek: [1, 3]},
        '2026-01-01',
      ),
    ).toBe('2026-01-05');
  });

  it('advances a weekly task without explicit days by N weeks', () => {
    expect(
      computeNextDueDate({type: 'weekly', interval: 2}, '2026-01-01'),
    ).toBe('2026-01-15');
  });

  it('advances a monthly task, clamping short months', () => {
    expect(
      computeNextDueDate({type: 'monthly', interval: 1}, '2026-01-31'),
    ).toBe('2026-02-28');
  });

  it('returns null once the recurrence end date has passed', () => {
    expect(
      computeNextDueDate(
        {type: 'daily', interval: 1, endDate: '2026-01-01'},
        '2026-01-01',
      ),
    ).toBeNull();
  });
});

describe('computeNextDueDate with daysOfMonth', () => {
  const on = (daysOfMonth: number[], interval = 1, endDate?: string) => ({
    type: 'monthly' as const,
    interval,
    daysOfMonth,
    endDate,
  });

  it('moves to the next picked day in the same month', () => {
    expect(computeNextDueDate(on([1, 15]), '2026-01-10')).toBe('2026-01-15');
  });

  it('wraps to the first picked day of the next month', () => {
    expect(computeNextDueDate(on([1, 15]), '2026-01-15', '2026-01-15')).toBe(
      '2026-02-01',
    );
  });

  it('completing early counts as this occurrence, not an extra one', () => {
    expect(computeNextDueDate(on([15]), '2026-01-10', '2026-01-15')).toBe(
      '2026-02-15',
    );
  });

  it('completing late skips missed occurrences', () => {
    expect(computeNextDueDate(on([15]), '2025-10-20', '2025-09-15')).toBe(
      '2025-11-15',
    );
  });

  it('clamps a day the month does not have to its last day', () => {
    expect(computeNextDueDate(on([31]), '2026-03-31', '2026-03-31')).toBe(
      '2026-04-30',
    );
    expect(computeNextDueDate(on([31]), '2026-04-30', '2026-04-30')).toBe(
      '2026-05-31',
    );
  });

  it('handles February in normal and leap years', () => {
    expect(computeNextDueDate(on([30]), '2026-01-30', '2026-01-30')).toBe(
      '2026-02-28',
    );
    expect(computeNextDueDate(on([29]), '2028-01-29', '2028-01-29')).toBe(
      '2028-02-29',
    );
  });

  it('treats -1 as the last day of every month', () => {
    expect(computeNextDueDate(on([-1]), '2026-01-31', '2026-01-31')).toBe(
      '2026-02-28',
    );
    expect(computeNextDueDate(on([-1]), '2026-02-28', '2026-02-28')).toBe(
      '2026-03-31',
    );
  });

  it('occurs once when several picked days clamp to the same date', () => {
    const rule = on([28, 29, 30, 31, -1]);
    expect(computeNextDueDate(rule, '2026-02-28', '2026-02-28')).toBe(
      '2026-03-28',
    );
  });

  it('keeps an every-N-months rule on its original cycle', () => {
    expect(computeNextDueDate(on([15], 2), '2026-01-15', '2026-01-15')).toBe(
      '2026-03-15',
    );
    expect(computeNextDueDate(on([15], 2), '2026-04-20', '2026-01-15')).toBe(
      '2026-05-15',
    );
  });

  it('handles completions years late without looping', () => {
    expect(computeNextDueDate(on([15], 5), '2040-06-01', '2026-01-15')).toBe(
      '2040-08-15',
    );
  });

  it('returns null when the next picked day is past the end date', () => {
    expect(
      computeNextDueDate(on([15], 1, '2026-02-10'), '2026-01-15', '2026-01-15'),
    ).toBeNull();
  });

  it('falls back to plain monthly when no valid days are picked', () => {
    expect(computeNextDueDate(on([]), '2026-01-31')).toBe('2026-02-28');
    expect(computeNextDueDate(on([0, 40]), '2026-01-31')).toBe('2026-02-28');
  });
});

describe('computeNextDueDate weekly early completion', () => {
  it('moves past the current due date when completed before it', () => {
    // 2026-01-05 is a Monday; completing it on Sunday the 4th should not
    // leave it due on the 5th again.
    expect(
      computeNextDueDate(
        {type: 'weekly', interval: 1, daysOfWeek: [1]},
        '2026-01-04',
        '2026-01-05',
      ),
    ).toBe('2026-01-12');
  });
});

describe('describeRecurrence with daysOfMonth', () => {
  it('lists picked days with ordinals, sorted, last day at the end', () => {
    expect(
      describeRecurrence({
        type: 'monthly',
        interval: 1,
        daysOfMonth: [-1, 22, 1, 3, 11],
      }),
    ).toBe('Monthly on the 1st, 3rd, 11th, 22nd, last day');
  });

  it('includes the interval when it is more than one month', () => {
    expect(
      describeRecurrence({type: 'monthly', interval: 2, daysOfMonth: [31]}),
    ).toBe('Every 2 months on the 31st');
  });
});

describe('firstMonthlyDayOnOrAfter', () => {
  it('returns the date itself when it is a picked day', () => {
    expect(firstMonthlyDayOnOrAfter([15], '2026-01-15')).toBe('2026-01-15');
  });

  it('moves to the next picked day, clamping short months', () => {
    expect(firstMonthlyDayOnOrAfter([30], '2026-02-10')).toBe('2026-02-28');
    expect(firstMonthlyDayOnOrAfter([5], '2026-12-20')).toBe('2027-01-05');
  });
});
