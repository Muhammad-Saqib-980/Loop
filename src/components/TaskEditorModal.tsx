import React, {useEffect, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {FormInput} from './FormInput';
import type {
  NewTaskInput,
  Priority,
  Recurrence,
  RecurrenceType,
  Task,
} from '../types/task';
import {toISODate, todayISODate} from '../utils/recurrence';
import {confirmDestructive} from '../utils/alert';
import {colors} from '../theme';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const RECURRENCE_TYPES: RecurrenceType[] = ['daily', 'weekly', 'monthly'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function TaskEditorModal({
  visible,
  task,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (input: NewTaskInput) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [repeats, setRepeats] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('daily');
  const [interval, setIntervalValue] = useState('1');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [titleError, setTitleError] = useState(false);
  const {width} = useWindowDimensions();
  const isDialog = width >= 700;

  useEffect(() => {
    if (visible) {
      setTitle(task?.title ?? '');
      setNotes(task?.notes ?? '');
      setPriority(task?.priority ?? 'medium');
      setDueDate(task?.dueDate);
      setRepeats(!!task?.recurrence);
      setRecurrenceType(task?.recurrence?.type ?? 'daily');
      setIntervalValue(String(task?.recurrence?.interval ?? 1));
      setDaysOfWeek(task?.recurrence?.daysOfWeek ?? []);
      setTitleError(false);
    }
  }, [visible, task]);

  function toggleWeekday(day: number) {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
    );
  }

  function handleSave() {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }

    let recurrence: Recurrence | undefined;
    if (repeats) {
      recurrence = {
        type: recurrenceType,
        interval: Math.max(1, parseInt(interval, 10) || 1),
        daysOfWeek:
          recurrenceType === 'weekly' && daysOfWeek.length > 0
            ? daysOfWeek
            : undefined,
      };
    }

    onSave({
      title,
      notes,
      priority,
      dueDate: dueDate ?? (repeats ? todayISODate() : undefined),
      recurrence,
    });
  }

  function confirmDelete() {
    if (!onDelete) {
      return;
    }
    confirmDestructive('Delete task?', title, 'Delete', onDelete);
  }

  return (
    <Modal
      visible={visible}
      animationType={isDialog ? 'fade' : 'slide'}
      transparent
      onRequestClose={onClose}>
      <View style={[styles.backdrop, isDialog && styles.backdropDialog]}>
        <View style={[styles.sheet, isDialog && styles.sheetDialog]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>
              {task ? 'Edit task' : 'New task'}
            </Text>

            <FormInput
              containerStyle={titleError && styles.fieldWithError}
              style={titleError && styles.inputError}
              placeholder="Title"
              value={title}
              onChangeText={text => {
                setTitle(text);
                setTitleError(false);
              }}
              onSubmitEditing={handleSave}
              autoFocus={!task}
            />
            {titleError ? (
              <Text style={styles.errorText}>
                Give it a title — tasks need at least a short title.
              </Text>
            ) : null}

            <FormInput
              style={styles.multiline}
              placeholder="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <Text style={styles.label}>Priority</Text>
            <View style={styles.row}>
              {PRIORITIES.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, priority === p && styles.chipActive]}
                  onPress={() => setPriority(p)}>
                  <Text
                    style={[
                      styles.chipText,
                      priority === p && styles.chipTextActive,
                    ]}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Due date</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  dueDate === undefined && styles.chipActive,
                ]}
                onPress={() => setDueDate(undefined)}>
                <Text
                  style={[
                    styles.chipText,
                    dueDate === undefined && styles.chipTextActive,
                  ]}>
                  None
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  dueDate === todayISODate() && styles.chipActive,
                ]}
                onPress={() => setDueDate(todayISODate())}>
                <Text
                  style={[
                    styles.chipText,
                    dueDate === todayISODate() && styles.chipTextActive,
                  ]}>
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  dueDate === addDaysISO(1) && styles.chipActive,
                ]}
                onPress={() => setDueDate(addDaysISO(1))}>
                <Text
                  style={[
                    styles.chipText,
                    dueDate === addDaysISO(1) && styles.chipTextActive,
                  ]}>
                  Tomorrow
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  dueDate === addDaysISO(7) && styles.chipActive,
                ]}
                onPress={() => setDueDate(addDaysISO(7))}>
                <Text
                  style={[
                    styles.chipText,
                    dueDate === addDaysISO(7) && styles.chipTextActive,
                  ]}>
                  Next week
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Repeat</Text>
              <Switch
                value={repeats}
                onValueChange={setRepeats}
                trackColor={{false: colors.border, true: colors.accent}}
              />
            </View>

            {repeats ? (
              <View>
                <View style={styles.row}>
                  {RECURRENCE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.chip,
                        recurrenceType === t && styles.chipActive,
                      ]}
                      onPress={() => setRecurrenceType(t)}>
                      <Text
                        style={[
                          styles.chipText,
                          recurrenceType === t && styles.chipTextActive,
                        ]}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {recurrenceType === 'weekly' ? (
                  <View style={styles.row}>
                    {WEEKDAYS.map((label, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.dayChip,
                          daysOfWeek.includes(i) && styles.chipActive,
                        ]}
                        onPress={() => toggleWeekday(i)}>
                        <Text
                          style={[
                            styles.chipText,
                            daysOfWeek.includes(i) && styles.chipTextActive,
                          ]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.row}>
                    <Text style={styles.meta}>Every</Text>
                    <TextInput
                      style={styles.intervalInput}
                      keyboardType="number-pad"
                      value={interval}
                      onChangeText={setIntervalValue}
                    />
                    <Text style={styles.meta}>
                      {recurrenceType === 'daily' ? 'day(s)' : 'month(s)'}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.actions}>
              {task && onDelete ? (
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={confirmDelete}>
                  <Text style={styles.deleteActionText}>Delete</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropDialog: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '88%',
  },
  sheetDialog: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
  },
  fieldWithError: {
    marginBottom: 6,
  },
  inputError: {
    borderColor: colors.high,
  },
  errorText: {
    color: colors.high,
    fontSize: 13,
    marginBottom: 12,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  label: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  meta: {
    color: colors.subtext,
    fontSize: 13,
  },
  intervalInput: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 50,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteAction: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  deleteActionText: {
    color: colors.high,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginLeft: 8,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
