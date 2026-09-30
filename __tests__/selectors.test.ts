import {getTodayTasks, getUpcomingTasks} from '../src/utils/selectors';
import type {Task} from '../src/types/task';
import {todayISODate} from '../src/utils/recurrence';

function makeRepeatingTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Buy groceries',
    priority: 'medium',
    completed: false,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recurrence: {type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5]},
    ...overrides,
  };
}

describe('getUpcomingTasks with a just-completed repeating task', () => {
  it('shows the task once its dueDate rolls to a future date, even though today is in its history', () => {
    const today = todayISODate();
    const future = '9999-01-01';
    const task = makeRepeatingTask({dueDate: future, history: [today]});

    expect(getUpcomingTasks([task])).toEqual([task]);
    expect(getTodayTasks([task])).toEqual([]);
  });

  it('keeps a not-yet-completed repeating task in Today, not Upcoming', () => {
    const today = todayISODate();
    const task = makeRepeatingTask({dueDate: today, history: []});

    expect(getTodayTasks([task])).toEqual([task]);
    expect(getUpcomingTasks([task])).toEqual([]);
  });
});
