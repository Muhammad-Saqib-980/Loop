import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import TaskListScreen from '../app/index';
import {useAuth} from '../src/auth/AuthContext';
import {getTasks, subscribeToTasks} from '../src/storage/taskStorage';
import {todayISODate} from '../src/utils/recurrence';

jest.mock('../src/auth/AuthContext');
jest.mock('../src/storage/taskStorage');

const mockUseAuth = useAuth as jest.Mock;
const mockGetTasks = getTasks as jest.Mock;
const mockSubscribeToTasks = subscribeToTasks as jest.Mock;

describe('TaskListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribeToTasks.mockReturnValue(() => {});
  });

  it('renders the tasks due today from storage', async () => {
    mockUseAuth.mockReturnValue({logout: jest.fn(), status: 'authed'});
    mockGetTasks.mockResolvedValue([
      {
        id: 't1',
        title: 'Water the plants',
        priority: 'medium',
        dueDate: todayISODate(),
        completed: false,
        history: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    const {getByText} = render(<TaskListScreen />);

    await waitFor(() => expect(getByText('Water the plants')).toBeTruthy());
    expect(getByText('1 due today')).toBeTruthy();
  });

  it('logs out when "Log out" is pressed', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({logout, status: 'authed'});
    mockGetTasks.mockResolvedValue([]);
    const {getByText} = render(<TaskListScreen />);

    await waitFor(() =>
      expect(getByText('Nothing here. Enjoy the quiet.')).toBeTruthy(),
    );
    fireEvent.press(getByText('Log out'));
    expect(logout).toHaveBeenCalled();
  });

  it('does not fetch tasks while not authenticated', async () => {
    mockUseAuth.mockReturnValue({logout: jest.fn(), status: 'anonymous'});
    render(<TaskListScreen />);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockGetTasks).not.toHaveBeenCalled();
  });
});
