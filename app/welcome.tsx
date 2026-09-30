import React, {useRef, useState} from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {Link} from 'expo-router';
import Head from 'expo-router/head';
import {LogoMark} from '../src/components/LogoMark';
import {
  FeatureIcon,
  FeatureIconName,
  LoopRing,
  PhoneMockup,
  StoreIcon,
  WidgetMockup,
} from '../src/components/landing/Illustrations';
import {DOWNLOAD_LINKS} from '../src/config/downloadLinks';
import {colors} from '../src/theme';

const MAX_WIDTH = 1120;

const FEATURES: {icon: FeatureIconName; title: string; body: string}[] = [
  {
    icon: 'repeat',
    title: 'Repeating tasks',
    body: 'Set a task to repeat every day, on certain weekdays, or every month. Check it off and it comes back when it is due again.',
  },
  {
    icon: 'calendar',
    title: 'Today & Upcoming',
    body: 'Focus on what is due today, look ahead at what is coming, or search across everything you have ever added.',
  },
  {
    icon: 'flag',
    title: 'Priorities at a glance',
    body: 'Mark tasks high, medium or low. A colored bar on every task shows what needs your attention first.',
  },
  {
    icon: 'widget',
    title: 'Home-screen widget',
    body: "Add the Loop widget on Android to see today's list and tick tasks off without opening the app.",
  },
  {
    icon: 'sync',
    title: 'Synced everywhere',
    body: 'Your tasks live in your Loop account, so the same list is on your phone and in your browser.',
  },
  {
    icon: 'shield',
    title: 'Your account, protected',
    body: 'Sign up with your email, verify it, and reset your password any time you need to.',
  },
];

const STEPS = [
  {
    title: 'Create your free account',
    body: 'Sign up with your email address and confirm it from your inbox.',
  },
  {
    title: 'Add what you need to do',
    body: 'Type a task and hit enter. Add a due date, a priority, or a repeat schedule.',
  },
  {
    title: 'Check it off, every time',
    body: 'Tick tasks off from the app, the web, or your home screen. Repeating ones come back on their own.',
  },
];

function openStoreLink(url: string) {
  // '#' marks a store listing that isn't published yet.
  if (url !== '#') {
    Linking.openURL(url);
  }
}

