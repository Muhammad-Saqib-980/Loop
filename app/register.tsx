import React, {useRef, useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {registerApi} from '../src/api/auth';
import {AuthLayout} from '../src/components/AuthLayout';
import {FormInput} from '../src/components/FormInput';
import {authStyles} from '../src/components/authScreenStyles';

export default function RegisterScreen() {
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await registerApi(email.trim(), password);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      pageTitle="Sign up"
      title="Create account"
      subtitle="It's free. You'll confirm your email before your first login.">
      {sent ? (
        <Text style={authStyles.success}>
          If this email can be registered, check your inbox for a verification
          link.
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
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <FormInput
            ref={passwordRef}
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <FormInput
            ref={confirmRef}
            label="Confirm password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />
          <Text style={[authStyles.meta, hintStyle]}>
            Use at least 8 characters.
          </Text>
          {error ? <Text style={authStyles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[authStyles.button, submitting && authStyles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            <Text style={authStyles.buttonText}>
              {submitting ? 'Creating account...' : 'Register'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <View style={authStyles.row}>
        <Text style={authStyles.meta}>Already have an account? </Text>
        <Link href="/login" style={authStyles.link}>
          Log in
        </Link>
      </View>
    </AuthLayout>
  );
}

const hintStyle = {fontSize: 12, marginTop: -6, marginBottom: 14};
