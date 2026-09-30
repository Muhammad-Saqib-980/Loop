import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {TaskEditorModal} from '../src/components/TaskEditorModal';

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
