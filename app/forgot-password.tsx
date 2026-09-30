import React, {useState} from 'react';
import {Text, TouchableOpacity} from 'react-native';
import {Link} from 'expo-router';
import {forgotPasswordApi} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {FormInput} from '../src/components/FormInput';
import {authStyles} from '../src/components/authScreenStyles';

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
    <AuthLayout
      pageTitle="Forgot password"
      title="Forgot password"
      subtitle="Enter your account email and we'll send you a link to choose a new password.">
      {sent ? (
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
