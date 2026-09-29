import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/forgot-password';
import {forgotPasswordApi} from '../src/api/auth';

jest.mock('../src/api/auth');
jest.mock('expo-router', () => ({
  Link: ({children}: any) => children,
}));

const mockForgotPasswordApi = forgotPasswordApi as jest.Mock;

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when submitted with an empty email', () => {
    const {getByText} = render(<ForgotPasswordScreen />);
    fireEvent.press(getByText('Send reset link'));
    expect(mockForgotPasswordApi).not.toHaveBeenCalled();
  });

  it('calls forgotPasswordApi and shows the generic confirmation on submit', async () => {
    mockForgotPasswordApi.mockResolvedValue(undefined);
    const {getByPlaceholderText, getByText} = render(<ForgotPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.press(getByText('Send reset link'));

    await waitFor(() => expect(mockForgotPasswordApi).toHaveBeenCalledWith('a@b.com'));
    await waitFor(() =>
      expect(
        getByText('If that account exists, a reset link has been sent to your email.'),
      ).toBeTruthy(),
    );
  });
});
