jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    getItem: jest.fn(key => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn(key => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store = {};
      return Promise.resolve();
    }),
  };
});

jest.mock('react-native-android-widget', () => {
  const actual = jest.requireActual('react-native-android-widget');
  return {
    ...actual,
    registerWidgetTaskHandler: jest.fn(),
    requestWidgetUpdate: jest.fn(() => Promise.resolve()),
    requestPinWidget: jest.fn(() => Promise.resolve(false)),
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({isConnected: true, isInternetReachable: true})),
  addEventListener: jest.fn(() => () => {}),
}));
