import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {Task} from '../types/task';
import {describeRecurrence, todayISODate} from '../utils/recurrence';
import {colors} from '../theme';

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
};

function dueLabel(dueDate?: string): string | null {
  if (!dueDate) {
    return null;
  }
  const today = todayISODate();
  if (dueDate === today) {
    return 'Today';
  }
  if (dueDate < today) {
    return 'Overdue';
  }
  return dueDate;
}

export function TaskRow({
  task,
  done,
  onToggle,
  onPress,
  onDelete,
}: {
  task: Task;
  /**
   * Whether this row should render as checked. Passed in rather than derived
   * from `task` because the same task object can legitimately appear
   * unchecked (its next, not-yet-due occurrence) in one list and checked
   * (today's completed occurrence) in another — e.g. Upcoming vs Completed
   * for a repeating task that was just completed today.
   */
  done: boolean;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(task.dueDate);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={onPress}>
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        style={[
          styles.checkbox,
          done && {backgroundColor: colors.accent, borderColor: colors.accent},
        ]}>
        {done ? <Text style={styles.checkmark}>✓</Text> : null}
      </TouchableOpacity>

      <View
        style={[styles.priorityBar, {backgroundColor: PRIORITY_COLORS[task.priority]}]}
      />

      <View style={styles.content}>
        <Text
          style={[styles.title, done && styles.titleDone]}
          numberOfLines={1}>
          {task.title}
        </Text>
        <View style={styles.metaRow}>
          {due ? (
            <Text
              style={[
                styles.meta,
                due === 'Overdue' && styles.overdue,
              ]}>
              {due}
            </Text>
          ) : null}
          {task.recurrence ? (
            <Text style={styles.meta}>
              {due ? '  ·  ' : ''}⟳ {describeRecurrence(task.recurrence)}
            </Text>
          ) : null}
        </View>
      </View>

      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        style={styles.deleteButton}>
        <Text style={styles.deleteIcon}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkmark: {
    color: colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  priorityBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  titleDone: {
    color: colors.subtext,
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 3,
  },
  meta: {
    color: colors.subtext,
    fontSize: 12,
  },
  overdue: {
    color: colors.high,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 4,
  },
  deleteIcon: {
    color: colors.subtext,
    fontSize: 14,
  },
});
