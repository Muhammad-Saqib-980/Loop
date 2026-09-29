# Todo Phase 2 — Expo Migration + Shared Web/Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the bare React Native app to Expo with a web build, add Expo Router with full auth screens wired to the Phase 1 backend, and swap the local-only task store for an API-backed one — without changing `TaskRow`, `TaskEditorModal`, `LogoMark`, `theme.ts`, or the recurrence/selector utilities.

**Architecture:** Expo (Metro web support) + Expo Router for navigation; a thin `src/api/*` layer talks to the Phase 1 backend; `src/auth/AuthContext.tsx` holds session state backed by `expo-secure-store` (native) / `localStorage` (web); `src/storage/taskStorage.ts` keeps its exact current exported shape but is now API-backed, with a small AsyncStorage snapshot (`widgetCache.ts`) feeding the Android widget.

**Tech Stack:** Expo SDK (latest compatible with React Native 0.74.x, resolved at install time), Expo Router, react-native-web, expo-secure-store, Jest + `@testing-library/react-native`.

**Spec:** [docs/superpowers/specs/2026-09-29-todo-phase2-expo-web-design.md](../specs/2026-09-29-todo-phase2-expo-web-design.md)

## Global Constraints

- Web build uses Expo's built-in Metro web bundler — no hand-written webpack config.
- `android/` and `ios/` stay committed to git (not gitignored); `expo prebuild` is run once and the native widget files (`TodoWidget.kt`, its manifest entry, its XML/drawable resources) must come out **byte-identical** — no custom Expo config plugin for the widget.
- Token storage is `expo-secure-store` on native and `localStorage` on web, behind one shared interface (`src/auth/tokenStorage.ts`).
- The backend base URL comes from `process.env.EXPO_PUBLIC_API_URL` everywhere (never hardcoded).
- The API client attaches `Authorization: Bearer <accessToken>` and on a `401` performs **exactly one, single-flight** `POST /auth/refresh` + retry before giving up — concurrent requests must share one in-flight refresh, never each call `/auth/refresh` independently.
- `src/storage/taskStorage.ts` keeps its exact current exported surface: `getTasks()`, `addTask(input)`, `updateTask(id, changes)`, `deleteTask(id)`, `toggleTaskComplete(id)`, `subscribeToTasks(listener)`. `TaskRow`, `TaskEditorModal`, `LogoMark`, `src/theme.ts`, `src/utils/recurrence.ts`, `src/utils/selectors.ts` are not modified by this plan.
- The widget's display path reads a local AsyncStorage snapshot first (works without connectivity); its toggle action attempts a real API call and fails silently on error — no offline queue (Phase 3's job).
- Offline cache/sync, active iOS development, and a widget config plugin are out of scope — do not build them.

## Review Focus

