import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {registerApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

export default function RegisterScreen() {
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
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Create account</Text>

      {sent ? (
        <Text style={authStyles.success}>
          If this email can be registered, check your inbox for a verification link.
        </Text>
      ) : (
        <>
          <TextInput
            style={authStyles.input}
            placeholder="Email"
            placeholderTextColor={colors.subtext}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={authStyles.input}
            placeholder="Password"
            placeholderTextColor={colors.subtext}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={authStyles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.subtext}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
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
    </View>
  );
}
