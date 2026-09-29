import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {Link} from 'expo-router';
import {forgotPasswordApi} from '../src/api/auth';
import {authStyles} from '../src/components/authScreenStyles';
import {colors} from '../src/theme';

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
    <View style={authStyles.container}>
      <Text style={authStyles.heading}>Forgot password</Text>

      {sent ? (
        <Text style={authStyles.success}>
          If that account exists, a reset link has been sent to your email.
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

      <Link href="/login" style={authStyles.link}>
        Back to login
      </Link>
    </View>
  );
}
