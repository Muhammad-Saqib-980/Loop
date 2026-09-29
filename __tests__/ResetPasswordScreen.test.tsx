import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import ResetPasswordScreen from '../app/reset-password';
import {resetPasswordApi} from '../src/api/auth';

jest.mock('../src/api/auth');
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({replace: mockReplace}),
}));

const mockResetPasswordApi = resetPasswordApi as jest.Mock;
const {useLocalSearchParams} = jest.requireMock('expo-router');

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows an error when there is no token in the URL', async () => {
    useLocalSearchParams.mockReturnValue({});
    const {getByPlaceholderText, getByText} = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('New password'), 'newpassword1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() =>
      expect(getByText('This reset link is invalid.')).toBeTruthy(),
    );
    expect(mockResetPasswordApi).not.toHaveBeenCalled();
  });

  it('shows an error when the new password is too short', async () => {
    useLocalSearchParams.mockReturnValue({token: 'good-token'});
    const {getByPlaceholderText, getByText} = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('New password'), 'short');
    fireEvent.press(getByText('Update password'));

    await waitFor(() =>
      expect(getByText('Password must be at least 8 characters.')).toBeTruthy(),
    );
    expect(mockResetPasswordApi).not.toHaveBeenCalled();
  });

  it('shows success and redirects to login when the reset succeeds', async () => {
    useLocalSearchParams.mockReturnValue({token: 'good-token'});
    mockResetPasswordApi.mockResolvedValue(true);
    const {getByPlaceholderText, getByText} = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('New password'), 'newpassword1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() =>
      expect(mockResetPasswordApi).toHaveBeenCalledWith(
        'good-token',
        'newpassword1',
      ),
    );
    await waitFor(() =>
      expect(
        getByText('Password updated. Redirecting to login...'),
      ).toBeTruthy(),
    );

    jest.advanceTimersByTime(1500);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('shows an error when the token is invalid or expired', async () => {
    useLocalSearchParams.mockReturnValue({token: 'bad-token'});
    mockResetPasswordApi.mockResolvedValue(false);
    const {getByPlaceholderText, getByText} = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('New password'), 'newpassword1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() =>
      expect(
        getByText('This reset link is invalid or has expired.'),
      ).toBeTruthy(),
    );
  });

  it('shows a generic error when the request fails', async () => {
    useLocalSearchParams.mockReturnValue({token: 'good-token'});
    mockResetPasswordApi.mockRejectedValue(new Error('network down'));
    const {getByPlaceholderText, getByText} = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('New password'), 'newpassword1');
    fireEvent.press(getByText('Update password'));

    await waitFor(() =>
      expect(getByText('Something went wrong. Please try again.')).toBeTruthy(),
    );
  });
});
