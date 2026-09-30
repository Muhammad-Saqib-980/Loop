import React, {useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {FormInput} from '../src/components/FormInput';
import {LogoMark} from '../src/components/LogoMark';
import {TaskEditorModal} from '../src/components/TaskEditorModal';
import {TaskRow} from '../src/components/TaskRow';
import {
  addTask,
  deleteTask,
  getTasks,
  subscribeToTasks,
  toggleTaskComplete,
  updateTask,
} from '../src/storage/taskStorage';
import {colors} from '../src/theme';
import type {NewTaskInput, Task} from '../src/types/task';
import {showAlert} from '../src/utils/notify';
import {todayISODate} from '../src/utils/recurrence';
import {
  getCompletedTasks,
  getTodayTasks,
  getUpcomingTasks,
  isTaskDoneToday,
} from '../src/utils/selectors';
import {usePageTitle} from '../src/utils/usePageTitle';
import {useAuth} from '../src/auth/AuthContext';

type FilterKey = 'today' | 'upcoming' | 'all' | 'completed';

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'all', label: 'All'},
  {key: 'completed', label: 'Completed'},
];

const CONNECTION_HINT = 'Please check your connection and try again.';

function tasksFor(filter: FilterKey, tasks: Task[]): Task[] {
  switch (filter) {
    case 'today':
      return getTodayTasks(tasks);
    case 'upcoming':
      return getUpcomingTasks(tasks);
    case 'completed':
      return getCompletedTasks(tasks);
    default:
      return tasks;
  }
}

