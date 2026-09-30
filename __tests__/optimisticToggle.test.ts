import {applyOptimisticToggle} from '../src/sync/optimisticToggle';
import {todayISODate} from '../src/utils/recurrence';
import type {Task} from '../src/types/task';

const base: Task = {
  id: '1',
  title: 'Task',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't0',
  updatedAt: 't0',
};

describe('applyOptimisticToggle', () => {
  it('flips completed for a non-recurring task', () => {
    const result = applyOptimisticToggle(base);
    expect(result.completed).toBe(true);

    const undone = applyOptimisticToggle(result);
    expect(undone.completed).toBe(false);
  });

  it('for a recurring task not done today, logs today and rolls dueDate forward', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: today,
      recurrence: {type: 'daily', interval: 1},
      history: [],
    };

    const result = applyOptimisticToggle(task);

    expect(result.history).toEqual([today]);
    expect(result.completed).toBe(false);
    expect(result.dueDate).not.toBe(today);
    expect(result.dueDate! > today).toBe(true);
  });

  it('for a recurring task already done today, undoes the completion', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: '9999-01-01',
      recurrence: {type: 'daily', interval: 1},
      history: [today],
    };

    const result = applyOptimisticToggle(task);

    expect(result.history).toEqual([]);
  });

  it('marks a recurring task completed when the recurrence has ended', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: today,
      recurrence: {type: 'daily', interval: 1, endDate: today},
      history: [],
    };

    const result = applyOptimisticToggle(task);

    expect(result.completed).toBe(true);
    expect(result.history).toEqual([today]);
  });

  it('always refreshes updatedAt to a new value', () => {
    const result = applyOptimisticToggle(base);
    expect(result.updatedAt).not.toBe(base.updatedAt);
  });
});
