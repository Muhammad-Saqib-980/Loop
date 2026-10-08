import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/forgot-password';
import {
  EmailDisabledError,
  forgotPasswordApi,
  getAuthConfigApi,
} from '../src/api/auth';

jest.mock('../src/api/auth');
jest.mock('expo-router', () => ({
  Link: ({children}: any) => children,
}));

const mockForgotPasswordApi = forgotPasswordApi as jest.Mock;
const mockGetAuthConfigApi = getAuthConfigApi as jest.Mock;
const EMAIL_DISABLED_TEXT =
  "Password reset by email isn't available on this server. Contact the administrator for help.";

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthConfigApi.mockResolvedValue(null);
  });

  it('explains up front when the server cannot send email', async () => {
    mockGetAuthConfigApi.mockResolvedValue({
      emailVerificationRequired: false,
      emailEnabled: false,
    });
    const {findByText, queryByText} = render(<ForgotPasswordScreen />);
    expect(await findByText(EMAIL_DISABLED_TEXT)).toBeTruthy();
    expect(queryByText('Send reset link')).toBeNull();
  });

  it('explains when the reset request fails because email is disabled', async () => {
    mockForgotPasswordApi.mockRejectedValue(new EmailDisabledError());
    const {getByPlaceholderText, getByText, findByText} = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.press(getByText('Send reset link'));
    expect(await findByText(EMAIL_DISABLED_TEXT)).toBeTruthy();
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

    await waitFor(() =>
      expect(mockForgotPasswordApi).toHaveBeenCalledWith('a@b.com'),
    );
    await waitFor(() =>
      expect(
        getByText(
          'If that account exists, a reset link has been sent to your email.',
        ),
      ).toBeTruthy(),
    );
  });
});
