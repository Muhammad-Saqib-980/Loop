import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import RegisterScreen from '../app/register';
import {registerApi} from '../src/api/auth';

jest.mock('../src/api/auth');
jest.mock('expo-router', () => ({
  Link: ({children}: any) => children,
}));

const mockRegisterApi = registerApi as jest.Mock;

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an error when the password is too short', async () => {
    const {getByPlaceholderText, getByText} = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'short');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'short');
    fireEvent.press(getByText('Register'));

    await waitFor(() =>
      expect(getByText('Password must be at least 8 characters.')).toBeTruthy(),
    );
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('shows an error when the passwords do not match', async () => {
    const {getByPlaceholderText, getByText} = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(
      getByPlaceholderText('Confirm password'),
      'password124',
    );
    fireEvent.press(getByText('Register'));

    await waitFor(() =>
      expect(getByText('Passwords do not match.')).toBeTruthy(),
    );
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('calls registerApi and shows the generic confirmation message on success', async () => {
    mockRegisterApi.mockResolvedValue(undefined);
    const {getByPlaceholderText, getByText} = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(
      getByPlaceholderText('Confirm password'),
      'password123',
    );
    fireEvent.press(getByText('Register'));

    await waitFor(() =>
      expect(mockRegisterApi).toHaveBeenCalledWith('a@b.com', 'password123'),
    );
    await waitFor(() =>
      expect(
        getByText(
          'If this email can be registered, check your inbox for a verification link.',
        ),
      ).toBeTruthy(),
    );
  });
});
