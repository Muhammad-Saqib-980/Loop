import type {WidgetTaskHandler} from 'react-native-android-widget';
import {getTasks, toggleTaskComplete} from '../storage/taskStorage';
import {TodoWidgetComponent} from './TodoWidgetComponent';

export const widgetTaskHandler: WidgetTaskHandler = async props => {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const tasks = await getTasks();
      props.renderWidget(TodoWidgetComponent({tasks}));
      break;
    }
    case 'WIDGET_CLICK': {
      if (props.clickAction === 'TOGGLE_TASK') {
        const taskId = props.clickActionData?.taskId as string | undefined;
        if (taskId) {
          await toggleTaskComplete(taskId);
        }
      }
      const tasks = await getTasks();
      props.renderWidget(TodoWidgetComponent({tasks}));
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
};