function LinkButton({
  href,
  label,
  variant,
  large,
}: {
  href: '/login' | '/register';
  label: string;
  variant: 'primary' | 'secondary';
  large?: boolean;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        // Link's asChild slot object-spreads styles on web, so arrays and functions break it.
        style={StyleSheet.flatten([
          styles.button,
          variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
          large && styles.buttonLarge,
        ])}>
        <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

function StoreButton({platform}: {platform: 'android' | 'ios'}) {
  const isAndroid = platform === 'android';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        isAndroid ? 'Get Loop on Google Play' : 'Download Loop on the App Store'
      }
      onPress={() => openStoreLink(DOWNLOAD_LINKS[platform])}
      style={({pressed}) => [styles.storeButton, pressed && styles.pressed]}>
      <StoreIcon platform={platform} />
      <View>
        <Text style={styles.storeKicker}>
          {isAndroid ? 'GET IT ON' : 'Download on the'}
        </Text>
        <Text style={styles.storeName}>
          {isAndroid ? 'Google Play' : 'App Store'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function WelcomeScreen() {
  const {width} = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [downloadY, setDownloadY] = useState(0);

  const isWide = width >= 960;
  const isMedium = width >= 640;
  const gutter = isMedium ? 32 : 20;
  const contentWidth = Math.min(width, MAX_WIDTH) - gutter * 2;
  const featureColumns = isWide ? 3 : isMedium ? 2 : 1;
  const featureGap = 16;
  const featureWidth =
    (contentWidth - featureGap * (featureColumns - 1)) / featureColumns;
  const phoneWidth = Math.min(290, contentWidth);

  const section = [styles.section, {paddingHorizontal: gutter}];

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={styles.pageContent}>
      <Head>
        <title>Loop — the to-do list for things that repeat</title>
        <meta
          name="description"
          content="Loop keeps your daily, weekly and monthly tasks in one simple list, on Android, iPhone and the web."
        />
      </Head>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[styles.nav, {paddingHorizontal: gutter}]}>
        <View style={styles.brand}>
          <LogoMark size={34} />
          <Text style={styles.brandName}>Loop</Text>
        </View>
        <View style={styles.navActions}>
          {isMedium ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                scrollRef.current?.scrollTo({y: downloadY, animated: true})
              }
              style={({pressed}) => [
                styles.navLink,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.navLinkText}>Download</Text>
            </Pressable>
          ) : null}
          <LinkButton href="/login" label="Log in" variant="secondary" />
          <LinkButton href="/register" label="Sign up" variant="primary" />
        </View>
      </View>

      <View style={[section, styles.hero, isWide && styles.heroWide]}>
        <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
          <View style={styles.eyebrow}>
            <Text style={styles.eyebrowText}>
              ⟳ A to-do list that keeps up with you
            </Text>
          </View>
          <Text style={[styles.heroTitle, isWide && styles.heroTitleWide]}>
            Tasks that come{'\n'}back around.
          </Text>
          <Text style={styles.heroBody}>
            Loop is a simple to-do list for the things you do once and the
            things you do every day. Plan today, see what's next, and check
            tasks off from your phone, your home screen, or the web.
          </Text>
          <View style={styles.ctaRow}>
            <LinkButton
              href="/register"
              label="Sign up free"
              variant="primary"
              large
            />
            <LinkButton
              href="/login"
              label="Log in"
              variant="secondary"
              large
            />
          </View>
          <Text style={styles.storeCaption}>Get the app</Text>
          <View style={styles.storeRow}>
            <StoreButton platform="android" />
            <StoreButton platform="ios" />
          </View>
        </View>

        <View style={styles.heroArt}>
          <View style={styles.heroRing} pointerEvents="none">
            <LoopRing size={Math.min(520, contentWidth + 80)} />
          </View>
          <PhoneMockup width={phoneWidth} />
        </View>
      </View>

      <View style={section}>
        <Text style={styles.sectionKicker}>Features</Text>
        <Text style={styles.sectionTitle}>
          Everything you need, nothing you don't
        </Text>
        <Text style={styles.sectionBody}>
          Loop keeps one clean list for the whole day, with just enough
          structure to stay on top of the things that repeat.
        </Text>
        <View style={[styles.featureGrid, {gap: featureGap}]}>
          {FEATURES.map(feature => (
            <View
              key={feature.title}
              style={[styles.card, {width: featureWidth}]}>
              <View style={styles.iconBadge}>
                <FeatureIcon name={feature.icon} />
              </View>
              <Text style={styles.cardTitle}>{feature.title}</Text>
              <Text style={styles.cardBody}>{feature.body}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[section, styles.showcase, isWide && styles.showcaseWide]}>
        <View style={styles.showcaseArt}>
          <WidgetMockup width={Math.min(340, contentWidth)} />
        </View>
        <View style={[styles.showcaseCopy, isWide && styles.showcaseCopyWide]}>
          <Text style={styles.sectionKicker}>Android widget</Text>
          <Text style={styles.sectionTitle}>
            Your day, right on your home screen
          </Text>
          {[
            "See today's tasks without opening the app.",
            'Tap a task to mark it done.',
            'The widget updates whenever your list changes.',
          ].map(point => (
            <View key={point} style={styles.bullet}>
              <Text style={styles.bulletMark}>✓</Text>
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={section}>
        <Text style={styles.sectionKicker}>How it works</Text>
        <Text style={styles.sectionTitle}>Up and running in a minute</Text>
        <View style={[styles.steps, isWide && styles.stepsWide]}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={[styles.card, styles.step]}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.cardTitle}>{step.title}</Text>
              <Text style={styles.cardBody}>{step.body}</Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={section}
        onLayout={e => setDownloadY(e.nativeEvent.layout.y)}>
        <View
          style={[styles.downloadBand, isMedium && styles.downloadBandMedium]}>
          <Text style={[styles.sectionTitle, styles.centered]}>
            Take Loop with you
          </Text>
          <Text style={[styles.sectionBody, styles.centered]}>
            Download the app for Android or iPhone, then log in with the same
            account to see your tasks everywhere.
          </Text>
          <View style={[styles.storeRow, styles.centeredRow]}>
            <StoreButton platform="android" />
            <StoreButton platform="ios" />
          </View>
          <Text style={[styles.meta, styles.centered]}>
            Prefer the browser? Use Loop right here.
          </Text>
          <View style={[styles.ctaRow, styles.centeredRow]}>
            <LinkButton
              href="/register"
              label="Sign up free"
              variant="primary"
              large
            />
            <LinkButton
              href="/login"
              label="Log in"
              variant="secondary"
              large
            />
          </View>
        </View>
      </View>

      <View style={[styles.footer, {width: contentWidth}]}>
        <View style={styles.brand}>
          <LogoMark size={22} />
          <Text style={styles.footerBrand}>Loop</Text>
        </View>
        <Text style={styles.meta}>
          © {new Date().getFullYear()} Loop. All rights reserved.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageContent: {
    alignItems: 'center',
  },
  nav: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navLink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navLinkText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  buttonLarge: {
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextLarge: {
    fontSize: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  section: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    paddingVertical: 48,
  },
  hero: {
    gap: 48,
    paddingTop: 32,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 72,
  },
  heroCopy: {
    gap: 20,
  },
  heroCopyWide: {
    flex: 1,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  eyebrowText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
  },
  heroTitleWide: {
    fontSize: 60,
    lineHeight: 66,
  },
  heroBody: {
    color: colors.subtext,
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 520,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  storeCaption: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: -8,
  },
  storeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#000',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 170,
  },
  storeKicker: {
    color: colors.subtext,
    fontSize: 10,
    fontWeight: '600',
  },
  storeName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  heroArt: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  heroRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionKicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    marginBottom: 12,
  },
  sectionBody: {
    color: colors.subtext,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 620,
    marginBottom: 28,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 141, 250, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardBody: {
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  showcase: {
    gap: 40,
  },
  showcaseWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  showcaseArt: {
    alignItems: 'center',
  },
  showcaseCopy: {
    gap: 4,
  },
  showcaseCopyWide: {
    flex: 1,
    paddingLeft: 24,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  bulletMark: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '800',
  },
  bulletText: {
    color: colors.subtext,
    fontSize: 16,
    lineHeight: 23,
    flex: 1,
  },
  steps: {
    gap: 16,
    marginTop: 16,
  },
  stepsWide: {
    flexDirection: 'row',
  },
  step: {
    flex: 1,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stepNumberText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  downloadBand: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  downloadBandMedium: {
    paddingHorizontal: 48,
  },
  centered: {
    textAlign: 'center',
  },
  centeredRow: {
    justifyContent: 'center',
    marginBottom: 16,
  },
  meta: {
    color: colors.subtext,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerBrand: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
