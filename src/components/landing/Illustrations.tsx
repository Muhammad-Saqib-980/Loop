import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';
import {LogoMark} from '../LogoMark';
import {colors} from '../../theme';

type MockTask = {
  title: string;
  meta: string;
  priority: 'high' | 'medium' | 'low';
  done?: boolean;
};

const PRIORITY_COLORS = {
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
};

const PHONE_TASKS: MockTask[] = [
  {
    title: 'Morning run',
    meta: 'Today  ·  ⟳ Every day',
    priority: 'high',
    done: true,
  },
  {title: 'Pay rent', meta: 'Today  ·  ⟳ Every month', priority: 'high'},
  {
    title: 'Water the plants',
    meta: 'Today  ·  ⟳ Weekly on Mon, Thu',
    priority: 'medium',
  },
  {title: 'Read 20 pages', meta: 'Today  ·  ⟳ Every day', priority: 'low'},
  {title: 'Call the dentist', meta: 'Today', priority: 'medium'},
];

function MockRow({task, compact}: {task: MockTask; compact?: boolean}) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
        {task.done ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <View
        style={[
          styles.priorityBar,
          {backgroundColor: PRIORITY_COLORS[task.priority]},
        ]}
      />
      <View style={styles.rowContent}>
        <Text
          style={[styles.rowTitle, task.done && styles.rowTitleDone]}
          numberOfLines={1}>
          {task.title}
        </Text>
        {compact ? null : (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {task.meta}
          </Text>
        )}
      </View>
    </View>
  );
}

export function PhoneMockup({width = 290}: {width?: number}) {
  return (
    <View
      style={[styles.phone, {width}]}
      accessibilityRole="image"
      accessibilityLabel="Loop app showing today's tasks">
      <View style={styles.notch} />
      <View style={styles.phoneHeader}>
        <LogoMark size={26} />
        <View>
          <Text style={styles.phoneTitle}>Loop</Text>
          <Text style={styles.phoneSubtitle}>4 due today</Text>
        </View>
      </View>
      <View style={styles.quickAdd}>
        <Text style={styles.quickAddText}>Add a task and hit enter...</Text>
        <View style={styles.quickAddButton}>
          <Text style={styles.quickAddPlus}>+</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {['Today', 'Upcoming', 'All'].map((label, i) => (
          <View key={label} style={[styles.tab, i === 0 && styles.tabActive]}>
            <Text style={[styles.tabText, i === 0 && styles.tabTextActive]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {PHONE_TASKS.map(task => (
        <MockRow key={task.title} task={task} />
      ))}
    </View>
  );
}

export function WidgetMockup({width = 320}: {width?: number}) {
  return (
    <View
      style={[styles.homeScreen, {width}]}
      accessibilityRole="image"
      accessibilityLabel="Loop widget on an Android home screen">
      <View style={styles.widget}>
        <View style={styles.widgetHeader}>
          <LogoMark size={20} />
          <Text style={styles.widgetTitle}>Today</Text>
          <Text style={styles.widgetCount}>3 left</Text>
        </View>
        {PHONE_TASKS.slice(0, 4).map(task => (
          <MockRow key={task.title} task={task} compact />
        ))}
      </View>
      <View style={styles.appGrid}>
        {[
          '#6C8DFA',
          '#34D399',
          '#FFB86C',
          '#FF6B6B',
          '#9AA0AC',
          '#6C8DFA',
          '#34D399',
          '#FFB86C',
        ].map((tint, i) => (
          <View key={i} style={[styles.appIcon, {backgroundColor: tint}]} />
        ))}
      </View>
    </View>
  );
}

export function LoopRing({size}: {size: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 108 108">
      <Path
        d="M90,54 A36,36 0 1,1 54,18"
        fill="none"
        stroke={colors.accent}
        strokeOpacity={0.18}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={54} cy={18} r={2.5} fill={colors.success} fillOpacity={0.6} />
    </Svg>
  );
}

export type FeatureIconName =
  | 'repeat'
  | 'calendar'
  | 'flag'
  | 'widget'
  | 'sync'
  | 'shield';

export function FeatureIcon({
  name,
  size = 24,
}: {
  name: FeatureIconName;
  size?: number;
}) {
  const stroke = {
    stroke: colors.accent,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'repeat' ? (
        <>
          <Path d="M17 2l4 4-4 4" {...stroke} />
          <Path d="M3 11v-1a4 4 0 0 1 4-4h14" {...stroke} />
          <Path d="M7 22l-4-4 4-4" {...stroke} />
          <Path d="M21 13v1a4 4 0 0 1-4 4H3" {...stroke} />
        </>
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={2} {...stroke} />
          <Line x1={16} y1={2} x2={16} y2={6} {...stroke} />
          <Line x1={8} y1={2} x2={8} y2={6} {...stroke} />
          <Line x1={3} y1={10} x2={21} y2={10} {...stroke} />
        </>
      ) : null}
      {name === 'flag' ? (
        <>
          <Path
            d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
            {...stroke}
          />
          <Line x1={4} y1={22} x2={4} y2={15} {...stroke} />
        </>
      ) : null}
      {name === 'widget' ? (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={14} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={3} y={14} width={7} height={7} rx={1.5} {...stroke} />
        </>
      ) : null}
      {name === 'sync' ? (
        <>
          <Path d="M23 4v6h-6" {...stroke} />
          <Path d="M1 20v-6h6" {...stroke} />
          <Path
            d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
            {...stroke}
          />
        </>
      ) : null}
      {name === 'shield' ? (
        <>
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...stroke} />
          <Path d="M9 12l2 2 4-4" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}

export function StoreIcon({platform}: {platform: 'android' | 'ios'}) {
  if (platform === 'android') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M5 3 L19 12 L5 21 Z" fill={colors.success} />
        <Path d="M5 3 L13 12 L5 21 Z" fill={colors.accent} />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={2} y={2} width={20} height={20} rx={5} fill={colors.accent} />
      <Path
        d="M8 17 L12 8 L16 17 M9.5 14 H14.5"
        stroke={colors.text}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  phone: {
    backgroundColor: colors.background,
    borderRadius: 40,
    borderWidth: 8,
    borderColor: '#2A2E38',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 40,
    shadowOffset: {width: 0, height: 20},
    elevation: 12,
  },
  notch: {
    alignSelf: 'center',
    width: 84,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    marginBottom: 14,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  phoneTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  phoneSubtitle: {
    color: colors.subtext,
    fontSize: 11,
  },
  quickAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  quickAddText: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.subtext,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 11,
  },
  quickAddButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddPlus: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    color: colors.subtext,
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginVertical: 4,
  },
  rowCompact: {
    paddingVertical: 7,
    marginVertical: 3,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.background,
    fontSize: 10,
    fontWeight: 'bold',
  },
  priorityBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 8,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  rowTitleDone: {
    color: colors.subtext,
    textDecorationLine: 'line-through',
  },
  rowMeta: {
    color: colors.subtext,
    fontSize: 10,
    marginTop: 2,
  },
  homeScreen: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#232838',
    borderWidth: 1,
    borderColor: colors.border,
  },
  widget: {
    backgroundColor: 'rgba(18, 20, 26, 0.92)',
    borderRadius: 20,
    padding: 12,
    marginBottom: 18,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  widgetTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  widgetCount: {
    color: colors.subtext,
    fontSize: 11,
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  appIcon: {
    width: '21%',
    aspectRatio: 1,
    borderRadius: 14,
    opacity: 0.35,
  },
});
