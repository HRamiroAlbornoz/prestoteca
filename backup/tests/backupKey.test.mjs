import { describe, expect, it } from 'vitest';
import { buildBackupKey, isBackupKey, selectExpiredKeys } from '../src/backupKey.mjs';

describe('buildBackupKey', () => {
  it('builds a sortable key from the UTC date, without colons or milliseconds', () => {
    const key = buildBackupKey(new Date('2026-10-24T06:00:07.123Z'));

    expect(key).toBe('postgres/prestoteca-2026-10-24T06-00-07Z.dump');
  });

  it('produces keys that the key pattern recognises', () => {
    expect(isBackupKey(buildBackupKey(new Date('2026-01-02T03:04:05Z')))).toBe(true);
  });
});

describe('isBackupKey', () => {
  it.each([
    'postgres/prestoteca-2026-10-24T06-00-07Z.dump.tmp',
    'postgres/manual-copy.dump',
    'prestoteca-2026-10-24T06-00-07Z.dump',
    'other/prestoteca-2026-10-24T06-00-07Z.dump',
  ])('rejects a key that the job did not create: %s', (key) => {
    expect(isBackupKey(key)).toBe(false);
  });
});

describe('selectExpiredKeys', () => {
  const day = (n) => buildBackupKey(new Date(Date.UTC(2026, 9, n, 6)));

  it('returns nothing when there are fewer backups than the limit', () => {
    expect(selectExpiredKeys([day(1), day(2)], 14)).toEqual([]);
  });

  it('returns nothing when there are exactly as many backups as the limit', () => {
    expect(selectExpiredKeys([day(1), day(2), day(3)], 3)).toEqual([]);
  });

  it('returns the oldest backups beyond the limit, whatever order the bucket lists them in', () => {
    const keys = [day(3), day(1), day(5), day(2), day(4)];

    expect(selectExpiredKeys(keys, 3).sort()).toEqual([day(1), day(2)]);
  });

  it('never selects files that do not follow the backup key pattern', () => {
    const keys = [day(1), day(2), day(3), 'postgres/manual-copy.dump', 'notes.txt'];

    expect(selectExpiredKeys(keys, 1).sort()).toEqual([day(1), day(2)]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects an invalid limit (%s) instead of deleting everything', (keep) => {
    expect(() => selectExpiredKeys([day(1)], keep)).toThrow(/keep/i);
  });
});
