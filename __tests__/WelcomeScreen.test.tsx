import React from 'react';
import {Linking} from 'react-native';
import {fireEvent, render, within} from '@testing-library/react-native';
import WelcomeScreen from '../app/welcome';
import {DOWNLOAD_LINKS} from '../src/config/downloadLinks';

jest.mock('expo-router', () => {
  const {View} = require('react-native');
  return {
    Link: ({href, children}: any) => (
      <View testID={`link-${href}`}>{children}</View>
    ),
  };
});
jest.mock('expo-router/head', () => () => null);

jest.mock('../src/config/downloadLinks', () => ({
  DOWNLOAD_LINKS: {android: '#', ios: '#'},
}));

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  it('explains what Loop is', () => {
    const {getByText} = render(<WelcomeScreen />);
    expect(getByText(/Tasks that come/)).toBeTruthy();
    expect(getByText('Repeating tasks')).toBeTruthy();
    expect(getByText('Home-screen widget')).toBeTruthy();
  });

  it('links the log in and sign up buttons to the auth screens', () => {
    const {getAllByTestId} = render(<WelcomeScreen />);
    const loginLinks = getAllByTestId('link-/login');
    const registerLinks = getAllByTestId('link-/register');

    expect(within(loginLinks[0]).getByText('Log in')).toBeTruthy();
    expect(within(registerLinks[0]).getByText('Sign up')).toBeTruthy();
    expect(registerLinks.some(l => within(l).queryByText('Sign up free'))).toBe(
      true,
    );
  });

  it('does nothing when a store link is still a placeholder', () => {
    const {getAllByLabelText} = render(<WelcomeScreen />);
    fireEvent.press(getAllByLabelText('Get Loop on Google Play')[0]);
    fireEvent.press(getAllByLabelText('Download Loop on the App Store')[0]);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the store URL once a real link is configured', () => {
    DOWNLOAD_LINKS.android =
      'https://play.google.com/store/apps/details?id=com.todoapp';
    const {getAllByLabelText} = render(<WelcomeScreen />);
    fireEvent.press(getAllByLabelText('Get Loop on Google Play')[0]);
    expect(Linking.openURL).toHaveBeenCalledWith(DOWNLOAD_LINKS.android);
  });
});
