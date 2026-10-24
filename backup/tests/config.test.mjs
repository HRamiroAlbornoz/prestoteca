import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.mjs';

const completeEnv = {
  DATABASE_URL: 'postgresql://user:secret-password@postgres.railway.internal:5432/railway',
  S3_BUCKET: 'backups-abc123',
  S3_ENDPOINT: 'https://t3.storageapi.dev',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'secret-key',
};

describe('readConfig', () => {
  it('reads every setting and keeps 14 backups by default', () => {
    const config = readConfig(completeEnv);

    expect(config).toEqual({
      databaseUrl: completeEnv.DATABASE_URL,
      keep: 14,
      s3: {
        bucket: 'backups-abc123',
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        accessKeyId: 'key-id',
        secretAccessKey: 'secret-key',
      },
    });
  });

  it('uses BACKUP_KEEP when it is a positive integer', () => {
    expect(readConfig({ ...completeEnv, BACKUP_KEEP: '2' }).keep).toBe(2);
  });

  it.each(['0', '-3', 'abc', '2.5'])('rejects an invalid BACKUP_KEEP (%s)', (value) => {
    expect(() => readConfig({ ...completeEnv, BACKUP_KEEP: value })).toThrow(/BACKUP_KEEP/);
  });

  it('names every missing variable without printing any value', () => {
    const partialEnv = { ...completeEnv, S3_BUCKET: '  ' };
    delete partialEnv.DATABASE_URL;
    delete partialEnv.S3_SECRET_ACCESS_KEY;

    const read = () => readConfig(partialEnv);

    expect(read).toThrow('Missing environment variables: DATABASE_URL, S3_BUCKET, S3_SECRET_ACCESS_KEY');
  });

  it('never includes secret values in the error message', () => {
    const read = () => readConfig({ ...completeEnv, BACKUP_KEEP: 'abc' });

    expect(read).toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret') }));
  });
});
