import {ApiError, apiFetch} from '../src/api/client';
import {clearTokens, getTokens, setTokens} from '../src/auth/tokenStorage';

jest.mock('../src/auth/tokenStorage');

const mockGetTokens = getTokens as jest.Mock;
const mockSetTokens = setTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;

describe('apiFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('attaches the access token as a Bearer header', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'access-1', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({hello: 'world'}),
    });

    const result = await apiFetch('/tasks', {method: 'GET'});

    expect(result).toEqual({hello: 'world'});
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer access-1');
  });

  it('returns undefined for a 204 response', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'access-1', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock).mockResolvedValue({ok: true, status: 204});

    const result = await apiFetch('/tasks/abc', {method: 'DELETE'});
    expect(result).toBeUndefined();
  });

  it('throws ApiError with the response status and body on a non-401 failure', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'access-1', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({error: 'Invalid task'}),
    });

    await expect(apiFetch('/tasks', {method: 'POST', body: '{}'})).rejects.toMatchObject({
      status: 400,
      body: {error: 'Invalid task'},
    });
    expect(ApiError).toBeDefined();
  });

  it('on a 401, refreshes once and retries the original request', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'stale-access', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ok: false, status: 401})
      .mockResolvedValueOnce({ok: true, status: 200, json: async () => ({accessToken: 'new-access', refreshToken: 'new-refresh'})})
      .mockResolvedValueOnce({ok: true, status: 200, json: async () => ([{id: '1'}])});

    const result = await apiFetch('/tasks', {method: 'GET'});

    expect(result).toEqual([{id: '1'}]);
    expect(mockSetTokens).toHaveBeenCalledWith({accessToken: 'new-access', refreshToken: 'new-refresh'});
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1][0]).toContain('/auth/refresh');
    expect(calls[2][1].headers.Authorization).toBe('Bearer new-access');
  });

  it('two concurrent 401s share exactly one refresh call', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'stale-access', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({accessToken: 'new-access', refreshToken: 'new-refresh'}),
        });
      }
      const isRetry = (global.fetch as jest.Mock).mock.calls.some(
        ([, init]: any) => init?.headers?.Authorization === 'Bearer new-access',
      );
      if (isRetry) {
        return Promise.resolve({ok: true, status: 200, json: async () => ([])});
      }
      return Promise.resolve({ok: false, status: 401});
    });

    await Promise.all([apiFetch('/tasks', {method: 'GET'}), apiFetch('/tasks', {method: 'GET'})]);

    const refreshCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]: any) =>
      typeof url === 'string' && url.includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears tokens and throws when refresh itself fails', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'stale-access', refreshToken: 'refresh-1'});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ok: false, status: 401})
      .mockResolvedValueOnce({ok: false, status: 401});

    await expect(apiFetch('/tasks', {method: 'GET'})).rejects.toMatchObject({status: 401});
    expect(mockClearTokens).toHaveBeenCalled();
  });
});
