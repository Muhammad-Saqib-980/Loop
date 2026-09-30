import type {WidgetTaskHandler} from 'react-native-android-widget';
import {getTasks, toggleTaskComplete} from '../storage/taskStorage';
import {readWidgetCache} from '../storage/widgetCache';
import {syncNow} from '../sync/syncEngine';
import {TodoWidgetComponent} from './TodoWidgetComponent';

export const widgetTaskHandler: WidgetTaskHandler = async props => {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const cached = await readWidgetCache();
      props.renderWidget(TodoWidgetComponent({tasks: cached}));
      // Drain anything a previous offline widget toggle left queued, then
      // render from the reconciled local cache. A failed sync still
      // re-renders: getTasks() reads the local cache, not the network.
      syncNow()
        .catch(() => {})
        .then(() => getTasks())
        .then(tasks => props.renderWidget(TodoWidgetComponent({tasks})))
        .catch(() => {});
      break;
    }
    case 'WIDGET_CLICK': {
      if (props.clickAction === 'TOGGLE_TASK') {
        const taskId = props.clickActionData?.taskId as string | undefined;
        if (taskId) {
          await toggleTaskComplete(taskId).catch(() => {});
        }
      }
      const cached = await readWidgetCache();
      props.renderWidget(TodoWidgetComponent({tasks: cached}));
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
};