- Two API calls that both hit a `401` at the same time must trigger only **one** `/auth/refresh` call, not two — the backend revokes an entire session's refresh-token family when a rotated token is reused, so a naive per-call refresh would log the user out on ordinary concurrent usage, not just an actual attack. → Task 5.
- Clearing a task's due date, recurrence, or notes in the editor (picking "None", turning off "Repeat") must actually clear it on the backend — the backend only clears a field when the PATCH body contains an explicit `null`; a field silently omitted from the JSON body is treated as "leave unchanged." → Task 9.
- Logging out must clear the locally cached task list and the widget's cached snapshot — otherwise a second account on the same device (or the still-installed widget) can keep showing the previous user's tasks. → Task 7 (AuthContext) and Task 10 (taskStorage's `clearLocalTaskCache`).
- An unverified-email login attempt must surface a working "resend verification email" action on the login screen itself, not a dead-end generic error. → Task 13.
- `verify-email` and `reset-password` must show a clear, non-crashing error state for a missing, invalid, expired, or already-used token — these are reached from email links that can be clicked stale or twice. → Tasks 15 and 17.

---

## Task 1: Install Expo + web support

**Files:**
- Modify: `package.json`
- Modify: `babel.config.js`
- Modify: `metro.config.js`
- Modify: `app.json`

**Interfaces:**
- Produces: an Expo-aware project (`expo` CLI available, `react-native-web`/`react-dom` installed) that later tasks build on. No application code yet.

- [ ] **Step 1: Install Expo modules into the existing bare RN project**

Run: `npx install-expo-modules@latest`

This is Expo's official command for adopting Expo modules into an existing bare React Native project — it detects the installed React Native version (0.74.5) and installs a compatible `expo` package plus `expo-modules-core` and its native Android/iOS glue, and patches `android/`/`ios/` minimally (Gradle/Podfile includes) to load the Expo modules registry. Answer any interactive prompts with the defaults unless they conflict with something in this plan.

Expected: the command completes without error; `package.json` now lists `expo` under `dependencies`; running `npx expo --version` prints a version number.

- [ ] **Step 2: Add web support**

Run: `npx expo install react-native-web react-dom`

(`expo install` — not plain `npm install` — picks versions compatible with the resolved Expo SDK.)

- [ ] **Step 3: Switch Babel to the Expo preset**

Modify `babel.config.js` to:

```js
module.exports = {
  presets: ['babel-preset-expo'],
};
```

- [ ] **Step 4: Switch Metro to Expo's config**

Modify `metro.config.js` to:

```js
const {getDefaultConfig} = require('expo/metro-config');

/** @type {import('metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
```

- [ ] **Step 5: Add web config to app.json**

Modify `app.json` — add a `web` block alongside the existing `name`/`displayName`:

```json
{
  "name": "TodoApp",
  "displayName": "Loop",
  "expo": {
    "name": "Loop",
    "slug": "loop",
    "scheme": "loop",
    "web": {
      "bundler": "metro"
    }
  }
}
```

(The top-level `name`/`displayName` keys are kept for the existing bare-RN Android/iOS native project files, which still reference them; the new `expo` key is what the Expo CLI and `expo-router` read. `scheme` is required later for auth-related deep links to resolve correctly on native.)

- [ ] **Step 6: Verify the web build boots**

Run: `npx expo start --web`

Expected: Metro bundles successfully and prints a local URL (e.g. `http://localhost:8081`); no build errors in the terminal. Stop the server (Ctrl+C) once confirmed — there's no UI to check yet since `App.tsx` hasn't changed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json babel.config.js metro.config.js app.json android ios
git commit -m "Install Expo and add web support"
```

(`install-expo-modules` may also touch `android/`/`ios/` files — include whatever it changed; review the diff first to confirm it didn't touch `TodoWidget.kt` or the widget's manifest/resource files, which must stay untouched until Task 3's dedicated verification.)

---

## Task 2: Install Expo Router and migrate the entry point

**Files:**
- Create: `app/_layout.tsx` (placeholder — replaced in Task 12)
- Create: `app/index.tsx` (placeholder — replaced in Task 18)
- Modify: `package.json`
- Modify: `index.js`
- Delete: none yet (`App.tsx` is removed in Task 18 once its content has moved)

**Interfaces:**
- Produces: a working Expo Router root (`app/_layout.tsx`, `app/index.tsx`) that later tasks replace with real content, and a `main` entry point that both boots the router and keeps registering the widget task handler.

- [ ] **Step 1: Install Expo Router and its peer dependencies**

Run: `npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens`

- [ ] **Step 2: Point package.json's main entry at a custom entry file**

Modify `package.json`'s top-level `"main"` field:

```json
"main": "index.js"
```

(Not `"expo-router/entry"` directly — Step 4 below wraps it in a custom `index.js` so the widget task handler registration, which is specific to `react-native-android-widget` and unrelated to Expo Router, still runs at startup.)

- [ ] **Step 3: Create the placeholder root layout**

`app/_layout.tsx`:

```tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

- [ ] **Step 4: Create the placeholder index route**

`app/index.tsx`:

```tsx
import {Text, View} from 'react-native';

export default function Index() {
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
      <Text>Loop</Text>
    </View>
  );
}
```

- [ ] **Step 5: Rewrite the entry point**

Replace `index.js`'s content with:

```js
/**
 * @format
 */

import 'expo-router/entry';
import {registerWidgetTaskHandler} from 'react-native-android-widget';
import {widgetTaskHandler} from './src/widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
```

- [ ] **Step 6: Verify the router boots and renders the placeholder**

Run: `npx expo start --web`

Expected: the terminal shows no errors; opening the printed local URL in a browser shows a screen with the text "Loop" centered on it (confirm this — take a screenshot or describe what's rendered if you can access a browser; at minimum confirm the Metro/web dev server itself reports no bundling or runtime errors in its logs).

- [ ] **Step 7: Commit**

```bash
git add app package.json package-lock.json index.js
git commit -m "Install Expo Router and migrate the app entry point"
```

---

## Task 3: Prebuild native projects, verify the widget is untouched

**Files:**
- Modify: `android/` (Expo-required additions only — e.g. `MainApplication.kt`'s module registration; the widget files must not change)
- Create: `ios/` (regenerated fresh — was deleted before Phase 1)

**Interfaces:**
- Produces: `android/` and `ios/` folders that satisfy Expo's build requirements while every hand-written widget file (`TodoWidget.kt`, its manifest `<receiver>` entry, its layout/drawable XML) stays byte-identical to what it was before this task. No later task touches these native folders again in this plan.

- [ ] **Step 1: Snapshot the widget files before prebuild**

Run:

```bash
git show HEAD:android/app/src/main/java/com/todoapp/TodoWidget.kt > /tmp/todo-widget-before.kt
git show HEAD:android/app/src/main/AndroidManifest.xml > /tmp/manifest-before.xml
```

- [ ] **Step 2: Run Android prebuild**

Run: `npx expo prebuild --platform android`

Expected: the command completes without error. It will report which files it modified (typically `MainApplication.kt`/`MainActivity.kt` for Expo's module registration, and possibly `build.gradle` files) — none of them should be the widget's own files.

- [ ] **Step 3: Verify the widget files are untouched**

Run:

```bash
diff /tmp/todo-widget-before.kt android/app/src/main/java/com/todoapp/TodoWidget.kt
diff /tmp/manifest-before.xml android/app/src/main/AndroidManifest.xml
```

Expected for the first `diff`: no output (files identical) — `TodoWidget.kt` must not have changed at all.

Expected for the second `diff`: any changes must be Expo-related additions (e.g. a new `<meta-data>` entry for Expo's config), and the widget's existing `<receiver android:name=".TodoWidget">` entry and its `<meta-data android:name="android.appwidget.provider">` line must still be present, unmodified, in the diff's context. If the widget's receiver entry is missing or altered, STOP and report BLOCKED — do not proceed past this step.

- [ ] **Step 4: Verify the Android native build still succeeds**

Run: `cd android && ./gradlew assembleDebug && cd ..`

Expected: `BUILD SUCCESSFUL`. This confirms Expo's additions compile alongside the existing widget code.

- [ ] **Step 5: Run iOS prebuild**

Run: `npx expo prebuild --platform ios`

Expected: the command completes without error and an `ios/` directory now exists with a `.xcodeproj`/`.xcworkspace` and `Podfile`. No build verification is required for iOS this phase (per the spec, active iOS development is out of scope) — just confirm the directory structure exists so a later `expo run:ios` is possible.

- [ ] **Step 6: Commit**

```bash
git add android ios
git commit -m "Prebuild native projects for Expo; verify the Android widget is untouched"
```

---

## Task 4: Token storage (native SecureStore / web localStorage)

**Files:**
- Create: `src/auth/tokenStorage.ts`
- Test: `__tests__/tokenStorage.test.ts`

**Interfaces:**
- Consumes: `expo-secure-store` (native), the global `localStorage` (web).
- Produces: `StoredTokens` (`{accessToken: string; refreshToken: string}`), `getTokens(): Promise<StoredTokens | null>`, `setTokens(tokens: StoredTokens): Promise<void>`, `clearTokens(): Promise<void>` — used by Tasks 5 and 7.

- [ ] **Step 1: Install expo-secure-store**

Run: `npx expo install expo-secure-store`

- [ ] **Step 2: Write the failing test**

`__tests__/tokenStorage.test.ts`:

```ts
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {clearTokens, getTokens, setTokens} from '../src/auth/tokenStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('tokenStorage on native', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
  });

  it('returns null when no tokens are stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    expect(await getTokens()).toBeNull();
  });

  it('stores and retrieves both tokens via SecureStore', async () => {
    mockSecureStore.getItemAsync.mockImplementation(async key =>
      key === 'todo_access_token' ? 'access-1' : key === 'todo_refresh_token' ? 'refresh-1' : null,
    );
    await setTokens({accessToken: 'access-1', refreshToken: 'refresh-1'});
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('todo_access_token', 'access-1');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('todo_refresh_token', 'refresh-1');

    const tokens = await getTokens();
    expect(tokens).toEqual({accessToken: 'access-1', refreshToken: 'refresh-1'});
  });

  it('clears both keys via SecureStore', async () => {
    await clearTokens();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('todo_access_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('todo_refresh_token');
  });
});

describe('tokenStorage on web', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'web';
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    (global as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
  });

  afterEach(() => {
    (Platform as any).OS = 'ios';
    delete (global as any).localStorage;
  });

  it('stores and retrieves both tokens via localStorage, without touching SecureStore', async () => {
    await setTokens({accessToken: 'web-access', refreshToken: 'web-refresh'});
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();

    const tokens = await getTokens();
    expect(tokens).toEqual({accessToken: 'web-access', refreshToken: 'web-refresh'});
  });

  it('clears both keys via localStorage', async () => {
    await setTokens({accessToken: 'web-access', refreshToken: 'web-refresh'});
    await clearTokens();
    expect(await getTokens()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/tokenStorage.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/tokenStorage'`.

- [ ] **Step 3: Implement token storage**

`src/auth/tokenStorage.ts`:

```ts
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = 'todo_access_token';
const REFRESH_KEY = 'todo_refresh_token';

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const nativeAdapter: StorageAdapter = {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key),
};

const webAdapter: StorageAdapter = {
  getItem: async key => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key, value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },
  removeItem: async key => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  },
};

function getAdapter(): StorageAdapter {
  return Platform.OS === 'web' ? webAdapter : nativeAdapter;
}

export async function getTokens(): Promise<StoredTokens | null> {
  const adapter = getAdapter();
  const [accessToken, refreshToken] = await Promise.all([
    adapter.getItem(ACCESS_KEY),
    adapter.getItem(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) {
    return null;
  }
  return {accessToken, refreshToken};
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  const adapter = getAdapter();
  await Promise.all([
    adapter.setItem(ACCESS_KEY, tokens.accessToken),
    adapter.setItem(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  const adapter = getAdapter();
  await Promise.all([adapter.removeItem(ACCESS_KEY), adapter.removeItem(REFRESH_KEY)]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/tokenStorage.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth/tokenStorage.ts __tests__/tokenStorage.test.ts package.json package-lock.json
git commit -m "Add cross-platform token storage (SecureStore / localStorage)"
```

---

## Task 5: API client with single-flight refresh-and-retry

**Files:**
- Create: `src/api/client.ts`
- Test: `__tests__/apiClient.test.ts`

**Interfaces:**
- Consumes: `getTokens`, `setTokens`, `clearTokens` from `../auth/tokenStorage` (Task 4).
- Produces: `ApiError` (class, `{status: number; body: unknown}`), `apiFetch<T>(path: string, options?: {method: string; body?: string}): Promise<T>` — used by Task 9.

- [ ] **Step 1: Write the failing test**

`__tests__/apiClient.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/apiClient.test.ts`
Expected: FAIL — `Cannot find module '../src/api/client'`.

- [ ] **Step 3: Implement the API client**

`src/api/client.ts`:

```ts
import {clearTokens, getTokens, setTokens} from '../auth/tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Deduplicates concurrent refresh attempts: if two requests hit a 401 at the
// same time, they must share one /auth/refresh call, not each make their
// own — the backend revokes the whole refresh-token family when a
// rotated/already-used token is presented again, so two independent
// refreshes using the same stale token would force-logout the user.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) {
    return null;
  }
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refreshToken: tokens.refreshToken}),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const data = await res.json();
  await setTokens({accessToken: data.accessToken, refreshToken: data.refreshToken});
  return data.accessToken as string;
}

export async function apiFetch<T>(
  path: string,
  options: {method: string; body?: string} = {method: 'GET'},
): Promise<T> {
  async function send(accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      headers,
      body: options.body,
    });
  }

  const tokens = await getTokens();
  let res = await send(tokens?.accessToken ?? null);

  if (res.status === 401) {
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      throw new ApiError(401, null);
    }
    res = await send(newAccessToken);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/apiClient.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts __tests__/apiClient.test.ts
git commit -m "Add API client with single-flight refresh-and-retry on 401"
```

---

## Task 6: Auth API functions

**Files:**
- Create: `src/api/auth.ts`
- Test: `__tests__/authApi.test.ts`

**Interfaces:**
- Produces: `LoginResult` (`{accessToken: string; refreshToken: string}`), `EmailNotVerifiedError`, `InvalidCredentialsError` (error classes), `loginApi(email, password): Promise<LoginResult>`, `registerApi(email, password): Promise<void>`, `resendVerificationApi(email): Promise<void>`, `verifyEmailApi(token): Promise<boolean>`, `forgotPasswordApi(email): Promise<void>`, `resetPasswordApi(token, newPassword): Promise<boolean>`, `logoutApi(refreshToken): Promise<void>` — used by Tasks 7, 13, 14, 15, 16, 17.

These call the backend's `/auth/*` endpoints directly via `fetch` (not `apiFetch` from Task 5) — none of them carry or need a Bearer access token; `logoutApi`/`refreshApi`-style calls send the refresh token in the request body instead.

- [ ] **Step 1: Write the failing test**

`__tests__/authApi.test.ts`:

```ts
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  forgotPasswordApi,
  loginApi,
  logoutApi,
  registerApi,
  resendVerificationApi,
  resetPasswordApi,
  verifyEmailApi,
} from '../src/api/auth';

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    status,
    json: async () => body,
  });
}

describe('auth API', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('loginApi returns tokens on success', async () => {
    mockFetchOnce(200, {accessToken: 'a1', refreshToken: 'r1'});
    const result = await loginApi('a@b.com', 'password123');
    expect(result).toEqual({accessToken: 'a1', refreshToken: 'r1'});
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(JSON.parse(init.body)).toEqual({email: 'a@b.com', password: 'password123'});
  });

  it('loginApi throws EmailNotVerifiedError on 403 EMAIL_NOT_VERIFIED', async () => {
    mockFetchOnce(403, {error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED'});
    await expect(loginApi('a@b.com', 'password123')).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('loginApi throws InvalidCredentialsError on 401', async () => {
    mockFetchOnce(401, {error: 'Invalid credentials'});
    await expect(loginApi('a@b.com', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('registerApi resolves on a 200 response', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(registerApi('a@b.com', 'password123')).resolves.toBeUndefined();
  });

  it('resendVerificationApi always resolves', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(resendVerificationApi('a@b.com')).resolves.toBeUndefined();
  });

  it('verifyEmailApi returns true on 200, false otherwise', async () => {
    mockFetchOnce(200, {message: 'Email verified'});
    expect(await verifyEmailApi('good-token')).toBe(true);

    mockFetchOnce(400, {error: 'Invalid or expired token'});
    expect(await verifyEmailApi('bad-token')).toBe(false);
  });

  it('forgotPasswordApi always resolves', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(forgotPasswordApi('a@b.com')).resolves.toBeUndefined();
  });

  it('resetPasswordApi returns true on 200, false otherwise', async () => {
    mockFetchOnce(200, {message: 'Password updated'});
    expect(await resetPasswordApi('good-token', 'newpassword1')).toBe(true);

    mockFetchOnce(400, {error: 'Invalid or expired token'});
    expect(await resetPasswordApi('bad-token', 'newpassword1')).toBe(false);
  });

  it('logoutApi sends the refresh token', async () => {
    mockFetchOnce(200, {message: 'Logged out'});
    await logoutApi('r1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/logout');
    expect(JSON.parse(init.body)).toEqual({refreshToken: 'r1'});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/authApi.test.ts`
Expected: FAIL — `Cannot find module '../src/api/auth'`.

- [ ] **Step 3: Implement the auth API functions**

`src/api/auth.ts`:

```ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class EmailNotVerifiedError extends Error {}
export class InvalidCredentialsError extends Error {}

interface PostResult<T> {
  status: number;
  data: T;
}

async function post<T>(path: string, body: unknown): Promise<PostResult<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return {status: res.status, data};
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export async function loginApi(email: string, password: string): Promise<LoginResult> {
  const {status, data} = await post<any>('/auth/login', {email, password});
  if (status === 403 && data?.code === 'EMAIL_NOT_VERIFIED') {
    throw new EmailNotVerifiedError();
  }
  if (status !== 200) {
    throw new InvalidCredentialsError();
  }
  return {accessToken: data.accessToken, refreshToken: data.refreshToken};
}

export async function registerApi(email: string, password: string): Promise<void> {
  await post('/auth/register', {email, password});
}

export async function resendVerificationApi(email: string): Promise<void> {
  await post('/auth/resend-verification', {email});
}

export async function verifyEmailApi(token: string): Promise<boolean> {
  const {status} = await post('/auth/verify-email', {token});
  return status === 200;
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await post('/auth/forgot-password', {email});
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<boolean> {
  const {status} = await post('/auth/reset-password', {token, newPassword});
  return status === 200;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  await post('/auth/logout', {refreshToken});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/authApi.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts __tests__/authApi.test.ts
git commit -m "Add auth API functions"
```

---

## Task 7: AuthContext

**Files:**
- Create: `src/auth/AuthContext.tsx`
- Test: `__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `getTokens`, `setTokens`, `clearTokens` (Task 4); `loginApi`, `registerApi`, `logoutApi` (Task 6); `clearLocalTaskCache` from `../storage/taskStorage` (Task 10 — see note below).
- Produces: `AuthProvider` (component), `useAuth(): {status: 'loading' | 'authed' | 'anonymous'; login; register; logout}` — used by Task 12 and every screen task.

**Note on task ordering:** this task imports `clearLocalTaskCache` from `../storage/taskStorage`, which Task 10 creates. Since Task 10 comes later in this plan, write this task's import and test against a **mock** of `../storage/taskStorage` (the real module doesn't need to exist yet for this task's own tests to pass — Jest mocks don't require the mocked module to exist... actually they do need the module file to exist for `jest.mock` to resolve it in most configurations). To avoid a forward reference to a file that doesn't exist yet, create a minimal placeholder now and let Task 10 replace it:

- [ ] **Step 1: Create a placeholder taskStorage.ts (if it doesn't already reflect Task 10 — check first)**

Run: `test -f src/storage/taskStorage.ts && grep -q clearLocalTaskCache src/storage/taskStorage.ts && echo "already has it" || echo "need placeholder"`

If it printed "need placeholder", append this export to the END of the existing `src/storage/taskStorage.ts` (the current AsyncStorage-backed version — do not otherwise modify that file in this task; Task 10 replaces the whole file):

```ts
export async function clearLocalTaskCache(): Promise<void> {
  cache = null;
  listeners.forEach(l => l([]));
}
```

(This is a temporary, minimal addition so Task 7 compiles and tests pass; Task 10 replaces the entire file, including this function, with the real API-backed version and its own widget-cache-clearing behavior.)

- [ ] **Step 2: Write the failing test**

`__tests__/AuthContext.test.tsx`:

```tsx
import React from 'react';
import {Text} from 'react-native';
import {act, render, waitFor} from '@testing-library/react-native';
import {AuthProvider, useAuth} from '../src/auth/AuthContext';
import {clearTokens, getTokens, setTokens} from '../src/auth/tokenStorage';
import {loginApi, logoutApi, registerApi} from '../src/api/auth';
import {clearLocalTaskCache} from '../src/storage/taskStorage';

jest.mock('../src/auth/tokenStorage');
jest.mock('../src/api/auth');
jest.mock('../src/storage/taskStorage', () => ({
  clearLocalTaskCache: jest.fn().mockResolvedValue(undefined),
}));

const mockGetTokens = getTokens as jest.Mock;
const mockSetTokens = setTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;
const mockLoginApi = loginApi as jest.Mock;
const mockRegisterApi = registerApi as jest.Mock;
const mockLogoutApi = logoutApi as jest.Mock;
const mockClearLocalTaskCache = clearLocalTaskCache as jest.Mock;

function Probe() {
  const auth = useAuth();
  return <Text>status:{auth.status}</Text>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts loading, then resolves to anonymous when no tokens are stored', async () => {
    mockGetTokens.mockResolvedValue(null);
    const {getByText} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(getByText('status:loading')).toBeTruthy();
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());
  });

  it('resolves to authed when tokens are already stored', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    const {getByText} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());
  });

  it('login stores tokens and flips status to authed', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockLoginApi.mockResolvedValue({accessToken: 'a1', refreshToken: 'r1'});

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());

    await act(async () => {
      await auth!.login('a@b.com', 'password123');
    });

    expect(mockSetTokens).toHaveBeenCalledWith({accessToken: 'a1', refreshToken: 'r1'});
    expect(getByText('status:authed')).toBeTruthy();
  });

  it('logout clears tokens, clears the local task cache, and flips status to anonymous', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    mockLogoutApi.mockResolvedValue(undefined);

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());

    await act(async () => {
      await auth!.logout();
    });

    expect(mockLogoutApi).toHaveBeenCalledWith('r');
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockClearLocalTaskCache).toHaveBeenCalled();
    expect(getByText('status:anonymous')).toBeTruthy();
  });

  it('register calls the register API without changing auth status', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockRegisterApi.mockResolvedValue(undefined);

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());

    await act(async () => {
      await auth!.register('a@b.com', 'password123');
    });

    expect(mockRegisterApi).toHaveBeenCalledWith('a@b.com', 'password123');
    expect(getByText('status:anonymous')).toBeTruthy();
  });

  it('useAuth throws when used outside a provider', () => {
    function Bare() {
      useAuth();
      return null;
    }
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/AuthContext.test.tsx`
Expected: FAIL — `Cannot find module '../src/auth/AuthContext'`. (First install the test dependency: `npm install --save-dev @testing-library/react-native` if not already present from an earlier task.)

- [ ] **Step 4: Implement AuthContext**

`src/auth/AuthContext.tsx`:

```tsx
import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {clearTokens, getTokens, setTokens} from './tokenStorage';
import {loginApi, logoutApi, registerApi} from '../api/auth';
import {clearLocalTaskCache} from '../storage/taskStorage';

export type AuthStatus = 'loading' | 'authed' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    getTokens().then(tokens => {
      setStatus(tokens ? 'authed' : 'anonymous');
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const {accessToken, refreshToken} = await loginApi(email, password);
    await setTokens({accessToken, refreshToken});
    setStatus('authed');
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await registerApi(email, password);
  }, []);

  const logout = useCallback(async () => {
    const tokens = await getTokens();
    if (tokens) {
      await logoutApi(tokens.refreshToken).catch(() => {});
    }
    await clearTokens();
    await clearLocalTaskCache();
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{status, login, register, logout}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/AuthContext.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/auth/AuthContext.tsx __tests__/AuthContext.test.tsx src/storage/taskStorage.ts package.json package-lock.json
git commit -m "Add AuthContext with login/register/logout and cache clearing on logout"
```

---

## Task 8: Widget cache

**Files:**
- Create: `src/storage/widgetCache.ts`
- Test: `__tests__/widgetCache.test.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage` (already a dependency; already mocked in `jest.setup.js`).
- Produces: `writeWidgetCache(tasks: Task[]): Promise<void>`, `readWidgetCache(): Promise<Task[]>`, `clearWidgetCache(): Promise<void>` — used by Tasks 10 and 11.

- [ ] **Step 1: Write the failing test**

`__tests__/widgetCache.test.ts`:

```ts
import {clearWidgetCache, readWidgetCache, writeWidgetCache} from '../src/storage/widgetCache';
import type {Task} from '../src/types/task';

const sampleTask: Task = {
  id: '1',
  title: 'Sample',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('widgetCache', () => {
  it('returns an empty array when nothing has been cached', async () => {
    expect(await readWidgetCache()).toEqual([]);
  });

  it('round-trips a written task list', async () => {
    await writeWidgetCache([sampleTask]);
    expect(await readWidgetCache()).toEqual([sampleTask]);
  });

  it('clears the cache back to empty', async () => {
    await writeWidgetCache([sampleTask]);
    await clearWidgetCache();
    expect(await readWidgetCache()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/widgetCache.test.ts`
Expected: FAIL — `Cannot find module '../src/storage/widgetCache'`.

- [ ] **Step 3: Implement the widget cache**

`src/storage/widgetCache.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task} from '../types/task';

const CACHE_KEY = '@todo_app/widget_cache';

export async function writeWidgetCache(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
}

export async function readWidgetCache(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as Task[]) : [];
}

export async function clearWidgetCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/widgetCache.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/storage/widgetCache.ts __tests__/widgetCache.test.ts
git commit -m "Add widget cache for offline-capable widget display"
```

---

## Task 9: Task API mapping layer

**Files:**
- Create: `src/api/tasks.ts`
- Test: `__tests__/tasksApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `../api/client` (Task 5).
- Produces: `fetchTasks(): Promise<Task[]>`, `createTaskApi(input: NewTaskInput): Promise<Task>`, `updateTaskApi(id: string, changes: Partial<NewTaskInput>): Promise<Task>`, `deleteTaskApi(id: string): Promise<void>`, `toggleTaskApi(id: string): Promise<Task>` — used by Task 10.

- [ ] **Step 1: Write the failing test**

`__tests__/tasksApi.test.ts`:

```ts
import {apiFetch} from '../src/api/client';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../src/api/tasks';

jest.mock('../src/api/client');
const mockApiFetch = apiFetch as jest.Mock;

const backendTaskRow = {
  id: '1',
  userId: 'u1',
  title: 'Write plan',
  notes: null,
  priority: 'high',
  dueDate: null,
  completed: false,
  recurrence: null,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('tasks API mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchTasks maps backend null fields to undefined on the frontend Task shape', async () => {
    mockApiFetch.mockResolvedValue([backendTaskRow]);
    const tasks = await fetchTasks();
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks', {method: 'GET'});
    expect(tasks).toEqual([
      {
        id: '1',
        title: 'Write plan',
        notes: undefined,
        priority: 'high',
        dueDate: undefined,
        completed: false,
        recurrence: undefined,
        history: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('createTaskApi posts the new-task fields and maps the response', async () => {
    mockApiFetch.mockResolvedValue(backendTaskRow);
    const task = await createTaskApi({title: 'Write plan', priority: 'high'});
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks', {
      method: 'POST',
      body: JSON.stringify({title: 'Write plan', notes: undefined, priority: 'high', dueDate: undefined, recurrence: undefined}),
    });
    expect(task.id).toBe('1');
    expect(task.notes).toBeUndefined();
  });

  it('updateTaskApi sends explicit null for cleared dueDate/recurrence/notes, not an omitted field', async () => {
    mockApiFetch.mockResolvedValue(backendTaskRow);
    await updateTaskApi('1', {
      title: 'Write plan',
      notes: undefined,
      priority: 'high',
      dueDate: undefined,
      recurrence: undefined,
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1', {
      method: 'PATCH',
      body: JSON.stringify({title: 'Write plan', notes: null, priority: 'high', dueDate: null, recurrence: null}),
    });
    const sentBody = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(sentBody).toHaveProperty('dueDate', null);
    expect(sentBody).toHaveProperty('recurrence', null);
    expect(sentBody).toHaveProperty('notes', null);
  });

  it('deleteTaskApi calls DELETE on the task id', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteTaskApi('1');
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1', {method: 'DELETE'});
  });

  it('toggleTaskApi calls POST on the toggle endpoint and maps the response', async () => {
    mockApiFetch.mockResolvedValue({...backendTaskRow, completed: true});
    const task = await toggleTaskApi('1');
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1/toggle', {method: 'POST'});
    expect(task.completed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/tasksApi.test.ts`
Expected: FAIL — `Cannot find module '../src/api/tasks'`.

- [ ] **Step 3: Implement the task API mapping layer**

`src/api/tasks.ts`:

```ts
import {apiFetch} from './client';
import type {NewTaskInput, Priority, Recurrence, Task} from '../types/task';

interface TaskResponse {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  completed: boolean;
  recurrence: Recurrence | null;
  history: string[];
  createdAt: string;
  updatedAt: string;
}

function toTask(row: TaskResponse): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    priority: row.priority,
    dueDate: row.dueDate ?? undefined,
    completed: row.completed,
    recurrence: row.recurrence ?? undefined,
    history: row.history,
    createdAt: row.createdAt,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const rows = await apiFetch<TaskResponse[]>('/tasks', {method: 'GET'});
  return rows.map(toTask);
}

export async function createTaskApi(input: NewTaskInput): Promise<Task> {
  const row = await apiFetch<TaskResponse>('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
    }),
  });
  return toTask(row);
}

// Assumes `changes` always carries the full current field set (true of this
// app's only caller, TaskEditorModal.handleSave via App/taskStorage), so an
// `undefined` value here means "the user cleared this field" and must be
// sent as an explicit `null` - the backend only clears dueDate/recurrence/
// notes on an explicit null, never on a field the JSON body simply omits.
export async function updateTaskApi(id: string, changes: Partial<NewTaskInput>): Promise<Task> {
  const row = await apiFetch<TaskResponse>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: changes.title,
      notes: changes.notes ?? null,
      priority: changes.priority,
      dueDate: changes.dueDate ?? null,
      recurrence: changes.recurrence ?? null,
    }),
  });
  return toTask(row);
}

export async function deleteTaskApi(id: string): Promise<void> {
  await apiFetch<void>(`/tasks/${id}`, {method: 'DELETE'});
}

export async function toggleTaskApi(id: string): Promise<Task> {
  const row = await apiFetch<TaskResponse>(`/tasks/${id}/toggle`, {method: 'POST'});
  return toTask(row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/tasksApi.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/tasks.ts __tests__/tasksApi.test.ts
git commit -m "Add task API mapping layer with null/undefined normalization"
```

---

## Task 10: Rewrite taskStorage.ts to be API-backed

**Files:**
- Modify: `src/storage/taskStorage.ts` (full rewrite — replaces the AsyncStorage-backed version and Task 7's placeholder `clearLocalTaskCache`)
- Test: `__tests__/taskStorage.test.ts`

**Interfaces:**
- Consumes: `fetchTasks`, `createTaskApi`, `updateTaskApi`, `deleteTaskApi`, `toggleTaskApi` (Task 9); `writeWidgetCache`, `clearWidgetCache` (Task 8).
- Produces: `getTasks()`, `addTask(input)`, `updateTask(id, changes)`, `deleteTask(id)`, `toggleTaskComplete(id)`, `subscribeToTasks(listener)`, `clearLocalTaskCache()` — the exact same exported names Task 7 already depends on and the current `App.tsx`/`TaskRow`/`TaskEditorModal` already use; used by Tasks 11 and 18.

Note: `exportTasksAsJSON`/`importTasksFromJSON` from the old AsyncStorage-backed file are deliberately dropped in this rewrite — they have no caller anywhere in the codebase (confirmed by search) and no equivalent bulk-export/import endpoint exists on the backend.

- [ ] **Step 1: Write the failing test**

`__tests__/taskStorage.test.ts`:

```ts
import {
  addTask,
  clearLocalTaskCache,
  deleteTask,
  getTasks,
  subscribeToTasks,
  toggleTaskComplete,
  updateTask,
} from '../src/storage/taskStorage';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../src/api/tasks';
import {clearWidgetCache, writeWidgetCache} from '../src/storage/widgetCache';
import type {Task} from '../src/types/task';

jest.mock('../src/api/tasks');
jest.mock('../src/storage/widgetCache');

const mockFetchTasks = fetchTasks as jest.Mock;
const mockCreateTaskApi = createTaskApi as jest.Mock;
const mockUpdateTaskApi = updateTaskApi as jest.Mock;
const mockDeleteTaskApi = deleteTaskApi as jest.Mock;
const mockToggleTaskApi = toggleTaskApi as jest.Mock;
const mockWriteWidgetCache = writeWidgetCache as jest.Mock;
const mockClearWidgetCache = clearWidgetCache as jest.Mock;

const task1: Task = {id: '1', title: 'One', priority: 'medium', completed: false, history: [], createdAt: 't1'};
const task2: Task = {id: '2', title: 'Two', priority: 'low', completed: false, history: [], createdAt: 't2'};

describe('taskStorage (API-backed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteWidgetCache.mockResolvedValue(undefined);
    mockClearWidgetCache.mockResolvedValue(undefined);
  });

  it('getTasks fetches from the API and notifies subscribers', async () => {
    mockFetchTasks.mockResolvedValue([task1, task2]);
    const listener = jest.fn();
    subscribeToTasks(listener);

    const result = await getTasks();

    expect(result).toEqual([task1, task2]);
    expect(listener).toHaveBeenCalledWith([task1, task2]);
    expect(mockWriteWidgetCache).toHaveBeenCalledWith([task1, task2]);
  });

  it('addTask prepends the created task to the in-memory cache and notifies', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    mockCreateTaskApi.mockResolvedValue(task2);

    const listener = jest.fn();
    subscribeToTasks(listener);
    const created = await addTask({title: 'Two', priority: 'low'});

    expect(created).toEqual(task2);
    expect(listener).toHaveBeenCalledWith([task2, task1]);
  });

  it('updateTask replaces the matching task in the cache', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    const updated = {...task1, title: 'One (edited)'};
    mockUpdateTaskApi.mockResolvedValue(updated);

    await updateTask('1', {title: 'One (edited)', priority: 'medium'});

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([updated]);
  });

  it('deleteTask removes the task from the cache', async () => {
    mockFetchTasks.mockResolvedValue([task1, task2]);
    await getTasks();
    mockDeleteTaskApi.mockResolvedValue(undefined);

    await deleteTask('1');

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([task2]);
  });

  it('toggleTaskComplete replaces the task with the server response', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    const toggled = {...task1, completed: true};
    mockToggleTaskApi.mockResolvedValue(toggled);

    await toggleTaskComplete('1');

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([toggled]);
  });

  it('subscribeToTasks immediately pushes the current cache to a new listener', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([task1]);
  });

  it('clearLocalTaskCache resets the in-memory cache, notifies with an empty list, and clears the widget cache', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();

    await clearLocalTaskCache();

    expect(mockClearWidgetCache).toHaveBeenCalled();
    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/taskStorage.test.ts`
Expected: FAIL (the placeholder `taskStorage.ts` from Task 7 doesn't have this behavior — e.g. `getTasks` still reads AsyncStorage, not the mocked `fetchTasks`).

- [ ] **Step 3: Rewrite taskStorage.ts**

Replace the entire contents of `src/storage/taskStorage.ts` with:

```ts
import type {NewTaskInput, Task} from '../types/task';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../api/tasks';
import {clearWidgetCache, writeWidgetCache} from './widgetCache';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

let cache: Task[] | null = null;

function setCache(tasks: Task[]): void {
  cache = tasks;
  listeners.forEach(l => l(tasks));
  writeWidgetCache(tasks).catch(() => {});
}

export function subscribeToTasks(listener: Listener): () => void {
  listeners.add(listener);
  if (cache) {
    listener(cache);
  }
  return () => listeners.delete(listener);
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await fetchTasks();
  setCache(tasks);
  return tasks;
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  const task = await createTaskApi(input);
  setCache([task, ...(cache ?? [])]);
  return task;
}

export async function updateTask(id: string, changes: Partial<NewTaskInput>): Promise<void> {
  const updated = await updateTaskApi(id, changes);
  setCache((cache ?? []).map(t => (t.id === id ? updated : t)));
}

export async function deleteTask(id: string): Promise<void> {
  await deleteTaskApi(id);
  setCache((cache ?? []).filter(t => t.id !== id));
}

export async function toggleTaskComplete(id: string): Promise<void> {
  const updated = await toggleTaskApi(id);
  setCache((cache ?? []).map(t => (t.id === id ? updated : t)));
}

export async function clearLocalTaskCache(): Promise<void> {
  cache = null;
  listeners.forEach(l => l([]));
  await clearWidgetCache();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/taskStorage.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the AuthContext test to confirm no regression**

Run: `npx jest __tests__/AuthContext.test.tsx`
Expected: PASS (still 6 tests — `clearLocalTaskCache` is mocked there, so this rewrite doesn't affect it, but confirm nothing broke).

- [ ] **Step 6: Commit**

```bash
git add src/storage/taskStorage.ts __tests__/taskStorage.test.ts
git commit -m "Rewrite taskStorage.ts to be API-backed, keeping its existing interface"
```

---

## Task 11: Update widget-task-handler.ts

**Files:**
- Modify: `src/widgets/widget-task-handler.ts`
- Test: `__tests__/widgetTaskHandler.test.ts`

**Interfaces:**
- Consumes: `getTasks`, `toggleTaskComplete` (Task 10, unchanged names); `readWidgetCache` (Task 8).
- Produces: `widgetTaskHandler` (same export name/shape as before) — used by `index.js` (already wired in Task 2).

- [ ] **Step 1: Write the failing test**

`__tests__/widgetTaskHandler.test.ts`:

```ts
import {widgetTaskHandler} from '../src/widgets/widget-task-handler';
import {getTasks, toggleTaskComplete} from '../src/storage/taskStorage';
import {readWidgetCache} from '../src/storage/widgetCache';
import type {Task} from '../src/types/task';

jest.mock('../src/storage/taskStorage');
jest.mock('../src/storage/widgetCache');

const mockGetTasks = getTasks as jest.Mock;
const mockToggleTaskComplete = toggleTaskComplete as jest.Mock;
const mockReadWidgetCache = readWidgetCache as jest.Mock;

const cachedTask: Task = {id: '1', title: 'Cached', priority: 'medium', completed: false, history: [], createdAt: 't1'};
const freshTask: Task = {id: '1', title: 'Fresh', priority: 'medium', completed: false, history: [], createdAt: 't1'};

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('on WIDGET_UPDATE, renders the cached snapshot immediately, then re-renders with live data', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
    let resolveGetTasks: (tasks: Task[]) => void = () => {};
    mockGetTasks.mockReturnValue(new Promise(resolve => {
      resolveGetTasks = resolve;
    }));

    const renderWidget = jest.fn();
    const handlerPromise = widgetTaskHandler({
      widgetAction: 'WIDGET_UPDATE',
      renderWidget,
    } as any);

    await handlerPromise;
    expect(renderWidget).toHaveBeenCalledTimes(1);

    resolveGetTasks([freshTask]);
    await new Promise(process.nextTick);
    expect(renderWidget).toHaveBeenCalledTimes(2);
  });

  it('on a live-refresh failure, does not throw and keeps only the cached render', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
    mockGetTasks.mockRejectedValue(new Error('network down'));

    const renderWidget = jest.fn();
    await widgetTaskHandler({widgetAction: 'WIDGET_UPDATE', renderWidget} as any);
    await new Promise(process.nextTick);

    expect(renderWidget).toHaveBeenCalledTimes(1);
  });

  it('on WIDGET_CLICK with TOGGLE_TASK, toggles then re-renders from the cache', async () => {
    mockToggleTaskComplete.mockResolvedValue(undefined);
    mockReadWidgetCache.mockResolvedValue([freshTask]);

    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetAction: 'WIDGET_CLICK',
      clickAction: 'TOGGLE_TASK',
      clickActionData: {taskId: '1'},
      renderWidget,
    } as any);

    expect(mockToggleTaskComplete).toHaveBeenCalledWith('1');
    expect(renderWidget).toHaveBeenCalledWith(expect.anything());
  });

  it('on WIDGET_CLICK when the toggle API call fails, still re-renders from the cache without throwing', async () => {
    mockToggleTaskComplete.mockRejectedValue(new Error('offline'));
    mockReadWidgetCache.mockResolvedValue([cachedTask]);

    const renderWidget = jest.fn();
    await expect(
      widgetTaskHandler({
        widgetAction: 'WIDGET_CLICK',
        clickAction: 'TOGGLE_TASK',
        clickActionData: {taskId: '1'},
        renderWidget,
      } as any),
    ).resolves.toBeUndefined();

    expect(renderWidget).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/widgetTaskHandler.test.ts`
Expected: FAIL — the current handler calls `getTasks()` directly for display (no cache-first render) and doesn't catch a `toggleTaskComplete` failure, so the assertions on call counts/timing/resolved-not-thrown won't match.

- [ ] **Step 3: Update the widget task handler**

Replace the entire contents of `src/widgets/widget-task-handler.ts` with:

```ts
import type {WidgetTaskHandler} from 'react-native-android-widget';
import {getTasks, toggleTaskComplete} from '../storage/taskStorage';
import {readWidgetCache} from '../storage/widgetCache';
import {TodoWidgetComponent} from './TodoWidgetComponent';

export const widgetTaskHandler: WidgetTaskHandler = async props => {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const cached = await readWidgetCache();
      props.renderWidget(TodoWidgetComponent({tasks: cached}));
      getTasks()
        .then(tasks => props.renderWidget(TodoWidgetComponent({tasks})))
        .catch(() => {});
      break;
    }
    case 'WIDGET_CLICK': {
      if (props.clickAction === 'TOGGLE_TASK') {
        const taskId = props.clickActionData?.taskId as string | undefined;
        if (taskId) {
          await toggleTaskComplete(taskId).catch(() => {});
        }
      }
      const cached = await readWidgetCache();
      props.renderWidget(TodoWidgetComponent({tasks: cached}));
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/widgetTaskHandler.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/widgets/widget-task-handler.ts __tests__/widgetTaskHandler.test.ts
git commit -m "Update widget task handler for cache-first display and best-effort toggle"
```

---

## Task 12: Route guard + real root layout

**Files:**
- Create: `src/auth/routeGuard.ts`
- Test: `__tests__/routeGuard.test.ts`
- Modify: `app/_layout.tsx` (replaces Task 2's placeholder)

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` (Task 7).
- Produces: `resolveRedirect(status, currentRoute): '/' | '/login' | null` — pure, unit-tested; used inside `app/_layout.tsx`'s effect.

- [ ] **Step 1: Write the failing test for the pure redirect logic**

`__tests__/routeGuard.test.ts`:

```ts
import {resolveRedirect} from '../src/auth/routeGuard';

describe('resolveRedirect', () => {
  it('never redirects while auth status is loading', () => {
    expect(resolveRedirect('loading', 'index')).toBeNull();
    expect(resolveRedirect('loading', 'login')).toBeNull();
  });

  it('sends an anonymous user on a protected route to /login', () => {
    expect(resolveRedirect('anonymous', 'index')).toBe('/login');
  });

  it('leaves an anonymous user on a public route alone', () => {
    for (const route of ['login', 'register', 'verify-email', 'forgot-password', 'reset-password']) {
      expect(resolveRedirect('anonymous', route)).toBeNull();
    }
  });

  it('sends an authed user away from login/register to /', () => {
    expect(resolveRedirect('authed', 'login')).toBe('/');
    expect(resolveRedirect('authed', 'register')).toBe('/');
  });

  it('leaves an authed user on the task list, or on verify-email/forgot/reset routes, alone', () => {
    expect(resolveRedirect('authed', 'index')).toBeNull();
    expect(resolveRedirect('authed', 'verify-email')).toBeNull();
    expect(resolveRedirect('authed', 'forgot-password')).toBeNull();
    expect(resolveRedirect('authed', 'reset-password')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/routeGuard.test.ts`
Expected: FAIL — `Cannot find module '../src/auth/routeGuard'`.

- [ ] **Step 3: Implement the route guard logic**

`src/auth/routeGuard.ts`:

```ts
import type {AuthStatus} from './AuthContext';

const PUBLIC_ROUTES = ['login', 'register', 'verify-email', 'forgot-password', 'reset-password'];
const AUTH_ONLY_ROUTES = ['login', 'register'];

export function resolveRedirect(status: AuthStatus, currentRoute: string): '/' | '/login' | null {
  if (status === 'loading') {
    return null;
  }
  const isPublic = PUBLIC_ROUTES.includes(currentRoute);
  if (status === 'anonymous' && !isPublic) {
    return '/login';
  }
  if (status === 'authed' && AUTH_ONLY_ROUTES.includes(currentRoute)) {
    return '/';
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/routeGuard.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Replace the placeholder root layout**

Replace the entire contents of `app/_layout.tsx` with:

```tsx
import React, {useEffect} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {Stack, useRouter, useSegments} from 'expo-router';
import {AuthProvider, useAuth} from '../src/auth/AuthContext';
import {resolveRedirect} from '../src/auth/routeGuard';
import {colors} from '../src/theme';

function useProtectedRoute() {
  const {status} = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const currentRoute = segments[0] ?? 'index';
    const target = resolveRedirect(status, currentRoute);
    if (target) {
      router.replace(target);
    }
  }, [status, segments, router]);

  return status;
}

function Gate({children}: {children: React.ReactNode}) {
  const status = useProtectedRoute();
  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate>
        <Stack screenOptions={{headerShown: false}} />
      </Gate>
    </AuthProvider>
  );
}

const styles = {
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
```

- [ ] **Step 6: Verify the app still boots**

Run: `npx expo start --web`

Expected: no build errors; opening the printed URL redirects to a screen (since `app/login.tsx` doesn't exist until Task 13, this will 404 or show Expo Router's not-found screen for `/login` — that's expected and fine at this point in the plan; the key thing to confirm is there's no *crash*, and the terminal shows no errors). Stop the server once confirmed.

- [ ] **Step 7: Commit**

```bash
git add src/auth/routeGuard.ts __tests__/routeGuard.test.ts app/_layout.tsx
git commit -m "Add auth-gated root layout with pure, tested redirect logic"
```

---

## Task 13: Login screen

**Files:**
- Create: `src/components/authScreenStyles.ts`
- Create: `app/login.tsx`
- Test: `__tests__/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 7); `EmailNotVerifiedError`, `resendVerificationApi` (Task 6).
- Produces: `authStyles` (shared `StyleSheet`, reused by Tasks 14–17); the `/login` route.

- [ ] **Step 1: Install the RTL test dependency (if not already present)**

Run: `npm install --save-dev @testing-library/react-native`

- [ ] **Step 2: Create the shared auth screen styles**

`src/components/authScreenStyles.ts`:

```ts
import {StyleSheet} from 'react-native';
import {colors} from '../theme';

export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: colors.high,
    fontSize: 13,
    marginBottom: 12,
  },
  success: {
    color: colors.success,
    fontSize: 13,
    marginBottom: 12,
  },
  notice: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    color: colors.subtext,
    fontSize: 13,
    marginBottom: 6,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'center',
  },
  meta: {
    color: colors.subtext,
    fontSize: 13,
  },
});
```

- [ ] **Step 3: Write the failing test**

`__tests__/LoginScreen.test.tsx`:

```tsx
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

    await waitFor(() => expect(getByText('Enter your email and password.')).toBeTruthy());
  });

  it('navigates to / on successful login', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({login});
    const {getByPlaceholderText, getByText} = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log in'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.com', 'password123'));
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

    await waitFor(() => expect(getByText("Your email isn't verified yet.")).toBeTruthy());

    fireEvent.press(getByText('Resend verification email'));
    await waitFor(() => expect(mockResendVerificationApi).toHaveBeenCalledWith('a@b.com'));
    await waitFor(() => expect(getByText('Verification email sent — check your inbox.')).toBeTruthy());
  });

  it('shows a generic error for any other login failure', async () => {
    const login = jest.fn().mockRejectedValue(new Error('invalid credentials'));
    mockUseAuth.mockReturnValue({login});
    const {getByPlaceholderText, getByText} = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Log in'));

    await waitFor(() => expect(getByText('Invalid email or password.')).toBeTruthy());
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest __tests__/LoginScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/login'`.

- [ ] **Step 5: Implement the login screen**

`app/login.tsx`:

```tsx
import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link, useRouter} from 'expo-router';
import {useAuth} from '../src/auth/AuthContext';
import {EmailNotVerifiedError, resendVerificationApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function LoginScreen() {
  const {login} = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setNeedsVerification(false);
    setResent(false);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setNeedsVerification(true);
      } else {
        setError('Invalid email or password.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    await resendVerificationApi(email.trim());
    setResent(true);
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Log in</Text>

      <TextInput
        style={authStyles.input}
        placeholder="Email"
        placeholderTextColor={colors.subtext}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={authStyles.input}
        placeholder="Password"
        placeholderTextColor={colors.subtext}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      {needsVerification ? (
        <View style={authStyles.notice}>
          <Text style={authStyles.noticeText}>Your email isn't verified yet.</Text>
          {resent ? (
            <Text style={authStyles.noticeText}>
              Verification email sent — check your inbox.
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend}>
              <Text style={authStyles.link}>Resend verification email</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[authStyles.button, submitting && authStyles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}>
        <Text style={authStyles.buttonText}>{submitting ? 'Logging in...' : 'Log in'}</Text>
      </TouchableOpacity>

      <Link href="/forgot-password" style={authStyles.link}>
        Forgot your password?
      </Link>
      <View style={authStyles.row}>
        <Text style={authStyles.meta}>No account? </Text>
        <Link href="/register" style={authStyles.link}>
          Register
        </Link>
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest __tests__/LoginScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/authScreenStyles.ts app/login.tsx __tests__/LoginScreen.test.tsx package.json package-lock.json
git commit -m "Add login screen with resend-verification handling"
```

---

## Task 14: Register screen

**Files:**
- Create: `app/register.tsx`
- Test: `__tests__/RegisterScreen.test.tsx`

**Interfaces:**
- Consumes: `registerApi` (Task 6); `authStyles` (Task 13).
- Produces: the `/register` route.

- [ ] **Step 1: Write the failing test**

`__tests__/RegisterScreen.test.tsx`:

```tsx
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

    await waitFor(() => expect(getByText('Password must be at least 8 characters.')).toBeTruthy());
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('shows an error when the passwords do not match', async () => {
    const {getByPlaceholderText, getByText} = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'password124');
    fireEvent.press(getByText('Register'));

    await waitFor(() => expect(getByText('Passwords do not match.')).toBeTruthy());
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('calls registerApi and shows the generic confirmation message on success', async () => {
    mockRegisterApi.mockResolvedValue(undefined);
    const {getByPlaceholderText, getByText} = render(<RegisterScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'password123');
    fireEvent.press(getByText('Register'));

    await waitFor(() => expect(mockRegisterApi).toHaveBeenCalledWith('a@b.com', 'password123'));
    await waitFor(() =>
      expect(
        getByText('If this email can be registered, check your inbox for a verification link.'),
      ).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/RegisterScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/register'`.

- [ ] **Step 3: Implement the register screen**

`app/register.tsx`:

```tsx
import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {registerApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await registerApi(email.trim(), password);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Register</Text>

      {sent ? (
        <Text style={authStyles.success}>
          If this email can be registered, check your inbox for a verification link.
        </Text>
      ) : (
        <>
          <TextInput
            style={authStyles.input}
            placeholder="Email"
            placeholderTextColor={colors.subtext}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={authStyles.input}
            placeholder="Password"
            placeholderTextColor={colors.subtext}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={authStyles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.subtext}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          {error ? <Text style={authStyles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[authStyles.button, submitting && authStyles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            <Text style={authStyles.buttonText}>
              {submitting ? 'Creating account...' : 'Register'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <View style={authStyles.row}>
        <Text style={authStyles.meta}>Already have an account? </Text>
        <Link href="/login" style={authStyles.link}>
          Log in
        </Link>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/RegisterScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/register.tsx __tests__/RegisterScreen.test.tsx
git commit -m "Add register screen"
```

---

## Task 15: Verify-email screen

**Files:**
- Create: `app/verify-email.tsx`
- Test: `__tests__/VerifyEmailScreen.test.tsx`

**Interfaces:**
- Consumes: `verifyEmailApi` (Task 6); `authStyles` (Task 13).
- Produces: the `/verify-email` route.

- [ ] **Step 1: Write the failing test**

`__tests__/VerifyEmailScreen.test.tsx`:

```tsx
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
      expect(getByText('This verification link is invalid or has expired.')).toBeTruthy(),
    );
    expect(mockVerifyEmailApi).not.toHaveBeenCalled();
  });

  it('shows success when the token verifies', async () => {
    useLocalSearchParams.mockReturnValue({token: 'good-token'});
    mockVerifyEmailApi.mockResolvedValue(true);
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() => expect(mockVerifyEmailApi).toHaveBeenCalledWith('good-token'));
    await waitFor(() =>
      expect(getByText('Your email is verified. You can log in now.')).toBeTruthy(),
    );
  });

  it('shows an error when the token is invalid or expired', async () => {
    useLocalSearchParams.mockReturnValue({token: 'bad-token'});
    mockVerifyEmailApi.mockResolvedValue(false);
    const {getByText} = render(<VerifyEmailScreen />);

    await waitFor(() =>
      expect(getByText('This verification link is invalid or has expired.')).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/VerifyEmailScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/verify-email'`.

- [ ] **Step 3: Implement the verify-email screen**

`app/verify-email.tsx`:

```tsx
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Link, useLocalSearchParams} from 'expo-router';
import {verifyEmailApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';

export default function VerifyEmailScreen() {
  const {token} = useLocalSearchParams<{token?: string}>();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    verifyEmailApi(token).then(ok => {
      setStatus(ok ? 'success' : 'error');
    });
  }, [token]);

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Verify email</Text>
      {status === 'checking' ? (
        <Text style={authStyles.noticeText}>Verifying your email...</Text>
      ) : status === 'success' ? (
        <Text style={authStyles.success}>Your email is verified. You can log in now.</Text>
      ) : (
        <Text style={authStyles.error}>This verification link is invalid or has expired.</Text>
      )}
      <Link href="/login" style={authStyles.link}>
        Go to login
      </Link>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/VerifyEmailScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/verify-email.tsx __tests__/VerifyEmailScreen.test.tsx
git commit -m "Add verify-email screen"
```

---

## Task 16: Forgot-password screen

**Files:**
- Create: `app/forgot-password.tsx`
- Test: `__tests__/ForgotPasswordScreen.test.tsx`

**Interfaces:**
- Consumes: `forgotPasswordApi` (Task 6); `authStyles` (Task 13).
- Produces: the `/forgot-password` route.

- [ ] **Step 1: Write the failing test**

`__tests__/ForgotPasswordScreen.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/ForgotPasswordScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/forgot-password'`.

- [ ] **Step 3: Implement the forgot-password screen**

`app/forgot-password.tsx`:

```tsx
import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {forgotPasswordApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await forgotPasswordApi(email.trim());
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Forgot password</Text>

      {sent ? (
        <Text style={authStyles.success}>
          If that account exists, a reset link has been sent to your email.
        </Text>
      ) : (
        <>
          <TextInput
            style={authStyles.input}
            placeholder="Email"
            placeholderTextColor={colors.subtext}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={[authStyles.button, submitting && authStyles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            <Text style={authStyles.buttonText}>
              {submitting ? 'Sending...' : 'Send reset link'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <Link href="/login" style={authStyles.link}>
        Back to login
      </Link>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/ForgotPasswordScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/forgot-password.tsx __tests__/ForgotPasswordScreen.test.tsx
git commit -m "Add forgot-password screen"
```

---

## Task 17: Reset-password screen

**Files:**
- Create: `app/reset-password.tsx`
- Test: `__tests__/ResetPasswordScreen.test.tsx`

**Interfaces:**
- Consumes: `resetPasswordApi` (Task 6); `authStyles` (Task 13).
- Produces: the `/reset-password` route.

- [ ] **Step 1: Write the failing test**

`__tests__/ResetPasswordScreen.test.tsx`:

```tsx
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

    await waitFor(() => expect(getByText('This reset link is invalid.')).toBeTruthy());
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
      expect(mockResetPasswordApi).toHaveBeenCalledWith('good-token', 'newpassword1'),
    );
    await waitFor(() =>
      expect(getByText('Password updated. Redirecting to login...')).toBeTruthy(),
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
      expect(getByText('This reset link is invalid or has expired.')).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/ResetPasswordScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/reset-password'`.

- [ ] **Step 3: Implement the reset-password screen**

`app/reset-password.tsx`:

```tsx
import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {resetPasswordApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function ResetPasswordScreen() {
  const {token} = useLocalSearchParams<{token?: string}>();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!token) {
      setError('This reset link is invalid.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const ok = await resetPasswordApi(token, password);
      if (ok) {
        setSuccess(true);
        setTimeout(() => router.replace('/login'), 1500);
      } else {
        setError('This reset link is invalid or has expired.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Reset password</Text>

      {success ? (
        <Text style={authStyles.success}>Password updated. Redirecting to login...</Text>
      ) : (
        <>
          <TextInput
            style={authStyles.input}
            placeholder="New password"
            placeholderTextColor={colors.subtext}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={authStyles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[authStyles.button, submitting && authStyles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            <Text style={authStyles.buttonText}>
              {submitting ? 'Updating...' : 'Update password'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/ResetPasswordScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/reset-password.tsx __tests__/ResetPasswordScreen.test.tsx
git commit -m "Add reset-password screen"
```

---

## Task 18: Task list screen (port App.tsx) and remove the old entry files

**Files:**
- Create: `app/index.tsx` (replaces Task 2's placeholder)
- Delete: `App.tsx`
- Test: none new — `__tests__/recurrence.test.ts` and `__tests__/selectors.test.ts` must keep passing unchanged (they test pure logic unaffected by this port)

**Interfaces:**
- Consumes: `getTasks`, `addTask`, `updateTask`, `deleteTask`, `toggleTaskComplete`, `subscribeToTasks` (Task 10); `useAuth` (Task 7); `TaskRow`, `TaskEditorModal`, `LogoMark` (unchanged, pre-existing).

- [ ] **Step 1: Replace the placeholder index route with the ported task list**

Replace the entire contents of `app/index.tsx` with (this is `App.tsx`'s current content, with import paths adjusted for its new location one directory deeper, a `useAuth` import added, and a "Log out" button added next to the existing "+ Widget" button — logging out has no other entry point in the UI, so this addition is necessary, not optional):

```tsx
import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {LogoMark} from '../src/components/LogoMark';
import {TaskEditorModal} from '../src/components/TaskEditorModal';
import {TaskRow} from '../src/components/TaskRow';
import {
  addTask,
  deleteTask,
  getTasks,
  subscribeToTasks,
  toggleTaskComplete,
  updateTask,
} from '../src/storage/taskStorage';
import {colors} from '../src/theme';
import type {NewTaskInput, Task} from '../src/types/task';
import {todayISODate} from '../src/utils/recurrence';
import {
  getCompletedTasks,
  getTodayTasks,
  getUpcomingTasks,
  isTaskDoneToday,
} from '../src/utils/selectors';
import {useAuth} from '../src/auth/AuthContext';

type FilterKey = 'today' | 'upcoming' | 'all' | 'completed';

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'all', label: 'All'},
  {key: 'completed', label: 'Completed'},
];

export default function TaskListScreen() {
  const {logout} = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterKey>('today');
  const [query, setQuery] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    getTasks().then(setTasks);
    return subscribeToTasks(setTasks);
  }, []);

  const filtered = useMemo(() => {
    let list: Task[];
    switch (filter) {
      case 'today':
        list = getTodayTasks(tasks);
        break;
      case 'upcoming':
        list = getUpcomingTasks(tasks);
        break;
      case 'completed':
        list = getCompletedTasks(tasks);
        break;
      default:
        list = tasks;
    }
    if (!query.trim()) {
      return list;
    }
    const q = query.trim().toLowerCase();
    return list.filter(t => t.title.toLowerCase().includes(q));
  }, [tasks, filter, query]);

  function handleQuickAdd() {
    if (!quickTitle.trim()) {
      return;
    }
    addTask({
      title: quickTitle,
      priority: 'medium',
      dueDate: todayISODate(),
    });
    setQuickTitle('');
  }

  function openEditor(task: Task | null) {
    setEditingTask(task);
    setEditorVisible(true);
  }

  function closeEditor() {
    setEditorVisible(false);
    setEditingTask(null);
  }

  function handleSave(input: NewTaskInput) {
    if (editingTask) {
      updateTask(editingTask.id, input);
    } else {
      addTask(input);
    }
    closeEditor();
  }

  function handleDelete() {
    if (editingTask) {
      deleteTask(editingTask.id);
    }
    closeEditor();
  }

  function handleAddWidget() {
    if (Platform.OS !== 'android') {
      return;
    }
    Alert.alert(
      'Add the Todo widget',
      'Long-press an empty spot on your home screen, choose Widgets, then drag the Todo widget onto the screen.',
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <LogoMark size={30} />
          <View>
            <Text style={styles.title}>Loop</Text>
            <Text style={styles.subtitle}>
              {getTodayTasks(tasks).length} due today
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.widgetButton} onPress={handleAddWidget}>
            <Text style={styles.widgetButtonText}>+ Widget</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
            <Text style={styles.widgetButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.quickAddRow}>
        <TextInput
          style={styles.quickAddInput}
          placeholder="Add a task and hit enter..."
          placeholderTextColor={colors.subtext}
          value={quickTitle}
          onChangeText={setQuickTitle}
          onSubmitEditing={handleQuickAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.quickAddButton} onPress={handleQuickAdd}>
          <Text style={styles.quickAddButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search"
        placeholderTextColor={colors.subtext}
        value={query}
        onChangeText={setQuery}
      />

      <View style={styles.tabs}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}>
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => (
          <TaskRow
            task={item}
            done={filter === 'completed' ? true : filter === 'all' ? isTaskDoneToday(item) : false}
            onToggle={() => toggleTaskComplete(item.id)}
            onPress={() => openEditor(item)}
            onDelete={() => deleteTask(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing here. Enjoy the quiet.</Text>
          </View>
        }
      />

      <TaskEditorModal
        visible={editorVisible}
        task={editingTask}
        onClose={closeEditor}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  widgetButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  widgetButtonText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  quickAddRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  quickAddInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  quickAddButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  quickAddButtonText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  searchInput: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.accent,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 14,
  },
});
```

- [ ] **Step 2: Delete the old App.tsx**

Run: `git rm App.tsx`

(`index.js` no longer references it — Task 2 already switched the entry point to `expo-router/entry`.)

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run: `npx jest`

Expected: every test file passes, including `__tests__/recurrence.test.ts` and `__tests__/selectors.test.ts` (untouched pure-logic tests) and every test added in Tasks 4–17.

- [ ] **Step 4: Commit**

```bash
git add app/index.tsx
git commit -m "Port the task list screen to app/index.tsx; remove App.tsx"
```

---

## Task 19: Full verification pass

**Files:**
- Create: `docs/superpowers/manual-verification-phase2.md` (a short, reusable manual checklist — not automated)

**Interfaces:**
- None — this task verifies the whole plan's output together, it produces no code other imports depend on.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npx jest`
Expected: all suites pass (every file from Tasks 4–18, plus the pre-existing `__tests__/App.test.tsx`\* and pure-logic tests).

\* If `__tests__/App.test.tsx` still imports `../App` (the file deleted in Task 18), update it to import the ported component from `../app/index` instead, keeping its existing assertions — do not delete this test file; it's the one existing render-smoke-test for the task list screen.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the Android native build still succeeds**

Run: `cd android && ./gradlew assembleDebug && cd ..`
Expected: `BUILD SUCCESSFUL` (confirms nothing in Tasks 4–18 broke the native Android build Task 3 already verified).

- [ ] **Step 4: Write the manual verification checklist**

`docs/superpowers/manual-verification-phase2.md`:

```markdown
# Phase 2 manual verification checklist

Run this against the real Phase 1 backend (`cd backend && docker compose up -d
&& npm run dev`, or whatever's running) with `EXPO_PUBLIC_API_URL` pointed at
it, on both a native build (`npx expo run:android`) and the web build
(`npx expo start --web`).

1. Register a new account. Confirm the generic "check your inbox" message
   appears (not a specific success/failure signal).
2. Find the verification email (or the token in the backend's logs/dev email
   provider) and open the `verify-email` link. Confirm it shows success.
3. Log in with the new account. Confirm you land on the task list.
4. Create a task with a due date and a recurrence. Confirm it appears in the
   right filter tab (Today/Upcoming).
5. Toggle it complete, then undo the toggle (tap again same day). Confirm the
   recurrence rollover matches the mobile app's existing behavior.
6. Edit the task: clear its due date (pick "None") and turn off "Repeat".
   Save, then reopen the editor — confirm both are actually cleared, not
   silently unchanged.
7. Delete a task. Confirm it disappears from the list.
8. Log out. Confirm you're redirected to `/login` and the task list is gone
   if you log back in as a **different** account (no leaked data from the
   first account).
9. On Android: confirm the home-screen widget shows today's tasks, and
   tapping a task in the widget toggles it (check it reflects in the app
   after reopening).
10. Log in with an unverified account. Confirm the login screen offers
    "Resend verification email" and it actually sends one.
11. Use "Forgot password", get the reset email, open the `reset-password`
    link, set a new password. Confirm the old password no longer works and
    the new one does, and that you were logged out of any other open
    session (per the backend's session-revocation-on-reset behavior).
12. Open `verify-email` or `reset-password` with no token / a garbage token
    in the URL. Confirm a clear error message, not a crash or infinite
    spinner.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/manual-verification-phase2.md __tests__/App.test.tsx
git commit -m "Add Phase 2 manual verification checklist"
```
