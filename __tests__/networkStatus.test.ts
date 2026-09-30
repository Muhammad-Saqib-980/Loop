import NetInfo from '@react-native-community/netinfo';
import {isOnline, subscribeToConnectivity} from '../src/sync/networkStatus';

const mockFetch = NetInfo.fetch as jest.Mock;
const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

describe('networkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isOnline resolves true when connected and reachable', async () => {
    mockFetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
    expect(await isOnline()).toBe(true);
  });

  it('isOnline resolves false when not connected', async () => {
    mockFetch.mockResolvedValue({isConnected: false, isInternetReachable: false});
    expect(await isOnline()).toBe(false);
  });

  it('isOnline treats an unknown (null) reachability as online, given a connection', async () => {
    mockFetch.mockResolvedValue({isConnected: true, isInternetReachable: null});
    expect(await isOnline()).toBe(true);
  });

  it('subscribeToConnectivity calls back only when a state reports connected+reachable', () => {
    let capturedListener: (state: any) => void = () => {};
    mockAddEventListener.mockImplementation(listener => {
      capturedListener = listener;
      return () => {};
    });
    const onOnline = jest.fn();
    subscribeToConnectivity(onOnline);

    capturedListener({isConnected: false, isInternetReachable: false});
    expect(onOnline).not.toHaveBeenCalled();

    capturedListener({isConnected: true, isInternetReachable: true});
    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('subscribeToConnectivity returns the underlying unsubscribe function', () => {
    const unsubscribe = jest.fn();
    mockAddEventListener.mockReturnValue(unsubscribe);
    const result = subscribeToConnectivity(() => {});
    expect(result).toBe(unsubscribe);
  });
});
