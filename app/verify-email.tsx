import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {Link, useLocalSearchParams} from 'expo-router';
import {verifyEmailApi} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function VerifyEmailScreen() {
  const {token} = useLocalSearchParams<{token?: string}>();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>(
    'checking',
  );

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    verifyEmailApi(token)
      .then(ok => setStatus(ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <AuthLayout
      pageTitle="Verify email"
      title="Verify email"
      subtitle="Confirming the link from your inbox.">
      {status === 'checking' ? (
        <View style={checkingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={authStyles.meta}>Verifying your email...</Text>
        </View>
      ) : status === 'success' ? (
        <Text style={authStyles.success}>
          Your email is verified. You can log in now.
        </Text>
      ) : (
        <Text style={authStyles.error}>
          This verification link is invalid or has expired.
        </Text>
      )}
      <Link
        href="/login"
        style={[
          authStyles.button,
          authStyles.buttonText,
          authStyles.buttonLink,
        ]}>
        Go to login
      </Link>
    </AuthLayout>
  );
}

const checkingRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 10,
  marginBottom: 16,
};
