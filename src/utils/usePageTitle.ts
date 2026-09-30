import {useEffect} from 'react';
import {Platform} from 'react-native';

// The app compiles without DOM typings; this only exists when running in a browser.
declare const document: {title: string};

export function usePageTitle(title: string) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = `${title} · Loop`;
    }
  }, [title]);
}
