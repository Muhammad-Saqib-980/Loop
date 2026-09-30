import React from 'react';
import {render} from '@testing-library/react-native';
import {TaskRow} from '../src/components/TaskRow';
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

describe('TaskRow', () => {
  it('does not render a pending indicator for a synced task', () => {
    const {queryByTestId} = render(
      <TaskRow
        task={baseTask}
        done={false}
        onToggle={() => {}}
        onPress={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(queryByTestId('pending-indicator')).toBeNull();
  });

  it('renders a pending indicator when the task has an unsynced change', () => {
    const {getByTestId} = render(
      <TaskRow
        task={{...baseTask, pending: true}}
        done={false}
        onToggle={() => {}}
        onPress={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(getByTestId('pending-indicator')).toBeTruthy();
  });
});
