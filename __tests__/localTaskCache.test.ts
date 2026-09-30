import {clearCache, readCache, writeCache} from '../src/sync/localTaskCache';
import type {Task} from '../src/types/task';

const sampleTask: Task = {
  id: '1',
  title: 'Sample',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('localTaskCache', () => {
  it('returns an empty array when nothing has been cached', async () => {
    expect(await readCache()).toEqual([]);
  });

  it('round-trips a written task list', async () => {
    await writeCache([sampleTask]);
    expect(await readCache()).toEqual([sampleTask]);
  });

  it('clears the cache back to empty', async () => {
    await writeCache([sampleTask]);
    await clearCache();
    expect(await readCache()).toEqual([]);
  });
});
