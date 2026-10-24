import { describe, expect, it } from 'vitest';
import { buildBackupKey } from '../src/backupKey.mjs';
import { runBackup } from '../src/runBackup.mjs';

const NOW = new Date('2026-10-24T06:00:00Z');
const FILE_PATH = '/tmp/prestoteca.dump';

const keyForDay = (day) => buildBackupKey(new Date(Date.UTC(2026, 9, day, 6)));

/**
 * In-memory stand-ins for Postgres and the bucket. Each step can be told to
 * fail, so the tests can check what the job does when something breaks.
 */
function createFakes({ existingKeys = [], failOn = {} } = {}) {
  const bucket = new Set(existingKeys);
  const calls = [];

  const deps = {
    now: NOW,
    keep: 3,
    filePath: FILE_PATH,
    log: () => {},
    dumpDatabase: async (filePath) => {
      calls.push(['dump', filePath]);
      if (failOn.dump) throw new Error('pg_dump exited with code 1');
    },
    verifyDump: async (filePath) => {
      calls.push(['verify', filePath]);
      if (failOn.verify) throw new Error('pg_restore exited with code 1');
    },
    uploadBackup: async (key, filePath) => {
      calls.push(['upload', key, filePath]);
      if (failOn.upload) throw new Error('S3 PutObject failed');
      bucket.add(key);
    },
    listBackupKeys: async () => {
      calls.push(['list']);
      return [...bucket];
    },
    deleteBackup: async (key) => {
      calls.push(['delete', key]);
      if (failOn.deleteKey === key) throw new Error('S3 DeleteObject failed');
      bucket.delete(key);
    },
  };

  return { deps, bucket, calls };
}

describe('runBackup', () => {
  it('dumps, verifies and uploads the backup under a dated key', async () => {
    const { deps, bucket } = createFakes();

    const result = await runBackup(deps);

    expect(result).toEqual({ key: 'postgres/prestoteca-2026-10-24T06-00-00Z.dump', deleted: [] });
    expect([...bucket]).toEqual(['postgres/prestoteca-2026-10-24T06-00-00Z.dump']);
  });

  it('keeps only the newest backups once the limit is exceeded', async () => {
    const { deps, bucket } = createFakes({ existingKeys: [keyForDay(20), keyForDay(21), keyForDay(22), keyForDay(23)] });

    const result = await runBackup(deps);

    expect(result.deleted.sort()).toEqual([keyForDay(20), keyForDay(21)]);
    expect([...bucket].sort()).toEqual([keyForDay(22), keyForDay(23), result.key]);
  });

  it('leaves files that the job did not create untouched', async () => {
    const manualCopy = 'postgres/manual-copy-before-migration.dump';
    const { deps, bucket } = createFakes({ existingKeys: [manualCopy, keyForDay(20), keyForDay(21), keyForDay(22), keyForDay(23)] });

    await runBackup(deps);

    expect(bucket.has(manualCopy)).toBe(true);
  });

  it('never deletes the backup it has just uploaded, even if older-looking keys sort after it', async () => {
    const futureKeys = [26, 27, 28].map(keyForDay);
    const { deps, bucket } = createFakes({ existingKeys: futureKeys });

    const result = await runBackup({ ...deps, keep: 1 });

    expect(bucket.has(result.key)).toBe(true);
    expect(result.deleted).not.toContain(result.key);
  });

  it.each([
    ['the dump fails', { dump: true }, /pg_dump/],
    ['the dump is corrupt', { verify: true }, /pg_restore/],
    ['the upload fails', { upload: true }, /PutObject/],
  ])('deletes nothing when %s', async (_case, failOn, message) => {
    const existingKeys = [20, 21, 22, 23].map(keyForDay);
    const { deps, bucket, calls } = createFakes({ existingKeys, failOn });

    await expect(runBackup(deps)).rejects.toThrow(message);

    expect([...bucket].sort()).toEqual(existingKeys);
    expect(calls.some(([step]) => step === 'delete')).toBe(false);
  });

  it('does not upload a dump that failed verification', async () => {
    const { deps, calls } = createFakes({ failOn: { verify: true } });

    await expect(runBackup(deps)).rejects.toThrow();

    expect(calls.some(([step]) => step === 'upload')).toBe(false);
  });

  it('keeps deleting the other expired backups when one deletion fails, then reports the failure', async () => {
    const existingKeys = [19, 20, 21, 22, 23].map(keyForDay);
    const { deps, bucket } = createFakes({ existingKeys, failOn: { deleteKey: keyForDay(19) } });

    await expect(runBackup(deps)).rejects.toThrow(keyForDay(19));

    expect(bucket.has(keyForDay(20))).toBe(false);
    expect(bucket.has(keyForDay(21))).toBe(false);
    expect(bucket.has(buildBackupKey(NOW))).toBe(true);
  });
});
