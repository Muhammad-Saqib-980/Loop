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
