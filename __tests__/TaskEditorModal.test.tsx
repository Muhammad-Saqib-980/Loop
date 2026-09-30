import React from 'react';
import {Platform} from 'react-native';
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
