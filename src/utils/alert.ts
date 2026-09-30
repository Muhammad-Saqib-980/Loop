import {Alert, Platform} from 'react-native';

// react-native-web's Alert.alert is a no-op stub (it never renders anything
// and never calls a button's onPress), so every call site that needs to
// actually reach the user - an info message or a destructive confirmation -
// must go through here instead of react-native's Alert directly.
//
// This project's tsconfig has no DOM lib (it targets React Native), so
// `window` isn't an ambient type here even though it exists at runtime on
// web. Reach it through a narrow local cast instead of widening the global
// types for the whole project.
interface BrowserDialogs {
  alert?: (message?: string) => void;
  confirm?: (message?: string) => boolean;
}

function browserDialogs(): BrowserDialogs {
  return globalThis as unknown as BrowserDialogs;
}

function combine(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** A dismiss-only message. Native: Alert.alert. Web: window.alert. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    browserDialogs().alert?.(combine(title, message));
    return;
  }
  Alert.alert(title, message);
}

/**
 * A Cancel/destructive-action confirmation. Native: Alert.alert with two
 * buttons. Web: window.confirm, running onConfirm only when the user
 * accepts.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === 'web') {
    if (browserDialogs().confirm?.(combine(title, message))) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    {text: 'Cancel', style: 'cancel'},
    {text: confirmLabel, style: 'destructive', onPress: onConfirm},
  ]);
}
