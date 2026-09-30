import React, {useState} from 'react';
import {Text, TouchableOpacity} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {resetPasswordApi} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {FormInput} from '../src/components/FormInput';
import {authStyles} from '../src/components/authScreenStyles';

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
    <AuthLayout
      pageTitle="Reset password"
      title="Reset password"
      subtitle="Choose a new password with at least 8 characters.">
      {success ? (
        <Text style={authStyles.success}>
          Password updated. Redirecting to login...
        </Text>
      ) : (
        <>
          <FormInput
            label="New password"
            placeholder="New password"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
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
    </AuthLayout>
  );
}
