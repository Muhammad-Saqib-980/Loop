import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {Link} from 'expo-router';
import {LogoMark} from './LogoMark';
import {LoopRing} from './landing/Illustrations';
import {colors} from '../theme';
import {usePageTitle} from '../utils/usePageTitle';

const HIGHLIGHTS = [
  'Repeating tasks that come back on schedule',
  'Today and Upcoming views to stay focused',
  'The same list on your phone and the web',
];

export function AuthLayout({
  pageTitle,
  title,
  subtitle,
  children,
}: {
  pageTitle: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  usePageTitle(pageTitle);
  const {width} = useWindowDimensions();
  const isWide = width >= 960;
  const showCard = width >= 520;

  return (
    <View style={[styles.page, isWide && styles.pageWide]}>
      {isWide ? (
        <View style={styles.brandPanel}>
          <View style={styles.brandRing} pointerEvents="none">
            <LoopRing size={560} />
          </View>
          <BrandMark />
          <View>
            <Text style={styles.brandHeadline}>
              Tasks that come{'\n'}back around.
            </Text>
            {HIGHLIGHTS.map(line => (
              <View key={line} style={styles.highlight}>
                <Text style={styles.highlightMark}>✓</Text>
                <Text style={styles.highlightText}>{line}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.brandFootnote}>
            © {new Date().getFullYear()} Loop
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formScrollContent}
        keyboardShouldPersistTaps="handled">
        {isWide ? null : (
          <View style={styles.compactBrand}>
            <BrandMark />
          </View>
        )}
        <View style={[styles.formBox, showCard && styles.card]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </View>
        {Platform.OS === 'web' ? (
          <Link href="/welcome" style={styles.backLink}>
            ← Back to home
          </Link>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <LogoMark size={36} />
      <Text style={styles.brandName}>Loop</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageWide: {
    flexDirection: 'row',
  },
  brandPanel: {
    flex: 1,
    maxWidth: 560,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    padding: 48,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  brandRing: {
    position: 'absolute',
    right: -280,
    bottom: -280,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  brandHeadline: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    marginBottom: 24,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  highlightMark: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '800',
  },
  highlightText: {
    color: colors.subtext,
    fontSize: 16,
    lineHeight: 22,
    flex: 1,
  },
  brandFootnote: {
    color: colors.subtext,
    fontSize: 13,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  compactBrand: {
    marginBottom: 28,
  },
  formBox: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 32,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: colors.subtext,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 24,
  },
  backLink: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
  },
});
