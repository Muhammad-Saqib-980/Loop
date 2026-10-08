import React, {useRef, useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link, useRouter} from 'expo-router';
import {useAuth} from '../src/auth/AuthContext';
import {
  EmailDisabledError,
  EmailNotVerifiedError,
  resendVerificationApi,
} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {FormInput} from '../src/components/FormInput';
import {authStyles} from '../src/components/authScreenStyles';

export default function LoginScreen() {
  const {login} = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setNeedsVerification(false);
    setResent(false);
    setResendError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setNeedsVerification(true);
      } else {
        setError('Invalid email or password.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendError(null);
    try {
      await resendVerificationApi(email.trim());
      setResent(true);
    } catch (err) {
      setResendError(
        err instanceof EmailDisabledError
          ? "This server can't send emails right now. Contact the administrator to verify your account."
          : "Couldn't resend the verification email. Please try again.",
      );
    }
  }

  return (
    <AuthLayout
      pageTitle="Log in"
      title="Welcome back"
      subtitle="Log in to see today's tasks.">
      <FormInput
        label="Email"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <FormInput
        ref={passwordRef}
        label="Password"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      <Link
        href="/forgot-password"
        style={[authStyles.link, authStyles.rightLink]}>
        Forgot your password?
      </Link>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      {needsVerification ? (
        <View style={authStyles.notice}>
          <Text style={authStyles.noticeText}>
            Your email isn't verified yet.
          </Text>
          {resendError ? (
            <Text style={authStyles.noticeText}>{resendError}</Text>
          ) : resent ? (
            <Text style={authStyles.noticeText}>
              Verification email sent — check your inbox.
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend}>
              <Text style={authStyles.link}>Resend verification email</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[authStyles.button, submitting && authStyles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}>
        <Text style={authStyles.buttonText}>
          {submitting ? 'Logging in...' : 'Log in'}
        </Text>
      </TouchableOpacity>

      <View style={authStyles.row}>
        <Text style={authStyles.meta}>No account? </Text>
        <Link href="/register" style={authStyles.link}>
          Register
        </Link>
      </View>
    </AuthLayout>
  );
}
