import {StyleSheet} from 'react-native';
import {colors} from '../theme';

export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: colors.high,
    fontSize: 13,
    marginBottom: 12,
  },
  success: {
    color: colors.success,
    fontSize: 13,
    marginBottom: 12,
  },
  notice: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    color: colors.subtext,
    fontSize: 13,
    marginBottom: 6,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'center',
  },
  meta: {
    color: colors.subtext,
    fontSize: 13,
  },
});
