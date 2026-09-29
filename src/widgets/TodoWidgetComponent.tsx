import React from 'react';
import {FlexWidget, ListWidget, TextWidget} from 'react-native-android-widget';
import type {Task} from '../types/task';
import {getTodayTasks} from '../utils/selectors';

const COLORS = {
  background: '#12141A',
  card: '#1C1F27',
  border: '#2A2E38',
  text: '#F5F6FA',
  subtext: '#9AA0AC',
  accent: '#6C8DFA',
  high: '#FF6B6B',
  medium: '#FFB86C',
  low: '#6C8DFA',
};

function priorityColor(priority: Task['priority']): string {
  return COLORS[priority];
}

function TaskRow({task}: {task: Task}) {
  return (
    <FlexWidget
      key={task.id}
      clickAction="TOGGLE_TASK"
      clickActionData={{taskId: task.id}}
      style={{
        width: 'match_parent',
        height: 'wrap_content',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}>
      <TextWidget
        text="☐"
        style={{fontSize: 18, color: '#FFFFFF', marginRight: 10}}
      />
      <FlexWidget
        style={{
          width: 4,
          height: 22,
          backgroundColor: priorityColor(task.priority) as `#${string}`,
          borderRadius: 2,
          marginRight: 10,
        }}
      />
      <FlexWidget style={{flex: 1}}>
        <TextWidget
          text={task.title}
          truncate="END"
          maxLines={1}
          style={{fontSize: 14, color: COLORS.text as `#${string}`}}
        />
      </FlexWidget>
      {task.recurrence ? (
        <TextWidget
          text="⟳"
          style={{fontSize: 14, color: COLORS.subtext as `#${string}`, marginLeft: 6}}
        />
      ) : null}
    </FlexWidget>
  );
}

export function TodoWidgetComponent({tasks}: {tasks: Task[]}) {
  const todayTasks = getTodayTasks(tasks);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: COLORS.background as `#${string}`,
        borderRadius: 16,
      }}>
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'wrap_content',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 8,
        }}>
        <TextWidget
          text="Today"
          style={{fontSize: 16, fontWeight: 'bold', color: COLORS.text as `#${string}`}}
        />
        <TextWidget
          text={String(todayTasks.length)}
          style={{fontSize: 13, color: COLORS.accent as `#${string}`}}
        />
      </FlexWidget>

      {todayTasks.length === 0 ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 'wrap_content',
            paddingHorizontal: 14,
            paddingVertical: 16,
          }}>
          <TextWidget
            text="All clear for today"
            style={{fontSize: 13, color: COLORS.subtext as `#${string}`}}
          />
        </FlexWidget>
      ) : (
        <ListWidget
          style={{
            width: 'match_parent',
            height: 'match_parent',
          }}>
          {todayTasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
