import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import VerifyEmailScreen from '../app/verify-email';
import {verifyEmailApi} from '../src/api/auth';

jest.mock('../src/api/auth');
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Link: ({children}: any) => children,
}));

const mockVerifyEmailApi = verifyEmailApi as jest.Mock;
const {useLocalSearchParams} = jest.requireMock('expo-router');

describe('VerifyEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an error immediately when no token is present in the URL', async () => {
    useLocalSearchParams.mockReturnValue({});
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() =>
      expect(
        getByText('This verification link is invalid or has expired.'),
      ).toBeTruthy(),
    );
    expect(mockVerifyEmailApi).not.toHaveBeenCalled();
  });

  it('shows success when the token verifies', async () => {
    useLocalSearchParams.mockReturnValue({token: 'good-token'});
    mockVerifyEmailApi.mockResolvedValue(true);
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() =>
      expect(mockVerifyEmailApi).toHaveBeenCalledWith('good-token'),
    );
    await waitFor(() =>
      expect(
        getByText('Your email is verified. You can log in now.'),
      ).toBeTruthy(),
    );
  });

  it('shows an error when the token is invalid or expired', async () => {
    useLocalSearchParams.mockReturnValue({token: 'bad-token'});
    mockVerifyEmailApi.mockResolvedValue(false);
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() =>
      expect(
        getByText('This verification link is invalid or has expired.'),
      ).toBeTruthy(),
    );
  });

  it('shows an error instead of spinning forever when the request fails', async () => {
    useLocalSearchParams.mockReturnValue({token: 'any-token'});
    mockVerifyEmailApi.mockRejectedValue(new Error('network down'));
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() =>
      expect(
        getByText('This verification link is invalid or has expired.'),
      ).toBeTruthy(),
    );
  });
});
