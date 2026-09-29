import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Link, useLocalSearchParams} from 'expo-router';
import {verifyEmailApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';

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
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Verify email</Text>
      {status === 'checking' ? (
        <Text style={authStyles.noticeText}>Verifying your email...</Text>
      ) : status === 'success' ? (
        <Text style={authStyles.success}>
          Your email is verified. You can log in now.
        </Text>
      ) : (
        <Text style={authStyles.error}>
          This verification link is invalid or has expired.
        </Text>
      )}
      <Link href="/login" style={authStyles.link}>
        Go to login
      </Link>
    </View>
  );
}
