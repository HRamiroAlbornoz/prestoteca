import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../src/log.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('log', () => {
  it('prints one JSON line with the time, the message and the details', () => {
    const print = vi.spyOn(console, 'log').mockImplementation(() => {});

    log('backup uploaded', { key: 'postgres/x.dump' });

    expect(print).toHaveBeenCalledTimes(1);
    const line = JSON.parse(print.mock.calls[0][0]);
    expect(line).toMatchObject({ message: 'backup uploaded', key: 'postgres/x.dump' });
    expect(new Date(line.time).toISOString()).toBe(line.time);
  });
});
