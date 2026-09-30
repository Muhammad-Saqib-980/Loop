import {StyleSheet} from 'react-native';
import {colors} from '../theme';

export const authStyles = StyleSheet.create({
  error: {
    color: colors.high,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  success: {
    color: colors.success,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  notice: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
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
    marginTop: 4,
    marginBottom: 16,
  },
  buttonLink: {
    textAlign: 'center',
    overflow: 'hidden',
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
    fontSize: 14,
    fontWeight: '600',
  },
  centeredLink: {
    alignSelf: 'center',
  },
  rightLink: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 18,
    marginTop: 4,
  },
  meta: {
    color: colors.subtext,
    fontSize: 14,
  },
});
