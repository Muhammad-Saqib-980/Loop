import React from 'react';
import {Platform, Switch} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {TaskEditorModal} from '../src/components/TaskEditorModal';
import type {Task} from '../src/types/task';

const baseTask: Task = {
  id: '1',
  title: 'Buy milk',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't0',
  updatedAt: 't0',
};

describe('TaskEditorModal', () => {
  it('shows an inline error instead of saving a task without a title', () => {
    const onSave = jest.fn();
    const {getByText, getByPlaceholderText, queryByText} = render(
      <TaskEditorModal
        visible
        task={null}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.press(getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText(/Give it a title/)).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('Title'), 'Buy milk');
    expect(queryByText(/Give it a title/)).toBeNull();
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({title: 'Buy milk'}),
    );
  });
});

describe('TaskEditorModal delete on web', () => {
  const originalConfirm = (globalThis as any).confirm;

  beforeEach(() => {
    (Platform as any).OS = 'web';
  });

  afterEach(() => {
    (globalThis as any).confirm = originalConfirm;
    (Platform as any).OS = 'ios';
  });

  it('calls onDelete when the user accepts the web confirm dialog', () => {
    (globalThis as any).confirm = jest.fn(() => true);
    const onDelete = jest.fn();

    const {getByText} = render(
      <TaskEditorModal
        visible
        task={baseTask}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.press(getByText('Delete'));

    expect(onDelete).toHaveBeenCalled();
  });

  it('does not call onDelete when the user cancels the web confirm dialog', () => {
    (globalThis as any).confirm = jest.fn(() => false);
    const onDelete = jest.fn();

    const {getByText} = render(
      <TaskEditorModal
        visible
        task={baseTask}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.press(getByText('Delete'));

    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('TaskEditorModal monthly days', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: new Date(2026, 0, 20)});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderEditor(task: Task | null = null) {
    const onSave = jest.fn();
    const utils = render(
      <TaskEditorModal
        visible
        task={task}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
    return {...utils, onSave};
  }

  it('saves picked days and sets the due date to the first matching day', () => {
    const {getByText, getByPlaceholderText, UNSAFE_getByType, onSave} =
      renderEditor();
    fireEvent.changeText(getByPlaceholderText('Title'), 'Pay rent');
    fireEvent(UNSAFE_getByType(Switch), 'valueChange', true);
    fireEvent.press(getByText('Monthly'));
    fireEvent.press(getByText('15'));
    fireEvent.press(getByText('Last day'));
    fireEvent.press(getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: '2026-01-31',
        recurrence: {
          type: 'monthly',
          interval: 1,
          daysOfWeek: undefined,
          daysOfMonth: [15, -1],
        },
      }),
    );
  });

  it('unpicks a day when it is pressed again', () => {
    const {getByText, getByPlaceholderText, UNSAFE_getByType, onSave} =
      renderEditor();
    fireEvent.changeText(getByPlaceholderText('Title'), 'Pay rent');
    fireEvent(UNSAFE_getByType(Switch), 'valueChange', true);
    fireEvent.press(getByText('Monthly'));
    fireEvent.press(getByText('15'));
    fireEvent.press(getByText('15'));
    fireEvent.press(getByText('Save'));

    expect(onSave.mock.calls[0][0].recurrence.daysOfMonth).toBeUndefined();
  });

  it("keeps an existing task's days and due date when saved unchanged", () => {
    const {getByText, onSave} = renderEditor({
      ...baseTask,
      dueDate: '2026-02-01',
      recurrence: {type: 'monthly', interval: 2, daysOfMonth: [1]},
    });
    fireEvent.press(getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: '2026-02-01',
        recurrence: expect.objectContaining({interval: 2, daysOfMonth: [1]}),
      }),
    );
  });

  it('drops picked days when the rule is switched to weekly', () => {
    const {getByText, onSave} = renderEditor({
      ...baseTask,
      dueDate: '2026-02-01',
      recurrence: {type: 'monthly', interval: 1, daysOfMonth: [1]},
    });
    fireEvent.press(getByText('Weekly'));
    fireEvent.press(getByText('Save'));

    expect(onSave.mock.calls[0][0].recurrence.daysOfMonth).toBeUndefined();
  });
});
