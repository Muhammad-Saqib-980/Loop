import React, {forwardRef, useState} from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {colors} from '../theme';

// RN's style types don't know about the browser focus ring we replace with our own border.
const webNoOutline =
  Platform.OS === 'web'
    ? ({outlineStyle: 'none'} as unknown as TextStyle)
    : null;

export const FormInput = forwardRef<
  TextInput,
  TextInputProps & {label?: string; containerStyle?: StyleProp<ViewStyle>}
>(function FormInput(
  {label, style, containerStyle, onFocus, onBlur, ...props},
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.subtext}
        {...props}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          webNoOutline,
          style,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    marginBottom: 14,
  },
  label: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.accent,
  },
});
