import {requestWidgetUpdate} from 'react-native-android-widget';
import type {Task} from '../types/task';
import {TodoWidgetComponent} from './TodoWidgetComponent';

export const WIDGET_NAME = 'TodoWidget';

/** Re-renders every placed instance of the widget with the latest tasks. */
export async function syncWidget(tasks: Task[]): Promise<void> {
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => TodoWidgetComponent({tasks}),
  });
}
