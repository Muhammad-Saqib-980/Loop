import {createLock} from '../src/sync/lock';

describe('createLock', () => {
  it('runs overlapping sections one at a time, in call order', async () => {
    const withLock = createLock();
    const events: string[] = [];
    const section = (name: string, ms: number) =>
      withLock(async () => {
        events.push(`${name}:start`);
        await new Promise(resolve => setTimeout(resolve, ms));
        events.push(`${name}:end`);
      });

    await Promise.all([section('a', 20), section('b', 0)]);

    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps running later sections after one rejects', async () => {
    const withLock = createLock();
    const failed = withLock(async () => {
      throw new Error('boom');
    });
    const next = withLock(async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
