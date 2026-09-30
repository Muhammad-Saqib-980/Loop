/**
 * Returns a function that runs async critical sections one at a time, in
 * call order. AsyncStorage read-modify-write sequences interleave across
 * awaits, so two concurrent writers (a user mutation and an in-flight sync)
 * would otherwise silently lose one another's writes.
 *
 * Not re-entrant: never call a lock from inside a section it is running.
 */
export function createLock(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}

/**
 * Guards every read-modify-write of localTaskCache, shared by taskStorage's
 * mutators and syncEngine. mutationQueue has its own internal lock, so it is
 * safe to call from inside a section held on this one.
 */
export const withCacheLock = createLock();