export default function TaskListScreen() {
  const {logout, status} = useAuth();
  const {width} = useWindowDimensions();
  const isWide = width >= 900;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterKey>('today');
  const [query, setQuery] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const activeLabel = FILTERS.find(f => f.key === filter)!.label;
  usePageTitle(activeLabel);

  useEffect(() => {
    if (status !== 'authed') {
      return;
    }
    getTasks()
      .then(setTasks)
      .catch(err => {
        console.error('Failed to load tasks', err);
      });
    return subscribeToTasks(setTasks);
  }, [status]);

  const filtered = useMemo(() => {
    const list = tasksFor(filter, tasks);
    if (!query.trim()) {
      return list;
    }
    const q = query.trim().toLowerCase();
    return list.filter(t => t.title.toLowerCase().includes(q));
  }, [tasks, filter, query]);

  const dueTodayCount = getTodayTasks(tasks).length;

  function handleQuickAdd() {
    if (!quickTitle.trim()) {
      return;
    }
    const title = quickTitle;
    setQuickTitle('');
    addTask({
      title,
      priority: 'medium',
      dueDate: todayISODate(),
    }).catch(() => {
      setQuickTitle(title);
      showAlert('Could not add task', CONNECTION_HINT);
    });
  }

  function openEditor(task: Task | null) {
    setEditingTask(task);
    setEditorVisible(true);
  }

  function closeEditor() {
    setEditorVisible(false);
    setEditingTask(null);
  }

  function handleSave(input: NewTaskInput) {
    const action = editingTask
      ? updateTask(editingTask.id, input)
      : addTask(input);
    action.catch(() => showAlert('Could not save task', CONNECTION_HINT));
    closeEditor();
  }

  function handleDelete() {
    if (editingTask) {
      deleteTask(editingTask.id).catch(() =>
        showAlert('Could not delete task', CONNECTION_HINT),
      );
    }
    closeEditor();
  }

  function handleAddWidget() {
    showAlert(
      'Add the Todo widget',
      'Long-press an empty spot on your home screen, choose Widgets, then drag the Todo widget onto the screen.',
    );
  }

  const quickAdd = (
    <View style={styles.quickAddRow}>
      <FormInput
        containerStyle={styles.flexField}
        style={styles.quickAddInput}
        placeholder="Add a task and hit enter..."
        value={quickTitle}
        onChangeText={setQuickTitle}
        onSubmitEditing={handleQuickAdd}
        returnKeyType="done"
      />
      <TouchableOpacity
        style={styles.quickAddButton}
        onPress={handleQuickAdd}
        accessibilityLabel="Add task">
        <Text style={styles.quickAddButtonText}>+</Text>
      </TouchableOpacity>
      {isWide ? (
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => openEditor(null)}>
          <Text style={styles.detailsButtonText}>New task with details</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const search = (
    <FormInput
      containerStyle={isWide ? styles.searchFieldWide : styles.searchField}
      style={styles.searchInput}
      placeholder="Search"
      value={query}
      onChangeText={setQuery}
    />
  );

  const list = (
    <FlatList
      data={filtered}
      keyExtractor={t => t.id}
      contentContainerStyle={styles.listContent}
      renderItem={({item}) => (
        <TaskRow
          task={item}
          done={
            filter === 'completed'
              ? true
              : filter === 'all'
              ? isTaskDoneToday(item)
              : false
          }
          onToggle={() =>
            toggleTaskComplete(item.id).catch(() =>
              showAlert('Could not update task', CONNECTION_HINT),
            )
          }
          onPress={() => openEditor(item)}
          onDelete={() =>
            deleteTask(item.id).catch(() =>
              showAlert('Could not delete task', CONNECTION_HINT),
            )
          }
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyMark}>
            <LogoMark size={56} />
          </View>
          <Text style={styles.emptyText}>Nothing here. Enjoy the quiet.</Text>
          <Text style={styles.emptyHint}>
            {query.trim()
              ? 'No tasks match your search.'
              : 'Add a task above to get started.'}
          </Text>
        </View>
      }
    />
  );

  const editor = (
    <TaskEditorModal
      visible={editorVisible}
      task={editingTask}
      onClose={closeEditor}
      onSave={handleSave}
      onDelete={editingTask ? handleDelete : undefined}
    />
  );

  if (isWide) {
    const counts: Record<FilterKey, number> = {
      today: dueTodayCount,
      upcoming: getUpcomingTasks(tasks).length,
      all: tasks.length,
      completed: getCompletedTasks(tasks).length,
    };
    const todayLabel = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return (
      <View style={styles.shell}>
        <View style={styles.sidebar}>
          <View style={styles.brandRow}>
            <LogoMark size={32} />
            <Text style={styles.sidebarBrand}>Loop</Text>
          </View>
          <Text style={styles.sidebarHeading}>Lists</Text>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                onPress={() => setFilter(f.key)}
                style={[styles.navItem, active && styles.navItemActive]}>
                <Text
                  style={[styles.navLabel, active && styles.navLabelActive]}>
                  {f.label}
                </Text>
                <Text
                  style={[styles.navCount, active && styles.navCountActive]}>
                  {counts[f.key]}
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.sidebarSpacer} />
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => logout()}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.main}>
          <View style={styles.mainInner}>
            <View style={styles.mainHeader}>
              <View>
                <Text style={styles.mainTitle}>{activeLabel}</Text>
                <Text style={styles.mainSubtitle}>
                  {todayLabel} · {dueTodayCount} due today
                </Text>
              </View>
              {search}
            </View>
            {quickAdd}
            {list}
          </View>
        </View>
        {editor}
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.compact}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <LogoMark size={30} />
            <View>
              <Text style={styles.title}>Loop</Text>
              <Text style={styles.subtitle}>{dueTodayCount} due today</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {Platform.OS === 'android' ? (
              <TouchableOpacity
                style={styles.pillButton}
                onPress={handleAddWidget}>
                <Text style={styles.pillButtonText}>+ Widget</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.pillButton}
              onPress={() => logout()}>
              <Text style={styles.pillButtonText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {quickAdd}
        {search}

        <View style={styles.tabs}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.tab, filter === f.key && styles.tabActive]}
              onPress={() => setFilter(f.key)}>
              <Text
                style={[
                  styles.tabText,
                  filter === f.key && styles.tabTextActive,
                ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {list}
      </View>
      {editor}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  compact: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pillButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillButtonText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  flexField: {
    flex: 1,
    marginBottom: 0,
  },
  quickAddInput: {
    backgroundColor: colors.card,
  },
  quickAddButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddButtonText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  detailsButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  detailsButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  searchField: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  searchFieldWide: {
    width: 260,
    marginBottom: 0,
  },
  searchInput: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    fontSize: 14,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.accent,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyMark: {
    opacity: 0.5,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyHint: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  sidebar: {
    width: 260,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  sidebarBrand: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sidebarHeading: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: 'rgba(108, 141, 250, 0.14)',
  },
  navLabel: {
    color: colors.subtext,
    fontSize: 15,
    fontWeight: '600',
  },
  navLabelActive: {
    color: colors.text,
  },
  navCount: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'right',
  },
  navCountActive: {
    color: colors.accent,
  },
  sidebarSpacer: {
    flex: 1,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  main: {
    flex: 1,
  },
  mainInner: {
    flex: 1,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingTop: 32,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  mainTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  mainSubtitle: {
    color: colors.subtext,
    fontSize: 14,
    marginTop: 4,
  },
});
