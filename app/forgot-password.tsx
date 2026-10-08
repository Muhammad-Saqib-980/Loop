import React, {useEffect, useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {
  EmailDisabledError,
  forgotPasswordApi,
  getAuthConfigApi,
} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {FormInput} from '../src/components/FormInput';
import {authStyles} from '../src/components/authScreenStyles';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailDisabled, setEmailDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await getAuthConfigApi();
      if (!cancelled && config && !config.emailEnabled) {
        setEmailDisabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (!email.trim()) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await forgotPasswordApi(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof EmailDisabledError) {
        setEmailDisabled(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      pageTitle="Forgot password"
      title="Forgot password"
      subtitle="Enter your account email and we'll send you a link to choose a new password.">
      {emailDisabled ? (
        <View style={authStyles.notice}>
          <Text style={authStyles.noticeText}>
            Password reset by email isn't available on this server. Contact the
            administrator for help.
          </Text>
        </View>
      ) : sent ? (
        <Text style={authStyles.success}>
          If that account exists, a reset link has been sent to your email.
        </Text>
      ) : (
        <>
          <FormInput
            label="Email"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
          />
          {error ? <Text style={authStyles.error}>{error}</Text> : null}
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

      <Link href="/login" style={[authStyles.link, authStyles.centeredLink]}>
        Back to login
      </Link>
    </AuthLayout>
  );
}
