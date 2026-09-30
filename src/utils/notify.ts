import {Alert, Platform} from 'react-native';

// The app compiles without DOM typings; this only exists when running in a browser.
declare const window: {
  alert(message: string): void;
  confirm(message: string): boolean;
};

// React Native Web ships Alert.alert as a no-op, so fall back to the browser dialogs.
export function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    {text: 'Cancel', style: 'cancel'},
    {text: confirmLabel, style: 'destructive', onPress: onConfirm},
  ]);
}
