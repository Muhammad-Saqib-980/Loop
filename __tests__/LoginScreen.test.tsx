import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import LoginScreen from '../app/login';
import {useAuth} from '../src/auth/AuthContext';
import {EmailNotVerifiedError, resendVerificationApi} from '../src/api/auth';

jest.mock('../src/auth/AuthContext');
jest.mock('../src/api/auth');

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({replace: mockReplace}),
  Link: ({children}: any) => children,
}));

const mockUseAuth = useAuth as jest.Mock;
const mockResendVerificationApi = resendVerificationApi as jest.Mock;

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a validation error when submitted empty', async () => {
    mockUseAuth.mockReturnValue({login: jest.fn()});
    const {getByText} = render(<LoginScreen />);

    fireEvent.press(getByText('Log in'));

    await waitFor(() =>
      expect(getByText('Enter your email and password.')).toBeTruthy(),
    );
  });

  it('navigates to / on successful login', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({login});
    const {getByPlaceholderText, getByText} = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log in'));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('a@b.com', 'password123'),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('shows a resend-verification action when login fails with EmailNotVerifiedError', async () => {
    const login = jest.fn().mockRejectedValue(new EmailNotVerifiedError());
    mockUseAuth.mockReturnValue({login});
    mockResendVerificationApi.mockResolvedValue(undefined);
    const {getByPlaceholderText, getByText} = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log in'));

    await waitFor(() =>
      expect(getByText("Your email isn't verified yet.")).toBeTruthy(),
    );

    fireEvent.press(getByText('Resend verification email'));
    await waitFor(() =>
      expect(mockResendVerificationApi).toHaveBeenCalledWith('a@b.com'),
    );
    await waitFor(() =>
      expect(
        getByText('Verification email sent — check your inbox.'),
      ).toBeTruthy(),
    );
  });

  it('shows a generic error for any other login failure', async () => {
    const login = jest.fn().mockRejectedValue(new Error('invalid credentials'));
    mockUseAuth.mockReturnValue({login});
    const {getByPlaceholderText, getByText} = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Log in'));

    await waitFor(() =>
      expect(getByText('Invalid email or password.')).toBeTruthy(),
    );
  });
});
