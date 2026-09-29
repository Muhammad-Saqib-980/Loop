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
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Reset password</Text>

      {success ? (
        <Text style={authStyles.success}>
          Password updated. Redirecting to login...
        </Text>
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
