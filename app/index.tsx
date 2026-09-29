import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
import {todayISODate} from '../src/utils/recurrence';
import {
  getCompletedTasks,
  getTodayTasks,
  getUpcomingTasks,
  isTaskDoneToday,
} from '../src/utils/selectors';
import {useAuth} from '../src/auth/AuthContext';

type FilterKey = 'today' | 'upcoming' | 'all' | 'completed';

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'all', label: 'All'},
  {key: 'completed', label: 'Completed'},
];

export default function TaskListScreen() {
  const {logout} = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterKey>('today');
  const [query, setQuery] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    getTasks().then(setTasks);
    return subscribeToTasks(setTasks);
  }, []);

  const filtered = useMemo(() => {
    let list: Task[];
    switch (filter) {
      case 'today':
        list = getTodayTasks(tasks);
        break;
      case 'upcoming':
        list = getUpcomingTasks(tasks);
        break;
      case 'completed':
        list = getCompletedTasks(tasks);
        break;
      default:
        list = tasks;
    }
    if (!query.trim()) {
      return list;
    }
    const q = query.trim().toLowerCase();
    return list.filter(t => t.title.toLowerCase().includes(q));
  }, [tasks, filter, query]);

  function handleQuickAdd() {
    if (!quickTitle.trim()) {
      return;
    }
    addTask({
      title: quickTitle,
      priority: 'medium',
      dueDate: todayISODate(),
    });
    setQuickTitle('');
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
    if (editingTask) {
      updateTask(editingTask.id, input);
    } else {
      addTask(input);
    }
    closeEditor();
  }

  function handleDelete() {
    if (editingTask) {
      deleteTask(editingTask.id);
    }
    closeEditor();
  }

  function handleAddWidget() {
    if (Platform.OS !== 'android') {
      return;
    }
    Alert.alert(
      'Add the Todo widget',
      'Long-press an empty spot on your home screen, choose Widgets, then drag the Todo widget onto the screen.',
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <LogoMark size={30} />
          <View>
            <Text style={styles.title}>Loop</Text>
            <Text style={styles.subtitle}>
              {getTodayTasks(tasks).length} due today
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.widgetButton} onPress={handleAddWidget}>
            <Text style={styles.widgetButtonText}>+ Widget</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
            <Text style={styles.widgetButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.quickAddRow}>
        <TextInput
          style={styles.quickAddInput}
          placeholder="Add a task and hit enter..."
          placeholderTextColor={colors.subtext}
          value={quickTitle}
          onChangeText={setQuickTitle}
          onSubmitEditing={handleQuickAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.quickAddButton} onPress={handleQuickAdd}>
          <Text style={styles.quickAddButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search"
        placeholderTextColor={colors.subtext}
        value={query}
        onChangeText={setQuery}
      />

      <View style={styles.tabs}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}>
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => (
          <TaskRow
            task={item}
            done={filter === 'completed' ? true : filter === 'all' ? isTaskDoneToday(item) : false}
            onToggle={() => toggleTaskComplete(item.id)}
            onPress={() => openEditor(item)}
            onDelete={() => deleteTask(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing here. Enjoy the quiet.</Text>
          </View>
        }
      />

      <TaskEditorModal
        visible={editorVisible}
        task={editingTask}
        onClose={closeEditor}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
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
  widgetButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  widgetButtonText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  quickAddRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  quickAddInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  quickAddButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  quickAddButtonText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  searchInput: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
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
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 14,
  },
});
