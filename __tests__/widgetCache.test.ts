import {clearWidgetCache, readWidgetCache, writeWidgetCache} from '../src/storage/widgetCache';
import type {Task} from '../src/types/task';

const sampleTask: Task = {
  id: '1',
  title: 'Sample',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('widgetCache', () => {
  it('returns an empty array when nothing has been cached', async () => {
    expect(await readWidgetCache()).toEqual([]);
  });

  it('round-trips a written task list', async () => {
    await writeWidgetCache([sampleTask]);
    expect(await readWidgetCache()).toEqual([sampleTask]);
  });

  it('clears the cache back to empty', async () => {
    await writeWidgetCache([sampleTask]);
    await clearWidgetCache();
    expect(await readWidgetCache()).toEqual([]);
  });
});
