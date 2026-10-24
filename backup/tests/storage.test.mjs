import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStorage } from '../src/storage.mjs';

const S3_CONFIG = {
  bucket: 'backups-abc123',
  endpoint: 'https://t3.storageapi.dev',
  region: 'iad',
  accessKeyId: 'key-id',
  secretAccessKey: 'secret-key',
};

/**
 * Fake S3 client: records every command it receives and answers with the
 * response that `respond` returns for it, the way the real SDK would.
 */
function createFakeClient(respond = () => ({})) {
  const sent = [];
  return {
    sent,
    async send(command) {
      sent.push(command);
      return respond(command);
    },
  };
}

let workDir;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('createStorage', () => {
  it('builds a real S3 client when none is given', () => {
    const storage = createStorage(S3_CONFIG);

    expect(typeof storage.uploadBackup).toBe('function');
  });
});

describe('uploadBackup', () => {
  it('uploads the file contents under the given key in the configured bucket', async () => {
    const filePath = join(workDir, 'backup.dump');
    await writeFile(filePath, 'PGDMP fake dump');
    const client = createFakeClient();

    await createStorage(S3_CONFIG, client).uploadBackup('postgres/prestoteca-x.dump', filePath);

    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(client.sent[0].input.Bucket).toBe('backups-abc123');
    expect(client.sent[0].input.Key).toBe('postgres/prestoteca-x.dump');
    expect(client.sent[0].input.Body.toString()).toBe('PGDMP fake dump');
  });

  it('fails without calling S3 when the dump file does not exist', async () => {
    const client = createFakeClient();

    await expect(
      createStorage(S3_CONFIG, client).uploadBackup('k', join(workDir, 'missing.dump')),
    ).rejects.toThrow(/ENOENT/);
    expect(client.sent).toHaveLength(0);
  });

  it('propagates an S3 error so the job does not go on to delete old copies', async () => {
    const filePath = join(workDir, 'backup.dump');
    await writeFile(filePath, 'x');
    const client = createFakeClient(() => {
      throw new Error('AccessDenied');
    });

    await expect(createStorage(S3_CONFIG, client).uploadBackup('k', filePath)).rejects.toThrow('AccessDenied');
  });
});

describe('listBackupKeys', () => {
  it('lists only under the backup prefix and follows every page', async () => {
    const pages = {
      first: { Contents: [{ Key: 'postgres/a.dump' }, { Key: 'postgres/b.dump' }], IsTruncated: true, NextContinuationToken: 'second' },
      second: { Contents: [{ Key: 'postgres/c.dump' }], IsTruncated: false },
    };
    const client = createFakeClient((command) => pages[command.input.ContinuationToken ?? 'first']);

    const keys = await createStorage(S3_CONFIG, client).listBackupKeys();

    expect(keys).toEqual(['postgres/a.dump', 'postgres/b.dump', 'postgres/c.dump']);
    expect(client.sent).toHaveLength(2);
    expect(client.sent.every((command) => command instanceof ListObjectsV2Command)).toBe(true);
    expect(client.sent.every((command) => command.input.Prefix === 'postgres/')).toBe(true);
  });

  it('returns an empty list for an empty bucket (S3 omits Contents)', async () => {
    const client = createFakeClient(() => ({ IsTruncated: false }));

    expect(await createStorage(S3_CONFIG, client).listBackupKeys()).toEqual([]);
  });
});

describe('deleteBackup', () => {
  it('deletes exactly the given key', async () => {
    const client = createFakeClient();

    await createStorage(S3_CONFIG, client).deleteBackup('postgres/old.dump');

    expect(client.sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(client.sent[0].input).toEqual({ Bucket: 'backups-abc123', Key: 'postgres/old.dump' });
  });
});

describe('downloadBackup', () => {
  it('writes the object bytes to the given file', async () => {
    const filePath = join(workDir, 'downloaded.dump');
    const client = createFakeClient(() => ({
      Body: { transformToByteArray: async () => new TextEncoder().encode('PGDMP restored') },
    }));

    await createStorage(S3_CONFIG, client).downloadBackup('postgres/x.dump', filePath);

    expect(client.sent[0]).toBeInstanceOf(GetObjectCommand);
    expect(client.sent[0].input.Key).toBe('postgres/x.dump');
    expect(await readFile(filePath, 'utf8')).toBe('PGDMP restored');
  });
});
