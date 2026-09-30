import {
  clearQueue,
  enqueue,
  hasPendingMutations,
  listQueue,
  remapTaskId,
  removeMutation,
} from '../src/sync/mutationQueue';

describe('mutationQueue', () => {
  beforeEach(async () => {
    // The underlying AsyncStorage mock persists across tests in this file;
    // without this, an earlier test's enqueued entries would leak into and
    // corrupt a later test's queue-contents assertions.
    await clearQueue();
  });

  it('starts empty', async () => {
    expect(await listQueue()).toEqual([]);
    expect(await hasPendingMutations()).toBe(false);
  });

  it('enqueue assigns an id and clientTimestamp, and appends in order', async () => {
    const first = await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});
    const second = await enqueue({type: 'toggle', taskId: 'tmp_1'});

    expect(first.id).toEqual(expect.any(String));
    expect(first.clientTimestamp).toEqual(expect.any(String));
    const queue = await listQueue();
    expect(queue.map(m => m.id)).toEqual([first.id, second.id]);
    expect(await hasPendingMutations()).toBe(true);
  });

  it('removeMutation removes only the matching entry', async () => {
    const first = await enqueue({type: 'create', taskId: 'a'});
    const second = await enqueue({type: 'delete', taskId: 'b'});

    await removeMutation(first.id);

    const queue = await listQueue();
    expect(queue.map(m => m.id)).toEqual([second.id]);
  });

  it('remapTaskId rewrites taskId on every matching queued entry', async () => {
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});
    await enqueue({type: 'update', taskId: 'tmp_1', payload: {title: 'A2', priority: 'low'}});
    await enqueue({type: 'delete', taskId: 'other'});

    await remapTaskId('tmp_1', 'real-id-9');

    const queue = await listQueue();
    expect(queue.map(m => m.taskId)).toEqual(['real-id-9', 'real-id-9', 'other']);
  });

  it('clearQueue empties the queue', async () => {
    await enqueue({type: 'create', taskId: 'a'});
    await clearQueue();
    expect(await listQueue()).toEqual([]);
    expect(await hasPendingMutations()).toBe(false);
  });
});
